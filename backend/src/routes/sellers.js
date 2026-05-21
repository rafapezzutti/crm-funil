const router  = require('express').Router();
const auth    = require('../middleware/auth');
const { sql } = require('../config/db');

router.use(auth);

router.get('/', async (req, res) => {
  const rows = await sql`SELECT * FROM sellers WHERE company_id = ${req.companyId} ORDER BY name`;
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { name, email } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório.' });
  const dup = await sql`SELECT id FROM sellers WHERE company_id = ${req.companyId} AND lower(name) = ${name.toLowerCase()}`;
  if (dup.length) return res.status(409).json({ error: 'Vendedor já cadastrado.' });
  const [row] = await sql`INSERT INTO sellers (company_id, name, email) VALUES (${req.companyId}, ${name}, ${email||null}) RETURNING *`;
  res.status(201).json(row);
});

router.delete('/:id', async (req, res) => {
  await sql`DELETE FROM sellers WHERE id = ${req.params.id} AND company_id = ${req.companyId}`;
  res.json({ deleted: true });
});

module.exports = router;
