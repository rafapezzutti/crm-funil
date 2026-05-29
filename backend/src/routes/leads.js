/**
 * CRM Pezzutti — Leads Route
 * GET    /api/leads              → listar (filtros: stage, crm, score, q)
 * POST   /api/leads              → criar lead
 * GET    /api/leads/:id          → detalhe completo
 * PUT    /api/leads/:id          → editar
 * DELETE /api/leads/:id          → excluir
 * PUT    /api/leads/:id/stage    → mover etapa
 * GET    /api/leads/:id/activities  → timeline
 * POST   /api/leads/:id/activities → adicionar atividade manual
 * GET    /api/leads/:id/proposals   → propostas
 * POST   /api/leads/:id/proposals   → nova proposta
 * GET    /api/leads/:id/onboarding  → checklist
 * PUT    /api/leads/:id/onboarding/:item → marcar item
 */

const router = require('express').Router();
const auth   = require('../middleware/auth');
const { sql } = require('../config/db');

const ONBOARDING_DEFAULT = [
  'usuario_criado',
  'treinamento_realizado',
  'primeiro_acesso',
  'dados_cadastrados',
  'configuracao_concluida',
];

const STAGE_LABELS = {
  prospeccao:'Prospecção', negociacao:'Negociação',
  piloto:'Piloto / Teste', producao:'Produção',
  perdido:'Perdido', cancelado:'Cancelado',
};

async function recordActivity(leadId, userId, userName, tipo, descricao, dados) {
  await sql`
    INSERT INTO lead_activities (lead_id, user_id, user_name, tipo, descricao, dados)
    VALUES (${leadId}, ${userId||null}, ${userName||null}, ${tipo}, ${descricao}, ${dados ? JSON.stringify(dados) : null})`;
}

async function ensureOnboarding(leadId) {
  for (const item of ONBOARDING_DEFAULT) {
    await sql`
      INSERT INTO onboarding_items (lead_id, item)
      VALUES (${leadId}, ${item})
      ON CONFLICT (lead_id, item) DO NOTHING`;
  }
}

