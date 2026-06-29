/**
 * CRM Funil — WhatsApp Routes
 * ============================
 * Meta Cloud API (envio outbound):
 *   POST /api/whatsapp/assessment/:id  → envia link de avaliação
 *   POST /api/whatsapp/message         → mensagem de texto livre
 *
 * Evolution API (conexão QR por empresa):
 *   POST   /api/whatsapp/evolution/connect     → cria instância + retorna QR code
 *   GET    /api/whatsapp/evolution/status      → status da conexão
 *   DELETE /api/whatsapp/evolution/disconnect  → desconecta
 *   POST   /api/whatsapp/webhook               → recebe mensagens (sem JWT)
 *
 * Env vars necessárias:
 *   WHATSAPP_TOKEN      — Meta Cloud Access Token
 *   WHATSAPP_PHONE_ID   — Meta Phone Number ID
 *   EVOLUTION_API_URL   — URL da Evolution API (ex: https://evo.fly.dev)
 *   EVOLUTION_API_KEY   — apikey global da Evolution API
 *   BACKEND_URL         — URL pública deste backend (para webhook)
 */

const router  = require('express').Router();
const auth    = require('../middleware/auth');
const { sql } = require('../config/db');

const APP_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── Meta Cloud API helpers ────────────────────────────────────────────────────

function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return '55' + digits;
  return digits;
}

async function sendWhatsApp(to, text) {
  const token   = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    throw new Error(
      'WhatsApp não configurado. Adicione WHATSAPP_TOKEN e WHATSAPP_PHONE_ID nas variáveis de ambiente do servidor.'
    );
  }

  const phone = formatPhone(to);
  if (phone.length < 12) throw new Error('Número de telefone inválido (mínimo 12 dígitos com DDI+DDD).');

  const payload = {
    messaging_product: 'whatsapp',
    to:                phone,
    type:              'text',
    text:              { body: text, preview_url: true },
  };

  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || `Erro ${res.status} na API do WhatsApp`;
    throw new Error(msg);
  }
  return data;
}

// ── Evolution API helpers ─────────────────────────────────────────────────────

function evoUrl() { return (process.env.EVOLUTION_API_URL || '').replace(/\/$/, ''); }
function evoKey() { return process.env.EVOLUTION_API_KEY || ''; }

async function evoFetch(path, options = {}) {
  const url = `${evoUrl()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: evoKey(),
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  return { ok: res.ok, status: res.status, data };
}

// Retorna o nome da instância Evolution para a empresa (cria registro se não existir)
async function getInstanceName(companyId) {
  const [cs] = await sql`SELECT whatsapp_instance FROM company_settings WHERE company_id = ${companyId}`;
  if (cs?.whatsapp_instance) return cs.whatsapp_instance;

  const [co] = await sql`SELECT slug FROM companies WHERE id = ${companyId}`;
  if (!co) throw new Error('Empresa não encontrada');

  // Limitar tamanho — Evolution API tem limite de 50 chars
  const name = `funil-${co.slug}`.slice(0, 50);

  await sql`
    INSERT INTO company_settings (company_id, whatsapp_instance)
    VALUES (${companyId}, ${name})
    ON CONFLICT (company_id) DO UPDATE
    SET whatsapp_instance = ${name}, updated_at = NOW()`;

  return name;
}

// Verifica se uma instância existe na Evolution API
async function instanceExists(instanceName) {
  const r = await evoFetch(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`);
  if (!r.ok) return false;
  const list = Array.isArray(r.data) ? r.data : (r.data ? [r.data] : []);
  return list.some(i =>
    i?.name                   === instanceName ||
    i?.instance?.instanceName === instanceName ||
    i?.instanceName           === instanceName
  );
}

