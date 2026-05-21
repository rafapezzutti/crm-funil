-- ═══════════════════════════════════════════════
-- CRM Funil — Schema PostgreSQL (Neon)
-- Execute este script uma vez para criar as tabelas
-- ═══════════════════════════════════════════════

-- Extensão para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── COMPANIES (tenants) ──────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  created_at  TIMESTAMP   DEFAULT NOW()
);

-- ── USERS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(255) UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  name           VARCHAR(255),
  reset_token    VARCHAR(255),
  reset_expires  TIMESTAMP,
  created_at     TIMESTAMP   DEFAULT NOW()
);

-- ── COMPANY MEMBERS (user ↔ company) ─────────────
CREATE TABLE IF NOT EXISTS company_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  role        VARCHAR(50) DEFAULT 'member',   -- 'admin' | 'member'
  created_at  TIMESTAMP   DEFAULT NOW(),
  UNIQUE(company_id, user_id)
);

-- ── SDRS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sdrs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255),
  created_at  TIMESTAMP   DEFAULT NOW()
);

-- ── SELLERS (Vendedores) ──────────────────────────
CREATE TABLE IF NOT EXISTS sellers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255),
  created_at  TIMESTAMP   DEFAULT NOW()
);

-- ── CLIENTS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID           NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  stage       VARCHAR(50)    NOT NULL DEFAULT 'prosp',  -- prosp|negoc|piloto|prod
  cnpj        VARCHAR(20),
  razao       VARCHAR(255),
  contato     VARCHAR(255),
  telefone    VARCHAR(30),
  email       VARCHAR(255),
  email_cob   VARCHAR(255),
  endereco    TEXT,
  setor       VARCHAR(100),
  tvs         INTEGER,
  custo       NUMERIC(10,2),
  lead_resp   UUID           REFERENCES sdrs(id)    ON DELETE SET NULL,
  seller_id   UUID           REFERENCES sellers(id) ON DELETE SET NULL,
  obs         TEXT,
  created_at  TIMESTAMP      DEFAULT NOW(),
  updated_at  TIMESTAMP      DEFAULT NOW()
);

-- ── ATTACHMENTS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS attachments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type        VARCHAR(50),          -- cnpj | piloto | final | outro
  name        VARCHAR(255),
  data        TEXT,                 -- base64 data URL
  size        INTEGER,
  created_at  TIMESTAMP   DEFAULT NOW()
);

-- ── INDEXES ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_company    ON clients(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_stage      ON clients(stage);
CREATE INDEX IF NOT EXISTS idx_sdrs_company       ON sdrs(company_id);
CREATE INDEX IF NOT EXISTS idx_sellers_company    ON sellers(company_id);
CREATE INDEX IF NOT EXISTS idx_members_company    ON company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_members_user       ON company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_client ON attachments(client_id);

-- ── SYNC META (rastreia última sincronização) ────
CREATE TABLE IF NOT EXISTS sync_meta (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ── TRIGGER: updated_at auto-update ──────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
