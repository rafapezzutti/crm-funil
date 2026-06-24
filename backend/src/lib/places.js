/**
 * Google Places search helpers — Unimidia prospecção
 *
 * Estratégia:
 *  - Keywords genéricas por segmento + localidade (município/bairro)
 *  - Progressão geográfica: SP capital → Grande SP → Interior SP → outros estados
 *  - Validação: apenas celular brasileiro (11 dígitos com DDD)
 */
const https = require('https');

const PLACES_KEY = () => process.env.GOOGLE_PLACES_KEY || '';

// ── HTTP helpers ──────────────────────────────────────────────────────────────

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

// ── Keywords por segmento (sem cidade — cidade vem da localidade) ─────────────
const SEGMENT_KEYWORDS = {
  unimidia_bares: [
    'restaurante', 'bar', 'café', 'pizzaria', 'lanchonete',
    'churrascaria', 'hamburgueria', 'cervejaria', 'boteco', 'bistrô',
  ],
  unimidia_esportes: [
    'beach tennis', 'quadra beach tennis', 'arena beach tennis',
    'clube beach tennis', 'quadra tênis', 'academia tênis',
    'clube tênis', 'court tênis', 'escola tênis',
  ],
  unimidia_clinicas: [
    'clínica médica', 'consultório médico', 'clínica odontológica',
    'dentista', 'consultório odontológico', 'clínica de saúde',
    'centro médico', 'clínica dermatológica',
  ],
  // Segmentos P Soluções (usam city param diretamente)
  saude: ['clínica médica', 'consultório médico', 'clínica de saúde', 'centro médico', 'clínica odontológica'],
  pet:   ['pet shop', 'veterinária', 'clínica veterinária', 'banho e tosa', 'petshop'],
};

// ── Tipos válidos por segmento ────────────────────────────────────────────────
const VALID_TYPES = {
  unimidia_bares:    ['restaurant', 'bar', 'cafe', 'food', 'bakery', 'meal_takeaway', 'meal_delivery', 'night_club'],
  unimidia_esportes: ['gym', 'stadium', 'establishment', 'point_of_interest', 'health'],
  unimidia_clinicas: ['health', 'doctor', 'hospital', 'medical_clinic', 'dentist', 'physiotherapist'],
  saude:             ['health', 'doctor', 'hospital', 'medical_clinic', 'dentist', 'physiotherapist', 'pharmacy'],
  pet:               ['pet_store', 'veterinary_care', 'store'],
};

// ── Blacklist (redes grandes — não são alvo da Unimidia) ──────────────────────
const UNIMIDIA_BLACKLIST = [
  "mcdonald's", 'mcdonalds', 'burger king', 'outback', 'subway', "bob's", 'bobs',
  'habib', 'giraffas', 'pizza hut', 'dominos', "domino's", 'starbucks', 'madero',
  'coco bambu', 'grupo zena', 'viena', 'frango assado', 'popeyes', 'kfc',
  'odontocompany', 'sorridents', 'odontoprev', 'unimed', 'hapvida',
  'notredame intermédica', "rede d'or", 'einstein', 'sírio-libanês',
  'fleury', 'dasa', 'hermes pardini',
];

function isBlacklisted(name) {
  const lower = (name || '').toLowerCase();
  return UNIMIDIA_BLACKLIST.some(bl => lower.includes(bl));
}

// ── Validação: apenas celular brasileiro (DDD 2 dígitos + 9 dígitos = 11 total) ─
function isMobilePhone(phone) {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  const semDDI = digits.startsWith('55') ? digits.slice(2) : digits;
  return semDDI.length === 11;
}

