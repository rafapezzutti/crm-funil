/**
 * CRM Pezzutti — Commissions Route
 *
 * Regras de comissão são configuráveis por empresa via company_settings.commission_rules.
 * Padrão quando não configurado:
 *   Mês 1  → 100%  |  Mês 2 → 50%  |  Meses 3-12 → 10%  |  Após 12m → 0%
 *
 * GET  /api/commissions/rules       → regras da empresa
 * PUT  /api/commissions/rules       → salvar regras (admin/master)
 * GET  /api/commissions             → tabela completa (admin/master) ou própria (vendedor)
 * PUT  /api/commissions/:sellerId   → obs/ajuste manual (admin/master)
 */
const router  = require('express').Router();
const auth    = require('../middleware/auth');
const { sql } = require('../config/db');

const DEFAULT_RULES = {
  tiers: [
    { label: 'Mês 1',       from: 0,  to: 0,  pct: 100 },
    { label: 'Mês 2',       from: 1,  to: 1,  pct: 50  },
    { label: 'Meses 3–12',  from: 2,  to: 11, pct: 10  },
    { label: 'Após 12m',    from: 12, to: null,pct: 0   },
  ],
  payment_delay_days: 30,
};

async function getCompanyRules(companyId) {
  try {
    const [s] = await sql`SELECT commission_rules FROM company_settings WHERE company_id = ${companyId}`;
    if (s?.commission_rules?.tiers?.length) return s.commission_rules;
  } catch {}
  return DEFAULT_RULES;
}

function comissaoTier(mesesDesdeProducao, tiers) {
  // Percorre tiers em ordem; usa o primeiro que inclui o mês
  for (const tier of tiers) {
    if (mesesDesdeProducao >= tier.from && (tier.to === null || mesesDesdeProducao <= tier.to)) {
      return tier.pct / 100;
    }
  }
  return 0;
}

// ── GET /api/commissions/rules ────────────────────────────────────────────────
router.get('/rules', auth, async (req, res) => {
  res.json(await getCompanyRules(req.companyId));
});

