const router  = require('express').Router();
const { sql } = require('../config/db');
const auth    = require('../middleware/auth');
const { placesSearch, placeDetails, sleep, searchSegment, SEGMENT_QUERIES, VALID_TYPES, isBlacklisted } = require('../lib/places');

const PLACES_KEY = () => process.env.GOOGLE_PLACES_KEY || '';

// POST /api/prospecting/search
// Body: { segment: 'saude'|'pet'|'unimidia_bares'|'unimidia_hoteis'|'unimidia_clinicas', city: 'São Paulo SP', limit: 50 }
router.post('/search', auth, async (req, res) => {
  if (!PLACES_KEY()) return res.status(500).json({ error: 'GOOGLE_PLACES_KEY não configurada.' });

  const { segment, city = 'São Paulo SP', limit = 50 } = req.body;
  if (!SEGMENT_QUERIES[segment]) return res.status(400).json({ error: 'Segmento inválido. Use: saude | pet | unimidia_bares | unimidia_hoteis | unimidia_clinicas' });

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

              // Para segmentos Unimidia: exigir celular começando com 9
              if (segment.startsWith('unimidia_')) {
                const digits = phone.replace(/\D/g, '');
                // Celular brasileiro: DDD (2 dígitos) + 9 + 8 dígitos = 11 dígitos
                // O 9o dígito (após o DDD) deve ser 9
                const semDDI = digits.startsWith('55') ? digits.slice(2) : digits;
                const semDDD = semDDI.length >= 11 ? semDDI.slice(2) : semDDI;
                if (!semDDD.startsWith('9')) continue;

                // Descartar grandes franquias/redes
                if (isBlacklisted(r.name)) continue;
              }

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
      const fone = lead.telefone || lead.whatsapp || null;
      if (fone) {
        const [existing] = await sql`
          SELECT id FROM leads
          WHERE company_id = ${companyId}
            AND telefone = ${fone}
          LIMIT 1`;
        if (existing) { skipped++; continue; }
      }

      await sql`
        INSERT INTO leads (company_id, nome, telefone, crm, stage, origem, score, created_at)
        VALUES (
          ${companyId},
          ${lead.nome},
          ${fone},
          ${lead.segmento === 'saude' ? 'saude' : 'pet'},
          'prospeccao',
          'prospeccao_diaria',
          ${lead.score || null},
          NOW()
        )`;
      imported++;
    } catch (e) {
      errors.push({ nome: lead.nome, erro: e.message });
    }
  }

  res.json({ imported, skipped, errors });
});

