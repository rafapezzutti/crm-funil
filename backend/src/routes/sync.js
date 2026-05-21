/**
 * CRM Funil — Sync Route
 * ======================
 * GET  /api/sync/status   → situação das fontes + última sincronização
 * POST /api/sync/run      → dispara sync manual (admin only)
 *
 * O sync periódico automático é iniciado em src/index.js via node-cron.
 */

const router = require('express').Router();
const auth   = require('../middleware/auth');
const { sql: funil } = require('../config/db');
const { Pool } = require('pg');

// ── Source databases ──────────────────────────────────────────────────────────
const SOURCES = {
  esportes: process.env.DATABASE_URL_ESPORTES,
  spas:     process.env.DATABASE_URL_SPAS,
  saude:    process.env.DATABASE_URL_SAUDE,
};

function srcPool(url) {
  return new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 3 });
}

// ── Track last sync in DB ─────────────────────────────────────────────────────
async function getLastSync(source) {
  try {
    const res = await funil`
      SELECT value FROM sync_meta WHERE key = ${'last_sync_' + source}`;
    return res[0]?.value || null;
  } catch { return null; }
}

async function setLastSync(source) {
  const key = 'last_sync_' + source;
  const val = new Date().toISOString();
  await funil`
    INSERT INTO sync_meta (key, value) VALUES (${key}, ${val})
    ON CONFLICT (key) DO UPDATE SET value = ${val}, updated_at = NOW()`;
  return val;
}

// ── Duplicate check ───────────────────────────────────────────────────────────
async function clientExists(companyId, razao, email, telefone) {
  const rows = await funil`
    SELECT id FROM clients
    WHERE company_id = ${companyId} AND (
      (${razao || ''} <> '' AND lower(razao) = lower(${razao || ''}))
      OR (${email || ''} <> '' AND lower(email) = lower(${email || ''}))
      OR (${telefone || ''} <> '' AND regexp_replace(COALESCE(telefone,''),'[^0-9]','','g')
          = regexp_replace(${telefone || ''},'[^0-9]','','g'))
    ) LIMIT 1`;
  return rows.length > 0;
}

async function insertClient(companyId, data) {
  await funil`
    INSERT INTO clients (company_id, stage, razao, contato, telefone, email, endereco, setor, cnpj, obs)
    VALUES (${companyId}, ${data.stage||'prod'}, ${data.razao||null}, ${data.contato||null},
            ${data.telefone||null}, ${data.email||null}, ${data.endereco||null},
            ${data.setor||null}, ${data.cnpj||null}, ${data.obs||null})`;
}

async function getOrCreateCompany(slug, name) {
  const existing = await funil`SELECT id FROM companies WHERE slug = ${slug}`;
  if (existing.length) return existing[0].id;
  const [created] = await funil`
    INSERT INTO companies (name, slug) VALUES (${name}, ${slug}) RETURNING id`;
  return created.id;
}

// ── Sync each source ──────────────────────────────────────────────────────────
async function syncEsportes() {
  if (!SOURCES.esportes) return { source: 'esportes', skipped: true, reason: 'DATABASE_URL_ESPORTES não configurada' };
  const pool = srcPool(SOURCES.esportes);
  const result = { source: 'esportes', imported: 0, skipped: 0, errors: 0 };
  try {
    const companyId = await getOrCreateCompany('crm-esportes', 'CRM Esportes');
    const { rows } = await pool.query(
      `SELECT id, name, responsible, cpf_cnpj, phone, email, street, number, city, state, cep
       FROM establishments ORDER BY id`
    );
    for (const e of rows) {
      const razao    = e.name || '';
      const telefone = e.phone || '';
      const email    = e.email || '';
      const endereco = [e.street, e.number, e.city, e.state, e.cep].filter(Boolean).join(', ');
      if (!razao) { result.skipped++; continue; }
      const dup = await clientExists(companyId, razao, email, telefone);
      if (dup) { result.skipped++; continue; }
      await insertClient(companyId, {
        stage: 'prod', razao, contato: e.responsible || razao,
        telefone, email, endereco, setor: 'Esportes',
        cnpj: e.cpf_cnpj || null,
        obs: `Sync CRM Esportes (id=${e.id})`,
      });
      result.imported++;
    }
    await setLastSync('esportes');
  } catch (err) {
    result.errors++;
    result.error = err.message;
  } finally {
    await pool.end().catch(() => {});
  }
  return result;
}

