const Anthropic  = require('@anthropic-ai/sdk');
const { sql }    = require('../config/db');

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

// Monta contexto rico baseado no tipo do robô
async function buildContext(robot, company) {
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  let ctx = `Empresa: ${company.name}\nData/Hora: ${now} (Horário de Brasília)\n\n`;

  try {
    if (robot.tipo === 'prospeccao_whatsapp') {
      const leads = await sql`
        SELECT name, phone, stage, ultimo_whatsapp_at, score
        FROM leads
        WHERE company_id = ${company.id}
          AND stage IN ('prospeccao', 'primeiro_contato')
          AND ativo = true
          AND (ultimo_whatsapp_at IS NULL OR ultimo_whatsapp_at < NOW() - INTERVAL '7 days')
        ORDER BY score DESC NULLS LAST, created_at DESC
        LIMIT 50`;

      ctx += `LEADS PARA PROSPECÇÃO (sem contato há +7 dias ou nunca contatados): ${leads.length}\n`;
      if (leads.length > 0) {
        ctx += leads.map(l =>
          `- ${l.name} | Tel: ${l.phone || 'N/A'} | Stage: ${l.stage} | Último contato: ${l.ultimo_whatsapp_at ? new Date(l.ultimo_whatsapp_at).toLocaleDateString('pt-BR') : 'Nunca'} | Score: ${l.score || 0}`
        ).join('\n');
      }
    }

    else if (robot.tipo === 'analise_conversas') {
      const [stats] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE ultimo_whatsapp_at > NOW() - INTERVAL '24 hours') AS contatados_24h,
          COUNT(*) FILTER (WHERE stage = 'negociacao') AS em_negociacao,
          COUNT(*) FILTER (WHERE stage = 'prospeccao') AS em_prospeccao,
          COUNT(*) FILTER (WHERE stage = 'ganho') AS ganhos_semana,
          COUNT(*) FILTER (WHERE score >= 70) AS leads_quentes
        FROM leads
        WHERE company_id = ${company.id} AND ativo = true`;

      const recentes = await sql`
        SELECT name, phone, stage, score, ultimo_whatsapp_at, origem
        FROM leads
        WHERE company_id = ${company.id}
          AND ativo = true
          AND ultimo_whatsapp_at > NOW() - INTERVAL '24 hours'
        ORDER BY ultimo_whatsapp_at DESC
        LIMIT 30`;

      ctx += `RESUMO DO FUNIL:\n`;
      ctx += `- Contatados nas últimas 24h: ${stats.contatados_24h}\n`;
      ctx += `- Em negociação: ${stats.em_negociacao}\n`;
      ctx += `- Em prospecção: ${stats.em_prospeccao}\n`;
      ctx += `- Leads quentes (score≥70): ${stats.leads_quentes}\n`;
      ctx += `- Ganhos esta semana: ${stats.ganhos_semana}\n\n`;

      if (recentes.length > 0) {
        ctx += `LEADS CONTATADOS HOJE:\n`;
        ctx += recentes.map(l =>
          `- ${l.name} | Stage: ${l.stage} | Score: ${l.score || 0} | Origem: ${l.origem || 'N/A'} | Contato: ${new Date(l.ultimo_whatsapp_at).toLocaleTimeString('pt-BR')}`
        ).join('\n');
      }
    }

    else if (robot.tipo === 'relatorio') {
      const [stats] = await sql`
        SELECT
          COUNT(*) AS total_leads,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS novos_hoje,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')  AS novos_semana,
          COUNT(*) FILTER (WHERE ultimo_whatsapp_at > NOW() - INTERVAL '24 hours') AS contatados_hoje,
          COUNT(*) FILTER (WHERE stage = 'prospeccao')   AS prospeccao,
          COUNT(*) FILTER (WHERE stage = 'negociacao')   AS negociacao,
          COUNT(*) FILTER (WHERE stage = 'ganho')        AS ganhos,
          COUNT(*) FILTER (WHERE stage = 'perdido')      AS perdidos,
          ROUND(AVG(score)) AS score_medio
        FROM leads
        WHERE company_id = ${company.id} AND ativo = true`;

      ctx += `ESTATÍSTICAS:\n`;
      ctx += `- Total de leads ativos: ${stats.total_leads}\n`;
      ctx += `- Novos hoje: ${stats.novos_hoje} | Esta semana: ${stats.novos_semana}\n`;
      ctx += `- Contatados hoje: ${stats.contatados_hoje}\n`;
      ctx += `- Funil: Prospecção(${stats.prospeccao}) → Negociação(${stats.negociacao}) → Ganhos(${stats.ganhos}) | Perdidos(${stats.perdidos})\n`;
      ctx += `- Score médio: ${stats.score_medio || 0}\n`;
    }

    else {
      // Tipo genérico — resumo básico
      const [count] = await sql`SELECT COUNT(*) AS total FROM leads WHERE company_id = ${company.id} AND ativo = true`;
      ctx += `Total de leads ativos: ${count.total}\n`;
    }
  } catch (e) {
    ctx += `[Erro ao carregar contexto: ${e.message}]\n`;
  }

  return ctx;
}

async function executeRobot(robot) {
  const start = Date.now();
  console.log(`🤖 [${new Date().toISOString()}] Executando robô #${robot.id} — ${robot.name} (empresa ${robot.company_id})`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  ANTHROPIC_API_KEY não configurada — robô ignorado');
    return;
  }

  try {
    const [company] = await sql`SELECT id, name, plan FROM companies WHERE id = ${robot.company_id}`;
    if (!company) throw new Error('Empresa não encontrada');

    const context = await buildContext(robot, company);

    const systemPrompt = `Você é um assistente especializado em CRM e gestão comercial para a empresa ${company.name}.
Analise os dados fornecidos e execute a tarefa conforme instruído.
Responda sempre em português do Brasil, de forma objetiva e acionável.
Quando sugerir ações, seja específico: nomes, números, próximos passos concretos.`;

    const userMessage = `${context}\n\nINSTRUÇÕES:\n${robot.prompt_template || 'Execute a análise e gere um relatório resumido.'}`;

    const model = process.env.ROBOT_MODEL || 'claude-haiku-4-5-20251001';

    const response = await client.messages.create({
      model,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const output = response.content[0]?.text || '(sem resposta)';
    const duration = Date.now() - start;

    await sql`
      INSERT INTO robot_logs (robot_id, company_id, status, output, duration_ms)
      VALUES (${robot.id}, ${robot.company_id}, 'ok', ${output}, ${duration})`;

    await sql`UPDATE robots SET updated_at = NOW() WHERE id = ${robot.id}`;

    console.log(`✅ Robô #${robot.id} concluído em ${duration}ms`);
    return output;

  } catch (err) {
    const duration = Date.now() - start;
    console.error(`❌ Robô #${robot.id} erro:`, err.message);
    await sql`
      INSERT INTO robot_logs (robot_id, company_id, status, output, duration_ms)
      VALUES (${robot.id}, ${robot.company_id}, 'erro', ${err.message}, ${duration})`
      .catch(() => {});
  }
}

module.exports = { executeRobot };
