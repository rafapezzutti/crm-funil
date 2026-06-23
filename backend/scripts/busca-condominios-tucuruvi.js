/**
 * busca-condominios-tucuruvi.js
 *
 * Busca condomínios residenciais no Tucuruvi via Google Places API
 * e exporta CSV para importar manualmente no CRM Funil.
 *
 * Uso:
 *   GOOGLE_PLACES_KEY=sua_chave node scripts/busca-condominios-tucuruvi.js
 *
 * Saída: condominios-tucuruvi.csv (na raiz do projeto)
 *
 * Obs: A Places API não filtra por data de construção. A estratégia para
 * identificar prédios NOVOS (últimos 5 anos) é:
 *   1. Poucos reviews totais (< 30 reviews = provável prédio novo)
 *   2. Nome contém palavras-chave de lançamento: "residencial", "living",
 *      "exclusive", "club", etc.
 *   3. Lista manual de empreendimentos conhecidos (seção KNOWN_BUILDINGS)
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const KEY = process.env.GOOGLE_PLACES_KEY;
if (!KEY) {
  console.error('❌  Defina GOOGLE_PLACES_KEY antes de rodar o script.');
  console.error('    Exemplo: GOOGLE_PLACES_KEY=AIza... node scripts/busca-condominios-tucuruvi.js');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Empreendimentos conhecidos (pesquisa manual) ─────────────────────────────
// Estes são adicionados diretamente, sem precisar da API.
const KNOWN_BUILDINGS = [
  {
    nome: 'Raízes Tucuruvi (Mitre Realty)',
    endereco: 'Avenida Guapira, 85 - Tucuruvi, São Paulo - SP',
    telefone: '',
    observacao: 'Lançamento 2024 — Mitre Realty. 1 e 3 dorms, 26m² a 79m².',
  },
  {
    nome: 'Tátil Tucuruvi',
    endereco: 'Rua Carataca, 36 - Vila Gustavo, São Paulo - SP, 02266-020',
    telefone: '(11) 93139-9621',
    observacao: 'Incorporadora Tátil. 2 dorms, 40m² a 52m².',
  },
  {
    nome: 'Mixer Jump Tucuruvi (Econ)',
    endereco: 'Avenida Guapira, 1451 - Tucuruvi, São Paulo - SP',
    telefone: '',
    observacao: 'Econ Construtora. 2 torres, 1 e 2 dorms, 41m².',
  },
  {
    nome: 'Station Tucuruvi',
    endereco: 'Tucuruvi, São Paulo - SP',
    telefone: '',
    observacao: '1 e 2 dorms, 29m² a 35m². Próximo à estação de metrô.',
  },
  {
    nome: 'Living Exclusive Tucuruvi',
    endereco: 'Tucuruvi, São Paulo - SP',
    telefone: '',
    observacao: 'Living Empreendimentos. 2 e 3 dorms, 60m² a 73m².',
  },
  {
    nome: 'XPRESS Tucuruvi',
    endereco: 'Tucuruvi, São Paulo - SP',
    telefone: '',
    observacao: '1 e 2 dorms. Próximo à estação Tucuruvi.',
  },
  {
    nome: 'Ao Cubo Tucuruvi (MCMV)',
    endereco: 'Avenida Mazzei, 365 - Tucuruvi, São Paulo - SP',
    telefone: '',
    observacao: 'Minha Casa Minha Vida. Perfil C/D — alto potencial.',
  },
  {
    nome: 'NOW Tucuruvi (Econ Construtora)',
    endereco: 'Tucuruvi, São Paulo - SP',
    telefone: '',
    observacao: 'Econ Construtora.',
  },
  {
    nome: 'UNNI Harmoni (Plano & Plano)',
    endereco: 'Tucuruvi, São Paulo - SP',
    telefone: '',
    observacao: 'Alvará 02/2022, execução 05/2023.',
  },
  {
    nome: 'Habita Tucuruvi (COHAB)',
    endereco: 'Avenida Comandante Antônio Sampaio - Tucuruvi, São Paulo - SP',
    telefone: '',
    observacao: '401 famílias. Segmento C/D — alto potencial para escola de futebol.',
  },
  {
    nome: 'Quali Verti Tucuruvi (Technolar)',
    endereco: 'Tucuruvi, São Paulo - SP',
    telefone: '',
    observacao: '3 dorms, 75m², 2 vagas.',
  },
  {
    nome: 'Grand Living Tucuruvi (Cyrela)',
    endereco: 'Tucuruvi, São Paulo - SP',
    telefone: '',
    observacao: 'Cyrela. 2 e 3 dorms, 61m² a 132,90m².',
  },
];

// ── Queries para Places API ──────────────────────────────────────────────────
const QUERIES = [
  'condomínio residencial Tucuruvi São Paulo',
  'residencial Tucuruvi São Paulo',
  'apartamentos Tucuruvi São Paulo',
  'condomínio clube Tucuruvi São Paulo',
  'living Tucuruvi São Paulo',
  'condomínio Vila Gustavo São Paulo',
  'condomínio Parada Inglesa São Paulo',
  'condomínio Jardim Brasil Tucuruvi São Paulo',
];

const LIMIT_PER_QUERY = 20; // Places Text Search retorna até 20 por página

// ── Helpers HTTP ─────────────────────────────────────────────────────────────
function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function placesSearch(query, pagetoken) {
  const params = new URLSearchParams({ query, language: 'pt-BR', key: KEY });
  if (pagetoken) params.set('pagetoken', pagetoken);
  return get(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`);
}

function placeDetails(place_id) {
  const fields = 'name,formatted_phone_number,website,formatted_address,rating,user_ratings_total,types,business_status,url';
  const params = new URLSearchParams({ place_id, fields, language: 'pt-BR', key: KEY });
  return get(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
}

// ── Heurística: é provável prédio novo? ──────────────────────────────────────
function isProvavelmenteNovo(place, details) {
  const totalReviews = details.user_ratings_total || 0;
  const name = (place.name || '').toLowerCase();

  // Poucos reviews = mais novo
  if (totalReviews <= 30) return true;

  // Nome contém palavras de empreendimentos modernos
  const keywords = ['living', 'exclusive', 'now', 'xpress', 'station', 'raízes', 'tátil',
                    'mixer', 'harmoni', 'cubo', 'quali', 'grand', 'residencial club'];
  if (keywords.some(k => name.includes(k))) return true;

  return false;
}

// ── CSV ──────────────────────────────────────────────────────────────────────
function escapeCsv(val) {
  if (val == null) return '';
  const s = String(val).replace(/"/g, '""');
  return /[,"\n]/.test(s) ? `"${s}"` : s;
}

function toCsvRow(obj) {
  return [
    obj.nome, obj.endereco, obj.telefone, obj.whatsapp,
    obj.site, obj.rating, obj.total_reviews,
    obj.maps_url, obj.provavel_novo ? 'SIM' : 'NÃO', obj.observacao,
  ].map(escapeCsv).join(',');
}

const CSV_HEADER = 'Nome,Endereço,Telefone,WhatsApp,Site,Rating,Reviews,Maps URL,Provável Novo (≤5 anos),Observação';

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const seen    = new Set();
  const results = [];

  // 1. Adiciona empreendimentos conhecidos primeiro
  for (const b of KNOWN_BUILDINGS) {
    const key = b.nome.toLowerCase().replace(/\s/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      nome:          b.nome,
      endereco:      b.endereco,
      telefone:      b.telefone || '',
      whatsapp:      (b.telefone || '').replace(/\D/g, ''),
      site:          '',
      rating:        '',
      total_reviews: '',
      maps_url:      '',
      provavel_novo: true,
      observacao:    b.observacao || 'Empreendimento mapeado manualmente',
    });
  }

  console.log(`✅  ${results.length} empreendimentos conhecidos adicionados.`);
  console.log('🔍  Buscando via Google Places API...\n');

  // 2. Busca via Places API
  for (const query of QUERIES) {
    console.log(`  → "${query}"`);
    let pagetoken = null;
    let pages     = 0;

    do {
      if (pagetoken) await sleep(2200);
      const resp = await placesSearch(query, pagetoken);

      if (resp.status !== 'OK' && resp.status !== 'ZERO_RESULTS') {
        console.warn(`    ⚠️  Places API status: ${resp.status}`);
        if (resp.status === 'REQUEST_DENIED') {
          console.error('    ❌  Chave inválida ou Places API não habilitada no projeto Google Cloud.');
          process.exit(1);
        }
        break;
      }

      for (const place of (resp.results || [])) {
        if (seen.has(place.place_id)) continue;
        seen.add(place.place_id);

        await sleep(300);
        let details = {};
        try {
          const det = await placeDetails(place.place_id);
          if (det.status === 'OK') details = det.result;
        } catch (e) {
          console.warn(`    ⚠️  Details erro: ${e.message}`);
        }

        if (details.business_status === 'CLOSED_PERMANENTLY') continue;

        const phone = details.formatted_phone_number || '';

        results.push({
          nome:          place.name,
          endereco:      details.formatted_address || place.formatted_address || '',
          telefone:      phone,
          whatsapp:      phone.replace(/\D/g, '').replace(/^0/, ''),
          site:          details.website || '',
          rating:        details.rating || '',
          total_reviews: details.user_ratings_total || 0,
          maps_url:      details.url || '',
          provavel_novo: isProvavelmenteNovo(place, details),
          observacao:    'Google Places',
        });
      }

      pagetoken = resp.next_page_token || null;
      pages++;
    } while (pagetoken && pages < 3);

    await sleep(500);
  }

  // 3. Ordena: prováveis novos primeiro
  results.sort((a, b) => (b.provavel_novo ? 1 : 0) - (a.provavel_novo ? 1 : 0));

  // 4. Exporta CSV
  const csvPath = path.join(__dirname, '..', 'condominios-tucuruvi.csv');
  const lines   = [CSV_HEADER, ...results.map(toCsvRow)];
  fs.writeFileSync(csvPath, '﻿' + lines.join('\n'), 'utf8'); // BOM para Excel

  console.log(`\n✅  ${results.length} condomínios encontrados.`);
  console.log(`📄  CSV exportado: ${csvPath}`);
  console.log(`🏗️   Prováveis prédios novos (≤5 anos): ${results.filter(r => r.provavel_novo).length}`);
  console.log('\n💡  Próximos passos:');
  console.log('    1. Abra o CSV e revise / complete os telefones dos síndicos');
  console.log('    2. Importe via POST /api/prospecting/import no CRM Funil');
  console.log('    3. Use o segmento "esportes" na tela de Prospecção do CRM');
})();
