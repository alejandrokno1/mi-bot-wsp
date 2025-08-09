// schedule.js (raíz)
import XLSX from 'xlsx';
import path from 'path';
import cron from 'node-cron';
import fs from 'fs';

const EXCEL_PATH = path.join(process.cwd(), 'datos.xlsx');

// Map final: { A: { 'lunes 11 de agosto': { '6:00 a 8:00': 'Tema', ... } }, B: {...} }
export let scheduleMap = {};

// ------------------------------ utils ------------------------------
function normalize(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function capFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function dayOrderKey(k) {
  // k ej: "lunes 11 de agosto" → toma el primer token
  const d = normalize(k).split(' ')[0];
  const order = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  const i = order.indexOf(d);
  return i === -1 ? 99 : i;
}

function makeDayKey(dateObj) {
  const dias  = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const d = dias[dateObj.getDay()];
  const n = dateObj.getDate();
  const m = meses[dateObj.getMonth()];
  return normalize(`${d} ${n} de ${m}`);
}

// ------------------------------ carga ------------------------------
/** Carga TODO el Excel en scheduleMap */
export function loadSchedule() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.warn('⚠️ [Scheduler] No existe', EXCEL_PATH);
    scheduleMap = {};
    return;
  }
  const wb = XLSX.readFile(EXCEL_PATH);
  const map = {};

  wb.SheetNames.forEach(sheetName => {
    const sh = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });

    // fila donde aparezca "Hora"
    const headerIdx = matrix.findIndex(r => r.some(c => normalize(c) === 'hora'));
    if (headerIdx < 0) return;

    const header = matrix[headerIdx];
    const horaCol = header.findIndex(c => normalize(c) === 'hora');

    // columnas de días (p.ej. "Lunes 11 de Agosto")
    const days = header.slice(horaCol + 1).map(normalize).filter(Boolean);

    const rows = matrix.slice(headerIdx + 1);
    const dayMap = {};

    days.forEach((dayKey, di) => {
      dayMap[dayKey] = {};
      rows.forEach(r => {
        const slot = (r[horaCol] ?? '').toString().trim();
        if (!slot) return;
        const subj = (r[horaCol + 1 + di] ?? '').toString().trim();
        dayMap[dayKey][slot] = subj;
      });
    });

    map[sheetName] = dayMap;
  });

  scheduleMap = map;
  console.log('📅 [Scheduler] horarios cargados:', Object.keys(scheduleMap));
}

// ------------------------------ mensaje para el bot ------------------------------
/**
 * Construye el mensaje de horario para responder en chat.
 * - hintText: texto del usuario (para detectar "hoy"/"mañana")
 * - sheetWanted: "A" o "B" (opcional). Si viene, devuelve SOLO ese grupo.
 */
