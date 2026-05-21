const router  = require('express').Router();
const auth    = require('../middleware/auth');
const { sql } = require('../config/db');

router.use(auth);

// GET current company info
router.get('/', async (req, res) => {
  const [company] = await sql`SELECT * FROM companies WHERE id = ${req.companyId}`;
  if (!company) return res.status(404).json({ error: 'Empresa não encontrada.' });
  res.json(company);
});

// PUT update company name
router.put('/', async (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem editar a empresa.' });
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório.' });
  const [company] = await sql`UPDATE companies SET name = ${name} WHERE id = ${req.companyId} RETURNING *`;
  res.json(company);
});

// GET members list
router.get('/members', async (req, res) => {
  const members = await sql`
    SELECT cm.user_id AS id, u.name, u.email, cm.role
    FROM company_members cm JOIN users u ON u.id = cm.user_id
    WHERE cm.company_id = ${req.companyId}
    ORDER BY u.name`;
  res.json(members);
});

module.exports = router;
