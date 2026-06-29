const router  = require('express').Router();
const auth    = require('../middleware/auth');
const { sql } = require('../config/db');
const { Resend } = require('resend');
const XLSX    = require('xlsx');
const { searchSegment, MUNICIPIOS_BRASIL } = require('../lib/places');

const resend = new Resend(process.env.RESEND_API_KEY);

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

// PUT /api/robots/:id/queued — Cowork enfileira robô (sem JWT, apenas ROBOT_SECRET)
router.put('/:id/queued', robotAuth, async (req, res) => {
  try {
    const [robot] = await sql`
      UPDATE robots SET queued_at = NOW() WHERE id = ${req.params.id}
      RETURNING id, name, queued_at`;
    if (!robot) return res.status(404).json({ error: 'Robô não encontrado.' });
    res.json(robot);
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

// GET /api/robots/:company_id/admins — lista e-mails dos admins/master da empresa (sem JWT)
// Uso: GET /api/robots/admins?company_id=<uuid>
router.get('/admins', robotAuth, async (req, res) => {
  const { company_id } = req.query;
  if (!company_id) return res.status(400).json({ error: 'company_id obrigatório.' });
  try {
    const admins = await sql`
      SELECT u.name, u.email, cm.role
      FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.company_id = ${company_id}
        AND cm.role IN ('admin', 'master')
        AND u.email IS NOT NULL
      ORDER BY cm.role, u.name`;
    res.json({ admins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/robots/send-email — envia e-mail com ou sem anexo via Resend (sem JWT)
// Body: {
//   company_id: uuid,           (para buscar admins automaticamente, opcional se "to" fornecido)
//   to: ['a@b.com'],            (opcional — se omitido, envia para os admins da empresa)
//   subject: string,
//   html: string,
//   attachments: [{ filename: string, content: string (base64) }]  (opcional)
// }
router.post('/send-email', robotAuth, async (req, res) => {
  const { company_id, to, subject, html, attachments } = req.body;
  if (!subject || !html) return res.status(400).json({ error: 'subject e html são obrigatórios.' });

  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.startsWith('re_xxx')) {
    return res.status(500).json({ error: 'RESEND_API_KEY não configurada.' });
  }

  try {
    let recipients = to || [];

    // Se não passou destinatários, busca admins e vendedores da empresa
    if (recipients.length === 0 && company_id) {
      const members = await sql`
        SELECT u.email
        FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.company_id = ${company_id}
          AND cm.role IN ('admin', 'master', 'vendedor')
          AND u.email IS NOT NULL`;
      recipients = members.map(a => a.email);
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'Nenhum destinatário encontrado.' });
    }

    // Monta payload para o Resend
    const payload = {
      from: process.env.RESEND_FROM || 'Unimidia CRM <onboarding@resend.dev>',
      to:   recipients,
      subject,
      html,
    };

    // Anexos: Resend aceita [{ filename, content (Buffer ou base64 string) }]
    if (attachments && attachments.length > 0) {
      payload.attachments = attachments.map(att => ({
        filename: att.filename,
        content:  att.content, // base64 string — Resend aceita direto
      }));
    }

    const result = await resend.emails.send(payload);

    res.json({
      ok:           true,
      email_id:     result?.id || result?.data?.id,
      recipients,
      has_attachment: (attachments || []).length > 0,
    });
  } catch (err) {
    console.error('[send-email]', err.message);
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

    } else if (robot.tipo === 'unimidia_prospeccao') {
      // Contexto para o Robô 1 da Unimidia: o que foi prospectado ontem e histórico recente
      const hoje = new Date().toISOString().split('T')[0];
      const ontem = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      const prospectadosOntem = await sql`
        SELECT nome, empresa, telefone, status, crm AS segmento
        FROM prospecting_records
        WHERE company_id = ${companyId}
          AND data_abordagem = ${ontem}::date
        ORDER BY status, nome
        LIMIT 200`;

      const naoRespondidosOntem = await sql`
        SELECT nome, empresa, telefone, crm AS segmento
        FROM prospecting_records
        WHERE company_id = ${companyId}
          AND data_abordagem = ${ontem}::date
          AND status IN ('sem_resposta', 'nao_entregue')
        ORDER BY nome
        LIMIT 150`;

      const [totaisOntem] = await sql`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'quente')        AS quentes,
          COUNT(*) FILTER (WHERE status = 'morno')         AS mornos,
          COUNT(*) FILTER (WHERE status = 'sem_resposta')  AS sem_resposta,
          COUNT(*) FILTER (WHERE status = 'visualizado')   AS visualizados,
          COUNT(*) FILTER (WHERE status = 'frio')          AS frios
        FROM prospecting_records
        WHERE company_id = ${companyId}
          AND data_abordagem = ${ontem}::date`;

      const prospectadosHoje = await sql`
        SELECT nome, empresa, telefone, status, crm AS segmento
        FROM prospecting_records
        WHERE company_id = ${companyId}
          AND data_abordagem = ${hoje}::date
        ORDER BY nome`;

      context = {
        tipo: 'unimidia_prospeccao',
        data_hoje: hoje,
        data_ontem: ontem,
        totais_ontem: totaisOntem,
        prospectados_ontem: prospectadosOntem,
        nao_respondidos_ontem: naoRespondidosOntem,
        ja_prospectados_hoje: prospectadosHoje,
      };

    } else if (robot.tipo === 'unimidia_revisao') {
      // Contexto para Robô 2 e 3 da Unimidia: conversas e stats do dia
      const hoje = new Date().toISOString().split('T')[0];
      const ontem = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const semanaAtras = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

      const prospectadosHoje = await sql`
        SELECT nome, empresa, telefone, crm AS segmento,
               status, analise, proximo_passo, updated_at,
               u.name AS vendedor_nome
        FROM prospecting_records r
        LEFT JOIN users u ON u.id = r.vendedor_id
        WHERE r.company_id = ${companyId}
          AND r.data_abordagem = ${hoje}::date
        ORDER BY r.updated_at DESC NULLS LAST, r.nome`;

      const [totaisHoje] = await sql`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'quente')        AS quentes,
          COUNT(*) FILTER (WHERE status = 'morno')         AS mornos,
          COUNT(*) FILTER (WHERE status = 'sem_resposta')  AS sem_resposta,
          COUNT(*) FILTER (WHERE status = 'visualizado')   AS visualizados,
          COUNT(*) FILTER (WHERE status = 'frio')          AS frios,
          COUNT(*) FILTER (WHERE status = 'nao_entregue')  AS nao_entregues
        FROM prospecting_records
        WHERE company_id = ${companyId}
          AND data_abordagem = ${hoje}::date`;

      const statsPorSegmento = await sql`
        SELECT
          crm AS segmento,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'quente')       AS quentes,
          COUNT(*) FILTER (WHERE status = 'morno')        AS mornos,
          COUNT(*) FILTER (WHERE status = 'sem_resposta') AS sem_resposta
        FROM prospecting_records
        WHERE company_id = ${companyId}
          AND data_abordagem = ${hoje}::date
        GROUP BY crm
        ORDER BY quentes DESC`;

      const statsPorVendedor = await sql`
        SELECT
          u.name AS vendedor,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE r.status = 'quente')       AS quentes,
          COUNT(*) FILTER (WHERE r.status = 'morno')        AS mornos,
          COUNT(*) FILTER (WHERE r.status = 'frio')         AS frios,
          COUNT(*) FILTER (WHERE r.status = 'visualizado')  AS visualizados,
          COUNT(*) FILTER (WHERE r.status = 'sem_resposta') AS sem_resposta
        FROM prospecting_records r
        LEFT JOIN users u ON u.id = r.vendedor_id
        WHERE r.company_id = ${companyId}
          AND r.data_abordagem = ${hoje}::date
        GROUP BY u.name
        ORDER BY quentes DESC`;

      const melhoresdaSemana = await sql`
        SELECT analise, status, crm AS segmento, nome
        FROM prospecting_records
        WHERE company_id = ${companyId}
          AND status = 'quente'
          AND data_abordagem >= ${semanaAtras}::date
          AND analise IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 10`;

      // Instância WhatsApp configurada para esta empresa (para o Cowork saber qual usar)
      const [cs] = await sql`
        SELECT whatsapp_instance FROM company_settings WHERE company_id = ${companyId}`;

      // Mensagens recebidas hoje no inbox (para análise direta pelo Cowork)
      const inboxHoje = cs?.whatsapp_instance ? await sql`
        SELECT phone, message_text, received_at
        FROM whatsapp_inbox
        WHERE company_id = ${companyId}
          AND received_at::date = ${hoje}::date
        ORDER BY received_at ASC
        LIMIT 200` : [];

      context = {
        tipo: 'unimidia_revisao',
        data_hoje: hoje,
        whatsapp_instance: cs?.whatsapp_instance || null,
        whatsapp_configurado: !!cs?.whatsapp_instance,
        total_respostas_inbox: inboxHoje.length,
        inbox_hoje: inboxHoje,
        totais_hoje: totaisHoje,
        prospectados_hoje: prospectadosHoje,
        stats_por_segmento: statsPorSegmento,
        stats_por_vendedor: statsPorVendedor,
        melhores_da_semana: melhoresdaSemana,
      };

    } else if (robot.tipo === 'unimidia_relatorio') {
      // Contexto para Robô 4 da Unimidia: relatório executivo semanal
      const hoje = new Date().toISOString().split('T')[0];
      const semanaAtras = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

      const [totaisSemana] = await sql`
        SELECT
          COUNT(*) AS total_abordados,
          COUNT(*) FILTER (WHERE status = 'quente')        AS quentes,
          COUNT(*) FILTER (WHERE status = 'morno')         AS mornos,
          COUNT(*) FILTER (WHERE status = 'frio')          AS frios,
          COUNT(*) FILTER (WHERE status = 'visualizado')   AS visualizados,
          COUNT(*) FILTER (WHERE status = 'sem_resposta')  AS sem_resposta,
          COUNT(*) FILTER (WHERE promoted_at IS NOT NULL)  AS convertidos
        FROM prospecting_records
        WHERE company_id = ${companyId}
          AND data_abordagem >= ${semanaAtras}::date
          AND data_abordagem <= ${hoje}::date`;

      const porSegmento = await sql`
        SELECT
          crm AS segmento,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'quente')       AS quentes,
          COUNT(*) FILTER (WHERE status = 'morno')        AS mornos,
          COUNT(*) FILTER (WHERE promoted_at IS NOT NULL) AS convertidos
        FROM prospecting_records
        WHERE company_id = ${companyId}
          AND data_abordagem >= ${semanaAtras}::date
        GROUP BY crm
        ORDER BY quentes DESC`;

      const rankingVendedores = await sql`
        SELECT
          COALESCE(u.name, 'Sem vendedor') AS vendedor,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE r.status = 'quente')        AS quentes,
          COUNT(*) FILTER (WHERE r.status = 'morno')         AS mornos,
          COUNT(*) FILTER (WHERE r.status = 'frio')          AS frios,
          COUNT(*) FILTER (WHERE r.status = 'visualizado')   AS visualizados,
          COUNT(*) FILTER (WHERE r.promoted_at IS NOT NULL)  AS convertidos,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE r.status IN ('quente','morno')) / NULLIF(COUNT(*), 0)
          ) AS taxa_engajamento
        FROM prospecting_records r
        LEFT JOIN users u ON u.id = r.vendedor_id
        WHERE r.company_id = ${companyId}
          AND r.data_abordagem >= ${semanaAtras}::date
        GROUP BY u.name
        ORDER BY convertidos DESC, quentes DESC, taxa_engajamento DESC`;

      const porDia = await sql`
        SELECT
          data_abordagem::text AS data,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'quente') AS quentes,
          COUNT(*) FILTER (WHERE status = 'morno')  AS mornos
        FROM prospecting_records
        WHERE company_id = ${companyId}
          AND data_abordagem >= ${semanaAtras}::date
        GROUP BY data_abordagem
        ORDER BY data_abordagem`;

      const melhorsMensagens = await sql`
        SELECT analise, crm AS segmento, nome, status, data_abordagem::text AS data
        FROM prospecting_records
        WHERE company_id = ${companyId}
          AND status = 'quente'
          AND data_abordagem >= ${semanaAtras}::date
          AND analise IS NOT NULL
        ORDER BY data_abordagem DESC
        LIMIT 15`;

      const followUpsPendentes = await sql`
        SELECT nome, empresa, telefone, crm AS segmento, status, proximo_passo, data_abordagem::text AS data
        FROM prospecting_records
        WHERE company_id = ${companyId}
          AND status IN ('quente', 'morno')
          AND promoted_at IS NULL
          AND data_abordagem >= ${semanaAtras}::date
        ORDER BY CASE status WHEN 'quente' THEN 1 WHEN 'morno' THEN 2 ELSE 3 END, data_abordagem DESC
        LIMIT 30`;

      context = {
        tipo: 'unimidia_relatorio',
        periodo: { inicio: semanaAtras, fim: hoje },
        totais_semana: totaisSemana,
        por_segmento: porSegmento,
        ranking_vendedores: rankingVendedores,
        por_dia: porDia,
        melhores_mensagens: melhorsMensagens,
        follow_ups_pendentes: followUpsPendentes,
      };

    } else {
      const [count] = await sql`SELECT COUNT(*) AS total FROM leads WHERE company_id = ${companyId} AND ativo = true`;
      context = { tipo: robot.tipo, total_leads: count.total };
    }

    res.json({ robot, context });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/robots/:id/execute-server ───────────────────────────────────────
// Execução server-side em background (robôs pesados: unimidia_prospeccao)
// Usa robotAuth — retorna 200 imediatamente e processa de forma assíncrona.
router.post('/:id/execute-server', robotAuth, async (req, res) => {
  const robotId = Number(req.params.id);
  try {
    const [robot] = await sql`
      SELECT r.*, c.name AS company_name
      FROM robots r
      JOIN companies c ON c.id = r.company_id
      WHERE r.id = ${robotId}`;
    if (!robot) return res.status(404).json({ error: 'Robô não encontrado.' });

    const EXECUTORS = { unimidia_prospeccao: executeUnimidiaProspeccao };
    if (!EXECUTORS[robot.tipo]) {
      return res.status(400).json({ error: `Tipo "${robot.tipo}" não suportado para execução server-side.` });
    }

    // Garante que queued_at esteja setado (para o frontend mostrar "executando")
    if (!robot.queued_at) {
      await sql`UPDATE robots SET queued_at = NOW() WHERE id = ${robotId}`;
    }

    // Retorna imediatamente
    res.json({ ok: true, message: 'Execução iniciada em background.', robot_id: robotId, tipo: robot.tipo });

    // Executa de forma assíncrona (não bloqueia o request)
    EXECUTORS[robot.tipo](robot).catch(err => {
      console.error(`[Robot ${robotId}] Erro fatal na execução:`, err.message);
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Executor: unimidia_prospeccao ─────────────────────────────────────────────
async function executeUnimidiaProspeccao(robot) {
  const START     = Date.now();
  const robotId   = robot.id;
  const companyId = robot.company_id;
  const hoje      = new Date().toISOString().split('T')[0];
  const ontem     = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  console.log(`[Robot ${robotId}] Iniciando unimidia_prospeccao para ${robot.company_name}...`);

  try {
    // ── 1. Carrega estado (índice do município atual) ─────────────────────────
    const [robotRow] = await sql`SELECT state_json FROM robots WHERE id = ${robotId}`;
    const state      = robotRow?.state_json || {};
    const muniIdx    = typeof state.municipio_idx === 'number' ? state.municipio_idx : 0;
    console.log(`[Robot ${robotId}] Iniciando no município idx ${muniIdx}: "${MUNICIPIOS_BRASIL[muniIdx % MUNICIPIOS_BRASIL.length]}"`);

    // ── 2. Carry-forward: leads da última execução não abordados ─────────────
    // "Não abordado" = sem_resposta ou nao_entregue (vendedor ainda não enviou / falhou entrega)
    // Usa MAX(data_abordagem) em vez de "ontem" para funcionar corretamente após fins de semana/feriados
    const leadsFw = await sql`
      SELECT id, nome, empresa, telefone, crm AS segmento, status,
             place_id, whatsapp_msg AS mensagem, maps_url, rating
      FROM prospecting_records
      WHERE company_id = ${companyId}
        AND data_abordagem = (
          SELECT MAX(data_abordagem) FROM prospecting_records
          WHERE company_id = ${companyId}
        )::date
        AND status IN ('sem_resposta', 'nao_entregue')`;
    console.log(`[Robot ${robotId}] ${leadsFw.length} leads não abordados ontem (carry-forward).`);

    // ── 3. IDs já na base (para não duplicar no Places) ───────────────────────
    const todosIds = await sql`
      SELECT place_id FROM prospecting_records
      WHERE company_id = ${companyId} AND place_id IS NOT NULL`;
    const excludeIds = new Set(todosIds.map(r => r.place_id));

    // ── 4. Segmentos ──────────────────────────────────────────────────────────
    const SEGMENTOS = [
      { key: 'unimidia_bares',    label: 'Bares/Restaurantes/Cafés',   msgKey: 'A' },
      { key: 'unimidia_esportes', label: 'Esportes (Tênis/Beach)',      msgKey: 'E' },
      { key: 'unimidia_clinicas', label: 'Clínicas Médicas/Odonto',    msgKey: 'C' },
    ];

    const MENSAGENS = {
      A: 'Olá! Somos da Unimidia 📺 Trabalhamos com televisores inteligentes para restaurantes e bares: cardápio digital, promoções em tempo real e entretenimento. Tudo gerenciado pelo celular. Posso te mostrar como funciona rapidinho?',
      E: 'Oi! Sou da Unimidia 📺 Ajudamos academias e quadras de tênis/beach tennis a engajar alunos e atrair novos clientes com TVs inteligentes — ranking ao vivo, agenda de aulas, promoções na tela. Posso apresentar em 5 min?',
      C: 'Olá! Sou da equipe Unimidia 📺 Trabalhamos com soluções de TV para clínicas: sala de espera com conteúdo educativo e institucional, reduz percepção de tempo de espera e valoriza sua marca. Posso te mostrar?',
      D: 'Oi, tudo bem? Vim conhecer o {nome}! Sou da Unimidia, trabalhamos com mídia digital para estabelecimentos como o seu. Vale 5 min para eu te apresentar nossa solução? 📺',
    };

    const allLeads  = [];
    const statsSeg  = {};
    const carryFwBySegmento = {};

    // Agrupa carry-forward por segmento
    for (const fw of leadsFw) {
      const seg = fw.segmento; // ex: unimidia_bares
      if (!carryFwBySegmento[seg]) carryFwBySegmento[seg] = [];
      carryFwBySegmento[seg].push(fw);
    }

    // Busca novos leads percorrendo municípios até completar `needed` por segmento.
    // Garante sempre 50 por segmento (carry-fw + novos = 50).
    // Avança o cursor ao município mais distante usado em qualquer segmento.
    async function buscarAteFull(segKey, startIdx, needed) {
      const leads = [];
      let idx = startIdx;
      while (leads.length < needed && idx < MUNICIPIOS_BRASIL.length) {
        const loc    = MUNICIPIOS_BRASIL[idx];
        const toFetch = Math.min(needed - leads.length + 10, 60);
        try {
          console.log(`[Robot ${robotId}] ${segKey} @ "${loc}" — buscando ${toFetch} (${leads.length}/${needed})`);
          const batch = await searchSegment(segKey, loc, toFetch, excludeIds);
          leads.push(...batch);
        } catch (e) {
          console.warn(`[Robot ${robotId}] ${segKey} @ "${loc}" erro: ${e.message}`);
        }
        idx++;
      }
      return { leads: leads.slice(0, needed), nextIdx: idx };
    }

    let maxNextIdx = muniIdx; // cursor avança ao máximo usado entre todos os segmentos

    for (const seg of SEGMENTOS) {
      const fwLeads        = (carryFwBySegmento[seg.key] || []).slice(0, 50); // máx 50 fw
      const slotsParaNovos = Math.max(0, 50 - fwLeads.length);

      let novosPlaces = [];
      if (slotsParaNovos > 0) {
        const { leads, nextIdx } = await buscarAteFull(seg.key, muniIdx, slotsParaNovos);
        novosPlaces = leads;
        maxNextIdx  = Math.max(maxNextIdx, nextIdx);
      }

      // Combina: carry-forward (prioridade) + novos = sempre 50 se possível
      const todosSegmento = [...fwLeads, ...novosPlaces];
      statsSeg[seg.label] = todosSegmento.length;
      console.log(`[Robot ${robotId}] ${seg.key}: ${fwLeads.length} fw + ${novosPlaces.length} novos = ${todosSegmento.length}`);

      todosSegmento.forEach((l, i) => {
        const isCarryFw = i < fwLeads.length;
        const msgKey = seg.msgKey === 'A' ? (i % 2 === 0 ? 'A' : 'D')
                     : seg.msgKey === 'C' ? (i % 2 === 0 ? 'C' : 'D')
                     : seg.msgKey;
        const mensagem = (l.mensagem && isCarryFw)
          ? l.mensagem
          : MENSAGENS[msgKey].replace('{nome}', l.nome);
        allLeads.push({
          ...l,
          segmento_label: seg.label,
          modelo: msgKey,
          mensagem,
          carry_forward: isCarryFw,
        });
      });
    }

    const totalGeral    = allLeads.length;
    const totalFw       = allLeads.filter(l => l.carry_forward).length;
    const totalNovos    = totalGeral - totalFw;
    console.log(`[Robot ${robotId}] Total: ${totalGeral} (${totalFw} carry-fw + ${totalNovos} novos)`);

    // ── 5. Salva APENAS os novos no CRM (carry-forward já estão na base) ──────
    const novosParaSalvar = allLeads.filter(l => !l.carry_forward);
    for (const l of novosParaSalvar) {
      try {
        await sql`
          INSERT INTO prospecting_records
            (company_id, nome, empresa, telefone, crm, status, data_abordagem, place_id, origem, whatsapp_msg)
          VALUES
            (${companyId}, ${l.nome}, ${l.nome}, ${l.telefone || null},
             ${l.segmento}, 'sem_resposta', ${hoje}::date,
             ${l.place_id || null}, 'google_places', ${l.mensagem})
          ON CONFLICT DO NOTHING`;
      } catch (e) {
        console.warn(`[Robot ${robotId}] Erro ao salvar "${l.nome}": ${e.message}`);
      }
    }
    // Atualiza data dos carry-forward para hoje (para aparecer na lista do dia)
    const fwIds = allLeads.filter(l => l.carry_forward && l.id).map(l => l.id);
    if (fwIds.length > 0) {
      await sql`UPDATE prospecting_records SET data_abordagem = ${hoje}::date WHERE id = ANY(${fwIds})`;
    }
    console.log(`[Robot ${robotId}] ${novosParaSalvar.length} novos salvos, ${fwIds.length} carry-fw atualizados.`);

    // ── 6. Avança índice de município ─────────────────────────────────────────
    const savedNextIdx = maxNextIdx % MUNICIPIOS_BRASIL.length;
    await sql`UPDATE robots SET state_json = ${JSON.stringify({ municipio_idx: savedNextIdx })}, updated_at = NOW() WHERE id = ${robotId}`;
    console.log(`[Robot ${robotId}] Próximo município: "${MUNICIPIOS_BRASIL[savedNextIdx]}" (idx ${savedNextIdx})`);

    // ── 7. Gera Excel ─────────────────────────────────────────────────────────
    const dataStr  = hoje.replace(/-/g, '');
    const sheetRows = allLeads.map(l => ({
      'Nome do Estabelecimento': l.nome,
      'Segmento':                l.segmento_label,
      'Telefone':                l.telefone || '',
      'Endereço':                l.endereco || '',
      'Avaliação Google':        l.rating || '',
      'Modelo de Mensagem':      l.modelo,
      'Mensagem Personalizada':  l.mensagem,
      'Status':                  l.carry_forward ? 'Carry-forward (não abordado ontem)' : 'Novo',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws['!cols'] = [{ wch: 40 }, { wch: 28 }, { wch: 18 }, { wch: 45 }, { wch: 14 }, { wch: 8 }, { wch: 90 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Prospecção');
    const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const xlsxB64 = xlsxBuf.toString('base64');
    console.log(`[Robot ${robotId}] Excel gerado (${Math.round(xlsxBuf.length / 1024)} KB).`);

    // ── 8. Envia e-mail ───────────────────────────────────────────────────────
    const geradoEm      = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const [hojeD, hojeM, hojeY] = hoje.split('-').reverse();
    const dataFormatada = `${hojeD}/${hojeM}/${hojeY}`;
    const muniInicio    = MUNICIPIOS_BRASIL[muniIdx % MUNICIPIOS_BRASIL.length];
    const muniLabel     = maxNextIdx > muniIdx + 1
      ? `${muniInicio} + ${maxNextIdx - muniIdx - 1} mais`
      : muniInicio;

    const SEG_COLORS = {
      'Bares/Restaurantes/Cafés': { bg: '#1a3a5c', icon: '🍺' },
      'Esportes (Tênis/Beach)':   { bg: '#1b4a2c', icon: '🎾' },
      'Clínicas Médicas/Odonto':  { bg: '#4a1d6b', icon: '🏥' },
    };

    const segCards = Object.entries(statsSeg).map(([nome, qtde]) => {
      const c = SEG_COLORS[nome] || { bg: '#333', icon: '📍' };
      return `
        <td style="width:33%;padding:16px;background:${c.bg};color:white;text-align:center;border-radius:8px;vertical-align:top">
          <div style="font-size:28px;margin-bottom:4px">${c.icon}</div>
          <div style="font-size:36px;font-weight:700;line-height:1">${qtde}</div>
          <div style="font-size:11px;margin-top:6px;opacity:.85;line-height:1.3">${nome}</div>
        </td>`;
    }).join('<td style="width:8px"></td>');

    const emailHtml = `
<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f6f8">
  <div style="background:linear-gradient(135deg,#0d1b4b 0%,#1a237e 60%,#283593 100%);padding:28px 24px;border-radius:10px 10px 0 0">
    <table style="width:100%"><tr>
      <td>
        <div style="color:#90CAF9;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Robô 1 — Prospecção Ativa</div>
        <h1 style="color:white;margin:0;font-size:22px;font-weight:700">📺 Unimidia — Lista de Prospecção</h1>
        <p style="color:#90CAF9;margin:6px 0 0;font-size:13px">${dataFormatada} &nbsp;·&nbsp; ${muniLabel} &nbsp;·&nbsp; Gerado às ${geradoEm.split(' ')[1] || geradoEm}</p>
      </td>
      <td style="text-align:right;vertical-align:top">
        <div style="background:rgba(255,255,255,.15);border-radius:50%;width:52px;height:52px;display:inline-flex;align-items:center;justify-content:center;font-size:26px">📺</div>
      </td>
    </tr></table>
  </div>
  <div style="background:#1565C0;padding:16px 24px;text-align:center">
    <span style="color:#E3F2FD;font-size:13px">Total de prospects na lista de hoje</span>
    <div style="color:white;font-size:48px;font-weight:700;line-height:1.1">${totalGeral}</div>
    <span style="color:#90CAF9;font-size:12px">${totalNovos} novos + ${totalFw} carry-forward • ${dataFormatada}</span>
  </div>
  <div style="background:#f4f6f8;padding:20px 20px 0">
    <table style="width:100%;border-collapse:separate;border-spacing:8px"><tr>${segCards}</tr></table>
  </div>
  <div style="background:#f4f6f8;padding:20px">
    <div style="background:white;border-radius:8px;padding:16px;border-left:4px solid #1565C0;margin-bottom:12px">
      <strong style="color:#1565C0">📎 Excel em anexo:</strong>
      <span style="color:#444;font-size:13px"> prospectos_unimidia_${dataStr}.xlsx</span>
      <div style="color:#666;font-size:12px;margin-top:6px">
        Colunas: Nome · Segmento · Telefone · Endereço · Avaliação · Modelo de Mensagem · Mensagem Personalizada · Status
      </div>
    </div>
    ${totalFw > 0 ? `
    <div style="background:#FFF3E0;border-radius:8px;padding:14px;margin-bottom:12px;border-left:4px solid #FF9800">
      <div style="font-weight:700;color:#E65100;margin-bottom:4px">♻️ ${totalFw} prospects carry-forward</div>
      <div style="color:#BF360C;font-size:12px">Estes leads estavam na lista de ontem mas não foram abordados. Priorize-os hoje!</div>
    </div>` : ''}
    <div style="background:white;border-radius:8px;padding:16px;margin-bottom:12px">
      <div style="font-weight:700;color:#1a237e;margin-bottom:10px">💬 Modelos de mensagem incluídos</div>
      <table style="width:100%;font-size:12px;color:#555">
        <tr>
          <td style="padding:4px 8px;background:#E3F2FD;border-radius:4px"><strong>A</strong> — Bares/Restaurantes/Cafés</td>
          <td style="padding:4px 8px;background:#E8F5E9;border-radius:4px"><strong>E</strong> — Esportes (Tênis/Beach Tennis)</td>
        </tr>
        <tr><td style="height:6px"></td></tr>
        <tr>
          <td style="padding:4px 8px;background:#F3E5F5;border-radius:4px"><strong>C</strong> — Clínicas & Consultórios</td>
          <td style="padding:4px 8px;background:#FFF8E1;border-radius:4px"><strong>D</strong> — Genérico (alternativo)</td>
        </tr>
      </table>
    </div>
    <div style="background:#E8EAF6;border-radius:8px;padding:14px;margin-bottom:16px">
      <div style="font-weight:700;color:#283593;margin-bottom:8px">🚀 Próximos passos</div>
      <ol style="color:#3949AB;font-size:13px;margin:0;padding-left:18px;line-height:1.8">
        <li>Abrir o Excel e revisar os contatos</li>
        <li>Abrir o CRM Funil → aba <strong>Prospecção</strong></li>
        <li>Designar vendedores para cada prospect</li>
        <li>Iniciar envios via WhatsApp</li>
      </ol>
    </div>
    <p style="color:#999;font-size:11px;text-align:center;margin-top:8px">
      Gerado automaticamente pelo Robô 1 • Unimidia CRM • ${geradoEm}<br>
      Localidade: ${muniLabel} (idx ${muniIdx}→${savedNextIdx}/${MUNICIPIOS_BRASIL.length}) &nbsp;·&nbsp;
      <a href="https://pfunil.ia.br" style="color:#1565C0">pfunil.ia.br</a>
    </p>
  </div>
</div>`;

    try {
      const admins = await sql`
        SELECT u.email FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.company_id = ${companyId} AND cm.role IN ('admin','master','vendedor') AND u.email IS NOT NULL`;
      const recipients = [...new Set(admins.map(a => a.email))];
      if (recipients.length > 0 && process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.startsWith('re_xxx')) {
        const resendInst = new Resend(process.env.RESEND_API_KEY);
        await resendInst.emails.send({
          from:        process.env.RESEND_FROM || 'Unimidia CRM <onboarding@resend.dev>',
          to:          recipients,
          subject:     `Unimidia — Lista de Prospecção ${dataFormatada} · ${muniLabel}`,
          html:        emailHtml,
          attachments: [{ filename: `prospectos_unimidia_${dataStr}.xlsx`, content: xlsxB64 }],
        });
        console.log(`[Robot ${robotId}] E-mail enviado para: ${recipients.join(', ')}`);
      }
    } catch (e) {
      console.warn(`[Robot ${robotId}] Erro ao enviar e-mail: ${e.message}`);
    }

    // ── 9. Log e limpa fila ───────────────────────────────────────────────────
    const durMs  = Date.now() - START;
    const output = `✅ Prospecção concluída em ${Math.round(durMs / 1000)}s\n\nLocalidade: ${muniLabel}\nTotal: ${totalGeral} (${totalNovos} novos + ${totalFw} carry-fw)\n${Object.entries(statsSeg).map(([k, v]) => `• ${k}: ${v}`).join('\n')}`;
    await sql`INSERT INTO robot_logs (robot_id, company_id, status, output, duration_ms) VALUES (${robotId}, ${companyId}, 'ok', ${output}, ${durMs})`;
    await sql`UPDATE robots SET queued_at = NULL, updated_at = NOW() WHERE id = ${robotId}`;
    console.log(`[Robot ${robotId}] Concluído em ${Math.round(durMs / 1000)}s.`);

  } catch (err) {
    const durMs = Date.now() - START;
    console.error(`[Robot ${robotId}] Erro:`, err.message);
    try {
      await sql`INSERT INTO robot_logs (robot_id, company_id, status, output, duration_ms) VALUES (${robotId}, ${companyId}, 'erro', ${`❌ Erro: ${err.message}`}, ${durMs})`;
      await sql`UPDATE robots SET queued_at = NULL, updated_at = NOW() WHERE id = ${robotId}`;
    } catch { /* ignora */ }
  }
}

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
  if (!name || !tipo) return res.status(400).json({ error: 'name e tipo são obrigatórios.' });
  try {
    const [robot] = await sql`
      INSERT INTO robots (company_id, name, description, tipo, trigger_type, cron_expr, event_trigger, prompt_template, whatsapp_template)
      VALUES (${req.companyId}, ${name}, ${description||null}, ${tipo}, ${trigger_type||'cron'},
              ${cron_expr||null}, ${event_trigger||null}, ${prompt_template||null}, ${whatsapp_template||null})
      RETURNING *`;
    res.status(201).json(robot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/robots/:id ────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, tipo, trigger_type, cron_expr, event_trigger, prompt_template, whatsapp_template, ativo } = req.body;
  try {
    // master pode editar qualquer robô; admin só os seus
    const [existing] = await sql`SELECT company_id FROM robots WHERE id = ${id}`;
    if (!existing) return res.status(404).json({ error: 'Robô não encontrado.' });
    if (req.role !== 'master' && existing.company_id !== req.companyId)
      return res.status(403).json({ error: 'Sem permissão.' });

    const [robot] = await sql`
      UPDATE robots SET
        name              = COALESCE(${name||null}, name),
        description       = COALESCE(${description||null}, description),
        tipo              = COALESCE(${tipo||null}, tipo),
        trigger_type      = COALESCE(${trigger_type||null}, trigger_type),
        cron_expr         = COALESCE(${cron_expr||null}, cron_expr),
        event_trigger     = COALESCE(${event_trigger||null}, event_trigger),
        prompt_template   = COALESCE(${prompt_template||null}, prompt_template),
        whatsapp_template = COALESCE(${whatsapp_template||null}, whatsapp_template),
        ativo             = COALESCE(${ativo !== undefined ? ativo : null}, ativo),
        updated_at        = NOW()
      WHERE id = ${id}
      RETURNING *`;
    res.json(robot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/robots/:id ─────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [existing] = await sql`SELECT company_id FROM robots WHERE id = ${id}`;
    if (!existing) return res.status(404).json({ error: 'Robô não encontrado.' });
    if (req.role !== 'master' && existing.company_id !== req.companyId)
      return res.status(403).json({ error: 'Sem permissão.' });

    await sql`DELETE FROM robot_logs WHERE robot_id = ${id}`;
    await sql`DELETE FROM robots WHERE id = ${id}`;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/robots/:id/queue — enfileira para execução imediata ───────────────
router.put('/:id/queue', async (req, res) => {
  try {
    const [robot] = await sql`
      UPDATE robots SET queued_at = NOW() WHERE id = ${req.params.id}
      RETURNING id, name, queued_at`;
    if (!robot) return res.status(404).json({ error: 'Robô não encontrado.' });
    res.json(robot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/robots/:id/run — alias de queue (usado pelo frontend) ────────────
router.post('/:id/run', async (req, res) => {
  try {
    const [robot] = await sql`
      UPDATE robots SET queued_at = NOW() WHERE id = ${req.params.id}
      RETURNING id, name, queued_at`;
    if (!robot) return res.status(404).json({ error: 'Robô não encontrado.' });
    res.json(robot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/robots/:id/logs ───────────────────────────────────────────────────
router.get('/:id/logs', async (req, res) => {
  try {
    const logs = await sql`
      SEL