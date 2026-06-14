const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { sql } = require('../config/db');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

sql`CREATE TABLE IF NOT EXISTS login_events (
  id BIGSERIAL PRIMARY KEY, user_id INTEGER, user_name TEXT, user_role TEXT, ip TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`.catch(() => {});
sql`CREATE INDEX IF NOT EXISTS idx_login_events_created ON login_events(created_at DESC)`.catch(() => {});

function makeSlug(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 60)
    + '-' + Date.now().toString(36);
}

function signToken(userId, companyId, role) {
  return jwt.sign(
    { userId, companyId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, companyName, segment } = req.body;
  if (!name || !email || !password || !companyName) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' });
  }
  try {
    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
    if (existing.length > 0) {
      return res.status(409).json({ error: 'E-mail já cadastrado.' });
    }
    const hash = await bcrypt.hash(password, 10);

    const [user] = await sql`
      INSERT INTO users (email, password_hash, name)
      VALUES (${email.toLowerCase()}, ${hash}, ${name})
      RETURNING id, email, name`;

    const slug = makeSlug(companyName);
    const [company] = await sql`
      INSERT INTO companies (name, slug, plan, trial_ends_at)
      VALUES (${companyName}, ${slug}, 'trial', NOW() + INTERVAL '14 days')
      RETURNING id, name, slug, plan, trial_ends_at`;

    await sql`
      INSERT INTO company_members (company_id, user_id, role)
      VALUES (${company.id}, ${user.id}, 'admin')`;

    await sql`
      INSERT INTO seller_profiles (user_id, company_id, ativo)
      VALUES (${user.id}, ${company.id}, true)
      ON CONFLICT (user_id) DO NOTHING`;

    const seg = segment || 'saude';
    const defaultPlans = {
      saude:    [{ nome:'Clínica Básica', valor:79.90 }, { nome:'Clínica Pro', valor:149.90 }],
      pet:      [{ nome:'Pet Shop',       valor:49.90 }, { nome:'Pet + Vet',    valor:79.90 }],
      esportes: [{ nome:'Autônomo',       valor:49.90 }, { nome:'Academia',     valor:79.90 }],
      spa:      [{ nome:'Estética',       valor:49.90 }, { nome:'Spa Completo', valor:89.90 }],
      outro:    [{ nome:'Plano Básico',   valor:49.90 }, { nome:'Plano Pro',    valor:99.90 }],
    };
    for (const p of (defaultPlans[seg] || defaultPlans.outro)) {
      await sql`
        INSERT INTO plans (company_id, crm, nome, valor)
        VALUES (${company.id}, ${seg}, ${p.nome}, ${p.valor})
        ON CONFLICT DO NOTHING`;
    }

    const token = signToken(user.id, company.id, 'admin');
    res.json({
      token,
      user:    { id: user.id, name: user.name, email: user.email },
      company: { id: company.id, name: company.name, slug: company.slug,
                 plan: company.plan, trial_ends_at: company.trial_ends_at },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar conta.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password, companyId } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }
  try {
    const [user] = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()}`;
    if (!user) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });

    const memberships = await sql`
      SELECT cm.company_id, cm.role, c.name, c.slug, c.plan, c.trial_ends_at, c.status
      FROM company_members cm
      JOIN companies c ON c.id = cm.company_id
      WHERE cm.user_id = ${user.id}
      ORDER BY c.name`;

    if (memberships.length === 0) {
      return res.status(403).json({ error: 'Usuário não pertence a nenhuma empresa.' });
    }

    let membership = companyId
      ? memberships.find(m => m.company_id === companyId)
      : memberships[0];
    if (!membership) membership = memberships[0];

    const token = signToken(user.id, membership.company_id, membership.role);
    const _ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip;
    sql`INSERT INTO login_events (user_id, user_name, user_role, ip)
        VALUES (${user.id}, ${user.name}, ${membership.role}, ${_ip})`.catch(() => {});
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
      company: { id: membership.company_id, name: membership.name, slug: membership.slug,
                 role: membership.role, plan: membership.plan,
                 trial_ends_at: membership.trial_ends_at, status: membership.status },
      companies: memberships.map(m => ({
        id: m.company_id, name: m.name, slug: m.slug, role: m.role,
        plan: m.plan, trial_ends_at: m.trial_ends_at,
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'E-mail obrigatório.' });
  try {
    const [user] = await sql`SELECT id, name FROM users WHERE email = ${email.toLowerCase()}`;
    if (!user) return res.json({ message: 'Se o e-mail existir, você receberá um link de recuperação.' });

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600_000);
    await sql`UPDATE users SET reset_token = ${token}, reset_expires = ${expires} WHERE id = ${user.id}`;

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await resend.emails.send({
      from: process.env.RESEND_FROM,
      to:   email,
      subject: 'Recuperação de senha — CRM Funil',
      html: `
        <h2>Olá, ${user.name}!</h2>
        <p>Recebemos uma solicitação de redefinição de senha para sua conta no <strong>CRM Funil</strong>.</p>
        <p><a href="${resetUrl}" style="background:#00DFC4;color:#080D35;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">
          Redefinir senha
        </a></p>
        <p>Este link expira em <strong>1 hora</strong>. Se não foi você, ignore este e-mail.</p>
      `
    });
    res.json({ message: 'Se o e-mail existir, você receberá um link de recuperação.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao enviar e-mail.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' });
  try {
    const [user] = await sql`
      SELECT id FROM users
      WHERE reset_token = ${token} AND reset_expires > NOW()`;
    if (!user) return res.status(400).json({ error: 'Link inválido ou expirado.' });

    const hash = await bcrypt.hash(password, 10);
    await sql`UPDATE users SET password_hash = ${hash}, reset_token = NULL, reset_expires = NULL WHERE id = ${user.id}`;
    res.json({ message: 'Senha redefinida com sucesso.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// GET /api/auth/me
const auth = require('../middleware/auth');
router.get('/me', auth, async (req, res) => {
  try {
    const [user] = await sql`SELECT id, name, email FROM users WHERE id = ${req.userId}`;
    const memberships = await sql`
      SELECT cm.company_id as id, cm.role, c.name, c.slug
      FROM company_members cm JOIN companies c ON c.id = cm.company_id
      WHERE cm.user_id = ${req.userId} ORDER BY c.name`;
    res.json({ user, companies: memberships, currentCompanyId: req.companyId });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// POST /api/auth/switch-company
router.post('/switch-company', auth, async (req, res) => {
  const { companyId } = req.body;
  if (!companyId) return res.status(400).json({ error: 'companyId obrigatório.' });
  try {
    const [membership] = await sql`
      SELECT cm.role, c.name, c.slug
      FROM company_members cm
      JOIN companies c ON c.id = cm.company_id
      WHERE cm.user_id = ${req.userId} AND cm.company_id = ${companyId}`;
    if (!membership) {
      return res.status(403).json({ error: 'Você não tem acesso a esta empresa.' });
    }
    const token = signToken(req.userId, companyId, membership.role);
    res.json({
      token,
      company: { id: companyId, name: membership.name, slug: membership.slug, role: membership.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
