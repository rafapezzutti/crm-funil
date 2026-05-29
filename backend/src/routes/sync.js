/**
 * CRM Pezzutti — Sync Route
 * Importa clientes ativos dos CRMs externos (Saúde, Spa, Esportes)
 * para a tabela `leads` do CRM Funil como stage='producao'.
 *
 * GET  /api/sync/status  → situação das fontes + última sync
 * POST /api/sync/run     → dispara sync manual (admin)
 */
const router = require('express').Router();
const auth   = require('../middleware/auth');
const { sql: funil } = require('../config/db');
const { Pool } = require('pg');

const SOURCES = {
  esportes: process.env.DATABASE_URL_ESPORTES,
  spas:     process.env.DATABASE_URL_SPAS,
  saude:    process.env.DATABASE_URL_SAUDE,
};

function srcPool(url) {
  return new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 3 });
}

async function getLastSync(source) {
  try {
    const res = await funil`SELECT value FROM sync_meta WHERE key = ${'last_sync_'+source}`;
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

// Verifica duplicata por nome/email/telefone
async function leadExists(companyId, nome, email, telefone) {
  const rows = await funil`
    SELECT id FROM leads
    WHERE company_id = ${companyId} AND (
      (${nome||''}     <> '' AND lower(nome)     = lower(${nome||''}))
      OR (${email||''} <> '' AND lower(email)    = lower(${email||''}))
      OR (${telefone||''} <> '' AND regexp_replace(COALESCE(telefone,''),'[^0-9]','','g')
          = regexp_replace(${telefone||''},'[^0-9]','','g'))
    ) LIMIT 1`;
  return rows.length > 0;
}

async function insertLead(companyId, crm, data) {
  await funil`
    INSERT INTO leads (company_id, stage, nome, empresa, telefone, email, crm,
                       origem, crm_externo_id, crm_externo_slug)
    VALUES (${companyId}, 'producao',
            ${data.nome||null}, ${data.empresa||null}, ${data.telefone||null},
            ${data.email||null}, ${crm},
            'sync', ${data.externo_id||null}, ${crm})`;
}

// ── Sync Esportes ─────────────────────────────────────────────────────────────
async function syncEsportes(companyId) {
  const url = SOURCES.esportes;
  if (!url) return { source:'esportes', skipped:true, reason:'DATABASE_URL_ESPORTES não configurado' };
  const pool = srcPool(url);
  try {
    const { rows } = await pool.query(`
      SELECT id, razao_social AS nome, fantasia AS empresa,
             telefone, email, ativo
      FROM   clientes
      WHERE  ativo = true OR ativo = 1
      LIMIT  2000`);
    let imported = 0;
    for (const c of rows) {
      const exists = await leadExists(companyId, c.nome, c.email, c.telefone);
      if (!exists) {
        await insertLead(companyId, 'esportes', { ...c, externo_id: c.id });
        imported++;
      }
    }
    await setLastSync('esportes');
    return { source:'esportes', total: rows.length, imported };
  } catch (err) {
    console.error('[sync:esportes]', err.message);
    return { source:'esportes', error: err.message };
  } finally { await pool.end(); }
}

// ── Sync Spas ─────────────────────────────────────────────────────────────────
async function syncSpas(companyId) {
  const url = SOURCES.spas;
  if (!url) return { source:'spas', skipped:true, reason:'DATABASE_URL_SPAS não configurado' };
  const pool = srcPool(url);
  try {
    const { rows } = await pool.query(`
      SELECT id, razao_social AS nome, fantasia AS empresa,
             telefone, email, ativo
      FROM   clientes LIMIT 2000`);
    let imported = 0;
    for (const c of rows) {
      const ativo = c.ativo === true || c.ativo === 1 || c.ativo === '1';
      if (!ativo) continue;
      const exists = await leadExists(companyId, c.nome, c.email, c.telefone);
      if (!exists) {
        await insertLead(companyId, 'spa', { ...c, externo_id: c.id });
        imported++;
      }
    }
    await setLastSync('spas');
    return { source:'spas', total: rows.length, imported };
  } catch (err) {
    console.error('[sync:spas]', err.message);
    return { source:'spas', error: err.message };
  } finally { await pool.end(); }
}

// ── Sync Saúde ────────────────────────────────────────────────────────────────
async function syncSaude(companyId) {
  const url = SOURCES.saude;
  if (!url) return { source:'saude', skipped:true, reason:'DATABASE_URL_SAUDE não configurado' };
  const pool = srcPool(url);
  try {
    const { rows } = await pool.query(`
      SELECT id, razao_social AS nome, fantasia AS empresa,
             telefone, email
      FROM   clientes LIMIT 2000`);
    let imported = 0;
    for (const c of rows) {
      const exists = await leadExists(companyId, c.nome, c.email, c.telefone);
      if (!exists) {
        await insertLead(companyId, 'saude', { ...c, externo_id: c.id });
        imported++;
      }
    }
    await setLastSync('saude');
    return { source:'saude', total: rows.length, imported };
  } catch (err) {
    console.error('[sync:saude]', err.message);
    return { source:'saude', error: err.message };
  } finally { await pool.end(); }
}

async function runAllSyncs(companyId) {
  const results = await Promise.allSettled([
    syncEsportes(companyId),
    syncSpas(companyId),
    syncSaude(companyId),
  ]);
  return results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message });
}

// ── GET /api/sync/status ──────────────────────────────────────────────────────
router.get('/status', auth, async (req, res) => {
  try {
    const sources = await Promise.all(Object.keys(SOURCES).map(async key => ({
      source:    key,
      configured: !!SOURCES[key],
      last_sync: await getLastSync(key),
    })));
    res.json({ sources });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/sync/run ────────────────────────────────────────────────────────
router.post('/run', auth, async (req, res) => {
  try {
    // Pega companyId do primeiro registro (single-tenant)
    const [co] = await funil`SELECT id FROM companies LIMIT 1`;
    const companyId = co?.id || req.companyId;
    const results = await runAllSyncs(companyId);
    res.json({ ok: true, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { router, runAllSyncs };
