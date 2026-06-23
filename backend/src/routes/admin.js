/**
 * CRM Pezzutti — Admin Route
 * Gerenciamento de vendedores (apenas admin/master)
 *
 * GET    /api/admin/sellers        → lista vendedores
 * POST   /api/admin/sellers        → cria vendedor
 * PUT    /api/admin/sellers/:id    → atualiza (ativo/inativo)
 * DELETE /api/admin/sellers/:id    → remove
 */
const router  = require('express').Router();
const auth    = require('../middleware/auth');
const bcrypt  = require('bcryptjs');
const { sql } = require('../config/db');

// Apenas admin pode gerenciar vendedores
function adminOnly(req, res, next) {
  if (req.role !== 'admin' && req.role !== 'master') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }
  next();
}

// ── GET /api/admin/sellers ────────────────────────────────────────────────────
router.get('/sellers', auth, adminOnly, async (req, res) => {
  try {
    const sellers = await sql`
      SELECT u.id, u.name, u.email, sp.cpf, sp.ativo, sp.created_at,
             COUNT(DISTINCT l.id) FILTER (WHERE l.stage NOT IN ('perdido','cancelado')) AS leads_ativos,
             COUNT(DISTINCT l.id) FILTER (WHERE l.stage = 'producao')                  AS leads_producao,
             COALESCE(SUM(COALESCE(l.valor_negociado, l.valor_plano, 0))
               FILTER (WHERE l.stage = 'producao'), 0)                                 AS mrr
      FROM   seller_profiles sp
      JOIN   users u ON u.id = sp.user_id
      LEFT JOIN leads l ON l.responsavel_id = sp.user_id AND l.company_id = sp.company_id
      WHERE  sp.company_id = ${req.companyId}
      GROUP  BY u.id, u.name, u.email, sp.cpf, sp.ativo, sp.created_at
      ORDER  BY u.name`;
    res.json(sellers);
  } catch (err) {
    console.error('[admin sellers GET]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/sellers ───────────────────────────────────────────────────
router.post('/sellers', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, cpf, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' });
    }

    // Verifica e-mail duplicado
    const [existing] = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
    if (existing) return res.status(409).json({ error: 'E-mail já cadastrado.' });

    const hash = await bcrypt.hash(password, 10);

    // Cria usuário
    const [user] = await sql`
      INSERT INTO users (email, password_hash, name)
      VALUES (${email.toLowerCase()}, ${hash}, ${name})
      RETURNING id, email, name`;

    // Associa à empresa como vendedor
    await sql`
      INSERT INTO company_members (company_id, user_id, role)
      VALUES (${req.companyId}, ${user.id}, 'vendedor')`;

    // Perfil do vendedor (CPF)
    const [profile] = await sql`
      INSERT INTO seller_profiles (user_id, company_id, cpf)
      VALUES (${user.id}, ${req.companyId}, ${cpf || null})
      RETURNING id, cpf, ativo, created_at`;

    res.status(201).json({ ...user, ...profile });
  } catch (err) {
    console.error('[admin sellers POST]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/admin/sellers/:id ────────────────────────────────────────────────
router.put('/sellers/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, cpf, ativo } = req.body;
    if (name) {
      await sql`UPDATE users SET name = ${name} WHERE id = ${req.params.id}`;
    }
    await sql`
      UPDATE seller_profiles SET
        cpf   = ${cpf || null},
        ativo = ${ativo ?? true}
      WHERE user_id = ${req.params.id} AND company_id = ${req.companyId}`;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/admin/sellers/:id ─────────────────────────────────────────────
router.delete('/sellers/:id', auth, adminOnly, async (req, res) => {
  try {
    await sql`
      UPDATE seller_profiles SET ativo = false
      WHERE user_id = ${req.params.id} AND company_id = ${req.companyId}`;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── POST /api/admin/invite ────────────────────────────────────────────────────
// Cria novo usuário e adiciona à empresa com o role especificado (admin/master only)
router.post('/invite', auth, adminOnly, async (req, res) => {
  const { name, email, password, role = 'vendedor' } = req.body;
  if (!name?.trim())  return res.status(400).json({ error: 'Nome é obrigatório.' });
  if (!email?.trim()) return res.status(400).json({ error: 'E-mail é obrigatório.' });
  if (!password)      return res.status(400).json({ error: 'Senha é obrigatória.' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' });
  if (!['admin','vendedor'].includes(role)) return res.status(400).json({ error: 'Função inválida.' });

  try {
    const emailLower = email.toLowerCase().trim();

    // Verifica se email já existe
    const [existing] = await sql`SELECT id FROM users WHERE email = ${emailLower}`;
    if (existing) {
      // Usuário já existe — apenas associa à empresa se ainda não for membro
      const [alreadyMember] = await sql`
        SELECT id FROM company_members WHERE user_id = ${existing.id} AND company_id = ${req.companyId}`;
      if (alreadyMember) {
        return res.status(409).json({ error: 'Este e-mail já é membro da empresa.' });
      }
      await sql`INSERT INTO company_members (company_id, user_id, role) VALUES (${req.companyId}, ${existing.id}, ${role})`;
      const [u] = await sql`SELECT id, name, email FROM users WHERE id = ${existing.id}`;
      return res.json({ ...u, role });
    }

    // Cria novo usuário
    const hash = await bcrypt.hash(password, 10);
    const [user] = await sql`
      INSERT INTO users (email, password_hash, name)
      VALUES (${emailLower}, ${hash}, ${name.trim()})
      RETURNING id, name, email`;

    await sql`INSERT INTO company_members (company_id, user_id, role) VALUES (${req.companyId}, ${user.id}, ${role})`;

    // Se for vendedor, cria seller_profile
    if (role === 'vendedor') {
      await sql`
        INSERT INTO seller_profiles (user_id, company_id, ativo)
        VALUES (${user.id}, ${req.companyId}, true)
        ON CONFLICT (user_id) DO NOTHING`;
    }

    res.json({ ...user, role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/team ───────────────────────────────────────────────────────
// Retorna todos os membros da empresa (para dropdown de responsável)
router.get('/team', auth, async (req, res) => {
  try {
    const members = await sql`
      SELECT u.id, u.name, u.email, cm.role
      FROM   company_members cm
      JOIN   users u ON u.id = cm.user_id
      WHERE  cm.company_id = ${req.companyId}
      ORDER  BY cm.role DESC, u.name`;
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
