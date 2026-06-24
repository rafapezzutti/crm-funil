/**
 * Helpers compartilhados: Google Places API
 * Usado por prospecting.js e robots.js (execução server-side)
 */
const https = require('https');

const PLACES_KEY = () => process.env.GOOGLE_PLACES_KEY || '';

// Busca via Places Text Search
function placesSearch(query, pagetoken) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ query, language: 'pt-BR', key: PLACES_KEY() });
    if (pagetoken) params.set('pagetoken', pagetoken);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`;
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

// Busca detalhes de um place_id
function placeDetails(place_id) {
  return new Promise((resolve, reject) => {
    const fields = 'name,formatted_phone_number,website,formatted_address,rating,types,business_status,url';
    const params = new URLSearchParams({ place_id, fields, language: 'pt-BR', key: PLACES_KEY() });
    const url = `https://maps.googleapis.com/maps/api/place/details/json?${params}`;
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Perfis de busca por segmento
const SEGMENT_QUERIES = {
  saude: [
    'clínica médica',
    'consultório médico',
    'clínica de saúde',
    'centro médico',
    'clínica odontológica',
  ],
  pet: [
    'pet shop',
    'veterinária',
    'clínica veterinária',
    'banho e tosa',
    'petshop',
  ],
  unimidia_bares: [
    'bar São Paulo',
    'restaurante São Paulo',
    'café São Paulo',
    'lanchonete São Paulo',
    'bistrô São Paulo',
    'boteco São Paulo',
  ],
  unimidia_hoteis: [
    'hotel São Paulo',
    'hostel São Paulo',
    'pousada São Paulo',
    'hotel interior São Paulo',
    'resort São Paulo estado',
  ],
  unimidia_clinicas: [
    'clínica médica São Paulo',
    'clínica odontológica São Paulo',
    'consultório dentista São Paulo',
    'centro médico São Paulo',
    'clínica de saúde São Paulo',
  ],
};

const VALID_TYPES = {
  saude:             ['health', 'doctor', 'hospital', 'medical_clinic', 'dentist', 'physiotherapist', 'pharmacy'],
  pet:               ['pet_store', 'veterinary_care', 'store'],
  unimidia_bares:    ['restaurant', 'bar', 'cafe', 'food', 'bakery', 'meal_takeaway', 'meal_delivery'],
  unimidia_hoteis:   ['lodging', 'establishment'],
  unimidia_clinicas: ['health', 'doctor', 'hospital', 'medical_clinic', 'dentist', 'physiotherapist'],
};

const UNIMIDIA_BLACKLIST = [
  "mcdonald's", 'mcdonalds', 'burger king', 'outback', 'subway', "bob's", 'bobs',
  'habib', 'giraffas', 'pizza hut', 'dominos', "domino's", 'starbucks', 'madero',
  'coco bambu', 'grupo zena', 'viena', 'frango assado', 'popeyes', 'kfc',
  'ibis', 'mercure', 'novotel', 'accor', 'marriott', 'hilton', 'hyatt', 'sheraton',
  'radisson', 'intercontinental', 'best western', 'holiday inn', 'wyndham',
  'golden tulip', 'blue tree', 'quality', 'comfort inn', 'sleep inn',
  'odontocompany', 'sorridents', 'odontoprev', 'unimed', 'hapvida',
  'notredame intermédica', 'rede d\'or', 'einstein', 'sírio-libanês',
  'fleury', 'dasa', 'hermes pardini',
];

function isBlacklisted(name) {
  const lower = (name || '').toLowerCase();
  return UNIMIDIA_BLACKLIST.some(bl => lower.includes(bl));
}

/**
 * Busca leads de um segmento via Google Places.
 * Retorna array de objetos { nome, endereco, telefone, whatsapp, site, rating, maps_url, place_id, segmento }
 */
async function searchSegment(segment, city = 'São Paulo SP', limit = 50) {
  if (!PLACES_KEY()) throw new Error('GOOGLE_PLACES_KEY não configurada.');
  if (!SEGMENT_QUERIES[segment]) throw new Error(`Segmento inválido: ${segment}`);

  const queries    = SEGMENT_QUERIES[segment];
  const validTypes = VALID_TYPES[segment];
  const seen       = new Set();
  const results    = [];

  for (const q of queries) {
    if (results.length >= limit) break;
    const query = `${q} ${city}`;
    console.log(`[Places] Buscando: "${query}"`);

    let pagetoken = null;
    let pages = 0;

    do {
      if (pagetoken) await sleep(2100);
      const resp = await placesSearch(query, pagetoken);
      if (resp.status !== 'OK' && resp.status !== 'ZERO_RESULTS') {
        console.warn(`[Places] status ${resp.status} para "${query}"`);
        break;
      }

      for (const place of (resp.results || [])) {
        if (results.length >= limit) break;
        if (seen.has(place.place_id)) continue;
        seen.add(place.place_id);

        let phone = '', website = '', address = place.formatted_address || '';
        let rating = place.rating || 0;
        let maps_url = '';

        try {
          const det = await placeDetails(place.place_id);
          if (det.status === 'OK') {
            const r = det.result;
            phone    = r.formatted_phone_number || '';
            website  = r.website || '';
            address  = r.formatted_address || address;
            rating   = r.rating || rating;
            maps_url = r.url || '';

            if (!phone && !website) continue;

            if (segment.startsWith('unimidia_')) {
              const digits = phone.replace(/\D/g, '');
              const semDDI = digits.startsWith('55') ? digits.slice(2) : digits;
              const semDDD = semDDI.length >= 11 ? semDDI.slice(2) : semDDI;
              if (!semDDD.startsWith('9')) continue;
              if (isBlacklisted(r.name)) continue;
            }

            const tipos   = r.types || [];
            const nomeLC  = (r.name || '').toLowerCase();
            const kwOK    = queries.some(kw => nomeLC.includes(kw.split(' ')[0]));
            const tipoOK  = tipos.some(t => validTypes.includes(t));
            if (!tipoOK && !kwOK) continue;
            if (r.business_status === 'CLOSED_PERMANENTLY') continue;
          }
        } catch (e) {
          console.warn('[Details] erro:', e.message);
        }

        results.push({
          nome:     place.name,
          endereco: address,
          telefone: phone,
          whatsapp: phone.replace(/\D/g, '').replace(/^0/, ''),
          site:     website,
          rating,
          maps_url,
          place_id: place.place_id,
          segmento: segment,
          origem:   'google_places',
        });
      }

      pagetoken = resp.next_page_token || null;
      pages++;
    } while (pagetoken && pages < 3 && results.length < limit);
  }

  return results.slice(0, limit);
}

module.exports = { placesSearch, placeDetails, sleep, searchSegment, SEGMENT_QUERIES, VALID_TYPES, isBlacklisted };
