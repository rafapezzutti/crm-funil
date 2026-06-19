const jwt = require('jsonwebtoken');
const { sql } = require('../config/db');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Verificar se JWT foi emitido antes de uma troca de senha
    if (payload.userId) {
      const [u] = await sql`SELECT password_changed_at FROM users WHERE id = ${payload.userId}`;
      if (u?.password_changed_at) {
        const changedAt = Math.floor(new Date(u.password_changed_at).getTime() / 1000);
        if (payload.iat < changedAt) {
          return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
        }
      }
    }

    // Verificar status da empresa (exceto master — nunca bloqueado)
    if (payload.companyId && payload.role !== 'master') {
      const [company] = await sql`SELECT status FROM companies WHERE id = ${payload.companyId}`;
      if (company && (company.status === 'suspenso' || company.status === 'inativo')) {
        return res.status(403).json({
          error: 'Acesso suspenso. Entre em contato com o suporte.',
          code: 'company_suspended',
          status: company.status,
        });
      }
    }

    req.userId    = payload.userId;
    req.companyId = payload.companyId;
    req.role      = payload.role;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

module.exports = authMiddleware;
