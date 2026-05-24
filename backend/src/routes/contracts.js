/**
 * CRM Funil — Contracts Route
 * ============================
 * POST /api/contracts/generate  → preenche template .docx e retorna para download
 */

const router  = require('express').Router();
const path    = require('path');
const fs      = require('fs');
const AdmZip  = require('adm-zip');
const auth    = require('../middleware/auth');
const { sql: funil } = require('../config/db');

const TEMPLATES_DIR = path.join(__dirname, '../../templates');

// ── Template selection ────────────────────────────────────────────────────────
// 'tipo' vem do frontend: 'spa' | 'saude'
// Se não informado, tenta derivar pelo slug da empresa de origem do cliente
function selectTemplate(tipo, companySlug) {
  if (tipo === 'spa')   return 'Contrato_SaaS_Spa_CRM_Pezzutti.docx';
  if (tipo === 'saude') return 'Contrato_SaaS_Saude_CRM_Pezzutti.docx';
  // fallback por slug (caso antigo)
  if (companySlug === 'crm-spas')  return 'Contrato_SaaS_Spa_CRM_Pezzutti.docx';
  if (companySlug === 'crm-saude') return 'Contrato_SaaS_Saude_CRM_Pezzutti.docx';
  return 'Contrato_SaaS_Spa_CRM_Pezzutti.docx';
}

// ── Número por extenso (pt-BR) ────────────────────────────────────────────────
function valorPorExtenso(valor) {
  const numero = Math.round(valor * 100);
  const reais    = Math.floor(numero / 100);
  const centavos = numero % 100;

  const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
    'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dezenas  = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
    'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  function converte(n) {
    if (n === 0)   return '';
    if (n === 100) return 'cem';
    if (n < 20)    return unidades[n];
    if (n < 100) {
      const uni = unidades[n % 10];
      return uni ? `${dezenas[Math.floor(n / 10)]} e ${uni}` : dezenas[Math.floor(n / 10)];
    }
    if (n < 1000) {
      const rest = n % 100;
      return rest ? `${centenas[Math.floor(n / 100)]} e ${converte(rest)}` : centenas[Math.floor(n / 100)];
    }
    if (n < 1_000_000) {
      const mil  = Math.floor(n / 1000);
      const rest = n % 1000;
      const milStr = mil === 1 ? 'mil' : `${converte(mil)} mil`;
      return rest ? `${milStr} e ${converte(rest)}` : milStr;
    }
    return String(n);
  }

  const pr = converte(reais);
  const pc = converte(centavos);
  const lr = reais     === 1 ? 'real'     : 'reais';
  const lc = centavos  === 1 ? 'centavo'  : 'centavos';

  if (!reais && !centavos) return 'zero reais';
  if (!reais)    return `${pc} ${lc}`;
  if (!centavos) return `${pr} ${lr}`;
  return `${pr} ${lr} e ${pc} ${lc}`;
}

