/**
 * CRM Pezzutti — Commissions Route
 *
 * Regras de comissão:
 *   Mês 1  (data_producao)       → 100% do valor da mensalidade
 *   Mês 2                        →  50%
 *   Meses 3–12                   →  10%
 *   Após 12 meses / renovação    →   0%
 *
 * Pagamento: 30 dias após pagamento do cliente.
 * Inadimplentes: não geram comissão.
 *
 * GET  /api/commissions           → visão por vendedor com cálculo automático
 * PUT  /api/commissions/:sellerId → salvar obs / ajuste manual (admin only)
 */
const router  = require('express').Router();
const auth    = require('../middleware/auth');
const { sql } = require('../config/db');

// Regras de comissão (percentual por mês de produção, 0-indexed)
function comissaoTier(mesesDesdeProducao) {
  if (mesesDesdeProducao === 0) return 1.00;   // mês 1 → 100%
  if (mesesDesdeProducao === 1) return 0.50;   // mês 2 → 50%
  if (mesesDesdeProducao <= 11) return 0.10;   // meses 3-12 → 10%
  return 0;                                     // após 12 meses → 0%
}

// ── GET /api/commissions ──────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { mes } = req.query;
    const mesRef  = mes ? mes + '-01' : new Date().toISOString().slice(0, 7) + '-01';
    const mesDate = new Date(mesRef);

    // Leads em produção com data_producao preenchida
    const leadsProducao = await sql`
      SELECT
        l.id, l.responsavel_id,
        COALESCE(l.valor_negociado, l.valor_plano, 0) AS valor_mensal,
        l.data_producao
      FROM leads l
      WHERE l.company_id = ${req.companyId}
        AND l.stage = 'producao'
        AND l.data_producao IS NOT NULL
        AND l.data_producao <= ${mesDate}`;

    // Calcular comissão por vendedor
    const comissaoPorVendedor = {};
    for (const lead of leadsProducao) {
      const dp   = new Date(lead.data_producao);
      const meses = (mesDate.getFullYear() - dp.getFullYear()) * 12
                  + (mesDate.getMonth() - dp.getMonth());
      const pct  = comissaoTier(meses);
      const val  = parseFloat(lead.valor_mensal) * pct;
      if (val <= 0) continue;
      const sid  = lead.responsavel_id;
      if (!sid) continue;
      if (!comissaoPorVendedor[sid]) comissaoPorVendedor[sid] = { valor: 0, leads: [] };
      comissaoPorVendedor[sid].valor += val;
      comissaoPorVendedor[sid].leads.push({ lead_id: lead.id, meses, pct: Math.round(pct*100), val: Math.round(val*100)/100 });
    }

    // Vendedores da empresa (inclui admin mesmo sem seller_profile)
    const cid = req.companyId;
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
        SELECT user_id FROM seller_profiles WHERE company_id = ${cid} AND ativo = true
        UNION
        SELECT user_id FROM company_members  WHERE company_id = ${cid} AND role = 'admin'
      ) AS members
      JOIN   users u ON u.id = members.user_id
      LEFT JOIN seller_profiles sp ON sp.user_id = members.user_id AND sp.company_id = ${cid}
      LEFT JOIN leads l ON l.responsavel_id = members.user_id AND l.company_id = ${cid}
      LEFT JOIN commissions c
        ON c.seller_id = members.user_id AND c.company_id = ${cid}
        AND c.mes_referencia = ${mesRef}::date
      GROUP  BY u.id, u.name, u.email, sp.cpf, c.obs
      ORDER  BY u.name`;

    const result = sellers.map(s => ({
      ...s,
      valor_comissao:  Math.round((comissaoPorVendedor[s.seller_id]?.valor || 0) * 100) / 100,
      detalhe_leads:   comissaoPorVendedor[s.seller_id]?.leads || [],
      data_pagamento:  (() => { const d = new Date(mesDate); d.setMonth(d.getMonth()+1); d.setDate(30); return d.toISOString().slice(0,10); })(),
    }));

    res.json(result);
  } catch (err) {
    console.error('[commissions GET]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/commissions/:sellerId — ADMIN ONLY ───────────────────────────────
router.put('/:sellerId', auth, async (req, res) => {
  try {
    if (req.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem alterar comissões.' });
    }

    const { mes, obs, pago, valor_ajuste } = req.body;
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
