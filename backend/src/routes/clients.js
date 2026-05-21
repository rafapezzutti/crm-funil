const router  = require('express').Router();
const auth    = require('../middleware/auth');
const { sql } = require('../config/db');
const XLSX    = require('xlsx');

// All routes require authentication
router.use(auth);

// ── GET /api/clients ─────────────────────────────
router.get('/', async (req, res) => {
  const { q, setor, stage } = req.query;
  try {
    let rows = await sql`
      SELECT c.*,
             s.name  AS sdr_name,
             v.name  AS seller_name,
             COALESCE(
               json_agg(a ORDER BY a.created_at) FILTER (WHERE a.id IS NOT NULL),
               '[]'
             ) AS attachments
      FROM clients c
      LEFT JOIN sdrs    s ON s.id = c.lead_resp
      LEFT JOIN sellers v ON v.id = c.seller_id
      LEFT JOIN attachments a ON a.client_id = c.id
      WHERE c.company_id = ${req.companyId}
      GROUP BY c.id, s.name, v.name
      ORDER BY c.created_at DESC`;

    if (stage) rows = rows.filter(r => r.stage === stage);
    if (setor) rows = rows.filter(r => r.setor === setor);
    if (q) {
      const lq = q.toLowerCase();
      rows = rows.filter(r =>
        [r.razao, r.cnpj, r.contato, r.email, r.sdr_name, r.seller_name, r.obs]
          .some(v => v && v.toLowerCase().includes(lq))
      );
    }
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar clientes.' });
  }
});

// ── POST /api/clients ────────────────────────────
router.post('/', async (req, res) => {
  const { stage, cnpj, razao, contato, telefone, email, email_cob,
          endereco, setor, tvs, custo, lead_resp, seller_id, obs, attachments } = req.body;

  // Validation: CNPJ and razao required for piloto/prod
  if ((stage === 'piloto' || stage === 'prod') && (!cnpj || !razao)) {
    return res.status(400).json({ error: 'CNPJ e Razão Social são obrigatórios neste estágio.' });
  }
  try {
    const [client] = await sql`
      INSERT INTO clients
        (company_id, stage, cnpj, razao, contato, telefone, email, email_cob,
         endereco, setor, tvs, custo, lead_resp, seller_id, obs)
      VALUES
        (${req.companyId}, ${stage || 'prosp'}, ${cnpj||null}, ${razao||null},
         ${contato||null}, ${telefone||null}, ${email||null}, ${email_cob||null},
         ${endereco||null}, ${setor||null}, ${tvs||null}, ${custo||null},
         ${lead_resp||null}, ${seller_id||null}, ${obs||null})
      RETURNING *`;

    // Insert attachments
    if (Array.isArray(attachments) && attachments.length) {
      for (const att of attachments) {
        await sql`INSERT INTO attachments (client_id, type, name, data, size)
                  VALUES (${client.id}, ${att.type}, ${att.name}, ${att.data}, ${att.size||0})`;
      }
    }
    res.status(201).json(client);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar cliente.' });
  }
});

// ── PUT /api/clients/:id ─────────────────────────
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { stage, cnpj, razao, contato, telefone, email, email_cob,
          endereco, setor, tvs, custo, lead_resp, seller_id, obs, attachments } = req.body;

  if ((stage === 'piloto' || stage === 'prod') && (!cnpj || !razao)) {
    return res.status(400).json({ error: 'CNPJ e Razão Social são obrigatórios neste estágio.' });
  }
  try {
    const [client] = await sql`
      UPDATE clients SET
        stage = ${stage}, cnpj = ${cnpj||null}, razao = ${razao||null},
        contato = ${contato||null}, telefone = ${telefone||null},
        email = ${email||null}, email_cob = ${email_cob||null},
        endereco = ${endereco||null}, setor = ${setor||null},
        tvs = ${tvs||null}, custo = ${custo||null},
        lead_resp = ${lead_resp||null}, seller_id = ${seller_id||null},
        obs = ${obs||null}
      WHERE id = ${id} AND company_id = ${req.companyId}
      RETURNING *`;

    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    // Replace attachments
    if (Array.isArray(attachments)) {
      await sql`DELETE FROM attachments WHERE client_id = ${id}`;
      for (const att of attachments) {
        await sql`INSERT INTO attachments (client_id, type, name, data, size)
                  VALUES (${id}, ${att.type}, ${att.name}, ${att.data}, ${att.size||0})`;
      }
    }
    res.json(client);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar cliente.' });
  }
});

// ── DELETE /api/clients/batch ────────────────────
router.delete('/batch', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Informe os IDs para exclusão.' });
  }
  try {
    await sql`DELETE FROM clients WHERE id = ANY(${ids}::uuid[]) AND company_id = ${req.companyId}`;
    res.json({ deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir clientes.' });
  }
});

// ── DELETE /api/clients/:id ──────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await sql`DELETE FROM clients WHERE id = ${id} AND company_id = ${req.companyId}`;
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir cliente.' });
  }
});

// ── POST /api/clients/import ─────────────────────
router.post('/import', async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows deve ser um array.' });

  function col(row, keys) {
    for (const k in row) {
      const kn = k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
      if (keys.includes(kn)) return String(row[k] || '').trim();
    }
    return '';
  }

  let added = 0, dups = 0;
  for (const row of rows) {
    const contato  = col(row, ['nome do contato','nome contato','contato','contact','nome']);
    const razao    = col(row, ['nome da empresa','razao social','empresa','company','razao','nome fantasia']);
    const telefone = col(row, ['telefone','numero de telefone','fone','phone','celular','whatsapp','tel']);
    const email    = col(row, ['email','e-mail','mail']);
    if (!contato && !razao) continue;

    // Duplicate check
    const telNum = telefone.replace(/\D/g,'');
    const dup = await sql`
      SELECT id FROM clients WHERE company_id = ${req.companyId} AND (
        (${telNum} <> '' AND regexp_replace(telefone, '[^0-9]', '', 'g') = ${telNum})
        OR (${email} <> '' AND lower(email) = ${email.toLowerCase()})
        OR (${razao} <> '' AND lower(razao) = ${razao.toLowerCase()})
      ) LIMIT 1`;
    if (dup.length) { dups++; continue; }

    await sql`INSERT INTO clients (company_id, stage, razao, contato, telefone, email)
              VALUES (${req.companyId}, 'prosp', ${razao||null}, ${contato||null}, ${telefone||null}, ${email||null})`;
    added++;
  }
  res.json({ added, dups });
});

module.exports = router;