async function syncSpas() {
  if (!SOURCES.spas) return { source: 'spas', skipped: true, reason: 'DATABASE_URL_SPAS não configurada' };
  const pool = srcPool(SOURCES.spas);
  const result = { source: 'spas', imported: 0, skipped: 0, errors: 0 };
  try {
    const companyId = await getOrCreateCompany('crm-spas', 'CRM Spas');
    const { rows } = await pool.query(
      `SELECT id, nome, email, telefone, endereco, ativo FROM clinicas ORDER BY id`
    );
    for (const c of rows) {
      const razao    = c.nome || '';
      const telefone = c.telefone || '';
      const email    = c.email || '';
      if (!razao) { result.skipped++; continue; }
      const dup = await clientExists(companyId, razao, email, telefone);
      if (dup) { result.skipped++; continue; }
      await insertClient(companyId, {
        stage: c.ativo === 1 ? 'prod' : 'neg',
        razao, contato: razao, telefone, email,
        endereco: c.endereco || null,
        setor: 'Saúde',
        obs: `Sync CRM Spas (id=${c.id})`,
      });
      result.imported++;
    }
    await setLastSync('spas');
  } catch (err) {
    result.errors++;
    result.error = err.message;
  } finally {
    await pool.end().catch(() => {});
  }
  return result;
}

async function syncSaude() {
  if (!SOURCES.saude) return { source: 'saude', skipped: true, reason: 'DATABASE_URL_SAUDE não configurada' };
  const pool = srcPool(SOURCES.saude);
  const result = { source: 'saude', imported: 0, skipped: 0, errors: 0 };
  try {
    const companyId = await getOrCreateCompany('crm-saude', 'CRM Saúde');
    const { rows } = await pool.query(
      `SELECT id, name, responsible_name, responsible_cpf, phone, email,
              street, number, complement, cep
       FROM clinics ORDER BY id`
    );
    for (const c of rows) {
      const razao    = c.name || '';
      const telefone = c.phone || '';
      const email    = c.email || '';
      const endereco = [c.street, c.number, c.complement, c.cep].filter(Boolean).join(', ');
      if (!razao) { result.skipped++; continue; }
      const dup = await clientExists(companyId, razao, email, telefone);
      if (dup) { result.skipped++; continue; }
      await insertClient(companyId, {
        stage: 'prod', razao,
        contato: c.responsible_name || razao,
        telefone, email, endereco,
        setor: 'Saúde',
        cnpj: c.responsible_cpf || null,
        obs: `Sync CRM Saúde (id=${c.id})`,
      });
      result.imported++;
    }
    await setLastSync('saude');
  } catch (err) {
    result.errors++;
    result.error = err.message;
  } finally {
    await pool.end().catch(() => {});
  }
  return result;
}

// ── Run all syncs ─────────────────────────────────────────────────────────────
async function runAllSyncs() {
  const results = await Promise.allSettled([
    syncEsportes(),
    syncSpas(),
    syncSaude(),
  ]);
  return results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message });
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/sync/status — mostra última sync de cada fonte
router.get('/status', auth, async (req, res) => {
  try {
    const [lastEsportes, lastSpas, lastSaude] = await Promise.all([
      getLastSync('esportes'),
      getLastSync('spas'),
      getLastSync('saude'),
    ]);
    res.json({
      sources: {
        esportes: { configured: !!SOURCES.esportes, lastSync: lastEsportes },
        spas:     { configured: !!SOURCES.spas,     lastSync: lastSpas },
        saude:    { configured: !!SOURCES.saude,     lastSync: lastSaude },
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/run — dispara sync manual (admin only)
router.post('/run', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores.' });
  try {
    const results = await runAllSyncs();
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, runAllSyncs };
