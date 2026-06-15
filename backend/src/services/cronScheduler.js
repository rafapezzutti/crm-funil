const cron           = require('node-cron');
const { sql }        = require('../config/db');
const { executeRobot } = require('./robotRunner');

const activeTasks = {}; // robotId -> cron.ScheduledTask

async function reloadSchedules() {
  // Para e remove todos os jobs atuais
  for (const [id, task] of Object.entries(activeTasks)) {
    task.stop();
    delete activeTasks[id];
  }

  try {
    const robots = await sql`
      SELECT r.*, c.name AS company_name
      FROM robots r
      JOIN companies c ON c.id = r.company_id
      WHERE r.ativo = true
        AND r.trigger_type = 'cron'
        AND r.cron_expr IS NOT NULL`;

    let agendados = 0;
    for (const robot of robots) {
      if (!cron.validate(robot.cron_expr)) {
        console.warn(`⚠️  Robô #${robot.id} (${robot.name}) tem cron inválido: ${robot.cron_expr}`);
        continue;
      }

      activeTasks[robot.id] = cron.schedule(
        robot.cron_expr,
        () => executeRobot(robot),
        { timezone: 'America/Sao_Paulo', scheduled: true }
      );
      agendados++;
    }

    console.log(`🕐 Scheduler: ${agendados} robô(s) agendado(s) (${robots.length} total encontrado)`);
  } catch (err) {
    console.error('❌ Erro ao carregar schedules:', err.message);
  }
}

function startCronScheduler() {
  // Carrega imediatamente
  reloadSchedules();

  // Recarrega a cada 5 minutos para pegar novos robôs ou alterações
  cron.schedule('*/5 * * * *', () => {
    console.log('🔄 Recarregando schedules…');
    reloadSchedules();
  }, { timezone: 'America/Sao_Paulo' });

  console.log('✅ CronScheduler iniciado');
}

module.exports = { startCronScheduler, reloadSchedules };
