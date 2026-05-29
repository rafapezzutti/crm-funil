/**
 * CRM Pezzutti — Plans Route
 * GET    /api/plans          → listar planos (filtro: crm)
 * POST   /api/plans          → criar plano
 * PUT    /api/plans/:id      → editar plano
 * DELETE /api/plans/:id      → excluir plano
 */
const router = require('express').Router();
const auth   = require('../middleware/auth');
const { sql } = require('../config/db');

router.get('/', auth, async (req, res) => {
  try {
    const { crm } = req.query;
    const rows = await sql`
      SELECT * FROM plans
      WHERE company_id = ${req.companyId}
        AND (${crm||null}::text IS NULL OR crm = ${crm||null})
      ORDER BY crm, valor`;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { crm, nome, valor } = req.body;
    if (!crm || !nome || valor == null) return res.status(400).json({ error: 'crm, nome e valor são obrigatórios.' });
    const [row] = await sql`
      INSERT INTO plans (company_id, crm, nome, valor)
      VALUES (${req.companyId}, ${crm}, ${nome}, ${valor})
      RETURNING *`;
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { crm, nome, valor, ativo } = req.body;
    const [row] = await sql`
      UPDATE plans SET
        crm   = ${crm},
        nome  = ${nome},
        valor = ${valor},
        ativo = ${ativo ?? true}
      WHERE id = ${req.params.id} AND company_id = ${req.companyId}
      RETURNING *`;
    if (!row) return res.status(404).json({ error: 'Plano não encontrado.' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await sql`DELETE FROM plans WHERE id = ${req.params.id} AND company_id = ${req.companyId}`;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
