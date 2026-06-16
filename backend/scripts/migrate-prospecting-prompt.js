/**
 * migrate-prospecting-prompt.js
 * Atualiza o prompt do robô "Prospecção Diária 03h" para usar Google Places API.
 * Executar uma vez: node scripts/migrate-prospecting-prompt.js
 */
require('dotenv').config();
const { sql } = require('./src/config/db');

const NOVO_PROMPT = `Você é o robô de prospecção ativa da empresa. Execute os seguintes passos:

## Passo 1 — Buscar leads no Google Places

Use o endpoint do CRM para buscar 50 leads para cada segmento:

Para CRM Saúde:
  POST /api/prospecting/search
  Body: { "segment": "saude", "city": "São Paulo SP", "limit": 50 }

Para CRM Pet:
  POST /api/prospecting/search
  Body: { "segment": "pet", "city": "São Paulo SP", "limit": 50 }

Cada lead retornado terá: nome, telefone, whatsapp, endereco, site, rating, maps_url.

## Passo 2 — Salvar arquivo de prospects do dia

Salve o resultado em:
  C:\\Users\\rafae\\OneDrive\\Pezzutti Soluções\\Projetos\\Prospecção Diaria\\prospects_{YYYY-MM-DD}.json

Formato:
{
  "saude": [ ...50 leads de saúde... ],
  "pets":  [ ...50 leads de pet... ]
}

## Passo 3 — Enviar WhatsApp para cada lead

Para cada lead com telefone preenchido, envie via Evolution API:
  URL: https://pezzutti-whatsapp.fly.dev
  Instância: pezzutti
  API Key: 5579ee64ebdd3dbaf6f20a87d3920955527d9f457fe6027f197a8c31efada893

Template para Saúde:
"Olá {nome}! Sou da Pezzutti Soluções. Trabalhamos com CRM especializado para clínicas e consultórios — controle de agenda, leads e follow-up automático. Posso mostrar em 10 minutos como funciona?"

Template para Pet:
"Olá {nome}! Sou da Pezzutti Soluções. Temos um CRM pensado para petshops e veterinárias — gestão de clientes, agendamentos e prospecção automática. Posso apresentar rapidinho?"

## Passo 4 — Registrar no CRM

Importe os leads para o CRM via:
  POST /api/prospecting/import
  Body: { "leads": [...] }

O sistema evita duplicatas por telefone automaticamente.

## Relatório final

Ao finalizar, gere um resumo:
- Total buscados: X saúde + X pet
- Com telefone (enviado WhatsApp): X
- Sem telefone (apenas cadastrado): X
- Erros: X`;

async function run() {
  try {
    const result = await sql`
      UPDATE robots
      SET prompt_template = ${NOVO_PROMPT},
          updated_at = NOW()
      WHERE name = 'Prospecção Diária 03h'
      RETURNING id, name, company_id`;

    if (result.length === 0) {
      console.log('⚠️  Robô "Prospecção Diária 03h" não encontrado.');
    } else {
      console.log(`✅ Prompt atualizado para ${result.length} robô(s):`);
      result.forEach(r => console.log(`   #${r.id} — ${r.name} (${r.company_id})`));
    }
  } catch (e) {
    console.error('❌ Erro:', e.message);
  } finally {
    process.exit(0);
  }
}
run();
