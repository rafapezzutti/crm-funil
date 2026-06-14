const router  = require('express').Router();
const auth    = require('../middleware/auth');
const jwt     = require('jsonwebtoken');
const { sql } = require('../config/db');

router.use(auth);

// Apenas master pode usar estas rotas
function masterOnly(req, res, next) {
  if (req.role !== 'master') return res.status(403).json({ error: 'Acesso restrito ao master.' });
  next();
}

// GET /api/master/companies — lista todas as empresas
router.get('/companies', masterOnly, async (req, res) => {
  try {
    const companies = await sql`
      SELECT c.id, c.name, c.slug, c.plan, c.trial_ends_at, c.status,
        (SELECT COUNT(*) FROM leads l WHERE l.company_id = c.id) AS total_leads,
        (SELECT COUNT(*) FROM robots r WHERE r.company_id = c.id AND r.ativo = true) AS total_robots
      FROM companies c
      ORDER BY c.name`;
    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/master/impersonate — gera token no contexto da empresa alvo
router.post('/impersonate', masterOnly, async (req, res) => {
  const { companyId } = req.body;
  if (!companyId) return res.status(400).json({ error: 'companyId obrigatório.' });
  try {
    const [company] = await sql`SELECT id, name, slug, plan, trial_ends_at, status FROM companies WHERE id = ${companyId}`;
    if (!company) return res.status(404).json({ error: 'Empresa não encontrada.' });

    // Token scoped para a empresa alvo, role=admin, mas com flag impersonatedBy
    const token = jwt.sign(
      { userId: req.userId, companyId: company.id, role: 'admin', impersonatedBy: req.userId },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );
    res.json({ token, company });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
