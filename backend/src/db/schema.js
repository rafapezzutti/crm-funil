/**
 * CRM Pezzutti — Schema Auto-Setup
 * Cria todas as tabelas na inicialização se não existirem.
 */
const { sql } = require('../config/db');

async function ensureSchema() {
  // Plans
  await sql`
    CREATE TABLE IF NOT EXISTS plans (
      id         SERIAL PRIMARY KEY,
      company_id INT REFERENCES companies(id) ON DELETE CASCADE,
      crm        VARCHAR(50)   NOT NULL,
      nome       VARCHAR(100)  NOT NULL,
      valor      DECIMAL(10,2) NOT NULL DEFAULT 0,
      ativo      BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;

  // Leads
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id                SERIAL PRIMARY KEY,
      company_id        INT REFERENCES companies(id) ON DELETE CASCADE,
      nome              VARCHAR(200) NOT NULL,
      empresa           VARCHAR(200),
      email             VARCHAR(200),
      telefone          VARCHAR(50),
      stage             VARCHAR(30)  DEFAULT 'prospeccao',
      crm               VARCHAR(50),
      origem            VARCHAR(50),
      score             VARCHAR(20),
      plano_id          INT REFERENCES plans(id),
      valor_plano       DECIMAL(10,2),
      valor_negociado   DECIMAL(10,2),
      responsavel_id    INT,
      data_fechamento   DATE,
      proxima_acao      VARCHAR(50),
      data_proxima_acao DATE,
      motivo_perda      VARCHAR(80),
      obs               TEXT,
      trial_start       TIMESTAMPTZ,
      trial_end         TIMESTAMPTZ,
      crm_externo_id    INT,
      crm_externo_slug  VARCHAR(50),
      health_score      VARCHAR(10)  DEFAULT 'green',
      created_at        TIMESTAMPTZ  DEFAULT NOW(),
      updated_at        TIMESTAMPTZ  DEFAULT NOW()
    )`;

  // Activities/Timeline
  await sql`
    CREATE TABLE IF NOT EXISTS lead_activities (
      id          SERIAL PRIMARY KEY,
      lead_id     INT REFERENCES leads(id) ON DELETE CASCADE,
      user_id     INT,
      user_name   VARCHAR(200),
      tipo        VARCHAR(50),
      descricao   TEXT NOT NULL,
      dados       JSONB,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )`;

  // Proposals
  await sql`
    CREATE TABLE IF NOT EXISTS lead_proposals (
      id          SERIAL PRIMARY KEY,
      lead_id     INT REFERENCES leads(id) ON DELETE CASCADE,
      versao      INT DEFAULT 1,
      valor       DECIMAL(10,2),
      data_envio  DATE,
      obs         TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )`;

  // Onboarding checklist items
  await sql`
    CREATE TABLE IF NOT EXISTS onboarding_items (
      id           SERIAL PRIMARY KEY,
      lead_id      INT REFERENCES leads(id) ON DELETE CASCADE,
      item         VARCHAR(80) NOT NULL,
      concluido    BOOLEAN DEFAULT false,
      concluido_at TIMESTAMPTZ,
      UNIQUE(lead_id, item)
    )`;

  // Sync meta (shared)
  await sql`
    CREATE TABLE IF NOT EXISTS sync_meta (
      key        VARCHAR(100) PRIMARY KEY,
      value      TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;

  // Seed default plans if empty
  await seedPlans();
}

async function seedPlans() {
  // Check if any company exists
  const cos = await sql`SELECT id FROM companies LIMIT 1`;
  if (!cos.length) return;
  const companyId = cos[0].id;

  const existing = await sql`SELECT id FROM plans WHERE company_id = ${companyId} LIMIT 1`;
  if (existing.length) return;

  const defaults = [
    { crm:'esportes', nome:'Autônomo',   valor: 49.90 },
    { crm:'esportes', nome:'Academia',   valor: 79.90 },
    { crm:'spa',      nome:'Autônomo',   valor: 49.90 },
    { crm:'spa',      nome:'Clínica',    valor: 79.90 },
    { crm:'saude',    nome:'Autônomo',   valor: 49.90 },
    { crm:'saude',    nome:'Clínica',    valor: 79.90 },
    { crm:'pet',      nome:'Pet / Hotel',valor: 49.90 },
    { crm:'pet',      nome:'Pet + Vet',  valor: 79.90 },
  ];

  for (const p of defaults) {
    await sql`
      INSERT INTO plans (company_id, crm, nome, valor)
      VALUES (${companyId}, ${p.crm}, ${p.nome}, ${p.valor})
      ON CONFLICT DO NOTHING`;
  }
}

module.exports = { ensureSchema };
