const router  = require('express').Router();
const auth    = require('../middleware/auth');
const { sql } = require('../config/db');

// Helper: valida ROBOT_SECRET (usado nos endpoints do Cowork, sem JWT)
function robotAuth(req, res, next) {
  const token = req.headers['x-robot-token'];
  if (!token || token !== process.env.ROBOT_SECRET) {
    return res.status(401).json({ error: 'Token inválido.' });
  }
  next();
}

// ── Endpoints do Cowork (sem JWT, apenas ROBOT_SECRET) ─────────────────────────

// GET /api/robots/queued — fila para o Cowork executar
router.get('/queued', robotAuth, async (req, res) => {
  try {
    const robots = await sql`
      SELECT r.*, c.name AS company_name
      FROM robots r
      JOIN companies c ON c.id = r.company_id
      WHERE r.queued_at IS NOT NULL AND r.ativo = true
      ORDER BY r.queued_at ASC`;
    res.json(robots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/robots/:id/queued — Cowork limpa a fila após executar
router.delete('/:id/queued', robotAuth, async (req, res) => {
  try {
    await sql`UPDATE robots SET queued_at = NULL WHERE id = ${req.params.id}`;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/robots/:id/log-cowork — Cowork registra resultado (sem JWT)
router.post('/:id/log-cowork', robotAuth, async (req, res) => {
  const { status, output, duration_ms } = req.body;
  try {
    const [robot] = await sql`SELECT company_id FROM robots WHERE id = ${req.params.id}`;
    if (!robot) return res.status(404).json({ error: 'Robô não encontrado.' });
    const [log] = await sql`
      INSERT INTO robot_logs (robot_id, company_id, status, output, duration_ms)
      VALUES (${req.params.id}, ${robot.company_id}, ${status||'ok'}, ${output||null}, ${duration_ms||null})
      RETURNING *`;
    await sql`UPDATE robots SET updated_at = NOW() WHERE id = ${req.params.id}`;
    res.json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/robots/:id/context — contexto CRM para o Cowork executar
router.get('/:id/context', robotAuth, async (req, res) => {
  try {
    const [robot] = await sql`
      SELECT r.*, c.name AS company_name, c.id AS cid
      FROM robots r
      JOIN companies c ON c.id = r.company_id
      WHERE r.id = ${req.params.id}`;
    if (!robot) return res.status(404).json({ error: 'Robô não encontrado.' });

    const companyId = robot.company_id;
    let context = {};

    if (robot.tipo === 'prospeccao_whatsapp') {
      const leads = await sql`
        SELECT nome, telefone, stage, ultimo_whatsapp_at, score
        FROM leads
        WHERE company_id = ${companyId}
          AND stage IN ('prospeccao','primeiro_contato')
          AND (ultimo_whatsapp_at IS NULL OR ultimo_whatsapp_at < NOW() - INTERVAL '7 days')
        ORDER BY score DESC NULLS LAST, created_at DESC
        LIMIT 50`;
      context = { tipo: 'prospeccao_whatsapp', leads };

    } else if (robot.tipo === 'analise_conversas') {
      const [stats] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE ultimo_whatsapp_at > NOW() - INTERVAL '24 hours') AS contatados_24h,
          COUNT(*) FILTER (WHERE stage = 'negociacao')  AS em_negociacao,
          COUNT(*) FILTER (WHERE stage = 'prospeccao')  AS em_prospeccao,
          COUNT(*) FILTER (WHERE stage = 'ganho')       AS ganhos_semana,
          COUNT(*) FILTER (WHERE score::numeric >= 70)  AS leads_quentes
        FROM leads WHERE company_id = ${companyId} AND ativo = true`;
      const recentes = await sql`
        SELECT nome, telefone, stage, score, ultimo_whatsapp_at, origem
        FROM leads
        WHERE company_id = ${companyId} AND ativo = true
          AND ultimo_whatsapp_at > NOW() - INTERVAL '24 hours'
        ORDER BY ultimo_whatsapp_at DESC LIMIT 30`;
      context = { tipo: 'analise_conversas', stats, recentes };

    } else if (robot.tipo === 'relatorio') {
      const [stats] = await sql`
        SELECT
          COUNT(*) AS total_leads,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS novos_hoje,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')  AS novos_semana,
          COUNT(*) FILTER (WHERE ultimo_whatsapp_at > NOW() - INTERVAL '24 hours') AS contatados_hoje,
          COUNT(*) FILTER (WHERE stage = 'prospeccao')  AS prospeccao,
          COUNT(*) FILTER (WHERE stage = 'negociacao')  AS negociacao,
          COUNT(*) FILTER (WHERE stage = 'ganho')       AS ganhos,
          COUNT(*) FILTER (WHERE stage = 'perdido')     AS perdidos,
          ROUND(AVG(score::numeric)) AS score_medio
        FROM leads WHERE company_id = ${companyId} AND ativo = true`;
      context = { tipo: 'relatorio', stats };

    } else {
      const [count] = await sql`SELECT COUNT(*) AS total FROM leads WHERE company_id = ${companyId} AND ativo = true`;
      context = { tipo: robot.tipo, total_leads: count.total };
    }

    res.json({ robot, context });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── A partir daqui, todos os endpoints exigem JWT ──────────────────────────────
router.use(auth);

// ── GET /api/robots ────────────────────────────────────────────────────────────
// master vê todos os robôs de todas as empresas; admin vê só a sua
router.get('/', async (req, res) => {
  try {
    const isMaster = req.role === 'master';
    const robots = isMaster
      ? await sql`
          SELECT r.*,
            c.name AS company_name,
            (SELECT COUNT(*) FROM robot_logs l WHERE l.robot_id = r.id) AS total_runs,
            (SELECT created_at FROM robot_logs l WHERE l.robot_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_run_at,
            (SELECT status    FROM robot_logs l WHERE l.robot_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_status
          FROM robots r
          JOIN companies c ON c.id = r.company_id
          ORDER BY c.name, r.created_at DESC`
      : await sql`
          SELECT r.*,
            (SELECT COUNT(*) FROM robot_logs l WHERE l.robot_id = r.id) AS total_runs,
            (SELECT created_at FROM robot_logs l WHERE l.robot_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_run_at,
            (SELECT status    FROM robot_logs l WHERE l.robot_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_status
          FROM robots r
          WHERE r.company_id = ${req.companyId}
          ORDER BY r.created_at DESC`;
    res.json(robots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/robots/seed ──────────────────────────────────────────────────────
// Seed dos 6 robôs padrão da P Soluções (master only, idempotente)
router.post('/seed', async (req, res) => {
  if (req.role !== 'master') return res.status(403).json({ error: 'Apenas master.' });
  const companyId = req.body.company_id || req.companyId;

  const defaults = [
    {
      name: 'Prospecção Ativa WhatsApp',
      description: 'Envia WhatsApp para até 100 prospects por dia (seg-sex às 3h)',
      tipo: 'prospeccao_whatsapp',
      trigger_type: 'cron',
      cron_expr: '0 3 * * 1-5',
      prompt_template: 'Execute a prospecção ativa: busque leads com stage=prospeccao e ultimo_whatsapp_at nulo ou > 7 dias, envie mensagem via WhatsApp conforme template, registre a atividade e atualize ultimo_whatsapp_at.',
      whatsapp_template: 'Olá {nome}! Sou da equipe Pezzutti Soluções. Vi que você pode se beneficiar com nosso sistema de gestão comercial. Posso te mostrar como funciona em 15 minutos?',
    },
    {
      name: 'Análise de Conversas 13h',
      description: 'Analisa respostas WhatsApp do dia e classifica leads (seg-sex às 13h)',
      tipo: 'analise_conversas',
      trigger_type: 'cron',
      cron_expr: '0 13 * * 1-5',
      prompt_template: 'Analise as respostas de WhatsApp recebidas desde o último ciclo. Classifique cada lead como quente/morno/frio/visualizado/sem_resposta. Atualize o score no CRM e gere resumo das conversas mais relevantes.',
      whatsapp_template: null,
    },
    {
      name: 'Análise de Conversas 21h',
      description: 'Análise final do dia — consolida respostas e prepara próxima rodada (seg-sex às 21h)',
      tipo: 'analise_conversas',
      trigger_type: 'cron',
      cron_expr: '0 21 * * 1-5',
      prompt_template: 'Análise final do dia: consolide todas as respostas WhatsApp do dia, salve análise em JSON com classificações, identifique leads quentes para follow-up prioritário amanhã e envie e-mail resumo.',
      whatsapp_template: null,
    },
    {
      name: 'Revisão WhatsApp — Sexta',
      description: 'Revisão semanal das conversas e engajamento (sexta às 16h)',
      tipo: 'analise_conversas',
      trigger_type: 'cron',
      cron_expr: '0 16 * * 5',
      prompt_template: 'Revisão semanal: analise engajamento da semana, identifique padrões de resposta, sugira ajustes no template de mensagem, liste os 10 leads mais engajados e os 10 que precisam de reativação.',
      whatsapp_template: null,
    },
    {
      name: 'Relatório Executivo Semanal',
      description: 'Gera relatório executivo da semana com KPIs e sugestões (sexta às 18h)',
      tipo: 'relatorio',
      trigger_type: 'cron',
      cron_expr: '0 18 * * 5',
      prompt_template: 'Gere relatório executivo semanal: total de prospects abordados, taxa de resposta, leads movidos no funil, receita gerada, comparativo com semana anterior, 3 melhorias sugeridas para próxima semana. Envie por e-mail.',
      whatsapp_template: null,
    },
    {
      name: 'Sync Prospecção Ativa',
      description: 'Sincroniza dados de prospecção e atualiza scores automaticamente',
      tipo: 'melhoria',
      trigger_type: 'ambos',
      cron_expr: '0 6 * * 1-5',
      event_trigger: 'lead_created',
      prompt_template: 'Sincronize os dados de prospecção: chame /api/leads/prospecting-sync para atualizar last_contact, mover leads frios para negociação, recalcular scores e identificar oportunidades de upsell.',
      whatsapp_template: null,
    },
  ];

  const created = [];
  const skipped = [];
  for (const d of defaults) {
    const existing = await sql`SELECT id FROM robots WHERE company_id = ${companyId} AND name = ${d.name} LIMIT 1`;
    if (existing.length > 0) { skipped.push(d.name); continue; }
    const [r] = await sql`
      INSERT INTO robots (company_id, name, description, tipo, trigger_type, cron_expr, event_trigger, prompt_template, whatsapp_template)
      VALUES (${companyId}, ${d.name}, ${d.description}, ${d.tipo}, ${d.trigger_type},
              ${d.cron_expr||null}, ${d.event_trigger||null}, ${d.prompt_template||null}, ${d.whatsapp_template||null})
      RETURNING id, name`;
    created.push(r.name);
  }
  res.json({ created, skipped });
});

// ── POST /api/robots ───────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  if (!['admin','master'].includes(req.role)) return res.status(403).json({ error: 'Apenas admins.' });
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
  if (!['admin','master'].includes(req.role)) return res.status(403).json({ error: 'Apenas admins.' });
  const { name, description, tipo, trigger_type, cron_expr, event_trigger, prompt_template, whatsapp_template, ativo } = req.body;
  try {
    const isMaster = req.role === 'master';
    const [robot] = isMaster
      ? await sql`
          UPDATE robots SET name=${name}, description=${description||null}, tipo=${tipo},
            trigger_type=${trigger_type||'cron'}, cron_expr=${cron_expr||null},
            event_trigger=${event_trigger||null}, prompt_template=${prompt_template||null},
            whatsapp_template=${whatsapp_template||null}, ativo=${ativo !== false}, updated_at=NOW()
          WHERE id = ${req.params.id} RETURNING *`
      : await sql`
          UPDATE robots SET name=${name}, description=${description||null}, tipo=${tipo},
            trigger_type=${trigger_type||'cron'}, cron_expr=${cron_expr||null},
            event_trigger=${event_trigger||null}, prompt_template=${prompt_template||null},
            whatsapp_template=${whatsapp_template||null}, ativo=${ativo !== false}, updated_at=NOW()
          WHERE id = ${req.params.id} AND company_id = ${req.companyId} RETURNING *`;
    if (!robot) return res.status(404).json({ error: 'Robô não encontrado.' });
    res.json(robot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/robots/:id ─────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  if (!['admin','master'].includes(req.role)) return res.status(403).json({ error: 'Apenas admins.' });
  const isMaster = req.role === 'master';
  if (isMaster) {
    await sql`UPDATE robots SET ativo = false WHERE id = ${req.params.id}`;
  } else {
    await sql`UPDATE robots SET ativo = false WHERE id = ${req.params.id} AND company_id = ${req.companyId}`;
  }
  res.json({ ok: true });
});

// ── POST /api/robots/:id/log ───────────────────────────────────────────────────
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
    const isMaster = req.role === 'master';
    const logs = isMaster
      ? await sql`SELECT * FROM robot_logs WHERE robot_id = ${req.params.id} ORDER BY created_at DESC LIMIT 50`
      : await sql`SELECT * FROM robot_logs WHERE robot_id = ${req.params.id} AND company_id = ${req.companyId} ORDER BY created_at DESC LIMIT 50`;
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/robots/:id/run — enfileira para execução pelo Cowork ────────────
router.post('/:id/run', async (req, res) => {
  if (!['admin','master'].includes(req.role)) return res.status(403).json({ error: 'Apenas admins.' });
  try {
    const isMaster = req.role === 'master';
    const [robot] = isMaster
      ? await sql`SELECT * FROM robots WHERE id = ${req.params.id} AND ativo = true`
      : await sql`SELECT * FROM robots WHERE id = ${req.params.id} AND company_id = ${req.companyId} AND ativo = true`;

    if (!robot) return res.status(404).json({ error: 'Robô não encontrado.' });

    // Marca como enfileirado (Cowork vai buscar e executar)
    await sql`UPDATE robots SET queued_at = NOW() WHERE id = ${robot.id}`;
    await sql`
      INSERT INTO robot_logs (robot_id, company_id, status, output)
      VALUES (${robot.id}, ${robot.company_id}, 'queued', 'Aguardando execução pelo Cowork…')`;

    res.json({ ok: true, message: `Robô "${robot.name}" enfileirado. O Cowork vai executar em instantes.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/robots/run-due ────────────────────────────────────────────────────
router.get('/run-due', async (req, res) => {
  const token = req.headers['x-robot-token'];
  if (!token || token !== process.env.ROBOT_SECRET) {
    return res.status(401).json({ error: 'Token inválido.' });
  }
  try {
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