// ── POST /api/prospecting/daily-sync ─────────────────────────────────────────
// Webhook sem JWT — salva prospects do dia em prospecting_records (NÃO no funil)
// Body: { token, data, leads: [{nome, empresa, telefone, crm, classificacao, resumo, analise, proximo_passo}] }
router.options('/daily-sync', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

router.post('/daily-sync', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const { token, data, leads: prospectos } = req.body;

    const secret = process.env.PROSPECTING_SYNC_TOKEN;
    if (!secret || token !== secret) {
      return res.status(401).json({ error: 'Token inválido.' });
    }

    // Resolve company_id: env vars têm prioridade; se inválidos, busca no banco pela empresa "Pezzutti"
    let defaultCompanyId = process.env.PROSPECTING_COMPANY_ID;
    if (!defaultCompanyId) {
      const [co] = await sql`SELECT id FROM companies WHERE name ILIKE '%pezzutti%' ORDER BY name LIMIT 1`;
      if (!co) return res.status(500).json({ error: 'Empresa Pezzutti não encontrada no banco.' });
      defaultCompanyId = co.id;
    } else {
      // Valida se o company_id existe no banco; se não existir, usa lookup
      const [valid] = await sql`SELECT id FROM companies WHERE id = ${defaultCompanyId}::uuid LIMIT 1`;
      if (!valid) {
        const [co] = await sql`SELECT id FROM companies WHERE name ILIKE '%pezzutti%' ORDER BY name LIMIT 1`;
        if (!co) return res.status(500).json({ error: 'Empresa Pezzutti não encontrada no banco.' });
        defaultCompanyId = co.id;
      }
    }

    const CRM_COMPANY_MAP = {
      'pet':   process.env.PROSPECTING_COMPANY_ID_PETS  || defaultCompanyId,
      'pets':  process.env.PROSPECTING_COMPANY_ID_PETS  || defaultCompanyId,
      'saude': process.env.PROSPECTING_COMPANY_ID_SAUDE || defaultCompanyId,
    };
    // Garante que os IDs do mapa também existem no banco; se não, usa defaultCompanyId
    for (const key of Object.keys(CRM_COMPANY_MAP)) {
      if (CRM_COMPANY_MAP[key] !== defaultCompanyId) {
        const [v] = await sql`SELECT id FROM companies WHERE id = ${CRM_COMPANY_MAP[key]}::uuid LIMIT 1`;
        if (!v) CRM_COMPANY_MAP[key] = defaultCompanyId;
      }
    }

    let criados = 0, atualizados = 0, ignorados = 0;

    for (const p of (prospectos || [])) {
      if (!p.nome && !p.telefone) { ignorados++; continue; }

      const crm        = (p.crm || 'pet').toLowerCase().replace('ú', 'u');
      const companyId  = CRM_COMPANY_MAP[crm] || defaultCompanyId;
      const status     = (p.classificacao || 'sem_resposta').toLowerCase();
      const dataAbord  = data || new Date().toISOString().split('T')[0];
      const phoneDigits = (p.telefone || '').replace(/\D/g, '');

      if (phoneDigits) {
        const [existing] = await sql`
          SELECT id FROM prospecting_records
          WHERE company_id = ${companyId}::uuid
            AND data_abordagem = ${dataAbord}::date
            AND telefone = ${phoneDigits}
          LIMIT 1`;

        if (existing) {
          await sql`
            UPDATE prospecting_records
            SET status        = ${status},
                resposta      = ${p.resumo || null},
                analise       = ${p.analise || p.resumo || null},
                proximo_passo = ${p.proximo_passo || null},
                raw           = ${JSON.stringify(p)},
                updated_at    = NOW()
            WHERE id = ${existing.id}`;
          atualizados++;
          continue;
        }
      }

      await sql`
        INSERT INTO prospecting_records
          (company_id, nome, empresa, telefone, crm, data_abordagem,
           status, resposta, analise, proximo_passo, data_arquivo, origem, raw)
        VALUES (
          ${companyId}::uuid,
          ${p.nome || 'Contato'},
          ${p.empresa || null},
          ${phoneDigits || null},
          ${crm},
          ${dataAbord}::date,
          ${status},
          ${p.resumo || null},
          ${p.analise || p.resumo || null},
          ${p.proximo_passo || null},
          ${dataAbord}::date,
          'prospeccao_diaria',
          ${JSON.stringify(p)}
        )`;
      criados++;
    }

    res.json({ ok: true, criados, atualizados, ignorados, data });
  } catch (err) {
    console.error('[prospecting daily-sync]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/prospecting/records ─────────────────────────────────────────────
// Lista histórico de prospecção da empresa para a data selecionada
// Query: date (YYYY-MM-DD), crm, status, q
router.get('/records', auth, async (req, res) => {
  try {
    const { date, crm, status, q } = req.query;
    const dataFiltro = date || new Date().toISOString().split('T')[0];

    const records = await sql`
      SELECT r.id, r.nome, r.empresa, r.telefone, r.crm, r.data_abordagem,
             r.status, r.resposta, r.analise, r.proximo_passo,
             r.promoted_at, r.promoted_by, r.lead_id, r.created_at, r.updated_at,
             u.name AS vendedor_nome
      FROM   prospecting_records r
      LEFT JOIN users u ON u.id = r.vendedor_id
      WHERE  r.company_id = ${req.companyId}
        AND  r.data_abordagem = ${dataFiltro}::date
        AND  (${crm    || null}::text IS NULL OR r.crm    = ${crm    || null})
        AND  (${status || null}::text IS NULL OR r.status  = ${status || null})
        AND  (${q      || null}::text IS NULL OR r.nome    ILIKE ${'%' + (q || '') + '%'}
                                              OR r.empresa ILIKE ${'%' + (q || '') + '%'})
      ORDER BY
        CASE r.status
          WHEN 'quente'       THEN 1
          WHEN 'morno'        THEN 2
          WHEN 'visualizado'  THEN 3
          WHEN 'sem_resposta' THEN 4
          WHEN 'frio'         THEN 5
          WHEN 'nao_entregue' THEN 6
          ELSE 7
        END,
        r.nome ASC`;

    const [totais] = await sql`
      SELECT
        COUNT(*)                                          AS total,
        COUNT(*) FILTER (WHERE status = 'quente')        AS quentes,
        COUNT(*) FILTER (WHERE status = 'morno')         AS mornos,
        COUNT(*) FILTER (WHERE status = 'frio')          AS frios,
        COUNT(*) FILTER (WHERE status = 'visualizado')   AS visualizados,
        COUNT(*) FILTER (WHERE status = 'sem_resposta')  AS sem_resposta,
        COUNT(*) FILTER (WHERE promoted_at IS NOT NULL)  AS promovidos
      FROM prospecting_records
      WHERE company_id = ${req.companyId}
        AND data_abordagem = ${dataFiltro}::date`;

    res.json({ ok: true, date: dataFiltro, totais, records });
  } catch (err) {
    console.error('[prospecting GET /records]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/prospecting/dates ────────────────────────────────────────────────
// Datas com histórico disponível para o seletor da UI
router.get('/dates', auth, async (req, res) => {
  try {
    const rows = await sql`
      SELECT data_abordagem::text AS date,
        COUNT(*)                                        AS total,
        COUNT(*) FILTER (WHERE status = 'quente')      AS quentes,
        COUNT(*) FILTER (WHERE status = 'morno')       AS mornos
      FROM prospecting_records
      WHERE company_id = ${req.companyId}
      GROUP BY data_abordagem
      ORDER BY data_abordagem DESC
      LIMIT 60`;
    res.json({ ok: true, dates: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/prospecting/records/:id/promote ─────────────────────────────────
// Promove prospect para lead no funil — apenas admin/master
router.post('/records/:id/promote', auth, async (req, res) => {
  if (!['admin', 'master'].includes(req.role)) {
    return res.status(403).json({ error: 'Apenas administradores podem promover prospects para o funil.' });
  }
  try {
    const [record] = await sql`
      SELECT * FROM prospecting_records
      WHERE id = ${req.params.id} AND company_id = ${req.companyId}`;

    if (!record) return res.status(404).json({ error: 'Prospect não encontrado.' });
    if (record.promoted_at) {
      return res.status(409).json({ error: 'Prospect já foi promovido.', lead_id: record.lead_id });
    }

    const [admin] = await sql`
      SELECT user_id FROM company_members
      WHERE company_id = ${req.companyId} AND role = 'admin'
      LIMIT 1`;

    const responsavelId = record.vendedor_id || admin?.user_id || req.userId;

    const [u] = await sql`SELECT name FROM users WHERE id = ${req.userId}::uuid LIMIT 1`;

    const [lead] = await sql`
      INSERT INTO leads
        (company_id, nome, empresa, telefone, crm, stage, origem, score,
         responsavel_id, obs, created_at, updated_at)
      VALUES (
        ${req.companyId},
        ${record.nome},
        ${record.empresa || null},
        ${record.telefone || null},
        ${record.crm || null},
        'prospeccao',
        'prospeccao_ativa',
        ${record.status === 'quente' ? 'quente' : record.status === 'morno' ? 'morno' : null},
        ${responsavelId}::uuid,
        ${record.analise || record.resposta || null},
        NOW(), NOW()
      ) RETURNING id`;

    await sql`
      INSERT INTO lead_activities (lead_id, user_id, user_name, tipo, descricao, dados)
      VALUES (
        ${lead.id}, ${req.userId}::uuid, ${u?.name || 'Admin'},
        'prospeccao',
        ${`Lead promovido do histórico de prospecção — ${record.status} em ${record.data_abordagem}`},
        ${JSON.stringify({ prosp_id: record.id, status: record.status, data_abordagem: record.data_abordagem })}
      )`;

    await sql`
      UPDATE prospecting_records
      SET promoted_at = NOW(),
          promoted_by = ${req.userId}::uuid,
          lead_id     = ${lead.id},
          updated_at  = NOW()
      WHERE id = ${record.id}`;

    res.json({ ok: true, lead_id: lead.id });
  } catch (err) {
    console.error('[prospecting promote]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/prospecting/records/:id ─────────────────────────────────────────
// Atualiza status/analise/proximo_passo manualmente
router.put('/records/:id', auth, async (req, res) => {
  try {
    const { status, analise, proximo_passo, vendedor_id } = req.body;
    await sql`
      UPDATE prospecting_records
      SET status        = COALESCE(${status        || null}, status),
          analise       = COALESCE(${analise       || null}, analise),
          proximo_passo = COALESCE(${proximo_passo || null}, proximo_passo),
          vendedor_id   = CASE WHEN ${vendedor_id !== undefined} THEN ${vendedor_id || null}::uuid
                               ELSE vendedor_id END,
          updated_at    = NOW()
      WHERE id = ${req.params.id} AND company_id = ${req.companyId}`;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/prospecting/sellers ──────────────────────────────────────────────
// Lista vendedores ativos da empresa para o seletor de atribuição
router.get('/sellers', auth, async (req, res) => {
  try {
    const members = await sql`
      SELECT u.id, u.name, u.email
      FROM (
        SELECT user_id FROM seller_profiles WHERE company_id = ${req.companyId} AND ativo = true
        UNION
        SELECT user_id FROM company_members  WHERE company_id = ${req.companyId} AND role IN ('admin','master')
      ) m
      JOIN users u ON u.id = m.user_id
      ORDER BY u.name`;
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/prospecting/assign-bulk ─────────────────────────────────────────
// Atribui vendedor_id a uma lista de records (manual ou aleatório calculado no front)
// Body: { assignments: [{id, vendedor_id}] }
router.post('/assign-bulk', auth, async (req, res) => {
  try {
    const { assignments } = req.body;
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: 'assignments[] obrigatório.' });
    }
    let atualizados = 0;
    for (const a of assignments) {
      if (!a.id) continue;
      await sql`
        UPDATE prospecting_records
        SET vendedor_id = ${a.vendedor_id || null}::uuid,
            updated_at  = NOW()
        WHERE id = ${a.id} AND company_id = ${req.companyId}`;
      atualizados++;
    }
    res.json({ ok: true, atualizados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/prospecting/consent ────────────────────────────────────────────
// Registra aceite do termo de uso ao conectar número WhatsApp
router.post('/consent', auth, async (req, res) => {
  try {
    const { phone, instance_name, terms_version = 'v1.0' } = req.body;
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || null;
    const ua = req.headers['user-agent'] || null;

    await sql`
      INSERT INTO number_consents
        (company_id, user_id, phone, instance_name, terms_version, ip_address, user_agent)
      VALUES (
        ${req.companyId}, ${req.userId}::uuid,
        ${phone || null}, ${instance_name || null},
        ${terms_version}, ${ip}, ${ua}
      )`;

    res.json({ ok: true, accepted_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
