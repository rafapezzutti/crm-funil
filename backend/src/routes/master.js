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


// POST /api/master/bootstrap — cria P. Soluções, sobe Rafael a master, semeia robôs
// Protegido por X-Robot-Token (sem JWT — usado uma vez para configurar o sistema)
router.post('/bootstrap', async (req, res) => {
  const token = req.headers['x-robot-token'];
  if (!token || token !== process.env.ROBOT_SECRET) {
    return res.status(401).json({ error: 'Token inválido.' });
  }
  const adminEmail = req.body.email || 'rafael.pezzutti@gmail.com';
  const log = [];

  try {
    // 1. Encontrar Rafael
    const [user] = await sql`SELECT id, name, email FROM users WHERE email = ${adminEmail.toLowerCase()}`;
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado: ' + adminEmail });
    log.push('Usuário encontrado: ' + user.name + ' (' + user.email + ')');

    // 2. Criar P. Soluções se não existe
    let [pSol] = await sql`SELECT id, name FROM companies WHERE slug LIKE 'p-solucoes%' OR name ILIKE '%pezzutti%' OR name ILIKE '%p. sol%' LIMIT 1`;
    if (!pSol) {
      const slug = 'p-solucoes-' + Date.now().toString(36);
      [pSol] = await sql`
        INSERT INTO companies (name, slug, plan, status)
        VALUES ('P. Soluções', ${slug}, 'master', 'ativo')
        RETURNING id, name`;
      log.push('Empresa criada: ' + pSol.name + ' (' + pSol.id + ')');
    } else {
      // Garantir plano master e status ativo
      await sql`UPDATE companies SET plan = 'master', status = 'ativo' WHERE id = ${pSol.id}`;
      log.push('Empresa já existe: ' + pSol.name + ' (' + pSol.id + ')');
    }

    // 3. Associar Rafael como master
    const [existing] = await sql`SELECT role FROM company_members WHERE user_id = ${user.id} AND company_id = ${pSol.id}`;
    if (!existing) {
      await sql`INSERT INTO company_members (company_id, user_id, role) VALUES (${pSol.id}, ${user.id}, 'master')`;
      log.push('Rafael adicionado como master em P. Soluções');
    } else if (existing.role !== 'master') {
      await sql`UPDATE company_members SET role = 'master' WHERE user_id = ${user.id} AND company_id = ${pSol.id}`;
      log.push('Role de Rafael atualizado para master');
    } else {
      log.push('Rafael já é master em P. Soluções');
    }

    // 4. Garantir seller_profile
    await sql`INSERT INTO seller_profiles (user_id, company_id, ativo) VALUES (${user.id}, ${pSol.id}, true) ON CONFLICT (user_id) DO NOTHING`;

    // 5. Semear 6 robôs
    const defaults = [
      { name:'Prospecção Ativa WhatsApp',    tipo:'prospeccao_whatsapp', trigger_type:'cron',    cron_expr:'0 3 * * 1-5',  event_trigger:null, prompt_template:'Execute a prospecção ativa: busque leads com stage=prospeccao e ultimo_whatsapp_at nulo ou > 7 dias, envie mensagem via WhatsApp conforme template, registre a atividade e atualize ultimo_whatsapp_at.', whatsapp_template:'Olá {nome}! Sou da equipe Pezzutti Soluções. Vi que você pode se beneficiar com nosso sistema de gestão comercial. Posso te mostrar como funciona em 15 minutos?' },
      { name:'Análise de Conversas 13h',      tipo:'analise_conversas',   trigger_type:'cron',    cron_expr:'0 13 * * 1-5', event_trigger:null, prompt_template:'Analise as respostas de WhatsApp recebidas desde o último ciclo. Classifique cada lead como quente/morno/frio/visualizado/sem_resposta. Atualize o score no CRM e gere resumo das conversas mais relevantes.', whatsapp_template:null },
      { name:'Análise de Conversas 21h',      tipo:'analise_conversas',   trigger_type:'cron',    cron_expr:'0 21 * * 1-5', event_trigger:null, prompt_template:'Análise final do dia: consolide todas as respostas WhatsApp do dia, salve análise em JSON com classificações, identifique leads quentes para follow-up prioritário amanhã e envie e-mail resumo.', whatsapp_template:null },
      { name:'Revisão WhatsApp — Sexta',      tipo:'analise_conversas',   trigger_type:'cron',    cron_expr:'0 16 * * 5',   event_trigger:null, prompt_template:'Revisão semanal: analise engajamento da semana, identifique padrões de resposta, sugira ajustes no template de mensagem, liste os 10 leads mais engajados e os 10 que precisam de reativação.', whatsapp_template:null },
      { name:'Relatório Executivo Semanal',   tipo:'relatorio',           trigger_type:'cron',    cron_expr:'0 18 * * 5',   event_trigger:null, prompt_template:'Gere relatório executivo semanal: total de prospects abordados, taxa de resposta, leads movidos no funil, receita gerada, comparativo com semana anterior, 3 melhorias sugeridas. Envie por e-mail.', whatsapp_template:null },
      { name:'Sync Prospecção Ativa',         tipo:'melhoria',            trigger_type:'ambos',   cron_expr:'0 6 * * 1-5',  event_trigger:'lead_created', prompt_template:'Sincronize os dados de prospecção: chame /api/leads/prospecting-sync para atualizar last_contact, mover leads frios para negociação, recalcular scores e identificar oportunidades de upsell.', whatsapp_template:null },
    ];
    const created = [], skipped = [];
    for (const d of defaults) {
      const [ex] = await sql`SELECT id FROM robots WHERE company_id = ${pSol.id} AND name = ${d.name} LIMIT 1`;
      if (ex) { skipped.push(d.name); continue; }
      await sql`INSERT INTO robots (company_id, name, tipo, trigger_type, cron_expr, event_trigger, prompt_template, whatsapp_template)
        VALUES (${pSol.id}, ${d.name}, ${d.tipo}, ${d.trigger_type}, ${d.cron_expr}, ${d.event_trigger}, ${d.prompt_template}, ${d.whatsapp_template})`;
      created.push(d.name);
    }
    log.push('Robôs criados: ' + (created.length ? created.join(', ') : 'nenhum novo'));
    if (skipped.length) log.push('Robôs já existiam: ' + skipped.join(', '));

    // 6. Gerar token master para login imediato
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

module.exports = router;
