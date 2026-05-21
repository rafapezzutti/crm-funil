const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { sql } = require('../config/db');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Helpers
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

// ── POST /api/auth/register ───────────────────────
// Cria usuário + empresa ao mesmo tempo
router.post('/register', async (req, res) => {
  const { name, email, password, companyName } = req.body;
  if (!name || !email || !password || !companyName) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' });
  }
  try {
    // Check email already exists
    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
    if (existing.length > 0) {
      return res.status(409).json({ error: 'E-mail já cadastrado.' });
    }
    const hash = await bcrypt.hash(password, 10);
    // Create user
    const [user] = await sql`
      INSERT INTO users (email, password_hash, name)
      VALUES (${email.toLowerCase()}, ${hash}, ${name})
      RETURNING id, email, name`;
    // Create company
    const slug = makeSlug(companyName);
    const [company] = await sql`
      INSERT INTO companies (name, slug)
      VALUES (${companyName}, ${slug})
      RETURNING id, name, slug`;
    // Add user as admin of company
    await sql`
      INSERT INTO company_members (company_id, user_id, role)
      VALUES (${company.id}, ${user.id}, 'admin')`;
    const token = signToken(user.id, company.id, 'admin');
    res.json({ token, user: { id: user.id, name: user.name, email: user.email },
               company: { id: company.id, name: company.name, slug: company.slug } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar conta.' });
  }
});

// ── POST /api/auth/login ─────────────────────────
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

    // Get companies this user belongs to
    const memberships = await sql`
      SELECT cm.company_id, cm.role, c.name, c.slug
      FROM company_members cm
      JOIN companies c ON c.id = cm.company_id
      WHERE cm.user_id = ${user.id}
      ORDER BY c.name`;

    if (memberships.length === 0) {
      return res.status(403).json({ error: 'Usuário não pertence a nenhuma empresa.' });
    }

    // If companyId specified, use it; otherwise use first
    let membership = companyId
      ? memberships.find(m => m.company_id === companyId)
      : memberships[0];
    if (!membership) membership = memberships[0];

    const token = signToken(user.id, membership.company_id, membership.role);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
      company: { id: membership.company_id, name: membership.name, slug: membership.slug, role: membership.role },
      companies: memberships.map(m => ({ id: m.company_id, name: m.name, slug: m.slug, role: m.role }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ── POST /api/auth/forgot-password ───────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'E-mail obrigatório.' });
  try {
    const [user] = await sql`SELECT id, name FROM users WHERE email = ${email.toLowerCase()}`;
    // Always return 200 to avoid user enumeration
    if (!user) return res.json({ message: 'Se o e-mail existir, você receberá um link de recuperação.' });

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600_000); // 1h
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

// ── POST /api/auth/reset-password ────────────────
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

// ── GET /api/auth/me ─────────────────────────────
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

// ── POST /api/auth/