// ── POST /api/whatsapp/webhook ────────────────────────────────────────────────
// Recebe eventos da Evolution API — sem JWT (a Evolution chama diretamente)
// DEVE ficar ANTES de router.use(auth)
router.post('/webhook', async (req, res) => {
  // Sempre 200 para a Evolution não retentar
  res.json({ ok: true });

  try {
    const { event, instance: instanceName, data } = req.body || {};
    if (!instanceName || !event) return;

    // Identificar a empresa pela instância
    const [cs] = await sql`SELECT company_id FROM company_settings WHERE whatsapp_instance = ${instanceName}`;
    if (!cs) return;

    const companyId = cs.company_id;

    // ── Mensagens recebidas ──────────────────────────────────────────────────
    if (event === 'messages.upsert') {
      const messages = Array.isArray(data) ? data : (data ? [data] : []);

      for (const msg of messages) {
        if (msg?.key?.fromMe) continue; // ignorar mensagens enviadas por nós

        const from = (msg?.key?.remoteJid || '')
          .replace(/@s\.whatsapp\.net$/, '')
          .replace(/@c\.us$/, '');

        if (!from || from.includes('@')) continue; // grupos, etc.

        const text =
          msg?.message?.conversation ||
          msg?.message?.extendedTextMessage?.text ||
          msg?.message?.imageMessage?.caption ||
          msg?.message?.videoMessage?.caption ||
          '[mídia]';

        // 1. Salvar no inbox (todas as mensagens, independente de ter lead no Funil)
        await sql`
          INSERT INTO whatsapp_inbox (company_id, instance_name, phone, message_text, raw)
          VALUES (
            ${companyId},
            ${instanceName},
            ${from},
            ${text},
            ${JSON.stringify({ ts: msg?.messageTimestamp, status: msg?.status })}
          )`;

        // 2. Se existir lead no Funil, registrar atividade também
        const tail = from.slice(-8);
        const [lead] = await sql`
          SELECT id FROM leads
          WHERE company_id = ${companyId}
            AND REGEXP_REPLACE(telefone, '[^0-9]', '', 'g') LIKE ${'%' + tail}
          ORDER BY updated_at DESC
          LIMIT 1`;

        if (lead) {
          await sql`
            INSERT INTO lead_activities (lead_id, tipo, descricao, dados)
            VALUES (
              ${lead.id},
              'whatsapp_recebido',
              ${text},
              ${JSON.stringify({ from, ts: msg?.messageTimestamp })}
            )`;

          await sql`
            UPDATE leads
            SET ultimo_whatsapp_at = NOW(), updated_at = NOW()
            WHERE id = ${lead.id}`;
        }

        // 3. Se existir prospecting_record do dia, atualizar status para 'morno'
        //    (recebeu resposta = pelo menos morno; analyze-chats faz classificação fina depois)
        const hoje = new Date().toISOString().split('T')[0];
        const [pr] = await sql`
          SELECT id, status FROM prospecting_records
          WHERE company_id = ${companyId}
            AND data_abordagem = ${hoje}::date
            AND REGEXP_REPLACE(telefone, '[^0-9]', '', 'g') LIKE ${'%' + tail}
          ORDER BY updated_at DESC
          LIMIT 1`;

        if (pr && pr.status === 'sem_resposta') {
          await sql`
            UPDATE prospecting_records
            SET status = 'morno', updated_at = NOW()
            WHERE id = ${pr.id}`;
        }
      }
    }

    // ── Atualização de status de leitura (visualizado) ───────────────────────
    if (event === 'messages.update') {
      const updates = Array.isArray(data) ? data : (data ? [data] : []);
      for (const upd of updates) {
        // status 3 = lido (READ) na Evolution API
        if (upd?.update?.status !== 3) continue;
        const to = (upd?.key?.remoteJid || '')
          .replace(/@s\.whatsapp\.net$/, '')
          .replace(/@c\.us$/, '');
        if (!to || to.includes('@')) continue;

        const tail = to.slice(-8);
        const hoje = new Date().toISOString().split('T')[0];
        const [pr] = await sql`
          SELECT id, status FROM prospecting_records
          WHERE company_id = ${companyId}
            AND data_abordagem = ${hoje}::date
            AND REGEXP_REPLACE(telefone, '[^0-9]', '', 'g') LIKE ${'%' + tail}
          ORDER BY updated_at DESC
          LIMIT 1`;

        // só marca visualizado se ainda está sem_resposta
        if (pr && pr.status === 'sem_resposta') {
          await sql`
            UPDATE prospecting_records
            SET status = 'visualizado', updated_at = NOW()
            WHERE id = ${pr.id}`;
        }
      }
    }
  } catch (err) {
    console.error('[whatsapp webhook]', err.message);
  }
});

