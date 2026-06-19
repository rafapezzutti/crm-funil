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
    i?.instance?.instanceName === instanceName ||
    i?.instanceName           === instanceName ||
    i?.name                   === instanceName
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

        // Buscar lead pelo telefone (match por 8 dígitos finais — robusto com DDI/DDD)
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
      }
    }
  } catch (err) {
    console.error('[whatsapp webhook]', err.message);
  }
});

// ── A partir daqui: JWT obrigatório ──────────────────────────────────────────
router.use(auth);

// ── POST /api/whatsapp/evolution/connect ──────────────────────────────────────
router.post('/evolution/connect', async (req, res) => {
  if (!evoUrl()) return res.status(503).json({ error: 'EVOLUTION_API_URL não configurada no servidor.' });

  try {
    const instanceName = await getInstanceName(req.companyId);
    const exists       = await instanceExists(instanceName);

    if (!exists) {
      const webhookUrl = `${(process.env.BACKEND_URL || 'https://api.pfunil.ia.br').replace(/\/$/, '')}/api/whatsapp/webhook`;

      const created = await evoFetch('/instance/create', {
        method: 'POST',
        body: JSON.stringify({
          instanceName,
          qrcode:      true,
          integration: 'WHATSAPP-BAILEYS',
          webhook: {
            url:      webhookUrl,
            byEvents: false,
            events:   ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
          },
        }),
      });

      if (!created.ok) {
        console.error('[evolution create]', created.data);
        return res.status(500).json({
          error: 'Erro ao criar instância: ' + (created.data?.error?.message || JSON.stringify(created.data)),
        });
      }
    }

    // Pegar QR code
    const qrRes = await evoFetch(`/instance/connect/${encodeURIComponent(instanceName)}`);

    // base64 é o PNG pronto para <img src>
    // code é a string raw do QR (nao é imagem) — nao usar como src
    const qrBase64 = qrRes.data?.base64
      || qrRes.data?.qrcode?.base64
      || null;

    // Garantir prefixo data URI
    const qr = qrBase64
      ? (qrBase64.startsWith('data:') ? qrBase64 : 'data:image/png;base64,' + qrBase64)
      : null;

    res.json({
      instanceName,
      qr,
      qrCode: qrRes.data?.code || null,  // string raw, util para debug
      state: qrRes.data?.state || 'qrcode',
    });
  } catch (err) {
    console.error('[evolution connect]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/whatsapp/evolution/status ────────────────────────────────────────
router.get('/evolution/status', async (req, res) => {
  if (!evoUrl()) return res.json({ connected: false, state: 'not_configured' });

  try {
    const instanceName = await getInstanceName(req.companyId);

    const exists = await instanceExists(instanceName);
    if (!exists) return res.json({ connected: false, state: 'not_created', instanceName });

    const stateRes = await evoFetch(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
    if (!stateRes.ok) return res.json({ connected: false, state: 'disconnected', instanceName });

    // Normalizar — varia entre versões
    const state = stateRes.data?.instance?.state
      || stateRes.data?.state
      || stateRes.data?.connectionStatus
      || 'unknown';

    const connected = state === 'open';

    // Buscar número do telefone conectado
    let phone = null;
    if (connected) {
      const infoRes = await evoFetch(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`);
      if (infoRes.ok) {
        const list = Array.isArray(infoRes.data) ? infoRes.data : [infoRes.data];
        const inst = list.find(i =>
          i?.instance?.instanceName === instanceName ||
          i?.instanceName           === instanceName ||
          i?.name                   === instanceName
        );
        const raw = inst?.instance?.owner || inst?.owner || null;
        if (raw) phone = raw.replace(/@s\.whatsapp\.net$/, '').replace(/@c\.us$/, '');
      }
    }

    res.json({ connected, state, instanceName, phone });
  } catch (err) {
    console.error('[evolution status]', err.message);
    res.json({ connected: false, state: 'error', error: err.message });
  }
});

// ── DELETE /api/whatsapp/evolution/disconnect ─────────────────────────────────
router.delete('/evolution/disconnect', async (req, res) => {
  if (!evoUrl()) return res.status(503).json({ error: 'EVOLUTION_API_URL não configurada.' });

  try {
    const instanceName = await getInstanceName(req.companyId);
    await evoFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: 'DELETE' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[evolution disconnect]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/whatsapp/assessment/:id ────────────────────────────────────────
router.post('/assessment/:id', async (req, res) => {
  try {
    const { to, patientName } = req.body;
    if (!to) return res.status(400).json({ error: 'Número de telefone é obrigatório.' });

    const [form] = await sql`
      SELECT af.token, af.physio_name,
             c.razao, c.contato,
             co.name AS company_name
      FROM   assessment_forms af
      JOIN   clients   c  ON c.id  = af.client_id
      JOIN   companies co ON co.id = af.company_id
      WHERE  af.id         = ${req.params.id}
        AND  af.company_id = ${req.companyId}`;

    if (!form) return res.status(404).json({ error: 'Ficha não encontrada.' });

    const link    = `${APP_URL}/avaliacao/${form.token}`;
    const name    = patientName || form.razao || form.contato || 'paciente';
    const physio  = form.physio_name ? ` com ${form.physio_name}` : '';
    const company = form.company_name;

    const text = [
      `Olá, ${name}! 👋`,
      ``,
      `*Ficha de Avaliação Fisioterapêutica*`,
      `Sua ficha foi preparada${physio} — ${company}.`,
      ``,
      `Acesse o link abaixo para preencher online:`,
      link,
      ``,
      `⏱ O link é válido por 30 dias.`,
    ].join('\n');

    await sendWhatsApp(to, text);
    res.json({ ok: true });
  } catch (err) {
    console.error('[whatsapp assessment]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/whatsapp/message ───────────────────────────────────────────────
router.post('/message', async (req, res) => {
  try {
    const { to, text } = req.body;
    if (!to || !text) return res.status(400).json({ error: 'Telefone e mensagem são obrigatórios.' });
    await sendWhatsApp(to, text);
    res.json({ ok: true });
  } catch (err) {
    console.error('[whatsapp message]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
