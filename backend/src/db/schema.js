/**
 * CRM Pezzutti — Schema Auto-Setup
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

  results.push(await runSafe('company_settings', () => sql`
    CREATE TABLE IF NOT EXISTS company_settings (
      company_id         UUID PRIMARY KEY,
      crm_types          JSONB        DEFAULT '[]',
      whatsapp_api_url   TEXT,
      whatsapp_api_token TEXT,
      whatsapp_instance  TEXT,
      updated_at         TIMESTAMPTZ  DEFAULT NOW()
    )`));

  results.push(await runSafe('companies_trial', () => sql`
    ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS plan          VARCHAR(20)  DEFAULT 'trial',
      ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '14 days',
      ADD COLUMN IF NOT EXISTS status        VARCHAR(20)  DEFAULT 'active'`));

  results.push(await runSafe('companies_contact_info', () => sql`
    ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS cnpj     VARCHAR(20),
      ADD COLUMN IF NOT EXISTS telefone VARCHAR(30)`));

  results.push(await runSafe('leads_migration_data_producao', () => sql`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS data_producao TIMESTAMPTZ`));

  await runSafe('assign_orphan_leads', () => sql`
    UPDATE leads l
    SET responsavel_id = (
      SELECT cm.user_id
      FROM company_members cm
      WHERE cm.company_id = l.company_id AND cm.role = 'admin'
      LIMIT 1
    )
    WHERE l.responsavel_id IS NULL
  `);


  // Tabela de robôs configuráveis por empresa
  results.push(await runSafe('robots', () => sql`
    CREATE TABLE IF NOT EXISTS robots (
      id                SERIAL PRIMARY KEY,
      company_id        UUID         NOT NULL,
      name              VARCHAR(100) NOT NULL,
      description       TEXT,
      tipo              VARCHAR(50)  NOT NULL DEFAULT 'custom',
      trigger_type      VARCHAR(20)  DEFAULT 'cron',
      cron_expr         VARCHAR(50),
      event_trigger     VARCHAR(50),
      prompt_template   TEXT,
      whatsapp_template TEXT,
      ativo             BOOLEAN      DEFAULT true,
      queued_at         TIMESTAMPTZ  DEFAULT NULL,
      updated_at        TIMESTAMPTZ  DEFAULT NOW(),
      created_at        TIMESTAMPTZ  DEFAULT NOW()
    )`));

  // Migração: adiciona queued_at em tabelas existentes
  await runSafe('robots_queued_at_col', () => sql`
    ALTER TABLE robots ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ DEFAULT NULL`);

  // Migração: coluna para invalidar JWTs após reset de senha
  await runSafe('users_password_changed_at', () => sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT NULL`);

  // Logs de execução de robôs
  results.push(await runSafe('robot_logs', () => sql`
    CREATE TABLE IF NOT EXISTS robot_logs (
      id          SERIAL PRIMARY KEY,
      robot_id    INT          NOT NULL,
      company_id  UUID         NOT NULL,
      status      VARCHAR(20)  DEFAULT 'ok',
      output      TEXT,
      duration_ms INT,
      created_at  TIMESTAMPTZ  DEFAULT NOW()
    )`));

  // Inbox de mensagens inbound — alimentado pelo webhook Evolution API
  results.push(await runSafe('whatsapp_inbox', () => sql`
    CREATE TABLE IF NOT EXISTS whatsapp_inbox (
      id            BIGSERIAL PRIMARY KEY,
      company_id    UUID         REFERENCES companies(id) ON DELETE CASCADE,
      instance_name TEXT,
      phone         TEXT NOT NULL,
      message_text  TEXT,
      received_at   TIMESTAMPTZ DEFAULT NOW(),
      raw           JSONB
    )`));

  await runSafe('whatsapp_inbox_idx_company_date', () => sql`
    CREATE INDEX IF NOT EXISTS idx_whatsapp_inbox_company_date
      ON whatsapp_inbox(company_id, received_at)`);

  await runSafe('whatsapp_inbox_idx_phone', () => sql`
    CREATE INDEX IF NOT EXISTS idx_whatsapp_inbox_phone
      ON whatsapp_inbox(phone, company_id)`);

  await runSafe('company_settings_commission_rules', () => sql`
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS commission_rules JSONB DEFAULT NULL`);

  // Histórico de prospecção — independente do funil de leads
  results.push(await runSafe('prospecting_records', () => sql`
    CREATE TABLE IF NOT EXISTS prospecting_records (
      id             BIGSERIAL PRIMARY KEY,
      company_id     UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      vendedor_id    UUID,
      nome           VARCHAR(200) NOT NULL,
      empresa        VARCHAR(200),
      telefone       VARCHAR(50),
      crm            VARCHAR(30),
      data_abordagem DATE,
      status         VARCHAR(30)  DEFAULT 'sem_resposta',
      resposta       TEXT,
      analise        TEXT,
      proximo_passo  TEXT,
      promoted_at    TIMESTAMPTZ,
      promoted_by    UUID,
      lead_id        INT,
      data_arquivo   DATE,
      origem         VARCHAR(50)  DEFAULT 'prospeccao_diaria',
      raw            JSONB,
      created_at     TIMESTAMPTZ  DEFAULT NOW(),
      updated_at     TIMESTAMPTZ  DEFAULT NOW()
    )`));

  await runSafe('prospecting_records_idx_date', () => sql`
    CREATE INDEX IF NOT EXISTS idx_prosp_records_company_date
      ON prospecting_records(company_id, data_abordagem DESC)`);

  await runSafe('prospecting_records_idx_phone', () => sql`
    CREATE INDEX IF NOT EXISTS idx_prosp_records_phone
      ON prospecting_records(telefone, company_id)`);

  // Consentimento de monitoramento WhatsApp (auditoria)
  results.push(await runSafe('number_consents', () => sql`
    CREATE TABLE IF NOT EXISTS number_consents (
      id            BIGSERIAL PRIMARY KEY,
      company_id    UUID         NOT NULL,
      user_id       UUID         NOT NULL,
      phone         VARCHAR(50),
      instance_name TEXT,
      terms_version VARCHAR(20)  DEFAULT 'v1.0',
      accepted_at   TIMESTAMPTZ  DEFAULT NOW(),
      ip_address    TEXT,
      user_agent    TEXT
    )`));

  // Múltiplos números WhatsApp por empresa
  results.push(await runSafe('whatsapp_connections', () => sql`
    CREATE TABLE IF NOT EXISTS whatsapp_connections (
      id            BIGSERIAL PRIMARY KEY,
      company_id    UUID         NOT NULL,
      vendedor_id   UUID,
      instance_name TEXT         NOT NULL,
      phone         VARCHAR(50),
      status        VARCHAR(20)  DEFAULT 'disconnected',
      created_at    TIMESTAMPTZ  DEFAULT NOW(),
      updated_at    TIMESTAMPTZ  DEFAULT NOW(),
      UNIQUE(company_id, instance_name)
    )`));

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
