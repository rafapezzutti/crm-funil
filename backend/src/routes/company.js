const router  = require('express').Router();
const auth    = require('../middleware/auth');
const { sql } = require('../config/db');

router.use(auth);

const DEFAULT_CRM_TYPES = [
  { value:'saude',    label:'Saúde',    icon:'🏥' },
  { value:'pet',      label:'Pet',      icon:'🐾' },
  { value:'esportes', label:'Esportes', icon:'⚽' },
  { value:'spa',      label:'Spa',      icon:'💆' },
];

// GET /api/company
router.get('/', async (req, res) => {
  const [company] = await sql`SELECT * FROM companies WHERE id = ${req.companyId}`;
  if (!company) return res.status(404).json({ error: 'Empresa não encontrada.' });
  res.json(company);
});

// PUT /api/company
router.put('/', async (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem editar.' });
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório.' });
  const [company] = await sql`UPDATE companies SET name = ${name} WHERE id = ${req.companyId} RETURNING *`;
  res.json(company);
});

// GET /api/company/members
router.get('/members', async (req, res) => {
  const members = await sql`
    SELECT cm.user_id AS id, u.name, u.email, cm.role
    FROM company_members cm JOIN users u ON u.id = cm.user_id
    WHERE cm.company_id = ${req.companyId}
    ORDER BY u.name`;
  res.json(members);
});

// GET /api/company/crm-types
router.get('/crm-types', async (req, res) => {
  try {
    const [s] = await sql`SELECT crm_types FROM company_settings WHERE company_id = ${req.companyId}`;
    const types = s?.crm_types;
    if (Array.isArray(types) && types.length > 0) return res.json(types);
    res.json(DEFAULT_CRM_TYPES);
  } catch {
    res.json(DEFAULT_CRM_TYPES);
  }
});

// GET /api/company/settings
router.get('/settings', async (req, res) => {
  try {
    const [s] = await sql`SELECT * FROM company_settings WHERE company_id = ${req.companyId}`;
    res.json({
      crm_types:          s?.crm_types          || DEFAULT_CRM_TYPES,
      whatsapp_api_url:   s?.whatsapp_api_url   || '',
      whatsapp_api_token: s?.whatsapp_api_token || '',
      whatsapp_instance:  s?.whatsapp_instance  || '',
    });
  } catch {
    res.json({ crm_types: DEFAULT_CRM_TYPES, whatsapp_api_url:'', whatsapp_api_token:'', whatsapp_instance:'' });
  }
});

// PUT /api/company/settings
router.put('/settings', async (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem alterar.' });
  const { crm_types, whatsapp_api_url, whatsapp_api_token, whatsapp_instance } = req.body;
  try {
    await sql`
      INSERT INTO company_settings
        (company_id, crm_types, whatsapp_api_url, whatsapp_api_token, whatsapp_instance, updated_at)
      VALUES
        (${req.companyId}, ${JSON.stringify(crm_types || DEFAULT_CRM_TYPES)},
         ${whatsapp_api_url||null}, ${whatsapp_api_token||null}, ${whatsapp_instance||null}, NOW())
      ON CONFLICT (company_id) DO UPDATE SET
        crm_types          = EXCLUDED.crm_types,
        whatsapp_api_url   = EXCLUDED.whatsapp_api_url,
        whatsapp_api_token = EXCLUDED.whatsapp_api_token,
        whatsapp_instance  = EXCLUDED.whatsapp_instance,
        updated_at         = NOW()`;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/company/settings/test-whatsapp
router.post('/settings/test-whatsapp', async (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores.' });
  const { whatsapp_api_url, whatsapp_api_token, whatsapp_instance } = req.body;
  if (!whatsapp_api_url || !whatsapp_api_token || !whatsapp_instance) {
    return res.status(400).json({ error: 'Preencha URL, token e instância.' });
  }
  try {
    const url = `${whatsapp_api_url.replace(/\/$/, '')}/instance/connectionState/${whatsapp_instance}`;
    const r = await fetch(url, {
      headers: { apikey: whatsapp_api_token },
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json();
    const state = data?.instance?.state || data?.state || 'unknown';
    const connected = state === 'open';
    res.json({ connected, state, message: connected ? '✅ WhatsApp conectado!' : `⚠️ Estado: ${state}` });
  } catch (err) {
    res.status(502).json({ connected: false, error: `Não foi possível conectar: ${err.message}` });
  }
});

module.exports = router;
