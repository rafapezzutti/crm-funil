/**
 * CRM Pezzutti — Schema Auto-Setup
 * company_id, responsavel_id, user_id, uploaded_by = UUID (todos ids são UUID neste projeto)
 * Drop explícito por nome para garantir recriação correta
 */
const { sql } = require('../config/db');

async function runSafe(name, fn) {
  try { await fn(); return { ok: true, table: name }; }
  catch (err) {
    console.error(`[schema] ${name}:`, err.message);
    return { ok: false, table: name, error: err.message };
  }
}

async function dropAll() {
  await sql`DROP TABLE IF EXISTS lead_whatsapp_chats CASCADE`;
  await sql`DROP TABLE IF EXISTS onboarding_items        CASCADE`;
  await sql`DROP TABLE IF EXISTS lead_proposals          CASCADE`;
  await sql`DROP TABLE IF EXISTS lead_activities         CASCADE`;
  await sql`DROP TABLE IF EXISTS leads                   CASCADE`;
  await sql`DROP TABLE IF EXISTS plans                   CASCADE`;
}

async function ensureSchema(force = false) {
  const results = [];

  if (force) {
    await runSafe('drop_tables', () => dropAll());
  }

  results.push(await runSafe('plans', () => sql`
    CREATE TABLE IF NOT EXISTS plans (
      id         SERIAL PRIMARY KEY,
      company_id UUID          NOT NULL,
      crm        VARCHAR(50)   NOT NULL,
      nome       VARCHAR(100)  NOT NULL,
      valor      DECIMAL(10,2) NOT NULL DEFAULT 0,
      ativo      BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`));

  results.push(await runSafe('leads', () => sql`
    CREATE TABLE IF NOT EXISTS leads (
      id                SERIAL PRIMARY KEY,
      company_id        UUID         NOT NULL,
      nome              VARCHAR(200) NOT NULL,
      empresa           VARCHAR(200),
      email             VARCHAR(200),
      telefone          VARCHAR(50),
      stage             VARCHAR(30)  DEFAULT 'prospeccao',
      crm               VARCHAR(50),
      origem            VARCHAR(50),
      score             VARCHAR(20),
      plano_id          INT,
      valor_plano       DECIMAL(10,2),
      valor_negociado   DECIMAL(10,2),
      responsavel_id    UUID,
      data_fechamento   DATE,
      proxima_acao      VARCHAR(50),
      data_proxima_acao DATE,
      motivo_perda      VARCHAR(80),
      obs               TEXT,
      trial_start       TIMESTAMPTZ,
      trial_end         TIMESTAMPTZ,
      crm_externo_id    INT,
      crm_externo_slug  VARCHAR(50),
      health_score          VARCHAR(10)  DEFAULT 'green',
      ultimo_whatsapp_at    TIMESTAMPTZ,
      prosp_quente_count    INT          DEFAULT 0,
      created_at            TIMESTAMPTZ  DEFAULT NOW(),
      updated_at            TIMESTAMPTZ  DEFAULT NOW()
    )`));

  // Migração segura: adiciona colunas se a tabela já existir
  results.push(await runSafe('leads_migration_whatsapp', () => sql`
    ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS ultimo_whatsapp_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS prosp_quente_count INT DEFAULT 0`));

  results.push(await runSafe('lead_activities', () => sql`
    CREATE TABLE IF NOT EXISTS lead_activities (
      id          SERIAL PRIMARY KEY,
      lead_id     INT  NOT NULL,
      user_id     UUID,
      user_name   VARCHAR(200),
      tipo        VARCHAR(50),
      descricao   TEXT NOT NULL,
      dados       JSONB,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )`));

  results.push(await runSafe('lead_proposals', () => sql`
    CREATE TABLE IF NOT EXISTS lead_proposals (
      id          SERIAL PRIMARY KEY,
      lead_id     INT  NOT NULL,
      versao      INT DEFAULT 1,
      valor       DECIMAL(10,2),
      data_envio  DATE,
      obs         TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )`));

  results.push(await runSafe('onboarding_items', () => sql`
    CREATE TABLE IF NOT EXISTS onboarding_items (
      id           SERIAL PRIMARY KEY,
      lead_id      INT NOT NULL,
      item         VARCHAR(80) NOT NULL,
      concluido    BOOLEAN DEFAULT false,
      concluido_at TIMESTAMPTZ,
      UNIQUE(lead_id, item)
    )`));

  results.push(await runSafe('lead_whatsapp_chats', () => sql`
    CREATE TABLE IF NOT EXISTS lead_whatsapp_chats (
      id            SERIAL PRIMARY KEY,
      lead_id       INT  NOT NULL,
      company_id    UUID NOT NULL,
      filename      VARCHAR(200),
      contact_name  VARCHAR(200),
      source        VARCHAR(50) DEFAULT 'whatsapp',
      content       TEXT,
      messages      JSONB,
      message_count INT DEFAULT 0,
      date_start    TIMESTAMPTZ,
      date_end      TIMESTAMPTZ,
      uploaded_by   UUID,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )`));

  results.push(await runSafe('sync_meta', () => sql`
    CREATE TABLE IF NOT EXISTS sync_meta (
      key        VARCHAR(100) PRIMARY KEY,
      value      TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`));


  results.push(await runSafe('seller_profiles', () => sql`
    CREATE TABLE IF NOT EXISTS seller_profiles (
      id         SERIAL PRIMARY KEY,
      user_id    UUID NOT NULL UNIQUE,
      company_id UUID NOT NULL,
      cpf        VARCHAR(20),
      ativo      BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`));

  results.push(await runSafe('commissions', () => sql`
    CREATE TABLE IF NOT EXISTS commissions (
      id               SERIAL PRIMARY KEY,
      seller_id        UUID NOT NULL,
      company_id       UUID NOT NULL,
      mes_referencia   DATE NOT NULL,
      percentual       DECIMAL(5,2) DEFAULT 0,
      valor_calculado  DECIMAL(10,2) DEFAULT 0,
      obs              TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(seller_id, mes_referencia)
    )`));

  await runSafe('seed_plans', () => seedPlans());

  const ok  = results.filter(r => r.ok).length;
  const err = results.filter(r => !r.ok).length;
  console.log(`[schema] ${ok} OK, ${err} erros`);
  return results;
}

async function seedPlans() {
  const cos = await sql`SELECT id FROM companies LIMIT 1`;
  if (!cos.length) return;
  const companyId = cos[0].id;
  const existing  = await sql`SELECT id FROM plans WHERE company_id = ${companyId} LIMIT 1`;
  if (existing.length) return;

  const defaults = [
    { crm:'esportes', nome:'Autônomo',    valor: 49.90 },
    { crm:'esportes', nome:'Academia',    valor: 79.90 },
    { crm:'spa',      nome:'Autônomo',    valor: 49.90 },
    { crm:'spa',      nome:'Clínica',     valor: 79.90 },
    { crm:'saude',    nome:'Clínica',     valor: 79.90 },
    { crm:'pet',      nome:'Pet / Hotel', valor: 49.90 },
    { crm:'pet',      nome:'Pet + Vet',   valor: 79.90 },
  ];
  for (const p of defaults) {
    await sql`
      INSERT INTO plans (company_id, crm, nome, valor)
      VALUES (${companyId}, ${p.crm}, ${p.nome}, ${p.valor})
      ON CONFLICT DO NOTHING`;
  }
}

module.exports = { ensureSchema };
