-- ═══════════════════════════════════════════════════════════
-- CRM Funil — Setup de Empresas (Pipes)
-- Execute APENAS se as empresas não existirem ainda
-- Verifique primeiro com diagnose.sql
-- ═══════════════════════════════════════════════════════════

-- ── PASSO 1: Cria as empresas (pipes) se não existirem ──────

INSERT INTO companies (name, slug)
VALUES
  ('CRM Unimidia',  'crm-unimidia'),
  ('CRM Spas',      'crm-spas'),
  ('CRM Esportes',  'crm-esportes'),
  ('CRM Saude',     'crm-saude')
ON CONFLICT (slug) DO NOTHING;

-- Confirma o que foi criado
SELECT id, name, slug FROM companies ORDER BY name;

-- ── PASSO 2: Adicione seu usuário como admin de cada empresa ─
-- Substitua 'SEU-USER-ID-AQUI' pelo seu UUID de usuário
-- (você encontra na tabela users ou rodando: SELECT id FROM users WHERE email = 'rafael.pezzutti@gmail.com')

-- Primeiro, descubra seu user ID:
SELECT id, email, name FROM users WHERE email = 'rafael.pezzutti@gmail.com';

-- Depois, rode o bloco abaixo substituindo o UUID:
/*
DO $$
DECLARE
  v_user_id UUID := 'SEU-USER-ID-AQUI';  -- <-- substitua aqui
  v_comp    RECORD;
BEGIN
  FOR v_comp IN SELECT id FROM companies LOOP
    INSERT INTO company_members (company_id, user_id, role)
    VALUES (v_comp.id, v_user_id, 'admin')
    ON CONFLICT (company_id, user_id) DO NOTHING;
  END LOOP;
  RAISE NOTICE 'Membro adicionado a todas as empresas.';
END;
$$;
*/

-- ── PASSO 3: Corrige stages inválidos (clientes invisíveis) ──

UPDATE clients SET stage = 'neg'
WHERE lower(stage) IN ('negoc', 'negociacao', 'negociação', 'em negociação', 'em negociacao');

UPDATE clients SET stage = 'prosp'
WHERE lower(stage) IN ('prospectado', 'prospecção', 'prospeccao')
   OR stage IS NULL OR trim(stage) = '';

UPDATE clients SET stage = 'prod'
WHERE lower(stage) IN ('producao', 'produção', 'em producao', 'em produção', 'ativo', 'active');

UPDATE clients SET stage = 'piloto'
WHERE lower(stage) IN ('em piloto', 'teste', 'trial');

-- Verifica quantos foram corrigidos
SELECT stage, COUNT(*) FROM clients GROUP BY stage ORDER BY stage;

-- ── PASSO 4: Cadastro manual dos clientes ausentes ───────────
-- Execute APÓS descobrir os IDs das empresas corretas no Passo 1

-- Exemplo — Bali Spa (CRM Spas):
/*
INSERT INTO clients (company_id, stage, razao, contato, setor)
SELECT id, 'prod', 'Bali Spa', 'Bali Spa', 'Saúde'
FROM companies WHERE slug = 'crm-spas'
ON CONFLICT DO NOTHING;
*/

-- Exemplo — Top Tênis (CRM Esportes):
/*
INSERT INTO clients (company_id, stage, razao, contato, setor)
SELECT id, 'prod', 'Top Tênis', 'Top Tênis', 'Serviços'
FROM companies WHERE slug = 'crm-esportes'
ON CONFLICT DO NOTHING;
*/

-- Exemplo — Winners Academy (CRM Esportes):
/*
INSERT INTO clients (company_id, stage, razao, contato, setor)
SELECT id, 'prod', 'Winners Academy', 'Winners Academy', 'Serviços'
FROM companies WHERE slug = 'crm-esportes'
ON CONFLICT DO NOTHING;
*/
