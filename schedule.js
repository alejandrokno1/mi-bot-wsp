// schedule.js
// Módulo mejorado: carga el Excel de horarios y programa recordatorios semanales con saludo dinámico

import XLSX from 'xlsx';
import path from 'path';
import cron from 'node-cron';

// Ruta al Excel (datos.xlsx en la carpeta raíz del proyecto)
const excelPath = path.join(process.cwd(), 'datos.xlsx');

let scheduleMap = {};

/** Normaliza texto: quita acentos, pasa a minúsculas y trim */
function normalize(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

/** Carga y parsea datos.xlsx para poblar scheduleMap */
function loadSchedule() {
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Identifica fila de encabezado y columna "Hora"
  const headerIndex = matrix.findIndex(row => row.some(cell => normalize(cell) === 'hora'));
  if (headerIndex === -1) {
    console.error('❌ [Scheduler] No se encontró encabezado "Hora"');
    return;
  }
  const header = matrix[headerIndex];
  const horaCol = header.findIndex(cell => normalize(cell) === 'hora');

  // Días: celdas no vacías a la derecha de "Hora"
  const days = header.slice(horaCol + 1).map(normalize).filter(d => d);
  const dataRows = matrix.slice(headerIndex + 1);

  scheduleMap = {};
  days.forEach((day, di) => {
    scheduleMap[day] = {};
    dataRows.forEach(row => {
      const slot = row[horaCol]?.toString().trim();
      if (!slot) return;
      const subject = row[horaCol + 1 + di]?.toString().trim() || '';
      scheduleMap[day][slot] = subject;
    });
  });
}

/** Elige saludo según hora local */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'buenos días';
  if (h < 18) return 'buenas tardes';
  return 'buenas noches';
}

/**
 * Programa recordatorios semanales 5 minutos antes de cada clase.
 * @param {import('whatsapp-web.js').Client} client - Cliente WhatsApp
 * @param {string} groupId - ID del grupo (ej. '123@g.us')
 */
function startScheduler(client, groupId) {
  loadSchedule();
  const weekdays = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];

  Object.entries(scheduleMap).forEach(([day, slots]) => {
    const dow = weekdays.indexOf(day);
    if (dow < 0) return;

    Object.entries(slots).forEach(([slot, subject]) => {
      if (!subject) return;

      // Parte robusto por 'a' o 'A'
      const [start] = slot.split(/\s*[aA]\s*/);
      let [h, m] = start.split(':').map(n => parseInt(n, 10));
      if (h === 24) h = 0;
      m -= 5;
      if (m < 0) { m += 60; h = (h + 23) % 24; }

      const cronExpr = `${m} ${h} * * ${dow}`;
      console.log(`⏱️ [Scheduler] Semanal: programando ${slot} (${subject}) cada ${day} a cron '${cronExpr}'`);

      cron.schedule(cronExpr, async () => {
        const greeting = getGreeting();
        const msg = `Muy ${greeting} para todos nuestros futuros Subintendentes, en un momento podrán ingresar a su clase de "${subject}". Importante no faltar.`;
        try {
          await client.sendMessage(groupId, msg);
          console.log(`✅ [Scheduler] Recordatorio enviado (${day} ${slot}): ${subject}`);
        } catch (err) {
          console.error('❌ [Scheduler] Error enviando:', err);
        }
      }, { timezone: 'America/Bogota' });
    });
  });
}

export { startScheduler };
