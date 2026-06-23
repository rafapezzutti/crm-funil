require('dotenv').config();
const { sql } = require('../src/config/db');

const NOVO_PROMPT = `Você é o robô de prospecção ativa da empresa. Execute os seguintes passos:

## Passo 1 — Buscar leads no Google Places

Chame o endpoint do CRM para buscar 50 leads para cada segmento:

CRM Saúde:
  POST /api/prospecting/search
  Body: { "segment": "saude", "city": "São Paulo SP", "limit": 50 }

CRM Pet:
  POST /api/prospecting/search
  Body: { "segment": "pet", "city": "São Paulo SP", "limit": 50 }

Cada lead retornado terá: nome, telefone, endereco, site, rating, maps_url.

## Passo 2 — Salvar arquivo de prospects do dia

Salve o resultado em:
  C:\\Users\\rafae\\OneDrive\\Pezzutti Soluções\\Projetos\\Prospecção Diaria\\prospects_{YYYY-MM-DD}.json

Formato:
{
  "saude": [ ...50 leads de saúde... ],
  "pets":  [ ...50 leads de pet... ]
}

## Passo 3 — Importar no CRM

Importe os leads via:
  POST /api/prospecting/import
  Body: { "leads": [...] }

O sistema evita duplicatas por telefone automaticamente.

## Passo 4 — Enviar e-mail resumo

Envie um e-mail para rafael.pezzutti@psolucoes-ia.com via Resend API
(chave: re_LmwN6m4e_K73XocVwDxHVKrERkc9vaXz6) com o resumo:

- Total encontrados: X saúde + X pet
- Com telefone: X | Sem telefone: X
- Importados no CRM: X | Duplicatas ignoradas: X
- Arquivo salvo: prospects_{data}.json

Assunto: "🔍 Prospecção {data} — X leads gerados (Saúde + Pet)"

## IMPORTANTE
Não envie WhatsApp. Apenas gere a lista, salve o arquivo e envie o e-mail resumo.
O envio de WhatsApp é feito manualmente para evitar restrições da plataforma.`;

async function run() {
  try {
    const result = await sql`
      UPDATE robots
      SET prompt_template = ${NOVO_PROMPT}, updated_at = NOW()
      WHERE name = 'Prospecção Diária 03h'
      RETURNING id, name`;

    console.log(`✅ Prompt atualizado: ${result[0]?.name} (#${result[0]?.id})`);
  } catch (e) {
    console.error('❌', e.message);
  } finally { process.exit(0); }
}
run();
