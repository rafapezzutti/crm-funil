require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');

const authRoutes    = require('./routes/auth');
const clientRoutes  = require('./routes/clients');
const sdrRoutes     = require('./routes/sdrs');
const sellerRoutes  = require('./routes/sellers');
const companyRoutes = require('./routes/company');

const app = express();

// ── Security ──────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ── Body parsing ──────────────────────────────────
app.use(express.json({ limit: '10mb' }));   // allow base64 attachments
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ─────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
});

// ── Routes ────────────────────────────────────────
app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/clients',  clientRoutes);
app.use('/api/sdrs',     sdrRoutes);
app.use('/api/sellers',  sellerRoutes);
app.use('/api/company',  companyRoutes);

// ── Health check ──────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── 404 ───────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// ── Global error handler ──────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno do servidor.' });
});

// ── Start ─────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀  API running on port ${PORT}`));
