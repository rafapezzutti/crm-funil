/**
 * CRM Pezzutti — Commissions Route
 * GET  /api/commissions           → visão geral por vendedor
 * PUT  /api/commissions/:sellerId → salvar percentual/obs de um vendedor
 */
const router  = require('express').Router();
const auth    = require('../middleware/auth');
const { sql } = require('../config/db');

// ── GET /api/commissions ──────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { mes } = req.query;
    const mesRef  = mes || new Date().toISOString().slice(0, 7) + '-01';

    const rows = await sql`
      SELECT
        u.id AS seller_id, u.name, u.email, sp.cpf,
        COUNT(DISTINCT l.id) FILTER (WHERE l.stage NOT IN ('perdido','cancelado')) AS leads_ativos,
        COUNT(DISTINCT l.id) FILTER (WHERE l.stage = 'producao')                  AS leads_producao,
        COUNT(DISTINCT l.id) FILTER (WHERE l.stage IN ('perdido','cancelado'))    AS leads_perdidos,
        COALESCE(SUM(COALESCE(l.valor_negociado, l.valor_plano, 0))
          FILTER (WHERE l.stage = 'producao'), 0)                                 AS mrr,
        COALESCE(c.percentual,      0) AS percentual,
        COALESCE(c.valor_calculado, 0) AS valor_calculado,
        c.obs
      FROM   seller_profiles sp
      JOIN   users u ON u.id = sp.user_id
      LEFT JOIN leads l
        ON l.responsavel_id = sp.user_id AND l.company_id = sp.company_id
      LEFT JOIN commissions c
        ON c.seller_id = sp.user_id AND c.company_id = sp.company_id
        AND c.mes_referencia = ${mesRef}::date
      WHERE  sp.company_id = ${req.companyId} AND sp.ativo = true
      GROUP  BY u.id, u.name, u.email, sp.cpf, c.percentual, c.valor_calculado, c.obs
      ORDER  BY u.name`;

    res.json(rows);
  } catch (err) {
    console.error('[commissions GET]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/commissions/:sellerId ────────────────────────────────────────────
router.put('/:sellerId', auth, async (req, res) => {
  try {
    const { mes, percentual, valor_calculado, obs } = req.body;
    const mesRef = mes || new Date().toISOString().slice(0, 7) + '-01';

    await sql`
      INSERT INTO commissions (seller_id, company_id, mes_referencia, percentual, valor_calculado, obs)
      VALUES (${req.params.sellerId}, ${req.companyId}, ${mesRef}::date,
              ${percentual || 0}, ${valor_calculado || 0}, ${obs || null})
      ON CONFLICT (seller_id, mes_referencia)
      DO UPDATE SET
        percentual      = ${percentual || 0},
        valor_calculado = ${valor_calculado || 0},
        obs             = ${obs || null}`;

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
