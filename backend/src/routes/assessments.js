/**
 * CRM Funil — Assessment Forms Route
 * ====================================
 * POST   /api/assessments              → criar ficha (auth)
 * GET    /api/assessments/client/:id   → listar fichas do cliente (auth)
 * GET    /api/assessments/public/:tok  → dados públicos para preenchimento (sem auth)
 * POST   /api/assessments/public/:tok  → salvar preenchimento (sem auth)
 * POST   /api/assessments/:id/email    → enviar link por email (auth)
 */

const router = require('express').Router();
const auth   = require('../middleware/auth');
const { sql } = require('../config/db');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── Garantir tabela ──────────────────────────────────────────────────────────
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS assessment_forms (
      id            SERIAL PRIMARY KEY,
      token         UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
      client_id     INT  NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      company_id    INT  NOT NULL REFERENCES companies(id),
      created_by    INT,
      physio_name   VARCHAR(200),
      physio_email  VARCHAR(200),
      status        VARCHAR(20) DEFAULT 'pending',
      form_data     JSONB,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      completed_at  TIMESTAMPTZ,
      expires_at    TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
    )`;
}
ensureTable().catch(err => console.error('[assessments] ensureTable:', err.message));

// ── POST / — criar nova ficha ────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { clientId, physioName, physioEmail } = req.body;
    if (!clientId) return res.status(400).json({ error: 'clientId é obrigatório.' });

    // Verifica se o cliente pertence à empresa
    const [client] = await sql`
      SELECT id, razao, contato FROM clients
      WHERE id = ${clientId} AND company_id = ${req.companyId}`;
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const [form] = await sql`
      INSERT INTO assessment_forms (client_id, company_id, created_by, physio_name, physio_email)
      VALUES (${clientId}, ${req.companyId}, ${req.userId}, ${physioName || null}, ${physioEmail || null})
      RETURNING id, token, created_at, expires_at`;

    res.json({
      ...form,
      link: `${APP_URL}/avaliacao/${form.token}`,
      clientName: client.razao || client.contato,
    });
  } catch (err) {
    console.error('[assessments POST /]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /client/:clientId — listar fichas de um cliente ──────────────────────
router.get('/client/:clientId', auth, async (req, res) => {
  try {
    const forms = await sql`
      SELECT af.id, af.token, af.status, af.physio_name, af.created_at,
             af.completed_at, af.expires_at,
             af.form_data->>'nome' AS patient_nome
      FROM   assessment_forms af
      WHERE  af.client_id  = ${req.params.clientId}
        AND  af.company_id = ${req.companyId}
      ORDER  BY af.created_at DESC`;
    res.json(forms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /public/:token — dados para o paciente preencher (SEM AUTH) ──────────
router.get('/public/:token', async (req, res) => {
  try {
    const [form] = await sql`
      SELECT af.id, af.status, af.physio_name, af.physio_email,
             af.expires_at, af.form_data,
             c.razao AS client_razao, c.contato AS client_contato,
             co.name AS company_name
      FROM   assessment_forms af
      JOIN   clients   c  ON c.id  = af.client_id
      JOIN   companies co ON co.id = af.company_id
      WHERE  af.token = ${req.params.token}`;

    if (!form) return res.status(404).json({ error: 'Ficha não encontrada.' });
    if (form.status === 'completed') return res.status(410).json({ error: 'Esta ficha já foi preenchida.', completed: true, data: form.form_data });
    if (new Date(form.expires_at) < new Date()) return res.status(410).json({ error: 'Link expirado. Solicite uma nova ficha.' });

    res.json({
      id:           form.id,
      status:       form.status,
      physioName:   form.physio_name,
      physioEmail:  form.physio_email,
      clientName:   form.client_razao || form.client_contato,
      companyName:  form.company_name,
      formData:     form.form_data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /public/:token — salvar preenchimento (SEM AUTH) ───────────────────
router.post('/public/:token', async (req, res) => {
  try {
    const { formData } = req.body;
    if (!formData) return res.status(400).json({ error: 'formData é obrigatório.' });

    const [form] = await sql`
      SELECT id, status, expires_at FROM assessment_forms WHERE token = ${req.params.token}`;
    if (!form)                                       return res.status(404).json({ error: 'Ficha não encontrada.' });
    if (form.status === 'completed')                 return res.status(410).json({ error: 'Ficha já preenchida.' });
    if (new Date(form.expires_at) < new Date())      return res.status(410).json({ error: 'Link expirado.' });

    await sql`
      UPDATE assessment_forms
      SET    status = 'completed', form_data = ${JSON.stringify(formData)}, completed_at = NOW()
      WHERE  id = ${form.id}`;

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:id/email — enviar link por email ──────────────────────────────────
router.post('/:id/email', auth, async (req, res) => {
  try {
    const { to, patientName } = req.body;
    if (!to) return res.status(400).json({ error: 'E-mail do destinatário é obrigatório.' });

    const [form] = await sql`
      SELECT af.token, af.physio_name, c.razao, c.contato, co.name AS company_name
      FROM   assessment_forms af
      JOIN   clients   c  ON c.id  = af.client_id
      JOIN   companies co ON co.id = af.company_id
      WHERE  af.id = ${req.params.id} AND af.company_id = ${req.companyId}`;
    if (!form) return res.status(404).json({ error: 'Ficha não encontrada.' });

    const link       = `${APP_URL}/avaliacao/${form.token}`;
    const clientName = form.razao || form.contato;
    const name       = patientName || clientName;

    await resend.emails.send({
      from:    process.env.RESEND_FROM || 'noreply@psolucoes.com.br',
      to:      [to],
      subject: `Ficha de Avaliação Fisioterapêutica — ${form.company_name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;padding:30px;border-radius:12px;">
          <div style="background:white;border-radius:10px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
            <h2 style="color:#1a5cd4;margin-top:0;">Ficha de Avaliação Fisioterapêutica</h2>
            <p style="color:#333;">Olá, <strong>${name}</strong>!</p>
            <p style="color:#555;">Sua ficha de avaliação fisioterapêutica foi preparada por <strong>${form.physio_name || form.company_name}</strong>.</p>
            <p style="color:#555;">Clique no botão abaixo para preencher sua ficha online. O link é válido por 30 dias.</p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${link}" style="background:linear-gradient(135deg,#1a5cd4,#00d4d4);color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:600;display:inline-block;">
                Preencher Ficha de Avaliação
              </a>
            </div>
            <p style="color:#888;font-size:13px;">Se o botão não funcionar, copie e cole este link no seu navegador:<br>
              <a href="${link}" style="color:#1a5cd4;">${link}</a>
            </p>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
            <p style="color:#aaa;font-size:12px;text-align:center;">${form.company_name} · Powered by P. Soluções</p>
          </div>
        </div>`,
    });

    res.json({ ok: true, link });
  } catch (err) {
    console.error('[assessments email]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
