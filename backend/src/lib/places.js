/**
 * Helpers compartilhados: Google Places API
 * Estratégia: busca por bairros/cidades específicas (não por cidade genérica)
 * para maximizar diversidade e evitar sobreposição de resultados.
 */
const https = require('https');

const PLACES_KEY = () => process.env.GOOGLE_PLACES_KEY || '';

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

// ──────────────────────────────────────────────────────────────────────────────
// SEGMENTOS: queries por bairro/região específica, sem cidade genérica no final
// Cada query busca num micro-pool diferente → sem sobreposição entre queries
// ──────────────────────────────────────────────────────────────────────────────

const SEGMENT_QUERIES = {

  // P Soluções — segmentos originais
  saude: [
    'clínica médica', 'consultório médico', 'clínica de saúde',
    'centro médico', 'clínica odontológica',
  ],
  pet: [
    'pet shop', 'veterinária', 'clínica veterinária', 'banho e tosa', 'petshop',
  ],

  // ── Unimidia: Bares, Restaurantes, Cafés ──────────────────────────────────
  // Busca por bairros específicos de SP para não repetir o mesmo pool
  unimidia_bares: [
    // Zona Oeste / Vila Madalena / Pinheiros
    'restaurante Pinheiros SP',
    'bar Vila Madalena SP',
    'café Perdizes SP',
    'restaurante Lapa SP',
    'bar Barra Funda SP',
    // Centro Expandido
    'restaurante Jardins SP',
    'bar Itaim Bibi SP',
    'café Cerqueira César SP',
    'restaurante Moema SP',
    'bar Vila Mariana SP',
    // Zona Sul
    'restaurante Saúde SP',
    'bar Jabaquara SP',
    'café Santo Amaro SP',
    'restaurante Campo Belo SP',
    // Zona Norte
    'restaurante Santana SP',
    'bar Casa Verde SP',
    'café Tucuruvi SP',
    'restaurante Brasilândia SP',
    // Zona Leste
    'restaurante Tatuapé SP',
    'bar Mooca SP',
    'café Penha SP',
    'restaurante Belém SP',
    // Centro histórico
    'bar Centro São Paulo',
    'restaurante República SP',
    'café Liberdade SP',
    // Grande SP
    'restaurante Guarulhos SP',
    'bar Osasco SP',
    'restaurante Santo André SP',
    'bar São Bernardo do Campo SP',
    'restaurante São Caetano do Sul SP',
  ],

  // ── Unimidia: Hotéis e Hostels ────────────────────────────────────────────
  // SP capital + interior e cidades-polo
  unimidia_hoteis: [
    // SP capital — zonas
    'hotel Jardins São Paulo',
    'hostel Vila Madalena SP',
    'hotel Itaim Bibi SP',
    'hotel Centro São Paulo',
    'hotel Consolação SP',
    'hotel Paulista SP',
    // Grande SP
    'hotel Guarulhos SP',
    'hotel Alphaville Barueri SP',
    'hotel Osasco SP',
    'hotel Santo André SP',
    'hotel São Bernardo do Campo SP',
    // Interior — polo de negócios
    'hotel Campinas SP',
    'hotel Sorocaba SP',
    'hotel São José dos Campos SP',
    'hotel Ribeirão Preto SP',
    'hotel São José do Rio Preto SP',
    'hotel Santos SP',
    'hotel Piracicaba SP',
    'hotel Jundiaí SP',
    'hotel Bauru SP',
    // Hostel / pousada
    'hostel Campinas SP',
    'pousada Campos do Jordão SP',
    'hotel Atibaia SP',
    'hotel Holambra SP',
  ],

  // ── Unimidia: Clínicas Médicas e Odontológicas ───────────────────────────
  unimidia_clinicas: [
    // SP capital — regiões
    'clínica médica Pinheiros SP',
    'clínica odontológica Jardins SP',
    'consultório dentista Moema SP',
    'clínica médica Santana SP',
    'clínica odontológica Tatuapé SP',
    'clínica médica Santo Amaro SP',
    'consultório médico Lapa SP',
    'clínica odontológica Vila Mariana SP',
    'clínica médica Itaim Bibi SP',
    'consultório dentista Perdizes SP',
    // Grande SP
    'clínica médica Guarulhos SP',
    'clínica odontológica Santo André SP',
    'consultório dentista São Bernardo do Campo SP',
    'clínica médica Osasco SP',
    // Interior
    'clínica médica Campinas SP',
    'clínica odontológica Sorocaba SP',
    'clínica médica Ribeirão Preto SP',
    'consultório dentista São José dos Campos SP',
    'clínica odontológica Santos SP',
    'clínica médica Jundiaí SP',
  ],
};

