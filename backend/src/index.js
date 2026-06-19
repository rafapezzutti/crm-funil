require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const { ensureSchema }       = require('./db/schema');
const { startCronScheduler } = require('./services/cronScheduler');
const authRoutes       = require('./routes/auth');
const leadRoutes       = require('./routes/leads');
const planRoutes       = require('./routes/plans');
const dashboardRoutes  = require('./routes/dashboard');
const adminRoutes      = require('./routes/admin');
const commissionRoutes = require('./routes/commissions');
const assessmentRoutes = require('./routes/assessments');
const whatsappRoutes   = require('./routes/whatsapp');
const companyRoutes    = require('./routes/company');
const robotRoutes      = require('./routes/robots');
const masterRoutes        = require('./routes/master');
const prospectingRoutes   = require('./routes/prospecting');

const app = express();

app.set('trust proxy', 1);

app.use(helmet());

const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:5173'];
app.use((req, res, next) => {
  // Rotas sem restrição de origem (chamadas de serviços externos)
  if (
    req.path.startsWith('/api/leads/prospecting-sync') ||
    req.path === '/api/whatsapp/webhook'
  ) {
    return cors({ origin: true, credentials: false })(req, res, next);
  }
  return cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })(req, res, next);
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 500, standardHeaders: true, legacyHeaders: false });
app.use(limiter);
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' } });

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',        authLimiter, authRoutes);
app.use('/api/leads',       leadRoutes);
app.use('/api/plans',       planRoutes);
app.use('/api/dashboard',   dashboardRoutes);
app.use('/api/admin',       adminRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/whatsapp',    whatsappRoutes);
app.use('/api/company',     companyRoutes);
app.use('/api/robots',      robotRoutes);
app.use('/api/master',      masterRoutes);
app.use('/api/prospecting', prospectingRoutes);

// ── Setup endpoint ────────────────────────────────────────────────────────────
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
    console.log