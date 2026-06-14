const router  = require('express').Router();
const auth    = require('../middleware/auth');
const { sql } = require('../config/db');

router.use(auth);

// ── GET /api/robots ────────────────────────────────────────────────────────────
// Lista robôs da empresa
router.get('/', async (req, res) => {
  try {
    const robots = await sql`
      SELECT r.*, 
        (SELECT COUNT(*) FROM robot_logs l WHERE l.robot_id = r.id) AS total_runs,
        (SELECT created_at FROM robot_logs l WHERE l.robot_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_run_at,
        (SELECT status FROM robot_logs l WHERE l.robot_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_status
      FROM robots r
      WHERE r.company_id = ${req.companyId}
      ORDER BY r.created_at DESC`;
    res.json(robots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/robots ───────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ error: 'Apenas admins.' });
  const { name, description, tipo, trigger_type, cron_expr, event_trigger, prompt_template, whatsapp_template } = req.body;
  if (!name || !tipo) return res.status(400).json({ error: 'Nome e tipo são obrigatórios.' });
  try {
    const [robot] = await sql`
      INSERT INTO robots (company_id, name, description, tipo, trigger_type, cron_expr, event_trigger, prompt_template, whatsapp_template)
      VALUES (${req.companyId}, ${name}, ${description||null}, ${tipo}, ${trigger_type||'cron'}, 
              ${cron_expr||null}, ${event_trigger||null}, ${prompt_template||null}, ${whatsapp_template||null})
      RETURNING *`;
    res.json(robot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/robots/:id ────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ error: 'Apenas admins.' });
  const { name, description, tipo, trigger_type, cron_expr, event_trigger, prompt_template, whatsapp_template, ativo } = req.body;
  try {
    const [robot] = await sql`
      UPDATE robots SET
        name              = ${name},
        description       = ${description||null},
        tipo              = ${tipo},
        trigger_type      = ${trigger_type||'cron'},
        cron_expr         = ${cron_expr||null},
        event_trigger     = ${event_trigger||null},
        prompt_template   = ${prompt_template||null},
        whatsapp_template = ${whatsapp_template||null},
        ativo             = ${ativo !== false},
        updated_at        = NOW()
      WHERE id = ${req.params.id} AND company_id = ${req.companyId}
      RETURNING *`;
    if (!robot) return res.status(404).json({ error: 'Robô não encontrado.' });
    res.json(robot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/robots/:id ─────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ error: 'Apenas admins.' });
  await sql`UPDATE robots SET ativo = false WHERE id = ${req.params.id} AND company_id = ${req.companyId}`;
  res.json({ ok: true });
});

// ── POST /api/robots/:id/log ───────────────────────────────────────────────────
// Claude chama este endpoint para registrar execução
router.post('/:id/log', async (req, res) => {
  const { status, output, duration_ms } = req.body;
  try {
    const [log] = await sql`
      INSERT INTO robot_logs (robot_id, company_id, status, output, duration_ms)
      VALUES (${req.params.id}, ${req.companyId}, ${status||'ok'}, ${output||null}, ${duration_ms||null})
      RETURNING *`;
    res.json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/robots/:id/logs ───────────────────────────────────────────────────
router.get('/:id/logs', async (req, res) => {
  try {
    const logs = await sql`
      SELECT * FROM robot_logs
      WHERE robot_id = ${req.params.id} AND company_id = ${req.companyId}
      ORDER BY created_at DESC
      LIMIT 50`;
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/robots/run-due ────────────────────────────────────────────────────
// Claude chama a cada X minutos para saber quais robôs estão prontos para rodar
// Token de autenticação via header X-Robot-Token (env: ROBOT_SECRET)
router.get('/run-due', async (req, res) => {
  const token = req.headers['x-robot-token'];
  if (!token || token !== process.env.ROBOT_SECRET) {
    return res.status(401).json({ error: 'Token inválido.' });
  }
  try {
    // Retorna todos os robôs ativos com cron (Claude decide quais são due com base no cron_expr)
    const robots = await sql`
      SELECT r.*, c.name AS company_name,
        cs.whatsapp_api_url, cs.whatsapp_api_token, cs.whatsapp_instance,
        (SELECT created_at FROM robot_logs l WHERE l.robot_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_run_at
      FROM robots r
      JOIN companies c ON c.id = r.company_id
      LEFT JOIN company_settings cs ON cs.company_id = r.company_id
      WHERE r.ativo = true AND r.trigger_type IN ('cron', 'ambos')
      ORDER BY r.company_id, r.created_at`;
    res.json(robots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