// ── GET /api/whatsapp/inbox ───────────────────────────────────────────────────
// Retorna mensagens inbound do dia para a instância — protegido por robot token
// Sem JWT (chamado pelo Cowork/skill, não pelo browser)
router.get('/inbox', async (req, res) => {
  const token = req.headers['x-robot-token'];
  if (!token || token !== process.env.ROBOT_SECRET) {
    return res.status(401).json({ error: 'Token inválido.' });
  }

  const { date, instance } = req.query;
  if (!date || !instance) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios: date (YYYY-MM-DD) e instance.' });
  }

  try {
    // Identificar empresa pela instância
    const [cs] = await sql`
      SELECT company_id FROM company_settings WHERE whatsapp_instance = ${instance}`;
    if (!cs) return res.status(404).json({ error: 'Instância não encontrada.' });

    const messages = await sql`
      SELECT phone, message_text, received_at
      FROM whatsapp_inbox
      WHERE company_id = ${cs.company_id}
        AND received_at::date = ${date}::date
      ORDER BY received_at ASC`;

    res.json({ ok: true, date, instance, total: messages.length, messages });
  } catch (err) {
    console.error('[whatsapp inbox]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/whatsapp/instance-setup ────────────────────────────────────────
// Vincula (ou cria) uma instância Evolution a uma empresa — protegido por robot token
// Usado pelo Cowork/skill para configurar a instância sem precisar de JWT
router.post('/instance-setup', async (req, res) => {
  const token = req.headers['x-robot-token'];
  if (!token || token !== process.env.ROBOT_SECRET) {
    return res.status(401).json({ error: 'Token inválido.' });
  }

  const { company_id, instance_name } = req.body;
  if (!company_id || !instance_name) {
    return res.status(400).json({ error: 'company_id e instance_name são obrigatórios.' });
  }

  try {
    await sql`
      INSERT INTO company_settings (company_id, whatsapp_instance)
      VALUES (${company_id}, ${instance_name})
      ON CONFLICT (company_id) DO UPDATE
      SET whatsapp_instance = ${instance_name}, updated_at = NOW()`;
    res.json({ ok: true, company_id, instance_name });
  } catch (err) {
    console.error('[whatsapp instance-setup]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/analyze-chats ───────────────────────────────────────────────────
// Lê o whatsapp_inbox do dia, cruza com prospecting_records por telefone,
// classifica quente/morno/frio pelo conteúdo da mensagem e atualiza os status.
// Protegido por robot token (chamado pelo Cowork/skill).
router.post('/analyze-chats', async (req, res) => {
  const token = req.headers['x-robot-token'];
  if (!token || token !== process.env.ROBOT_SECRET) {
    return res.status(401).json({ error: 'Token inválido.' });
  }

  const { company_id, date } = req.body;
  if (!company_id || !date) {
    return res.status(400).json({ error: 'company_id e date (YYYY-MM-DD) são obrigatórios.' });
  }

  try {
    // 1. Buscar todas as mensagens recebidas no dia para a empresa
    const inbox = await sql`
      SELECT phone, message_text, received_at
      FROM whatsapp_inbox
      WHERE company_id = ${company_id}
        AND received_at::date = ${date}::date
      ORDER BY received_at ASC`;

    if (inbox.length === 0) {
      return res.json({ ok: true, date, total_inbox: 0, atualizados: 0, classificados: [] });
    }

    // 2. Classificar cada mensagem como quente / morno / frio
    function classificar(text) {
      if (!text) return 'morno';
      const t = text.toLowerCase();

      const FRIO = [
        'não tenho interesse', 'nao tenho interesse', 'não quero', 'nao quero',
        'não preciso', 'nao preciso', 'não obrigado', 'nao obrigado',
        'não, obrigado', 'obrigado, não', 'remova', 'remove', 'para de mandar',
        'não me mande', 'nao me mande', 'bloquear', 'spam', 'para',
        'não tenho', 'nao tenho', 'negativo', 'não temos', 'nao temos',
      ];

      const QUENTE = [
        'tenho interesse', 'tenho sim', 'quero saber mais', 'me conta mais',
        'pode me ligar', 'pode ligar', 'manda mais info', 'manda mais informação',
        'manda mais informações', 'como funciona', 'qual o preço', 'qual o valor',
        'quanto custa', 'me interessa', 'interessante', 'quero ver', 'pode mostrar',
        'agende', 'agenda', 'marca', 'marque', 'quando', 'disponível', 'disponivel',
        'ótimo', 'otimo', 'perfeito', 'combinado', 'pode ser', 'vamos conversar',
        'me chama', 'me liga', 'whatsapp', 'video', 'reunião', 'reuniao',
      ];

      if (FRIO.some(k => t.includes(k))) return 'frio';
      if (QUENTE.some(k => t.includes(k))) return 'quente';
      return 'morno';
    }

    // 3. Agrupar mensagens por número (pegar última mensagem de cada número)
    const porNumero = {};
    for (const msg of inbox) {
      porNumero[msg.phone] = msg; // última mensagem sobrescreve
    }

    const atualizados = [];

    // 4. Para cada número com mensagem, cruzar com prospecting_records
    for (const [phone, msg] of Object.entries(porNumero)) {
      const tail = phone.slice(-8);
      const [pr] = await sql`
        SELECT id, status, nome, crm AS segmento
        FROM prospecting_records
        WHERE company_id = ${company_id}
          AND data_abordagem = ${date}::date
          AND REGEXP_REPLACE(telefone, '[^0-9]', '', 'g') LIKE ${'%' + tail}
        ORDER BY updated_at DESC
        LIMIT 1`;

      if (!pr) continue;

      const novoStatus = classificar(msg.message_text);

      // só atualiza se mudou (e nunca rebaixa de quente para morno)
      const prioridade = { quente: 3, morno: 2, frio: 1, visualizado: 0, sem_resposta: 0 };
      const pAtual  = prioridade[pr.status]  ?? 0;
      const pNovo   = prioridade[novoStatus] ?? 0;
      if (pNovo <= pAtual) continue;

      await sql`
        UPDATE prospecting_records
        SET status = ${novoStatus}, analise = ${msg.message_text.slice(0, 500)}, updated_at = NOW()
        WHERE id = ${pr.id}`;

      atualizados.push({
        id: pr.id,
        nome: pr.nome,
        segmento: pr.segmento,
        phone,
        mensagem: msg.message_text.slice(0, 120),
        status_anterior: pr.status,
        status_novo: novoStatus,
      });
    }

    res.json({
      ok: true,
      date,
      total_inbox: inbox.length,
      numeros_unicos: Object.keys(porNumero).length,
      atualizados: atualizados.length,
      classificados: atualizados,
    });
  } catch (err) {
    console.error('[analyze-chats]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── A partir daqui: JWT obrigatório ──────────────────────────────────────────
router.use(auth);

// ── PUT /api/whatsapp/evolution/instance ──────────