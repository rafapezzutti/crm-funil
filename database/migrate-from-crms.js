/**
 * CRM Funil — Script de Migração dos CRMs Individuais
 * =====================================================
 * Importa dados do CRM Esportes, CRM Spas e CRM Saúde
 * para o banco do CRM Funil (multi-tenant).
 *
 * Como rodar:
 *   cd crm-funil
 *   node database/migrate-from-crms.js
 *
 * Requer: npm install pg (ou use o backend/node_modules)
 */

require('dotenv').config({ path: './backend/.env' });
const { Pool } = require('pg');

// ── Connection Strings ────────────────────────────────────────────────────────
const DB_FUNIL    = process.env.DATABASE_URL;
const DB_ESPORTES = 'postgresql://neondb_owner:npg_qn5HUu9rFdmi@ep-cold-mud-acmf86oo-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const DB_SPAS     = 'postgresql://neondb_owner:npg_w4yqnoeQzt5O@ep-misty-wind-ac9b92h8-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const DB_SAUDE    = 'postgresql://neondb_owner:npg_wc2NMFP3HEYt@ep-long-cloud-acpl3ioy-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

function pool(url) {
  return new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
}

// ── Stats ─────────────────────────────────────────────────────────────────────
const stats = { companies: 0, imported: 0, skipped: 0, errors: 0 };

// ── Helpers ───────────────────────────────────────────────────────────────────
async function upsertCompany(funil, name, slug) {
  const res = await funil.query(
    `INSERT INTO companies (name, slug)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name`,
    [name, slug]
  );
  return res.rows[0];
}

async function ensureAdminMember(funil, companyId, userEmail) {
  const user = await funil.query(
    `SELECT id FROM users WHERE email = $1`, [userEmail]
  );
  if (!user.rows.length) {
    console.warn(`  ⚠  Usuário ${userEmail} não encontrado — pule o passo de membro`);
    return;
  }
  const userId = user.rows[0].id;
  await funil.query(
    `INSERT INTO company_members (company_id, user_id, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (company_id, user_id) DO NOTHING`,
    [companyId, userId]
  );
}

async function clientExists(funil, companyId, razao, email, telefone) {
  const res = await funil.query(
    `SELECT id FROM clients
     WHERE company_id = $1 AND (
       ($2 <> '' AND lower(razao) = lower($2))
       OR ($3 <> '' AND lower(email) = lower($3))
       OR ($4 <> '' AND regexp_replace(telefone,'[^0-9]','','g') = regexp_replace($4,'[^0-9]','','g'))
     ) LIMIT 1`,
    [companyId, razao || '', email || '', telefone || '']
  );
  return res.rows.length > 0;
}

