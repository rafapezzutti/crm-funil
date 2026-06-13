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
        AND  (${req.role !== 'vendedor' ? null : req.userId}::uuid IS NULL OR l.responsavel_id = ${req.role !== 'vendedor' ? null : req.userId}::uuid)
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

    // Vendedor: auto-associar como responsável
    if (req.role === 'vendedor' && !lead.responsavel_id) {
      await sql`UPDATE leads SET responsavel_id = ${req.userId}::uuid WHERE id = ${lead.id}`;
      lead.responsavel_id = req.userId;
    }

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

// ── POST /api/leads/prospecting-sync ─────────────────────────────────────────
// Webhook sem JWT para a automação de prospecção Cowork.
// Env vars necessárias no Render:
//   PROSPECTING_SYNC_TOKEN  — token de segurança
//   PROSPECTING_COMPANY_ID  — UUID da empresa (SELECT id FROM companies WHERE name ILIKE '%pezzutti%')
// Body: { token, data, leads: [{nome, empresa, telefone, crm, classificacao, resumo}] }
//
// Regras de negócio:
//   quente/morno           → entram/atualizam no funil (stage: prospeccao, origem: prospeccao_ativa)
//   frio (lead existente)  → registra atividade "sem interesse" na timeline; NÃO cria lead novo
//   frio (lead novo)       → ignorado (não polui o funil)
//   quente + já era quente → promove automaticamente para stage "negociacao" (2 revisões consecutivas)
//   todos                  → atualiza ultimo_whatsapp_at e incrementa prosp_quente_count se quente
router.options('/prospecting-sync', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

router.post('/prospecting-sync', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const { token, data, leads: prospectos } = req.body;

    const syncToken = process.env.PROSPECTING_SYNC_TOKEN;
    if (!syncToken || token !== syncToken) {
      return res.status(401).json({ error: 'Token inválido.' });
    }

    const companyId = process.env.PROSPECTING_COMPANY_ID;
    if (!companyId) {
      return res.status(500).json({ error: 'PROSPECTING_COMPANY_ID não configurado no Render.' });
    }

    if (!Array.isArray(prospectos) || prospectos.length === 0) {
      return res.json({ ok: true, criados: 0, atualizados: 0, ignorados: 0, promovidos: 0 });
    }

    // Admin da empresa — responsável padrão para leads sem dono
    const [adminMember] = await sql`
      SELECT user_id FROM company_members
      WHERE company_id = ${companyId}::uuid AND role = 'admin'
      LIMIT 1`;
    const adminId = adminMember?.user_id || null;

    const SCORE_MAP  = { quente: 'quente', morno: 'morno', muito_quente: 'muito_quente' };
    const SCORE_RANK = { morno: 1, quente: 2, muito_quente: 3 };

    let criados = 0, atualizados = 0, ignorados = 0, promovidos = 0;

    for (const p of prospectos) {
      // Aceita tanto 'classificacao' quanto 'score' como nome do campo
      const classificacao = (p.classificacao || p.score || '').toLowerCase();
      const score         = SCORE_MAP[classificacao];
      const isFrio        = classificacao === 'frio';

      const telNum = (p.telefone || p.whatsapp || '').replace(/\D/g, '');

      // Buscar lead existente: por telefone (se disponível) ou por nome/empresa
      let existing;
      if (telNum) {
        [existing] = await sql`
          SELECT id, score, stage, prosp_quente_count
          FROM leads
          WHERE company_id = ${companyId}::uuid
            AND regexp_replace(COALESCE(telefone,''), '[^0-9]', '', 'g') = ${telNum}
          LIMIT 1`;
      } else {
        // Sem telefone: buscar por nome ou empresa (normalizado)
        const nomeBusca = (p.nome || '').trim();
        const empBusca  = (p.empresa || '').trim();
        if (nomeBusca || empBusca) {
          [existing] = await sql`
            SELECT id, score, stage, prosp_quente_count
            FROM leads
            WHERE company_id = ${companyId}::uuid
              AND origem = 'prospeccao_ativa'
              AND (
                LOWER(TRIM(nome))    = LOWER(${nomeBusca})
                OR LOWER(TRIM(empresa)) = LOWER(${empBusca})
              )
            LIMIT 1`;
        }
      }

      // ── FRIO: só age se lead já existe no funil ──────────────────────────
      if (isFrio) {
        if (!existing) { ignorados++; continue; } // frio + lead novo → ignora
        await sql`UPDATE leads SET ultimo_whatsapp_at = NOW(), updated_at = NOW() WHERE id = ${existing.id}`;
        await sql`
          INSERT INTO lead_activities (lead_id, user_id, user_name, tipo, descricao, dados)
          VALUES (${existing.id}, NULL, 'Cowork Automação', 'prospeccao',
            ${`[${data}] Respondeu negativamente — sem interesse (prospecção ativa)`},
            ${JSON.stringify({ data, classificacao: 'frio', resumo: p.resumo || null })})`;
        atualizados++;
        continue;
      }

      // ── Visualizado/sem_resposta/nao_entregue → ignora completamente ─────
      if (!score) { ignorados++; continue; }

      if (existing) {
        // ── Lead existente: atualizar score + ultimo_whatsapp_at ──────────
        const rankNovo  = SCORE_RANK[score] || 0;
        const rankAtual = SCORE_RANK[existing.score] || 0;
        const newCount  = score === 'quente' ? (parseInt(existing.prosp_quente_count) || 0) + 1 : existing.prosp_quente_count;
        const scoreInfo = existing.score !== score ? ` (score: ${existing.score} → ${score})` : '';

        // Auto-promoção para Negociação: 2+ revisões quente consecutivas
        const devePromover = score === 'quente'
          && newCount >= 2
          && existing.stage === 'prospeccao';

        await sql`
          UPDATE leads SET
            score              = ${rankNovo > rankAtual ? score : existing.score},
            ultimo_whatsapp_at = NOW(),
            prosp_quente_count = ${newCount},
            stage              = ${devePromover ? 'negociacao' : existing.stage},
            updated_at         = NOW()
          WHERE id = ${existing.id}`;

        const desc = devePromover
          ? `[${data}] 🎯 Promovido para Negociação — ${newCount}ª revisão consecutiva como quente`
          : `[${data}] Revisão prospecção: ${classificacao}${scoreInfo}`;

        await sql`
          INSERT INTO lead_activities (lead_id, user_id, user_name, tipo, descricao, dados)
          VALUES (${existing.id}, NULL, 'Cowork Automação',
            ${devePromover ? 'mudanca_etapa' : 'prospeccao'},
            ${desc},
            ${JSON.stringify({ data, classificacao, prosp_quente_count: newCount, resumo: p.resumo || null })})`;

        if (devePromover) promovidos++;
        atualizados++;
      } else {
        // ── Lead novo: criar no funil ─────────────────────────────────────
        const crm   = p.crm || (p.produto === 'saude' ? 'saude' : 'pet');
        const obs   = `Prospecção ativa WhatsApp — ${data}${p.resumo ? ': ' + p.resumo : ''}`;
        const count = score === 'quente' ? 1 : 0;

        const [lead] = await sql`
          INSERT INTO leads
            (company_id, nome, empresa, telefone, crm, score, stage, origem, obs,
             responsavel_id, ultimo_whatsapp_at, prosp_quente_count)
          VALUES (
            ${companyId}::uuid,
            ${p.nome || 'Contato WhatsApp'},
            ${p.empresa || null},
            ${p.telefone || p.whatsapp || null},
            ${crm}, ${score}, 'prospeccao', 'prospeccao_ativa', ${obs},
            ${adminId}, NOW(), ${count}
          ) RETURNING id`;

        await sql`
          INSERT INTO lead_activities (lead_id, user_id, user_name, tipo, descricao, dados)
          VALUES (${lead.id}, NULL, 'Cowork Automação', 'prospeccao',
            ${`Lead criado via prospecção ativa WhatsApp — ${classificacao} em ${data}`},
            ${JSON.stringify({ data, classificacao, crm, resumo: p.resumo || null })})`;
        criados++;
      }
    }

    res.json({ ok: true, criados, atualizados, ignorados, promovidos, data });
  } catch (err) {
    console.error('[prospecting-sync]', err);
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

    // Base update (stage + motivo)
    const [lead] = await sql`
      UPDATE leads SET
        stage        = ${stage},
        motivo_perda = ${motivo_perda||null},
        updated_at   = NOW()
      WHERE id = ${req.params.id} AND company_id = ${req.companyId}
      RETURNING *`;

    // Trial: define datas separadamente para evitar nested sql`` no Neon
    if (stage === 'piloto') {
      const days      = parseInt(trial_days || 10);
      const trialStart = new Date();
      const trialEnd   = new Date(Date.now() + days * 86400_000);
      await sql`
        UPDATE leads SET trial_start = ${trialStart}, trial_end = ${trialEnd}
        WHERE id = ${req.params.id}`;
    }

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

// ── POST /api/leads/assign-me ─────────────────────────────────────────────────
router.post('/assign-me', auth, async (req, res) => {
  try {
    const result = await sql`
      UPDATE leads
      SET    responsavel_id = ${req.userId}::uuid,
             updated_at     = NOW()
      WHERE  company_id     = ${req.companyId}
        AND  responsavel_id IS NULL
      RETURNING id`;
    res.json({ ok: true, updated: result.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
