const router  = require('express').Router();
const auth    = require('../middleware/auth');
const jwt     = require('jsonwebtoken');
const { sql } = require('../config/db');

// ── POST /api/master/bootstrap ─────────────────────────────────────────────────
// Sem auth JWT — protegido apenas por X-Robot-Token
// Cria P. Soluções, sobe Rafael a master, semeia 6 robôs
router.post('/bootstrap', async (req, res) => {
  const token = req.headers['x-robot-token'];
  if (!token || token !== process.env.ROBOT_SECRET) {
    return res.status(401).json({ error: 'Token inválido.' });
  }
  const adminEmail = (req.body.email || 'rafael.pezzutti@gmail.com').toLowerCase();
  const log = [];
  try {
    // 1. Encontrar usuário
    const [user] = await sql`SELECT id, name, email FROM users WHERE email = ${adminEmail}`;
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado: ' + adminEmail });
    log.push('Usuário: ' + user.name + ' (' + user.email + ')');

    // 2. Criar P. Soluções se não existe
    let [pSol] = await sql`SELECT id, name FROM companies WHERE slug LIKE 'p-solucoes%' OR name ILIKE '%pezzutti%' OR name ILIKE 'p. sol%' LIMIT 1`;
    if (!pSol) {
      const slug = 'p-solucoes-' + Date.now().toString(36);
      [pSol] = await sql`
        INSERT INTO companies (name, slug, plan, status)
        VALUES ('P. Soluções', ${slug}, 'master', 'ativo')
        RETURNING id, name`;
      log.push('Empresa criada: ' + pSol.name);
    } else {
      await sql`UPDATE companies SET plan = 'master', status = 'ativo' WHERE id = ${pSol.id}`;
      log.push('Empresa já existe: ' + pSol.name);
    }

    // 3. Associar como master
    const [existing] = await sql`SELECT role FROM company_members WHERE user_id = ${user.id} AND company_id = ${pSol.id}`;
    if (!existing) {
      await sql`INSERT INTO company_members (company_id, user_id, role) VALUES (${pSol.id}, ${user.id}, 'master')`;
      log.push('Role master atribuído');
    } else if (existing.role !== 'master') {
      await sql`UPDATE company_members SET role = 'master' WHERE user_id = ${user.id} AND company_id = ${pSol.id}`;
      log.push('Role atualizado para master');
    } else {
      log.push('Já é master');
    }
    await sql`INSERT INTO seller_profiles (user_id, company_id, ativo) VALUES (${user.id}, ${pSol.id}, true) ON CONFLICT (user_id) DO NOTHING`;

    // 4. Semear 6 robôs
    const defaults = [
      { name:'Prospecção Diária 03h',        tipo:'prospeccao_whatsapp', trigger_type:'cron',  cron_expr:'0 3 * * 1-5',  event_trigger:null,           prompt:'Execute a prospecção ativa: busque leads com stage=prospeccao e ultimo_whatsapp_at nulo ou > 7 dias, envie mensagem via WhatsApp conforme template, registre a atividade e atualize ultimo_whatsapp_at.',  wa:'Olá {nome}! Sou da Pezzutti Soluções. Vi que você pode se beneficiar com nosso CRM comercial. Posso mostrar em 15 minutos?' },
      { name:'Revisão WhatsApp 15h',          tipo:'analise_conversas',   trigger_type:'cron',  cron_expr:'0 15 * * 1-5', event_trigger:null,           prompt:'Analise as respostas de WhatsApp recebidas desde o último ciclo. Classifique cada lead como quente/morno/frio/visualizado/sem_resposta. Atualize o score no CRM e gere resumo.', wa:null },
      { name:'Revisão WhatsApp 18h',          tipo:'analise_conversas',   trigger_type:'cron',  cron_expr:'0 18 * * 1-5', event_trigger:null,           prompt:'Análise final do dia: consolide respostas WhatsApp, salve análise em JSON, identifique leads quentes para follow-up amanhã, envie e-mail resumo.',                                                              wa:null },
      { name:'Relatório Diário 21h',          tipo:'relatorio',           trigger_type:'cron',  cron_expr:'0 21 * * 1-5', event_trigger:null,           prompt:'Gere relatório diário: total de prospects abordados, taxa de resposta, movimentações no funil, destaques do dia, próximas ações prioritárias.',                                                                   wa:null },
      { name:'Revisão WhatsApp Sexta 16h',    tipo:'analise_conversas',   trigger_type:'cron',  cron_expr:'0 16 * * 5',   event_trigger:null,           prompt:'Revisão semanal: analise engajamento da semana, padrões de resposta, sugira ajustes no template, liste os 10 leads mais engajados e os 10 que precisam reativação.',                                                  wa:null },
      { name:'Relatório Semanal Sexta 18h',   tipo:'relatorio',           trigger_type:'cron',  cron_expr:'0 18 * * 5',   event_trigger:null,           prompt:'Relatório executivo semanal: prospects abordados, taxa de resposta, leads movidos no funil, receita gerada, comparativo semana anterior, 3 melhorias sugeridas. Envie por e-mail.',                                   wa:null },
    ];
    const created = [], skipped = [];
    for (const d of defaults) {
      const [ex] = await sql`SELECT id FROM robots WHERE company_id = ${pSol.id} AND name = ${d.name} LIMIT 1`;
      if (ex) { skipped.push(d.name); continue; }
      await sql`INSERT INTO robots (company_id, name, tipo, trigger_type, cron_expr, event_trigger, prompt_template, whatsapp_template)
        VALUES (${pSol.id}, ${d.name}, ${d.tipo}, ${d.trigger_type}, ${d.cron_expr}, ${d.event_trigger}, ${d.prompt}, ${d.wa})`;
      created.push(d.name);
    }
    log.push('Robôs criados: ' + (created.length ? created.join(', ') : 'nenhum novo'));
    if (skipped.length) log.push('Já existiam: ' + skipped.join(', '));

    // 5. Gerar token master
    const masterToken = jwt.sign(
      { userId: user.id, companyId: pSol.id, role: 'master' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ ok: true, log, company: pSol, masterToken });
  } catch (err) {
    res.status(500).json({ error: err.message, log });
  }
});

// ── Rotas protegidas por JWT ───────────────────────────────────────────────────
router.use(auth);

function masterOnly(req, res, next) {
  if (req.role !== 'master') return res.status(403).json({ error: 'Acesso restrito ao master.' });
  next();
}

// GET /api/master/companies
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

// POST /api/master/impersonate
router.post('/impersonate', masterOnly, async (req, res) => {
  const { companyId } = req.body;
  if (!companyId) return res.status(400).json({ error: 'companyId obrigatório.' });
  try {
    const [company] = await sql`SELECT id, name, slug, plan, trial_ends_at, status FROM companies WHERE id = ${companyId}`;
    if (!company) return res.status(404).json({ error: 'Empresa não encontrada.' });
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
