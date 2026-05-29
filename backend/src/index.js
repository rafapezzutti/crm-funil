require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const { ensureSchema } = require('./db/schema');
const authRoutes      = require('./routes/auth');
const leadRoutes      = require('./routes/leads');
const planRoutes      = require('./routes/plans');
const dashboardRoutes = require('./routes/dashboard');
const { router: syncRoutes, runAllSyncs } = require('./routes/sync');

const app = express();

app.use(helmet());

const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:5173'];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 500, standardHeaders: true, legacyHeaders: false });
app.use(limiter);
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' } });

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',      authLimiter, authRoutes);
app.use('/api/leads',     leadRoutes);
app.use('/api/plans',     planRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/sync',      syncRoutes);


// ── Setup endpoint (força criação das tabelas) ────────────────────────────────
app.get('/api/setup', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const results = await ensureSchema(force);
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno.' });
});

// ── Inicialização ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`🚀  API running on port ${PORT}`);
  try {
    await ensureSchema();
    console.log('✅  Schema OK');
  } catch (e) {
    console.error('❌  Schema error:', e.message);
  }
  startSyncScheduler();
});

function startSyncScheduler() {
  const hasAnySrc = process.env.DATABASE_URL_ESPORTES
                 || process.env.DATABASE_URL_SPAS
                 || process.env.DATABASE_URL_SAUDE;
  if (!hasAnySrc) {
    console.log('ℹ  Sync desativado (sem fontes configuradas).');
    return;
  }
  const INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_HOURS || '6') * 3600000;
  console.log(`🔄  Sync agendado a cada ${INTERVAL_MS/3600000}h`);
  setTimeout(async () => {
    const [co] = await require('./config/db').sql`SELECT id FROM companies LIMIT 1`;
    if (!co) return;
    const results = await runAllSyncs(co.id);
    const total   = results.reduce((s, r) => s + (r.imported || 0), 0);
    console.log(`✅  Sync inicial: ${total} novos registros`);
  }, 10_000);
  setInterval(async () => {
    try {
      const [co] = await require('./config/db').sql`SELECT id FROM companies LIMIT 1`;
      if (!co) return;
      const results = await runAllSyncs(co.id);
      const total   = results.reduce((s, r) => s + (r.imported || 0), 0);
      if (total > 0) console.log(`✅  Sync: ${total} novos`);
    } catch (e) { console.error('❌  Sync error:', e.message); }
  }, INTERVAL_MS);
}