// ── Lista ordenada de localidades do Brasil (SP primeiro, depois por proximidade) ─
// Cada entrada é uma string usada como sufixo das queries: "restaurante {localidade}"
const MUNICIPIOS_BRASIL = [
  // SP capital — setores geográficos (múltiplos para diversidade)
  'Pinheiros São Paulo SP',
  'Vila Madalena São Paulo SP',
  'Jardins São Paulo SP',
  'Itaim Bibi São Paulo SP',
  'Moema São Paulo SP',
  'Vila Mariana São Paulo SP',
  'Santana São Paulo SP',
  'Tatuapé São Paulo SP',
  'Lapa São Paulo SP',
  'Santo Amaro São Paulo SP',
  'Centro São Paulo SP',
  'Liberdade São Paulo SP',
  'Perdizes São Paulo SP',
  'Barra Funda São Paulo SP',
  'Campo Belo São Paulo SP',
  'Saúde São Paulo SP',
  'Mooca São Paulo SP',
  'Penha São Paulo SP',
  'Brasilândia São Paulo SP',
  'Casa Verde São Paulo SP',
  'Jabaquara São Paulo SP',
  'Tucuruvi São Paulo SP',
  // Grande SP — imediata
  'Guarulhos SP',
  'Osasco SP',
  'Santo André SP',
  'São Bernardo do Campo SP',
  'São Caetano do Sul SP',
  'Diadema SP',
  'Mauá SP',
  'Mogi das Cruzes SP',
  'Carapicuíba SP',
  'Barueri SP',
  'Cotia SP',
  'Taboão da Serra SP',
  'Embu das Artes SP',
  'Itaquaquecetuba SP',
  'Suzano SP',
  'Ferraz de Vasconcelos SP',
  'Ribeirão Pires SP',
  'Rio Grande da Serra SP',
  'Poá SP',
  'Mairiporã SP',
  'Atibaia SP',
  'Francisco Morato SP',
  'Franco da Rocha SP',
  // Interior SP — anel próximo (<200 km)
  'Campinas SP',
  'Santos SP',
  'São Vicente SP',
  'Praia Grande SP',
  'Sorocaba SP',
  'Jundiaí SP',
  'Piracicaba SP',
  'São José dos Campos SP',
  'Taubaté SP',
  'Guarujá SP',
  'Cubatão SP',
  'Americana SP',
  'Limeira SP',
  'Indaiatuba SP',
  'Sumaré SP',
  'Santa Bárbara d\'Oeste SP',
  'Jacareí SP',
  'Mogi Guaçu SP',
  // Interior SP — anel médio (200–350 km)
  'Ribeirão Preto SP',
  'São Carlos SP',
  'Araraquara SP',
  'São José do Rio Preto SP',
  'Bauru SP',
  'Marília SP',
  'Araçatuba SP',
  'Presidente Prudente SP',
  'Itapetininga SP',
  'Botucatu SP',
  'Jaú SP',
  'Franca SP',
  // Interior SP — demais regiões
  'Votuporanga SP',
  'Catanduva SP',
  'Fernandópolis SP',
  'Assis SP',
  'Ourinhos SP',
  'Itapeva SP',
  'Registro SP',
  'Caraguatatuba SP',
  'Ubatuba SP',
  'São Sebastião SP',
  'Campos do Jordão SP',
  // Sul de Minas (divisa SP)
  'Poços de Caldas MG',
  'Pouso Alegre MG',
  'Varginha MG',
  'Alfenas MG',
  // Rio de Janeiro
  'Rio de Janeiro RJ',
  'Niterói RJ',
  'Duque de Caxias RJ',
  'São Gonçalo RJ',
  'Nova Iguaçu RJ',
  'Belford Roxo RJ',
  'Petrópolis RJ',
  'Volta Redonda RJ',
  'Macaé RJ',
  'Campos dos Goytacazes RJ',
  'Cabo Frio RJ',
  'Angra dos Reis RJ',
  'Resende RJ',
  // Minas Gerais
  'Belo Horizonte MG',
  'Contagem MG',
  'Uberlândia MG',
  'Juiz de Fora MG',
  'Betim MG',
  'Montes Claros MG',
  'Ribeirão das Neves MG',
  'Uberaba MG',
  'Governador Valadares MG',
  'Ipatinga MG',
  'Sete Lagoas MG',
  'Divinópolis MG',
  'Teófilo Otoni MG',
  'Ubá MG',
  // Paraná
  'Curitiba PR',
  'Londrina PR',
  'Maringá PR',
  'Ponta Grossa PR',
  'Cascavel PR',
  'São José dos Pinhais PR',
  'Foz do Iguaçu PR',
  'Colombo PR',
  'Guarapuava PR',
  'Paranaguá PR',
  'Apucarana PR',
  'Toledo PR',
  // Santa Catarina
  'Florianópolis SC',
  'Joinville SC',
  'Blumenau SC',
  'São José SC',
  'Criciúma SC',
  'Chapecó SC',
  'Itajaí SC',
  'Lages SC',
  'Jaraguá do Sul SC',
  'Palhoça SC',
  'Balneário Camboriú SC',
  // Rio Grande do Sul
  'Porto Alegre RS',
  'Caxias do Sul RS',
  'Pelotas RS',
  'Canoas RS',
  'Santa Maria RS',
  'Gravataí RS',
  'Viamão RS',
  'Novo Hamburgo RS',
  'São Leopoldo RS',
  'Rio Grande RS',
  'Alvorada RS',
  'Passo Fundo RS',
  // Espírito Santo
  'Vitória ES',
  'Vila Velha ES',
  'Serra ES',
  'Cariacica ES',
  'Cachoeiro de Itapemirim ES',
  'Linhares ES',
  // Goiás / DF
  'Brasília DF',
  'Goiânia GO',
  'Aparecida de Goiânia GO',
  'Anápolis GO',
  'Rio Verde GO',
  'Luziânia GO',
  'Águas Lindas de Goiás GO',
  // Mato Grosso do Sul
  'Campo Grande MS',
  'Dourados MS',
  'Três Lagoas MS',
  // Mato Grosso
  'Cuiabá MT',
  'Várzea Grande MT',
  'Rondonópolis MT',
  // Bahia
  'Salvador BA',
  'Feira de Santana BA',
  'Vitória da Conquista BA',
  'Camaçari BA',
  'Itabuna BA',
  'Ilhéus BA',
  'Lauro de Freitas BA',
  // Pernambuco
  'Recife PE',
  'Caruaru PE',
  'Olinda PE',
  'Paulista PE',
  'Petrolina PE',
  'Garanhuns PE',
  // Ceará
  'Fortaleza CE',
  'Caucaia CE',
  'Juazeiro do Norte CE',
  'Maracanaú CE',
  'Sobral CE',
  // Paraíba
  'João Pessoa PB',
  'Campina Grande PB',
  // Rio Grande do Norte
  'Natal RN',
  'Mossoró RN',
  // Alagoas
  'Maceió AL',
  // Sergipe
  'Aracaju SE',
  // Piauí
  'Teresina PI',
  // Maranhão
  'São Luís MA',
  'Imperatriz MA',
  // Pará
  'Belém PA',
  'Ananindeua PA',
  'Santarém PA',
  // Amazonas
  'Manaus AM',
  // Rondônia
  'Porto Velho RO',
  'Ji-Paraná RO',
  // Tocantins
  'Palmas TO',
  // Acre
  'Rio Branco AC',
  // Amapá
  'Macapá AP',
  // Roraima
  'Boa Vista RR',
];

