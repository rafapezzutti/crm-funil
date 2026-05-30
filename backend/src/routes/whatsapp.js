/**
 * CRM Funil — WhatsApp Route (Meta Cloud API)
 * ============================================
 * POST /api/whatsapp/assessment/:id  → envia link da ficha de avaliação via WhatsApp
 * POST /api/whatsapp/message         → mensagem de texto livre para um número
 *
 * Variáveis de ambiente necessárias:
 *   WHATSAPP_TOKEN    — Access Token permanente da Meta
 *   WHATSAPP_PHONE_ID — Phone Number ID (ex: 1234567890123456)
 *   FRONTEND_URL      — URL do frontend (já usada em assessments.js)
 */

const router = require('express').Router();
const auth   = require('../middleware/auth');
const { sql } = require('../config/db');

const APP_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── Helper: formata número para E.164 (só dígitos, com DDI) ─────────────────
function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  // Se não tem código de país (BR = 55), adiciona automaticamente
  if (digits.length === 10 || digits.length === 11) return '55' + digits;
  return digits;
}

// ── Helper: envia mensagem de texto via Meta WhatsApp Cloud API ──────────────
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
    // Erro comum: número não está no WhatsApp ou fora da janela de 24h (precisa de template)
    throw new Error(msg);
  }

  return data;
}

// ── POST /api/whatsapp/assessment/:id ────────────────────────────────────────
// Envia o link da ficha de avaliação para o WhatsApp do paciente
router.post('/assessment/:id', auth, async (req, res) => {
  try {
    const { to, patientName } = req.body;
    if (!to) return res.status(400).json({ error: 'Número de telefone é obrigatório.' });

    // Busca a ficha (pertencente à empresa do usuário logado)
    const [form] = await sql`
      SELECT af.token, af.physio_name,
             c.razao, c.contato,
             co.name AS company_name
      FROM   assessment_forms af
      JOIN   clients   c  ON c.id  = af.client_id
      JOIN   companies co ON co.id = af.company_id
      WHERE  af.id          = ${req.params.id}
        AND  af.company_id  = ${req.companyId}`;

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
// Mensagem de texto livre (uso interno, ex: confirmações de consulta)
router.post('/message', auth, async (req, res) => {
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