async function insertClient(funil, companyId, data) {
  await funil.query(
    `INSERT INTO clients
       (company_id, stage, razao, contato, telefone, email, endereco, setor, cnpj, obs)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      companyId,
      data.stage    || 'prod',
      data.razao    || null,
      data.contato  || null,
      data.telefone || null,
      data.email    || null,
      data.endereco || null,
      data.setor    || null,
      data.cnpj     || null,
      data.obs      || null,
    ]
  );
  stats.imported++;
}

// ── Migração: CRM Esportes → CRM Funil ───────────────────────────────────────
async function migrateEsportes(funil) {
  console.log('\n📦 Migrando CRM Esportes...');
  const src = pool(DB_ESPORTES);
  try {
    const company = await upsertCompany(funil, 'CRM Esportes', 'crm-esportes');
    await ensureAdminMember(funil, company.id, 'rafael.pezzutti@gmail.com');
    console.log(`  ✓ Empresa: ${company.name} [${company.id}]`);

    const { rows: ests } = await src.query(
      `SELECT id, name, responsible, cpf_cnpj, phone, email,
              street, number, city, state, cep
       FROM establishments ORDER BY id`
    );
    console.log(`  → ${ests.length} estabelecimentos encontrados`);

    for (const e of ests) {
      const razao    = e.name || '';
      const telefone = e.phone || '';
      const email    = e.email || '';
      const endereco = [e.street, e.number, e.city, e.state, e.cep]
                        .filter(Boolean).join(', ');

      const dup = await clientExists(funil, company.id, razao, email, telefone);
      if (dup) { stats.skipped++; console.log(`  ⏭  Já existe: ${razao}`); continue; }

      await insertClient(funil, company.id, {
        stage: 'prod', razao, contato: e.responsible || razao,
        telefone, email, endereco, setor: 'Esportes',
        cnpj: e.cpf_cnpj || null,
        obs: `Importado do CRM Esportes (id=${e.id})`,
      });
      console.log(`  ✅ ${razao}`);
    }

    // Também importa pontos/espaços como observação nos estabelecimentos
    const { rows: points } = await src.query(
      `SELECT p.name AS ponto, p.type, p.price_per_hour, e.name AS est_name
       FROM points p JOIN establishments e ON e.id = p.est_id`
    );
    if (points.length) {
      console.log(`  ℹ  ${points.length} pontos/quadras encontrados (vinculados como obs nos clientes)`);
    }
  } catch (err) {
    console.error('  ❌ Erro no CRM Esportes:', err.message);
    stats.errors++;
  } finally {
    await src.end();
  }
}

// ── Migração: CRM Spas → CRM Funil ───────────────────────────────────────────
async function migrateSpas(funil) {
  console.log('\n💆 Migrando CRM Spas...');
  const src = pool(DB_SPAS);
  try {
    const company = await upsertCompany(funil, 'CRM Spas', 'crm-spas');
    await ensureAdminMember(funil, company.id, 'rafael.pezzutti@gmail.com');
    console.log(`  ✓ Empresa: ${company.name} [${company.id}]`);

    const { rows: clinicas } = await src.query(
      `SELECT id, nome, email, telefone, endereco,
              horario_funcionamento, ativo
       FROM clinicas ORDER BY id`
    );
    console.log(`  → ${clinicas.length} clínicas/spas encontrados`);

    for (const c of clinicas) {
      const razao    = c.nome || '';
      const telefone = c.telefone || '';
      const email    = c.email || '';
      const stage    = c.ativo === 1 ? 'prod' : 'neg';

      const dup = await clientExists(funil, company.id, razao, email, telefone);
      if (dup) { stats.skipped++; console.log(`  ⏭  Já existe: ${razao}`); continue; }

      await insertClient(funil, company.id, {
        stage, razao, contato: razao,
        telefone, email,
        endereco: c.endereco || null,
        setor: 'Saúde',
        obs: `Importado do CRM Spas (id=${c.id})`,
      });
      console.log(`  ✅ ${razao}${c.ativo !== 1 ? ' (inativo)' : ''}`);
    }
  } catch (err) {
    console.error('  ❌ Erro no CRM Spas:', err.message);
    stats.errors++;
  } finally {
    await src.end();
  }
}

// ── Migração: CRM Saúde → CRM Funil ──────────────────────────────────────────
async function migrateSaude(funil) {
  console.log('\n🏥 Migrando CRM Saúde...');
  const src = pool(DB_SAUDE);
  try {
    const company = await upsertCompany(funil, 'CRM Saúde', 'crm-saude');
    await ensureAdminMember(funil, company.id, 'rafael.pezzutti@gmail.com');
    console.log(`  ✓ Empresa: ${company.name} [${company.id}]`);

    const { rows: clinics } = await src.query(
      `SELECT id, name, responsible_name, responsible_cpf,
              phone, email, street, number, complement, cep
       FROM clinics ORDER BY id`
    );
    console.log(`  → ${clinics.length} clínicas encontradas`);

    for (const c of clinics) {
      const razao    = c.name || '';
      const telefone = c.phone || '';
      const email    = c.email || '';
      const endereco = [c.street, c.number, c.complement, c.cep]
                        .filter(Boolean).join(', ');

      const dup = await clientExists(funil, company.id, razao, email, telefone);
      if (dup) { stats.skipped++; console.log(`  ⏭  Já existe: ${razao}`); continue; }

      await insertClient(funil, company.id, {
        stage: 'prod', razao,
        contato: c.responsible_name || razao,
        telefone, email, endereco,
        setor: 'Saúde',
        cnpj: c.responsible_cpf || null,
        obs: `Importado do CRM Saúde (id=${c.id})`,
      });
      console.log(`  ✅ ${razao}`);
    }
  } catch (err) {
    console.error('  ❌ Erro no CRM Saúde:', err.message);
    stats.errors++;
  } finally {
    await src.end();
  }
}

// ── Cria pipe CRM Unimidia ────────────────────────────────────────────────────
async function createUnimidiaPipe(funil) {
  console.log('\n🎯 Criando pipe CRM Unimidia...');
  const company = await upsertCompany(funil, 'CRM Unimidia', 'crm-unimidia');
  await ensureAdminMember(funil, company.id, 'rafael.pezzutti@gmail.com');
  console.log(`  ✓ Pipe criado: ${company.name} [${company.id}]`);
  stats.companies++;
  return company;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' CRM Funil — Migração dos CRMs Individuais');
  console.log('═══════════════════════════════════════════════');

  if (!DB_FUNIL) {
    console.error('❌ DATABASE_URL não encontrada. Verifique backend/.env');
    process.exit(1);
  }

  const funil = pool(DB_FUNIL);
  try {
    // Testa conexão
    await funil.query('SELECT 1');
    console.log('✓ Conectado ao banco do CRM Funil');

    await createUnimidiaPipe(funil);
    await migrateEsportes(funil);
    await migrateSpas(funil);
    await migrateSaude(funil);

    console.log('\n═══════════════════════════════════════════════');
    console.log(' Migração concluída!');
    console.log(`  Empresas criadas/confirmadas : ${stats.companies + 3}`);
    console.log(`  Clientes importados          : ${stats.imported}`);
    console.log(`  Duplicatas ignoradas         : ${stats.skipped}`);
    console.log(`  Erros                        : ${stats.errors}`);
    console.log('═══════════════════════════════════════════════\n');
  } catch (err) {
    console.error('❌ Erro fatal:', err.message);
    process.exit(1);
  } finally {
    await funil.end();
  }
}

main();