// ── Busca prospects de um segmento para uma localidade específica ─────────────
/**
 * @param {string} segment   - chave do segmento (unimidia_bares, etc.)
 * @param {string} locality  - localidade a buscar (ex: "Pinheiros São Paulo SP")
 * @param {number} limit     - máximo de resultados
 * @param {Set}    excludeIds - place_ids a ignorar (já na base)
 */
async function searchSegment(segment, locality, limit = 50, excludeIds = new Set()) {
  if (!PLACES_KEY()) throw new Error('GOOGLE_PLACES_KEY não configurada.');

  const keywords  = SEGMENT_KEYWORDS[segment];
  const validTypes = VALID_TYPES[segment];
  if (!keywords)   throw new Error(`Segmento inválido: ${segment}`);

  const isUnimidia = segment.startsWith('unimidia_');
  const seen       = new Set();
  const results    = [];

  for (const kw of keywords) {
    if (results.length >= limit) break;

    const query = `${kw} ${locality}`;
    console.log(`[Places] "${query}" (${results.length}/${limit})`);

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
        if (excludeIds.has(place.place_id)) continue;
        seen.add(place.place_id);

        let phone = '', website = '', address = place.formatted_address || '';
        let rating = place.rating || 0;
        let maps_url = '';

        try {
          await sleep(150); // evita rate limit no Details API
          const det = await placeDetails(place.place_id);
          if (det.status === 'OK') {
            const r = det.result;
            phone    = r.formatted_phone_number || '';
            website  = r.website || '';
            address  = r.formatted_address || address;
            rating   = r.rating || rating;
            maps_url = r.url || '';

            if (isUnimidia) {
              // Unimidia: exige celular válido para WhatsApp
              if (!isMobilePhone(phone)) continue;
              if (isBlacklisted(r.name)) continue;
            } else {
              // P Soluções: precisa de pelo menos telefone ou site
              if (!phone && !website) continue;
            }

            // Validação de tipo de estabelecimento
            const tipos  = r.types || [];
            const tipoOK = tipos.some(t => validTypes.includes(t));
            const nomeLC = (r.name || '').toLowerCase();
            const kwOK   = keywords.some(k => nomeLC.includes(k.split(' ')[0]));
            if (!tipoOK && !kwOK) continue;

            if (r.business_status === 'CLOSED_PERMANENTLY') continue;
          } else {
            // Detalhes não disponíveis — pula
            continue;
          }
        } catch (e) {
          console.warn('[Details] erro:', e.message);
          continue;
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
          localidade: locality,
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
  searchSegment,
  SEGMENT_KEYWORDS, VALID_TYPES, MUNICIPIOS_BRASIL,
  isBlacklisted, isMobilePhone,
};
