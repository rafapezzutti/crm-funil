const router  = require('express').Router();
const https   = require('https');
const { sql } = require('../config/db');
const auth    = require('../middleware/auth');

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

// Aguarda um tempo (Places API exige delay entre páginas)
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
};

// Tipos válidos por segmento (filtro de verificação)
const VALID_TYPES = {
  saude: ['health', 'doctor', 'hospital', 'medical_clinic', 'dentist', 'physiotherapist', 'pharmacy'],
  pet:   ['pet_store', 'veterinary_care', 'store'],
};

// POST /api/prospecting/search
// Body: { segment: 'saude'|'pet', city: 'São Paulo SP', limit: 50 }
router.post('/search', auth, async (req, res) => {
  if (!PLACES_KEY()) return res.status(500).json({ error: 'GOOGLE_PLACES_KEY não configurada.' });

  const { segment, city = 'São Paulo SP', limit = 50 } = req.body;
  if (!SEGMENT_QUERIES[segment]) return res.status(400).json({ error: 'Segmento inválido. Use: saude | pet' });

  const queries   = SEGMENT_QUERIES[segment];
  const validTypes = VALID_TYPES[segment];
  const seen      = new Set();
  const results   = [];

  try {
    for (const q of queries) {
      if (results.length >= limit) break;
      const query = `${q} ${city}`;
      console.log(`[Prospecting] Buscando: "${query}"`);

      let pagetoken = null;
      let pages     = 0;

      do {
        if (pagetoken) await sleep(2100); // Places API exige 2s entre páginas
        const resp = await placesSearch(query, pagetoken);
        if (resp.status !== 'OK' && resp.status !== 'ZERO_RESULTS') {
          console.warn(`[Places] status ${resp.status} para "${query}"`);
          break;
        }

        for (const place of (resp.results || [])) {
          if (results.length >= limit) break;
          if (seen.has(place.place_id)) continue;
          seen.add(place.place_id);

          // Busca detalhes (telefone, site)
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

              // Verificação: pular se sem telefone e sem site
              if (!phone && !website) continue;

              // Verificação de tipo (flexível: pelo menos 1 tipo compatível OU nome contém keywords)
              const tipos = r.types || [];
              const nomeLC = (r.name || '').toLowerCase();
              const keywordsOK = queries.some(kw => nomeLC.includes(kw.split(' ')[0]));
              const tipoOK = tipos.some(t => validTypes.includes(t));
              if (!tipoOK && !keywordsOK) continue;

              // Ignorar se negócio fechado permanentemente
              if (r.business_status === 'CLOSED_PERMANENTLY') continue;
            }
          } catch (e) {
            console.warn('[Details] erro:', e.message);
          }

          results.push({
            nome:       place.name,
            endereco:   address,
            telefone:   phone,
            whatsapp:   phone.replace(/\D/g, '').replace(/^0/, ''),
            site:       website,
            rating,
            maps_url,
            place_id:   place.place_id,
            segmento:   segment,
            origem:     'google_places',
            abordado:   false,
          });
        }

        pagetoken = resp.next_page_token || null;
        pages++;
      } while (pagetoken && pages < 3 && results.length < limit);
    }

    res.json({
      segment,
      city,
      total: results.length,
      leads: results.slice(0, limit),
    });

  } catch (err) {
    console.error('[Prospecting] erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prospecting/import
// Importa leads da lista de prospecção direto no CRM
// Body: { leads: [...], companyId }
router.post('/import', auth, async (req, res) => {
  const { leads = [] } = req.body;
  const companyId = req.companyId;

  if (!leads.length) return res.status(400).json({ error: 'Nenhum lead enviado.' });

  let imported = 0, skipped = 0;
  const errors = [];

  for (const lead of leads) {
    try {
      // Evita duplicata por telefone
      if (lead.telefone) {
        const [existing] = await sql`
          SELECT id FROM leads
          WHERE company_id = ${companyId}
            AND (phone = ${lead.telefone} OR phone = ${lead.whatsapp || ''})
          LIMIT 1`;
        if (existing) { skipped++; continue; }
      }

      await sql`
        INSERT INTO leads (company_id, name, phone, address, website, origin, stage, score, origem, created_at)
        VALUES (
          ${companyId},
          ${lead.nome},
          ${lead.telefone || lead.whatsapp || null},
          ${lead.endereco || null},
          ${lead.site || null},
          ${lead.segmento === 'saude' ? 'CRM Saúde' : 'CRM Pet'},
          'prospeccao',
          ${Math.round((lead.rating || 0) * 10)},
          'google_places',
          NOW()
        )`;
      imported++;
    } catch (e) {
      errors.push({ nome: lead.nome, erro: e.message });
    }
  }

  res.json({ imported, skipped, errors });
});

module.exports = router;