// ── PUT /api/commissions/rules ────────────────────────────────────────────────
router.put('/rules', auth, async (req, res) => {
  if (!['admin', 'master'].includes(req.role)) {
    return res.status(403).json({ error: 'Apenas administradores podem alterar as regras.' });
  }
  const { tiers, payment_delay_days } = req.body;
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return res.status(400).json({ error: 'Tiers obrigatórios.' });
  }
  const rules = { tiers, payment_delay_days: payment_delay_days || 30 };
  try {
    await sql`
      INSERT INTO company_settings (company_id, commission_rules, updated_at)
      VALUES (${req.companyId}, ${JSON.stringify(rules)}, NOW())
      ON CONFLICT (company_id) DO UPDATE
        SET commission_rules = EXCLUDED.commission_rules,
            updated_at       = NOW()`;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/commissions ──────────────────────────────────────────────────────
// Admin/master: todos os vendedores | Vendedor: apenas si mesmo
router.get('/', auth, async (req, res) => {
  try {
    const { mes } = req.query;
    const mesRef  = mes ? mes + '-01' : new Date().toISOString().slice(0, 7) + '-01';
    const mesDate = new Date(mesRef);

    const rules   = await getCompanyRules(req.companyId);
    const { tiers, payment_delay_days = 30 } = rules;

    const isManager = ['admin', 'master'].includes(req.role);
    const cid = req.companyId;

    // Leads em produção com data_producao preenchida
    const leadsProducao = await sql`
      SELECT
        l.id, l.responsavel_id,
        COALESCE(l.valor_negociado, l.valor_plano, 0) AS valor_mensal,
        l.data_producao
      FROM leads l
      WHERE l.company_id = ${cid}
        AND l.stage = 'producao'
        AND l.data_producao IS NOT NULL
        AND l.data_producao <= ${mesDate}
        ${!isManager ? sql`AND l.responsavel_id = ${req.userId}::uuid` : sql``}`;

    // Calcular comissão por vendedor
    const comissaoPorVendedor = {};
    for (const lead of leadsProducao) {
      const dp   = new Date(lead.data_producao);
      const meses = (mesDate.getFullYear() - dp.getFullYear()) * 12
                  + (mesDate.getMonth() - dp.getMonth());
      const pct  = comissaoTier(meses, tiers);
      const val  = parseFloat(lead.valor_mensal) * pct;
      if (val <= 0) continue;
      const sid  = lead.responsavel_id;
      if (!sid) continue;
      if (!comissaoPorVendedor[sid]) comissaoPorVendedor[sid] = { valor: 0, leads: [] };
      comissaoPorVendedor[sid].valor += val;
      comissaoPorVendedor[sid].leads.push({ lead_id: lead.id, meses, pct: Math.round(pct*100), val: Math.round(val*100)/100 });
    }

    // Vendedores a incluir
    const sellers = await sql`
      SELECT
        u.id AS seller_id, u.name, u.email, sp.cpf,
        COUNT(DISTINCT l.id) FILTER (WHERE l.stage NOT IN ('perdido','cancelado')) AS leads_ativos,
        COUNT(DISTINCT l.id) FILTER (WHERE l.stage = 'producao')                  AS leads_producao,
        COUNT(DISTINCT l.id) FILTER (WHERE l.stage IN ('perdido','cancelado'))    AS leads_perdidos,
        COALESCE(SUM(COALESCE(l.valor_negociado, l.valor_plano, 0))
          FILTER (WHERE l.stage = 'producao'), 0)                                 AS mrr,
        c.obs
      FROM (
        ${isManager
          ? sql`
              SELECT user_id FROM seller_profiles WHERE company_id = ${cid} AND ativo = true
              UNION
              SELECT user_id FROM company_members  WHERE company_id = ${cid} AND role = 'admin'
            `
          : sql`SELECT ${req.userId}::uuid AS user_id`
        }
      ) AS members
      JOIN   users u ON u.id = members.user_id
      LEFT JOIN seller_profiles sp ON sp.user_id = members.user_id AND sp.company_id = ${cid}
      LEFT JOIN leads l ON l.responsavel_id = members.user_id AND l.company_id = ${cid}
      LEFT JOIN commissions c
        ON c.seller_id = members.user_id AND c.company_id = ${cid}
        AND c.mes_referencia = ${mesRef}::date
      GROUP  BY u.id, u.name, u.email, sp.cpf, c.obs
      ORDER  BY u.name`;

    // Data de previsão de pagamento
    const dataPgto = (() => {
      const d = new Date(mesDate);
      d.setMonth(d.getMonth() + 1);
      d.setDate(payment_delay_days);
      return d.toISOString().slice(0, 10);
    })();

    const result = sellers.map(s => ({
      ...s,
      valor_comissao:  Math.round((comissaoPorVendedor[s.seller_id]?.valor || 0) * 100) / 100,
      detalhe_leads:   comissaoPorVendedor[s.seller_id]?.leads || [],
      data_pagamento:  dataPgto,
    }));

    res.json(result);
  } catch (err) {
    console.error('[commissions GET]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/commissions/:sellerId — ADMIN/MASTER ONLY ────────────────────────
router.put('/:sellerId', auth, async (req, res) => {
  try {
    if (!['admin', 'master'].includes(req.role)) {
      return res.status(403).json({ error: 'Apenas administradores podem alterar comissões.' });
    }

    const { mes, obs, valor_ajuste } = req.body;
    const mesRef = mes ? mes + '-01' : new Date().toISOString().slice(0, 7) + '-01';

    await sql`
      INSERT INTO commissions (seller_id, company_id, mes_referencia, percentual, valor_calculado, obs)
      VALUES (${req.params.sellerId}, ${req.companyId}, ${mesRef}::date,
              0, ${valor_ajuste || 0}, ${obs || null})
      ON CONFLICT (seller_id, mes_referencia)
      DO UPDATE SET
        obs             = ${obs || null},
        valor_calculado = ${valor_ajuste || 0}`;

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
