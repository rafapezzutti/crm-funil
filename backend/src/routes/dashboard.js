/**
 * CRM Pezzutti — Dashboard Route
 * GET /api/dashboard          → KPIs principais + MRR + alertas
 * GET /api/dashboard/mrr      → MRR por CRM
 * GET /api/dashboard/alerts   → lista de alertas ativos
 */
const router = require('express').Router();
const auth   = require('../middleware/auth');
const { sql } = require('../config/db');

// ── GET /api/dashboard ────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const cid = req.companyId;

    // Contagem por etapa
    const counts = await sql`
      SELECT stage, COUNT(*) AS total
      FROM leads WHERE company_id = ${cid}
      GROUP BY stage`;
    const byStage = {};
    counts.forEach(r => { byStage[r.stage] = parseInt(r.total); });

    // MRR por CRM (apenas produção)
    const mrrRows = await sql`
      SELECT l.crm,
             COALESCE(SUM(COALESCE(l.valor_negociado, l.valor_plano, p.valor, 0)), 0) AS mrr
      FROM   leads l
      LEFT JOIN plans p ON p.id = l.plano_id
      WHERE  l.company_id = ${cid} AND l.stage = 'producao'
      GROUP  BY l.crm`;
    const mrr = { total: 0, saude: 0, spa: 0, esportes: 0, pet: 0 };
    mrrRows.forEach(r => {
      const v = parseFloat(r.mrr) || 0;
      mrr[r.crm] = (mrr[r.crm] || 0) + v;
      mrr.total += v;
    });

    // Ticket médio em produção
    const [ticketRow] = await sql`
      SELECT AVG(COALESCE(l.valor_negociado, l.valor_plano, p.valor, 0)) AS ticket
      FROM   leads l
      LEFT JOIN plans p ON p.id = l.plano_id
      WHERE  l.company_id = ${cid} AND l.stage = 'producao'`;
    const ticket = parseFloat(ticketRow?.ticket || 0);

    // Testes próximos do vencimento (< 3 dias) ou vencidos
    const trials = await sql`
      SELECT id, nome, empresa, trial_end,
             EXTRACT(DAY FROM trial_end - NOW()) AS dias_restantes
      FROM   leads
      WHERE  company_id = ${cid} AND stage = 'piloto'
        AND  trial_end IS NOT NULL
        AND  trial_end < NOW() + INTERVAL '4 days'
      ORDER  BY trial_end`;

    // Ações atrasadas
    const atrasadas = await sql`
      SELECT id, nome, empresa, proxima_acao, data_proxima_acao
      FROM   leads
      WHERE  company_id = ${cid}
        AND  stage NOT IN ('perdido','cancelado')
        AND  data_proxima_acao < CURRENT_DATE
      ORDER  BY data_proxima_acao LIMIT 10`;

    // Atividades recentes
    const recentActivity = await sql`
      SELECT la.*, l.nome AS lead_nome, l.empresa AS lead_empresa
      FROM   lead_activities la
      JOIN   leads l ON l.id = la.lead_id
      WHERE  l.company_id = ${cid}
      ORDER  BY la.created_at DESC LIMIT 15`;

    // Leads criados nos últimos 30 dias (crescimento)
    const growth = await sql`
      SELECT DATE_TRUNC('week', created_at) AS semana, COUNT(*) AS total
      FROM   leads
      WHERE  company_id = ${cid} AND created_at > NOW() - INTERVAL '90 days'
      GROUP  BY 1 ORDER BY 1`;

    res.json({
      byStage, mrr, ticket,
      trials, atrasadas, recentActivity, growth,
    });
  } catch (err) {
    console.error('[dashboard]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/dashboard/alerts ─────────────────────────────────────────────────
router.get('/alerts', auth, async (req, res) => {
  try {
    const cid = req.companyId;
    const alerts = [];

    // Testes vencidos
    const vencidos = await sql`
      SELECT id, nome, empresa FROM leads
      WHERE company_id = ${cid} AND stage = 'piloto'
        AND trial_end < NOW()`;
    vencidos.forEach(l =>
      alerts.push({ tipo:'trial_vencido', severity:'high', lead_id:l.id,
        lead_nome: l.nome, lead_empresa: l.empresa,
        descricao: `Teste vencido — ${l.empresa||l.nome}` }));

    // Testes vencendo em 3 dias
    const vencendo = await sql`
      SELECT id, nome, empresa, trial_end,
             CEIL(EXTRACT(EPOCH FROM trial_end - NOW()) / 86400)::int AS dias
      FROM leads
      WHERE company_id = ${cid} AND stage = 'piloto'
        AND trial_end BETWEEN NOW() AND NOW() + INTERVAL '3 days'`;
    vencendo.forEach(l =>
      alerts.push({ tipo:'trial_vencendo', severity:'medium', lead_id:l.id,
        lead_nome: l.nome, lead_empresa: l.empresa,
        descricao: `Teste vence em ${l.dias} dia${l.dias!==1?'s':''} — ${l.empresa||l.nome}` }));

    // Próxima ação atrasada
    const atrasadas = await sql`
      SELECT id, nome, empresa, proxima_acao, data_proxima_acao FROM leads
      WHERE company_id = ${cid} AND stage NOT IN ('perdido','cancelado')
        AND data_proxima_acao < CURRENT_DATE`;
    atrasadas.forEach(l =>
      alerts.push({ tipo:'acao_atrasada', severity:'medium', lead_id:l.id,
        lead_nome: l.nome, lead_empresa: l.empresa,
        descricao: `Ação atrasada: ${l.proxima_acao||'follow-up'} — ${l.empresa||l.nome}` }));

    // Leads em negociação sem atividade há 7 dias
    const sem_atividade = await sql`
      SELECT l.id, l.nome, l.empresa FROM leads l
      WHERE l.company_id = ${cid} AND l.stage = 'negociacao'
        AND l.updated_at < NOW() - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM lead_activities la
          WHERE la.lead_id = l.id AND la.created_at > NOW() - INTERVAL '7 days'
        )`;
    sem_atividade.forEach(l =>
      alerts.push({ tipo:'sem_interacao', severity:'low', lead_id:l.id,
        lead_nome: l.nome, lead_empresa: l.empresa,
        descricao: `Sem interação há 7+ dias — ${l.empresa||l.nome}` }));

    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/dashboard/mrr ────────────────────────────────────────────────────
router.get('/mrr', auth, async (req, res) => {
  try {
    const rows = await sql`
      SELECT l.crm,
             COUNT(*) AS clientes,
             COALESCE(SUM(COALESCE(l.valor_negociado, l.valor_plano, p.valor, 0)), 0) AS mrr,
             AVG(COALESCE(l.valor_negociado, l.valor_plano, p.valor, 0)) AS ticket
      FROM   leads l
      LEFT JOIN plans p ON p.id = l.plano_id
      WHERE  l.company_id = ${req.companyId} AND l.stage = 'producao'
      GROUP  BY l.crm
      ORDER  BY mrr DESC`;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/dashboard/activity ───────────────────────────────────────────────
// Atividade dos leads nos últimos 30 dias
router.get('/activity', auth, async (req, res) => {
  try {
    const cid = req.companyId;

    // Atividades por dia (últimos 30 dias)
    const byDay = await sql`
      SELECT DATE(la.created_at) AS dia, COUNT(*) AS total,
             COUNT(*) FILTER (WHERE la.tipo = 'mudanca_etapa') AS mudancas,
             COUNT(*) FILTER (WHERE la.tipo IN ('ligacao','whatsapp','demo')) AS contatos
      FROM   lead_activities la
      JOIN   leads l ON l.id = la.lead_id
      WHERE  l.company_id = ${cid}
        AND  la.created_at >= NOW() - INTERVAL '30 days'
      GROUP  BY 1 ORDER BY 1`;

    // Leads criados nos últimos 30 dias
    const novosLeads = await sql`
      SELECT DATE(created_at) AS dia, COUNT(*) AS total, crm
      FROM   leads
      WHERE  company_id = ${cid}
        AND  created_at >= NOW() - INTERVAL '30 days'
      GROUP  BY 1, 3 ORDER BY 1`;

    // Conversões por etapa (30 dias)
    const conversoes = await sql`
      SELECT dados->>'stage_novo' AS para, COUNT(*) AS total
      FROM   lead_activities la
      JOIN   leads l ON l.id = la.lead_id
      WHERE  l.company_id = ${cid}
        AND  la.tipo = 'mudanca_etapa'
        AND  la.created_at >= NOW() - INTERVAL '30 days'
      GROUP  BY 1`;

    // Top leads mais ativos
    const topLeads = await sql`
      SELECT l.id, l.nome, l.empresa, l.crm, l.stage,
             COUNT(la.id) AS atividades
      FROM   lead_activities la
      JOIN   leads l ON l.id = la.lead_id
      WHERE  l.company_id = ${cid}
        AND  la.created_at >= NOW() - INTERVAL '30 days'
      GROUP  BY l.id, l.nome, l.empresa, l.crm, l.stage
      ORDER  BY atividades DESC LIMIT 10`;

    res.json({ byDay, novosLeads, conversoes, topLeads });
  } catch (err) {
    console.error('[dashboard/activity]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/dashboard/sellers ────────────────────────────────────────────────
// Performance por vendedor
router.get('/sellers', auth, async (req, res) => {
  try {
    const cid = req.companyId;
    const rows = await sql`
      SELECT u.id, u.name,
             COUNT(DISTINCT l.id) FILTER (WHERE l.stage NOT IN ('perdido','cancelado')) AS leads_ativos,
             COUNT(DISTINCT l.id) FILTER (WHERE l.stage = 'producao')                  AS em_producao,
             COUNT(DISTINCT l.id) FILTER (WHERE l.stage = 'piloto')                    AS em_piloto,
             COUNT(DISTINCT l.id) FILTER (WHERE l.stage IN ('perdido','cancelado'))    AS perdidos,
             COALESCE(SUM(COALESCE(l.valor_negociado, l.valor_plano, 0))
               FILTER (WHERE l.stage = 'producao'), 0) AS mrr
      FROM   seller_profiles sp
      JOIN   users u ON u.id = sp.user_id
      LEFT JOIN leads l ON l.responsavel_id = sp.user_id AND l.company_id = ${cid}
      WHERE  sp.company_id = ${cid} AND sp.ativo = true
      GROUP  BY u.id, u.name
      ORDER  BY em_producao DESC, mrr DESC`;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── GET /api/dashbo