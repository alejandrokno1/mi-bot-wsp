// schedule.js
// Mejoras: idempotencia, TZ real para saludo, watcher para reprogramar al cambiar el Excel.
// Ahora el Excel se toma desde DATA_DIR/EXCEL_PATH (persistente).

import XLSX from 'xlsx';
import path from 'path';
import cron from 'node-cron';
import fs from 'fs';
import chokidar from 'chokidar';

// ───────────────────────────────────────────────────────────────
// Rutas y parámetros
// ───────────────────────────────────────────────────────────────
const TZ = process.env.TZ || 'America/Bogota';

// Carpeta de datos persistentes (compatible con Railway Volume)
const DATA_DIR   = process.env.DATA_DIR   || path.join(process.cwd(), 'data');
// Ruta del Excel (puedes sobreescribir con EXCEL_PATH)
export const EXCEL_PATH = process.env.EXCEL_PATH || path.join(DATA_DIR, 'datos.xlsx');

// Minutos antes del inicio para avisar
const AHEAD_MIN = Number(process.env.SCHEDULE_AHEAD_MIN || 5);

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

function weekdayIndex(name) {
  return ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'].indexOf(normalize(name));
}

// Hora actual (0-23) en la zona horaria deseada
function hourInTZ(tz = TZ) {
  const parts = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', hour12: false, timeZone: tz })
    .formatToParts(new Date());
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  return Number.isFinite(h) ? h : 0;
}

function minusMinutes(h, m, delta = AHEAD_MIN) {
  m -= delta;
  while (m < 0) { m += 60; h = (h + 23) % 24; }
  return { h, m };
}

// Debounce simple para el watcher
function debounce(fn, ms = 600) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ------------------------------ carga ------------------------------
/** Carga TODO el Excel en scheduleMap */
export function loadSchedule() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.warn('⚠️ [Scheduler] No existe', EXCEL_PATH);
    scheduleMap = {};
    return;
  }
  try {
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
  } catch (e) {
    console.error('❌ [Scheduler] error leyendo Excel:', e);
    scheduleMap = {};
  }
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

  const lines = ['🗓️ *Horario de clases*', `Zona horaria: ${TZ}`, ''];

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
 * @param {(res: {sheetName:string,gid:string,dayKey:string,slot:string,subject:string,ok:boolean,error?:string})=>void} onResult
 */

// Registro y limpieza de cron jobs activos
const _jobs = new Set();
let _watcher = null;

function _clearJobs() {
  for (const j of _jobs) {
    try { j.stop(); } catch {}
  }
  _jobs.clear();
}

// Debounced reprogram para el watcher
const _reprogramDebounced = debounce((_client, _map, _cb) => {
  console.log('🔁 [Scheduler] Reprogramando tras cambios en Excel…');
  _internalStart(_client, _map, _cb, { fromWatcher: true });
}, 800);

function _setupWatcher(client, groupMap, onResult) {
  if (process.env.SCHEDULE_WATCH === '0') {
    if (_watcher) { try { _watcher.close(); } catch {} _watcher = null; }
    return;
  }
  if (_watcher) return; // ya corriendo

  try {
    // vigilar la ruta efectiva del Excel
    _watcher = chokidar.watch(EXCEL_PATH, { ignoreInitial: true });
    _watcher
      .on('change', () => {
        console.log('📄 [Scheduler] Excel cambió:', EXCEL_PATH);
        _reprogramDebounced(client, groupMap, onResult);
      })
      .on('error', (e) => console.warn('⚠️ [Scheduler] watcher error:', e));
    console.log('👀 [Scheduler] observando cambios en Excel:', EXCEL_PATH);
  } catch (e) {
    console.warn('⚠️ [Scheduler] no se pudo iniciar watcher:', e);
  }
}

function _internalStart(client, groupMap, onResult, { fromWatcher = false } = {}) {
  loadSchedule();
  _clearJobs(); // idempotencia

  const groups = groupMap || {};
  Object.entries(groups).forEach(([sheetName, ids]) => {
    const dayMap = scheduleMap[sheetName];
    if (!dayMap) {
      console.warn(`⚠️ [Scheduler] no hay hoja "${sheetName}" en Excel`);
      return;
    }
    console.log(`⏱️ [Scheduler] configurando grupo ${sheetName}:`, ids);

    Object.entries(dayMap).forEach(([dayKey, slots]) => {
      const weekdayName = normalize(dayKey).split(' ')[0];
      const idx = weekdayIndex(weekdayName);
      if (idx < 0) return;

      Object.entries(slots).forEach(([slot, subject]) => {
        if (!String(subject).trim()) return;

        // Parse simple: "6:00 a 8:00" → usa la hora de inicio
        const [start] = String(slot).split(/\s*a\s*/i);
        let [h, m] = String(start).split(':').map(n => parseInt(n, 10));
        if (Number.isNaN(h) || Number.isNaN(m)) return;
        if (h === 24) h = 0;
        ({ h, m } = minusMinutes(h, m, AHEAD_MIN));

        const cronExpr = `${m} ${h} * * ${idx}`;

        const job = cron.schedule(cronExpr, async () => {
          try {
            const hour = hourInTZ(TZ); // hora real en TZ
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
          } catch (e) {
            console.error(`[scheduler] fallo en tarea ${sheetName} ${dayKey} ${slot}:`, e);
          }
        }, { timezone: TZ });

        _jobs.add(job);
      });
    });
  });

  console.log(`[scheduler] ${_jobs.size} tareas programadas. TZ=${TZ}` + (fromWatcher ? ' (reload)' : ''));
}

// API pública
export function startScheduler(client, groupMap, onResult) {
  _internalStart(client, groupMap, onResult, { fromWatcher: false });
  _setupWatcher(client, groupMap, onResult);
}

export function stopScheduler() {
  _clearJobs();
  if (_watcher) {
    try { _watcher.close(); } catch {}
    _watcher = null;
  }
  console.log('[scheduler] detenido');
}