// ── Formata data por extenso ──────────────────────────────────────────────────
function formatarData(dateStr) {
  const meses = ['janeiro','fevereiro','março','abril','maio','junho',
                 'julho','agosto','setembro','outubro','novembro','dezembro'];
  const d = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

// ── Escapa caracteres especiais XML ───────────────────────────────────────────
function esc(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Formata valor monetário BR ────────────────────────────────────────────────
function formatBRL(num) {
  return Number(num || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Gera contrato ─────────────────────────────────────────────────────────────
router.post('/generate', auth, async (req, res) => {
  try {
    const {
      clientId,
      tipo,             // 'spa' | 'saude' — vem do frontend
      representante, nacionalidade, estadoCivil, profissao,
      cpfRep, rgRep, cargo,
      dataContrato,
      valorMensal,      // valor editável enviado pelo usuário
      // Saúde
      modalidade,       // 'clinica' | 'autonomo'
      quantidade,
      precoUnitario,    // preço por unidade (editável)
      // Spa
      qtdSpa,
      precoSpa,
    } = req.body;

    if (!clientId) return res.status(400).json({ error: 'clientId é obrigatório.' });

    // ── Busca cliente + empresa ───────────────────────────────────────────────
    const rows = await funil`
      SELECT c.*, co.slug AS company_slug
      FROM   clients c
      JOIN   companies co ON co.id = c.company_id
      WHERE  c.id = ${clientId} AND c.company_id = ${req.companyId}
    `;
    if (!rows.length) return res.status(404).json({ error: 'Cliente não encontrado.' });
    const client = rows[0];

    // ── Seleciona template ────────────────────────────────────────────────────
    const templateName = selectTemplate(tipo, client.company_slug);
    const templatePath = path.join(TEMPLATES_DIR, templateName);
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ error: `Template não encontrado: ${templateName}` });
    }

    // ── Carrega o .docx como ZIP ──────────────────────────────────────────────
    const zip      = new AdmZip(templatePath);
    const xmlEntry = zip.getEntry('word/document.xml');
    let   xml      = xmlEntry.getData().toString('utf8');

    // ── Valores — usa o valor enviado pelo frontend (editável), fallback para o CRM
    const custoNum     = parseFloat(valorMensal) || parseFloat(client.custo) || 0;
    const custoFmt     = formatBRL(custoNum);
    const custoExtenso = valorPorExtenso(custoNum);
    const dataFmt      = /^\d{4}-\d{2}-\d{2}$/.test(dataContrato || '')
                           ? formatarData(dataContrato)
                           : (dataContrato || formatarData(null));

    // ── Substituições principais ──────────────────────────────────────────────
    const subs = {
      '[RAZÃO SOCIAL DO CONTRATANTE]':     esc(client.razao),
      '[00.000.000/0000-00]':              esc(client.cnpj),
      '[ENDEREÇO COMPLETO, CIDADE/UF, CEP]': esc(client.endereco),
      '[NOME DO REPRESENTANTE LEGAL]':     esc(representante),
      '[Nome do Representante Legal]':     esc(representante),
      '[nacionalidade]':                   esc(nacionalidade),
      '[estado civil]':                    esc(estadoCivil),
      '[profissão]':                       esc(profissao),
      '[000.000.000-00]':                  esc(cpfRep),
      '[00.000.000-0 SSP/UF]':             esc(rgRep),
      '[Cargo]':                           esc(cargo),
      '[VALOR MENSAL]':                    esc(custoFmt),
      '[VALOR POR EXTENSO]':               esc(custoExtenso),
      'São Paulo, ____ de _____________________ de _______.':
        `São Paulo, ${esc(dataFmt)}.`,
    };

    for (const [key, val] of Object.entries(subs)) {
      xml = xml.split(key).join(val);
    }

    // ── Anexo I — Saúde ───────────────────────────────────────────────────────
    if (templateName.includes('Saude')) {
      const qtd       = parseInt(quantidade) || 1;
      const isCli     = modalidade !== 'autonomo';
      // Usa preço enviado pelo frontend; defaults dos contratos como fallback
      const precoUnit = parseFloat(precoUnitario) || (isCli ? 59.90 : 45.90);
      const precoCli  = isCli ? precoUnit : 59.90;
      const precoAuto = isCli ? 45.90 : precoUnit;
      const totalCli  = formatBRL(qtd * precoCli);
      const totalAuto = formatBRL(qtd * precoAuto);
      const totalVal  = qtd * precoUnit;
      const totalFmt  = formatBRL(totalVal);
      const totalExt  = valorPorExtenso(totalVal);

      const marcaClinica = isCli ? '(✓)' : '(   )';
      const marcaAuto    = isCli ? '(   )' : '(✓)';
      const qtdClinica   = isCli ? String(qtd)  : '—';
      const qtdAuto      = isCli ? '—'           : String(qtd);
      const valClinica   = isCli ? totalCli      : '______________';
      const valAuto      = isCli ? '______________' : totalAuto;

      xml = xml.split(
        '(   )  Clínica / Consultório — quantidade: _______ × R$ 59,90 = R$ ______________'
      ).join(
        `${marcaClinica}  Clínica / Consultório — quantidade: ${qtdClinica} × R$ 59,90 = R$ ${valClinica}`
      );
      xml = xml.split(
        '(   )  Profissional Autônomo — quantidade: _______ × R$ 45,90 = R$ ______________'
      ).join(
        `${marcaAuto}  Profissional Autônomo — quantidade: ${qtdAuto} × R$ 45,90 = R$ ${valAuto}`
      );
      xml = xml.split(
        'Valor mensal total contratado: R$ ______________ ( ____________________________________________ )'
      ).join(
        `Valor mensal total contratado: R$ ${totalFmt} ( ${esc(totalExt)} )`
      );
    }

    // ── Anexo I — Spa ─────────────────────────────────────────────────────────
    if (templateName.includes('Spa')) {
      const qtd      = parseInt(qtdSpa) || parseInt(quantidade) || 1;
      const preco    = parseFloat(precoSpa) || 79.90;
      const totalVal = qtd * preco;
      const totalFmt = formatBRL(totalVal);
      const totalExt = valorPorExtenso(totalVal);

      xml = xml.split(
        'Spa / Estabelecimento — quantidade de unidades: _______ × R$ 79,90 = R$ ______________'
      ).join(
        `Spa / Estabelecimento — quantidade de unidades: ${qtd} × R$ 79,90 = R$ ${totalFmt}`
      );
      xml = xml.split(
        'Valor mensal total contratado: R$ ______________ ( ____________________________________________ )'
      ).join(
        `Valor mensal total contratado: R$ ${totalFmt} ( ${esc(totalExt)} )`
      );
    }

    // ── Reempacota e retorna ──────────────────────────────────────────────────
    zip.updateFile('word/document.xml', Buffer.from(xml, 'utf8'));
    const output = zip.toBuffer();

    const slug = (client.razao || client.contato || 'Cliente')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 50);
    const filename = `Contrato_${slug}.docx`;

    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(output);

  } catch (err) {
    console.error('[contracts]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
