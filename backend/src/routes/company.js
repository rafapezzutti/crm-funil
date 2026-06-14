const router  = require('express').Router();
const auth    = require('../middleware/auth');
const { sql } = require('../config/db');

router.use(auth);

const DEFAULT_CRM_TYPES = [
  { value:'saude',    label:'Saúde',    icon:'🏥' },
  { value:'pet',      label:'Pet',      icon:'🐾' },
  { value:'esportes', label:'Esportes', icon:'⚽' },
  { value:'spa',      label:'Spa',      icon:'💆' },
];

// ── GET /api/company ───────────────────────────────
router.get('/', async (req, res) => {
  const [company] = await sql`SELECT * FROM companies WHERE id = ${req.companyId}`;
  if (!company) return res.status(404).json({ error: 'Empresa não encontrada.' });
  res.json(company);
});

// ── PUT /api/company ───────────────────────────────
router.put('/', async (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem editar.' });
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório.' });
  const [company] = await sql`U