// ── GET /api/leads ────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { stage, crm, score, q, responsavel } = req.query;
    const leads = await sql`
      SELECT l.id, l.nome, l.empresa, l.email, l.telefone,
             l.stage, l.crm, l.origem, l.score, l.health_score,
             l.valor_plano, l.valor_negociado, l.data_proxima_acao, l.proxima_acao,
             l.trial_start, l.trial_end, l.motivo_perda,
             l.crm_externo_slug, l.created_at, l.updated_at,
             p.nome AS plano_nome, p.valor AS plano_valor,
             u.name AS responsavel_nome
      FROM   leads l
      LEFT JOIN plans p ON p.id = l.plano_id
      LEFT JOIN users u ON u.id = l.responsavel_id
      WHERE  l.company_id = ${req.companyId}
        AND  (${stage||null}::text IS NULL OR l.stage = ${stage||null})
        AND  (${crm||null}::text   IS NULL OR l.crm   = ${crm||null})
        AND  (${score||null}::text IS NULL OR l.score  = ${score||null})
        AND  (${q||null}::text     IS NULL OR l.nome ILIKE ${'%'+(q||'')+'%'} OR l.empresa ILIKE ${'%'+(q||'')+'%'})
      ORDER  BY l.updated_at DESC`;
    res.json(leads);
  } catch (err) {
    console.error('[leads GET /]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/leads ───────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const {
      nome, empresa, email, telefone, crm, origem, score, obs,
      plano_id, valor_plano, valor_negociado, responsavel_id,
      data_fechamento, proxima_acao, data_proxima_acao, stage,
    } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

    const [lead] = await sql`
      INSERT INTO leads (
        company_id, nome, empresa, email, telefone, crm, origem, score, obs,
        plano_id, valor_plano, valor_negociado, responsavel_id,
        data_fechamento, proxima_acao, data_proxima_acao,
        stage
      ) VALUES (
        ${req.companyId}, ${nome}, ${empresa||null}, ${email||null}, ${telefone||null},
        ${crm||null}, ${origem||null}, ${score||null}, ${obs||null},
        ${plano_id||null}, ${valor_plano||null}, ${valor_negociado||null},
        ${responsavel_id||null}, ${data_fechamento||null},
        ${proxima_acao||null}, ${data_proxima_acao||null},
        ${stage||'prospeccao'}
      ) RETURNING *`;

    // Registro na timeline
    const [u] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
    await recordActivity(lead.id, req.userId, u?.name, 'criacao',
      `Lead criado na etapa ${STAGE_LABELS[lead.stage] || lead.stage}`);

    // Onboarding se entrou direto em produção
    if (lead.stage === 'producao') await ensureOnboarding(lead.id);

    res.status(201).json(lead);
  } catch (err) {
    console.error('[leads POST /]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/leads/:id ────────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const [lead] = await sql`
      SELECT l.*, p.nome AS plano_nome, p.valor AS plano_valor,
             u.name AS responsavel_nome
      FROM   leads l
      LEFT JOIN plans p ON p.id = l.plano_id
      LEFT JOIN users u ON u.id = l.responsavel_id
      WHERE  l.id = ${req.params.id} AND l.company_id = ${req.companyId}`;
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    const activities = await sql`
      SELECT * FROM lead_activities WHERE lead_id = ${lead.id}
      ORDER BY created_at DESC`;

    const proposals = await sql`
      SELECT * FROM lead_proposals WHERE lead_id = ${lead.id}
      ORDER BY created_at DESC`;

    const onboarding = await sql`
      SELECT * FROM onboarding_items WHERE lead_id = ${lead.id}
      ORDER BY id`;

    res.json({ ...lead, activities, proposals, onboarding });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/leads/:id ────────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const {
      nome, empresa, email, telefone, crm, origem, score, obs,
      plano_id, valor_plano, valor_negociado, responsavel_id,
      data_fechamento, proxima_acao, data_proxima_acao, health_score,
    } = req.body;

    const [lead] = await sql`
      UPDATE leads SET
        nome = ${nome}, empresa = ${empresa||null}, email = ${email||null},
        telefone = ${telefone||null}, crm = ${crm||null}, origem = ${origem||null},
        score = ${score||null}, obs = ${obs||null},
        plano_id = ${plano_id||null}, valor_plano = ${valor_plano||null},
        valor_negociado = ${valor_negociado||null},
        responsavel_id = ${responsavel_id||null},
        data_fechamento = ${data_fechamento||null},
        proxima_acao = ${proxima_acao||null},
        data_proxima_acao = ${data_proxima_acao||null},
        health_score = ${health_score||'green'},
        updated_at = NOW()
      WHERE id = ${req.params.id} AND company_id = ${req.companyId}
      RETURNING *`;

    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/leads/:id ─────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    await sql`DELETE FROM leads WHERE id = ${req.params.id} AND company_id = ${req.companyId}`;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/leads/:id/stage ──────────────────────────────────────────────────
router.put('/:id/stage', auth, async (req, res) => {
  try {
    const { stage, motivo_perda, trial_days, descricao } = req.body;
    if (!stage) return res.status(400).json({ error: 'stage é obrigatório.' });

    const updates = { stage, updated_at: 'NOW()' };
    if (motivo_perda) updates.motivo_perda = motivo_perda;

    // Trial: define datas
    let trialStart = null, trialEnd = null;
    if (stage === 'piloto') {
      const days = parseInt(trial_days || 10);
      trialStart = new Date();
      trialEnd   = new Date(Date.now() + days * 86400_000);
    }

    const [lead] = await sql`
      UPDATE leads SET
        stage             = ${stage},
        motivo_perda      = ${motivo_perda||null},
        trial_start       = ${stage==='piloto' ? trialStart : sql`trial_start`},
        trial_end         = ${stage==='piloto' ? trialEnd   : sql`trial_end`},
        updated_at        = NOW()
      WHERE id = ${req.params.id} AND company_id = ${req.companyId}
      RETURNING *`;

    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    // Onboarding ao entrar em produção
    if (stage === 'producao') await ensureOnboarding(lead.id);

    // Activity log
    const [u] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
    const desc = descricao || `Movido para ${STAGE_LABELS[stage]||stage}${motivo_perda ? ' — ' + motivo_perda : ''}`;
    await recordActivity(lead.id, req.userId, u?.name, 'mudanca_etapa', desc, { stage_anterior: lead.stage, stage_novo: stage });

    res.json(lead);
  } catch (err) {
    console.error('[leads PUT stage]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/leads/:id/activities ─────────────────────────────────────────────
router.get('/:id/activities', auth, async (req, res) => {
  try {
    const rows = await sql`
      SELECT * FROM lead_activities
      WHERE lead_id = ${req.params.id}
      ORDER BY created_at DESC`;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/leads/:id/activities ────────────────────────────────────────────
router.post('/:id/activities', auth, async (req, res) => {
  try {
    const { tipo, descricao } = req.body;
    if (!descricao) return res.status(400).json({ error: 'descricao é obrigatório.' });
    const [u] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
    const [row] = await sql`
      INSERT INTO lead_activities (lead_id, user_id, user_name, tipo, descricao)
      VALUES (${req.params.id}, ${req.userId}, ${u?.name||null}, ${tipo||'obs'}, ${descricao})
      RETURNING *`;
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/leads/:id/proposals ─────────────────────────────────────────────
router.get('/:id/proposals', auth, async (req, res) => {
  try {
    const rows = await sql`
      SELECT * FROM lead_proposals WHERE lead_id = ${req.params.id}
      ORDER BY created_at DESC`;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/leads/:id/proposals ─────────────────────────────────────────────
router.post('/:id/proposals', auth, async (req, res) => {
  try {
    const { valor, data_envio, obs } = req.body;
    const count = await sql`SELECT COUNT(*) AS c FROM lead_proposals WHERE lead_id = ${req.params.id}`;
    const versao = parseInt(count[0].c) + 1;
    const [row] = await sql`
      INSERT INTO lead_proposals (lead_id, versao, valor, data_envio, obs)
      VALUES (${req.params.id}, ${versao}, ${valor||null}, ${data_envio||null}, ${obs||null})
      RETURNING *`;
    // Activity
    const [u] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
    await recordActivity(req.params.id, req.userId, u?.name, 'proposta',
      `Proposta v${versao} enviada${valor ? ' — R$ ' + Number(valor).toLocaleString('pt-BR',{minimumFractionDigits:2}) : ''}`);
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/leads/:id/onboarding ─────────────────────────────────────────────
router.get('/:id/onboarding', auth, async (req, res) => {
  try {
    await ensureOnboarding(req.params.id);
    const rows = await sql`
      SELECT * FROM onboarding_items WHERE lead_id = ${req.params.id} ORDER BY id`;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/leads/:id/onboarding/:item ──────────────────────────────────────
router.put('/:id/onboarding/:item', auth, async (req, res) => {
  try {
    const { concluido } = req.body;
    await sql`
      UPDATE onboarding_items
      SET concluido = ${concluido}, concluido_at = ${concluido ? sql`NOW()` : null}
      WHERE lead_id = ${req.params.id} AND item = ${req.params.item}`;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/leads/:id/whatsapp ───────────────────────────────────────────────
// Lista conversas WhatsApp anexadas ao lead
router.get('/:id/whatsapp', auth, async (req, res) => {
  try {
    const rows = await sql`
      SELECT id, filename, contact_name, source, message_count,
             date_start, date_end, created_at
      FROM   lead_whatsapp_chats
      WHERE  lead_id    = ${req.params.id}
        AND  company_id = ${req.companyId}
      ORDER  BY created_at DESC`;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/leads/:id/whatsapp/:chatId ───────────────────────────────────────
// Retorna mensagens completas de uma conversa
router.get('/:id/whatsapp/:chatId', auth, async (req, res) => {
  try {
    const [chat] = await sql`
      SELECT * FROM lead_whatsapp_chats
      WHERE id = ${req.params.chatId}
        AND lead_id    = ${req.params.id}
        AND company_id = ${req.companyId}`;
    if (!chat) return res.status(404).json({ error: 'Conversa não encontrada.' });
    res.json(chat);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/leads/:id/whatsapp ──────────────────────────────────────────────
// Salva uma exportação de conversa WhatsApp
router.post('/:id/whatsapp', auth, async (req, res) => {
  try {
    const { filename, contactName, source, content, messages } = req.body;
    if (!content) return res.status(400).json({ error: 'Conteúdo da conversa é obrigatório.' });

    const [lead] = await sql`
      SELECT id FROM leads WHERE id = ${req.params.id} AND company_id = ${req.companyId}`;
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    const msgArray  = messages || [];
    const count     = msgArray.length;
    const dateStart = msgArray.length > 0 ? msgArray[0].ts  : null;
    const dateEnd   = msgArray.length > 0 ? msgArray[msgArray.length - 1].ts : null;

    const [chat] = await sql`
      INSERT INTO lead_whatsapp_chats
        (lead_id, company_id, filename, contact_name, source, content, messages, message_count, date_start, date_end, uploaded_by)
      VALUES
        (${req.params.id}, ${req.companyId}, ${filename||null}, ${contactName||null},
         ${source||'whatsapp'}, ${content}, ${JSON.stringify(msgArray)}, ${count},
         ${dateStart||null}, ${dateEnd||null}, ${req.userId})
      RETURNING id, filename, contact_name, message_count, date_start, date_end, created_at`;

    // Activity log
    const [u] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
    await recordActivity(req.params.id, req.userId, u?.name, 'whatsapp',
      `Conversa WhatsApp anexada: ${filename || 'sem nome'} (${count} mensagens)`);

    res.status(201).json(chat);
  } catch (err) {
    console.error('[whatsapp chat POST]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/leads/:id/whatsapp/:chatId ────────────────────────────────────
router.delete('/:id/whatsapp/:chatId', auth, async (req, res) => {
  try {
    await sql`
      DELETE FROM lead_whatsapp_chats
      WHERE id = ${req.params.chatId}
        AND lead_id    = ${req.params.id}
        AND company_id = ${req.companyId}`;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


module.exports = router;
