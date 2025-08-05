// schedule.js
import XLSX from 'xlsx';
import path from 'path';
import cron from 'node-cron';


const EXCEL_PATH = path.join(process.cwd(), 'datos.xlsx');

// scheduleMap tendrá: { A: { '11 de agosto': { '6:00 a 8:00':'Lectura', ... }, ... }, B: {...} }
export let scheduleMap = {};

/** Normaliza texto: quita acentos, pasa a minúsculas y trim */
function normalize(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

/** Carga TODO el Excel en scheduleMap */
export function loadSchedule() {
  const wb = XLSX.readFile(EXCEL_PATH);
  scheduleMap = {};

  wb.SheetNames.forEach(sheetName => {
    const sh = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });

    // Buscamos fila donde aparezca "Hora"
    const headerIdx = matrix.findIndex(r => r.some(c => normalize(c) === 'hora'));
    if (headerIdx < 0) return; // omitir si no hay

    const header = matrix[headerIdx];
    const horaCol = header.findIndex(c => normalize(c) === 'hora');

    // Las demás columnas son días (E.g. "Lunes 11 de Agosto" → normalize → "lunes 11 de agosto")
    const days = header.slice(horaCol + 1).map(normalize).filter(d => d);

    const rows = matrix.slice(headerIdx + 1);
    const dayMap = {};

    days.forEach((dayKey, di) => {
      dayMap[dayKey] = {};
      rows.forEach(r => {
        const slot = r[horaCol]?.toString().trim();
        if (!slot) return;
        const subj = r[horaCol + 1 + di]?.toString().trim() || '';
        dayMap[dayKey][slot] = subj;
      });
    });

    scheduleMap[sheetName] = dayMap;
  });

  console.log('📅 [Scheduler] horarios cargados:', Object.keys(scheduleMap));
}

/** Elige saludo según hora local */
function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'buenos días' : h < 18 ? 'buenas tardes' : 'buenas noches';
}

/**
 * Programa recordatorios semanales personalizados por grupo
 * @param {import('whatsapp-web.js').Client} client
 * @param {{ A: string[], B: string[] }} groupMap 
 */
export function startScheduler(client, groupMap) {
  loadSchedule();

  // Para cada hoja (A y B)
  Object.entries(groupMap).forEach(([sheetName, ids]) => {
    const dayMap = scheduleMap[sheetName];
    if (!dayMap) {
      console.warn(`⚠️ [Scheduler] no hay hoja "${sheetName}" en Excel`);
      return;
    }

    console.log(`⏱️ [Scheduler] configurando grupo ${sheetName}:`, ids);

    // Cada día del mapa
    Object.entries(dayMap).forEach(([dayKey, slots]) => {
      // Buscamos índice de weekday [domingo=0,...sábado=6]
      // expandimos "lunes 11 de agosto" → tomamos la primer palabra
      const weekdayName = dayKey.split(' ')[0];
      const idx = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado']
        .indexOf(normalize(weekdayName));
      if (idx < 0) return;

      Object.entries(slots).forEach(([slot, subject]) => {
        if (!subject) return;

        // parseo “6:00 a 8:00”
        const [start] = slot.split(/\s*a\s*/i);
        let [h,m] = start.split(':').map(n => parseInt(n,10));
        if (h===24) h=0;
        m -= 5;
        if (m<0) { m+=60; h=(h+23)%24; }

        const cronExpr = `${m} ${h} * * ${idx}`;
        console.log(`📌 [Scheduler][${sheetName}] ${slot} → "${subject}" → cron '${cronExpr}' (day=${dayKey})`);

        cron.schedule(cronExpr, async () => {
          const greeting = getGreeting();
          const msg = `Muy ${greeting} para todos nuestros futuros Subintendentes,\n` +
                      `en un momento podrán ingresar a su clase de "${subject}".\n` +
                      `¡Importante no faltar!`;
          for (const gid of ids) {
            try {
              await client.sendMessage(gid, msg);
              console.log(`✅ [Scheduler][${sheetName}] enviado a ${gid}: ${dayKey} ${slot}`);
            } catch (e) {
              console.error(`❌ [Scheduler][${sheetName}] error al enviar a ${gid}:`, e);
            }
          }
        }, { timezone: 'America/Bogota' });
      });
    });
  });
}