export function buildScheduleMessage(hintText = '', sheetWanted = null) {
  if (!Object.keys(scheduleMap).length) loadSchedule();

  if (!Object.keys(scheduleMap).length) {
    return 'Aún no tengo el horario cargado. Intenta más tarde.';
  }

  const t = normalize(hintText);
  const wantToday    = /\bhoy\b/.test(t);
  const wantTomorrow = /\bmañana|manana\b/.test(t);

  let filterKey = null;
  if (wantToday || wantTomorrow) {
    const d = new Date();
    if (wantTomorrow) d.setDate(d.getDate() + 1);
    filterKey = makeDayKey(d); // ej "lunes 11 de agosto"
  }

  // Filtrar por grupo si lo piden
  if (sheetWanted && !scheduleMap[sheetWanted]) {
    return `No tengo horario para el *Grupo ${sheetWanted}*.`;
  }
  const allSheets = Object.keys(scheduleMap);
  const sheets = sheetWanted ? [sheetWanted] : allSheets;

  const tz = process.env.TZ || 'America/Bogota';
  const lines = ['🗓️ *Horario de clases*', `Zona horaria: ${tz}`, ''];

  let any = false;

  sheets.forEach(sheet => {
    const dayMap = scheduleMap[sheet] || {};
    const keys = Object.keys(dayMap).sort((a,b) => dayOrderKey(a) - dayOrderKey(b));
    const dayKeys = filterKey ? keys.filter(k => k === filterKey) : keys;

    // omitir días sin materias
    const usable = dayKeys.filter(k => {
      const slots = dayMap[k] || {};
      return Object.values(slots).some(v => String(v).trim());
    });

    if (!usable.length) return;

    any = true;

    // Siempre mostrar a qué grupo pertenece lo que se está enviando
    lines.push(`*Grupo ${sheet}*`);

    usable.forEach(k => {
      lines.push(`• *${capFirst(k)}*`);
      const slots = dayMap[k];
      for (const [slot, subj] of Object.entries(slots)) {
        if (String(subj).trim()) {
          lines.push(`   - ${slot}: ${subj}`);
        }
      }
      lines.push('');
    });
  });

  if (!any) {
    return wantToday || wantTomorrow
      ? 'No hay clases registradas para ese día.'
      : 'Aún no tengo clases registradas en el archivo.';
  }

  if (lines.at(-1) === '') lines.pop();
  lines.push('');
  lines.push('_El horario está sujeto a modificaciones. Revisa los avisos oficiales._');

  return lines.join('\n');
}

// ------------------------------ scheduler (node-cron) ------------------------------
/**
 * Programa recordatorios semanales personalizados por grupo
 * @param {import('whatsapp-web.js').Client} client
 * @param {{ A?: string[], B?: string[] }} groupMap 
 */

// ⬇️ Reemplaza SOLO esta función en src/utils/schedule.js
export function startScheduler(client, groupMap, onResult) {
  loadSchedule();

  Object.entries(groupMap).forEach(([sheetName, ids]) => {
    const dayMap = scheduleMap[sheetName];
    if (!dayMap) {
      console.warn(`⚠️ [Scheduler] no hay hoja "${sheetName}" en Excel`);
      return;
    }
    console.log(`⏱️ [Scheduler] configurando grupo ${sheetName}:`, ids);

    Object.entries(dayMap).forEach(([dayKey, slots]) => {
      const weekdayName = normalize(dayKey).split(' ')[0];
      const idx = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'].indexOf(weekdayName);
      if (idx < 0) return;

      Object.entries(slots).forEach(([slot, subject]) => {
        if (!subject) return;

        // parseo “6:00 a 8:00” y programo 5 min antes
        const [start] = slot.split(/\s*a\s*/i);
        let [h, m] = start.split(':').map(n => parseInt(n, 10));
        if (Number.isNaN(h) || Number.isNaN(m)) return;
        if (h === 24) h = 0;
        m -= 5;
        if (m < 0) { m += 60; h = (h + 23) % 24; }

        const cronExpr = `${m} ${h} * * ${idx}`;
        cron.schedule(cronExpr, async () => {
          const hour = new Date().getHours();
          const greeting = hour < 12 ? 'buenos días' : hour < 18 ? 'buenas tardes' : 'buenas noches';
          const msg = `Muy ${greeting} para todos nuestros futuros Subintendentes,\n`
                    + `en un momento podrán ingresar a su clase de "${subject}".\n`
                    + `¡Importante no faltar!`;

          for (const gid of ids) {
            try {
              await client.sendMessage(gid, msg);
              onResult?.({ sheetName, gid, dayKey, slot, subject, ok: true, error: null });
            } catch (e) {
              console.error(`❌ [Scheduler][${sheetName}] error al enviar a ${gid}:`, e);
              onResult?.({ sheetName, gid, dayKey, slot, subject, ok: false, error: String(e) });
            }
          }
        }, { timezone: process.env.TZ || 'America/Bogota' });
      });
    });
  });
}
