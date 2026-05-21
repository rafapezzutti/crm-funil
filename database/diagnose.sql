-- ═══════════════════════════════════════════════════════════
-- CRM Funil — Script de Diagnóstico
-- Execute no Neon SQL Editor para entender o estado atual
-- ═══════════════════════════════════════════════════════════

-- 1. Todas as empresas cadastradas
SELECT '=== EMPRESAS ===' AS info;
SELECT id, name, slug, created_at
FROM companies
ORDER BY name;

-- 2. Quantos clientes por empresa
SELECT '=== CLIENTES POR EMPRESA ===' AS info;
SELECT co.name AS empresa, COUNT(cl.id) AS total_clientes
FROM companies co
LEFT JOIN clients cl ON cl.company_id = co.id
GROUP BY co.id, co.name
ORDER BY co.name;

-- 3. Distribuição de stages em todos os clientes
SELECT '=== DISTRIBUIÇÃO DE STAGES ===' AS info;
SELECT co.name AS empresa, cl.stage, COUNT(*) AS total
FROM clients cl
JOIN companies co ON co.id = cl.company_id
GROUP BY co.name, cl.stage
ORDER BY co.name, cl.stage;

-- 4. Busca pelos clientes desaparecidos
SELECT '=== BUSCA: Bali / Tênis / Winners ===' AS info;
SELECT cl.id, cl.razao, cl.contato, cl.stage, co.name AS empresa
FROM clients cl
JOIN companies co ON co.id = cl.company_id
WHERE lower(cl.razao)   LIKE '%bali%'
   OR lower(cl.razao)   LIKE '%tenis%'
   OR lower(cl.razao)   LIKE '%tênis%'
   OR lower(cl.razao)   LIKE '%winners%'
   OR lower(cl.contato) LIKE '%bali%'
   OR lower(cl.contato) LIKE '%tenis%'
   OR lower(cl.contato) LIKE '%winners%';

-- 5. Clientes com stages inválidos (não aparecem no kanban)
SELECT '=== CLIENTES COM STAGE INVÁLIDO ===' AS info;
SELECT cl.id, cl.razao, cl.contato, cl.stage, co.name AS empresa
FROM clients cl
JOIN companies co ON co.id = cl.company_id
WHERE cl.stage NOT IN ('prosp', 'neg', 'piloto', 'prod')
   OR cl.stage IS NULL;

-- 6. Todos os membros e suas empresas
SELECT '=== MEMBROS / EMPRESAS ===' AS info;
SELECT u.name AS usuario, u.email, co.name AS empresa, cm.role
FROM company_members cm
JOIN users u ON u.id = cm.user_id
JOIN companies co ON co.id = cm.company_id
ORDER BY co.name, u.name;