const VALID_TYPES = {
  saude:             ['health', 'doctor', 'hospital', 'medical_clinic', 'dentist', 'physiotherapist', 'pharmacy'],
  pet:               ['pet_store', 'veterinary_care', 'store'],
  unimidia_bares:    ['restaurant', 'bar', 'cafe', 'food', 'bakery', 'meal_takeaway', 'meal_delivery', 'night_club'],
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
  'notredame intermédica', "rede d'or", 'einstein', 'sírio-libanês',
  'fleury', 'dasa', 'hermes pardini',
];

function isBlacklisted(name) {
  const lower = (name || '').toLowerCase();
  return UNIMIDIA_BLACKLIST.some(bl => lower.includes(bl));
}

// Valida telefone para segmentos Unimidia.
// Aceita celular (9 dígitos após DDD) OU fixo (8 dígitos após DDD).
// Antes: apenas celular = 80% de rejeição. Agora: aceita fixo também.
function isValidPhoneForUnimidia(phone) {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  // Remove DDI 55 se presente
  const semDDI = digits.startsWith('55') ? digits.slice(2) : digits;
  // Deve ter 10 (fixo: DDD+8) ou 11 (celular: DDD+9) dígitos
  return semDDI.length === 10 || semDDI.length === 11;
}

/**
 * Busca leads de um segmento via Google Places.
 * Estratégia: uma query por bairro/cidade → resultados distintos sem sobreposição.
 * O parâmetro `city` é ignorado para segmentos Unimidia (cidade já está na query).
 * Para segmentos P Soluções (saude, pet), usa city normalmente.
 */
async function searchSegment(segment, city = 'São Paulo SP', limit = 50) {
  if (!PLACES_KEY()) throw new Error('GOOGLE_PLACES_KEY não configurada.');
  if (!SEGMENT_QUERIES[segment]) throw new Error(`Segmento inválido: ${segment}`);

  const queries    = SEGMENT_QUERIES[segment];
  const validTypes = VALID_TYPES[segment];
  const isUnimidia = segment.startsWith('unimidia_');
  const seen       = new Set();
  const results    = [];

  for (const q of queries) {
    if (results.length >= limit) break;

    // Segmentos Unimidia: cidade já está na query. P Soluções: appenda city.
    const query = isUnimidia ? q : `${q} ${city}`;
    console.log(`[Places] Buscando: "${query}" (${results.length}/${limit} coletados)`);

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

            // Precisa ter telefone ou site
            if (!phone && !website) continue;

            // Validação de telefone para Unimidia (celular OU fixo)
            if (isUnimidia) {
              if (!isValidPhoneForUnimidia(phone)) continue;
              if (isBlacklisted(r.name)) continue;
            }

            // Validação de tipo de estabelecimento
            const tipos  = r.types || [];
            const nomeLC = (r.name || '').toLowerCase();
            const kwOK   = queries.some(kw => nomeLC.includes(kw.split(' ')[0]));
            const tipoOK = tipos.some(t => validTypes.includes(t));
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

module.exports = {
  placesSearch, placeDetails, sleep,
  searchSegment, SEGMENT_QUERIES, VALID_TYPES, isBlacklisted,
};
