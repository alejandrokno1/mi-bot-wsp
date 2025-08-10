// @ts-nocheck
// bot.js
import 'dotenv/config';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

// Pagos: detector + mensaje de redirección
import { detectPaymentIntent, paymentRedirectMessage } from './src/utils/payment.js';
// Clasificador general (horario / tóxico / crisis)
import { classify } from './src/utils/classifier.js';
// Horario (responder y scheduler)
import { buildScheduleMessage, startScheduler } from './src/utils/schedule.js';

import {
  BASE_SYSTEM_PROMPT,
  EXAMPLES,
  MATRICULATION_RESPONSE,
  PAYMENT_INFO,

  // Contexto ampliado
  KEYWORDS,
  ASK_WHICH_PROF,
  formatProfNumberResponse,

  QUICK,
  getPlatformStatusMessage,
  applyAdminCommand,
  OUTAGES,
  setOutage
} from './contextoBot.js';

////////////////////////////////////////////////////////////////////////////////
// 0️⃣  Base de datos y tablas
////////////////////////////////////////////////////////////////////////////////
const db = new Database('bot-data.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS paused_chats ( chat_id TEXT PRIMARY KEY );
  CREATE TABLE IF NOT EXISTS responded_chats (
    chat_id TEXT PRIMARY KEY,
    last_response TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tutorial_asked ( chat_id TEXT PRIMARY KEY );
  CREATE TABLE IF NOT EXISTS tutorial_done  ( chat_id TEXT PRIMARY KEY );
  CREATE TABLE IF NOT EXISTS users (
    chat_id    TEXT PRIMARY KEY,
    name       TEXT,
    group_pref TEXT
  );
  CREATE TABLE IF NOT EXISTS scheduler_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    when_ts    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    group_name TEXT,
    group_id   TEXT,
    day_key    TEXT,
    slot       TEXT,
    subject    TEXT,
    ok         INTEGER,
    error      TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (  -- clave-valor simple (string/JSON)
    key   TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS bot_windows (
    dow     INTEGER PRIMARY KEY,  -- 0..6
    start   TEXT NOT NULL DEFAULT '00:00',
    end     TEXT NOT NULL DEFAULT '00:00',
    enabled INTEGER NOT NULL DEFAULT 0
  );
`);
const pausedChats = new Set(
  db.prepare('SELECT chat_id FROM paused_chats').all().map(r => r.chat_id)
);

// --------- Helpers de settings + ventanas ---------
function readAllSettings() {
  const rows = db.prepare('SELECT key,value FROM settings').all();
  const out = {};
  for (const r of rows) {
    const v = r.value;
    if (v === '0' || v === '1') out[r.key] = v;
    else {
      try { out[r.key] = JSON.parse(v); } catch { out[r.key] = v; }
    }
  }
  return out;
}
function writeSetting(key, valueObjOrString) {
  const value = typeof valueObjOrString === 'string'
    ? valueObjOrString
    : JSON.stringify(valueObjOrString);
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, value);
}
function readWindows() {
  return db.prepare('SELECT dow, start, end, enabled FROM bot_windows ORDER BY dow').all();
}

// Cache ligero (se refresca cada 20s)
let cfgCache = { settings: null, windows: [], ts: 0 };
function getConfig(force = false) {
  const now = Date.now();
  if (force || now - cfgCache.ts > 20000 || !cfgCache.settings) {
    cfgCache.settings = readAllSettings();
    cfgCache.windows = readWindows();
    cfgCache.ts = now;
  }
  return cfgCache;
}

// Obtener hora/minuto y día en una TZ
function getNowInTZ(tz = 'America/Bogota') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    weekday: 'short', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date());
  const get = n => parts.find(p => p.type === n)?.value;
  const w = (get('weekday') || 'sun').toLowerCase();
  const map = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };
  const dow = map[w] ?? 0;
  const hour = parseInt(get('hour') || '0', 10);
  const minute = parseInt(get('minute') || '0', 10);
  return { dow, hour, minute };
}

// ¿Está dentro de alguna ventana activa para ese día?
function isWithinWorkingHours(dow, hour, minute, windows) {
  const pad = n => String(n).padStart(2,'0');
  const nowHM = `${pad(hour)}:${pad(minute)}`;
  const dayRows = windows.filter(w => Number(w.dow) === dow && Number(w.enabled) === 1);

  for (const w of dayRows) {
    const start = (w.start || '00:00').slice(0,5);
    const end   = (w.end   || '00:00').slice(0,5);
    if (start <= end) {
      if (start <= nowHM && nowHM < end) return true;
    } else {
      if (nowHM >= start || nowHM < end) return true;
    }
  }
  return false;
}

// ===== Persistir / restaurar estado de plataforma =====
function saveOutagesToDB() {
  writeSetting('outage_q10',  { active: OUTAGES.q10.active,  note: OUTAGES.q10.note  });
  writeSetting('outage_zoom', { active: OUTAGES.zoom.active, note: OUTAGES.zoom.note });
}
function restoreOutagesFromDB() {
  const s = getConfig(true).settings;
  if (s.outage_q10) {
    try { setOutage('q10',  !!s.outage_q10.active,  s.outage_q10.note  || undefined); } catch {}
  }
  if (s.outage_zoom) {
    try { setOutage('zoom', !!s.outage_zoom.active, s.outage_zoom.note || undefined); } catch {}
  }
}

// ===== Broadcast (a todos los grupos de BROADCAST_GROUP_IDS) =====
// ===== Broadcast (a todos los grupos definidos en config/groups.json) =====
function loadBroadcastGroups() {
  try {
    const p = path.join(process.cwd(), 'config', 'groups.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8')); // { A:[...], B:[...], ... }

    // Unimos todas las listas (A, B, etc.)
    const all = Object.values(j || {}).flat().map(s => String(s).trim()).filter(Boolean);

    // Normalizamos: forzamos @g.us y quitamos duplicados
    const unique = Array.from(new Set(all.map(id => id.endsWith('@g.us') ? id : `${id}@g.us`)));

    if (!unique.length) {
      console.warn('Broadcast: config/groups.json no contiene IDs de grupos.');
    }
    return unique;
  } catch (e) {
    console.warn('Broadcast: no pude leer config/groups.json:', e?.message || e);
    return [];
  }
}

async function broadcastToGroups(text, opts = {}) {
  const groups = loadBroadcastGroups();
  if (!groups.length) {
    console.warn('Broadcast: no hay grupos configurados en config/groups.json.');
    return;
  }

  for (const gid of groups) {
    try {
      await sendHumanTo(gid, text, opts);
      await sleep(400 + Math.random() * 600);
    } catch (e) {
      console.warn('Broadcast falló', gid, e?.message || e);
    }
  }
}



////////////////////////////////////////////////////////////////////////////////
// 1️⃣  Cliente WhatsApp & OpenAI
////////////////////////////////////////////////////////////////////////////////
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'bot-ia' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']
  }
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
const history = new Map();
const ADMIN = process.env.ADMIN_WAID; // ej: 57XXXXXXXXXX@c.us

// Admin numbers para comandos (E.164) — opcional si usas ADMIN_WAID
const ADMIN_NUMBERS = (process.env.ADMIN_NUMBERS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Elección A/B temporal (con timeout)
const pendingScheduleChoice = new Map(); // chatId -> { hint, timer }
// Confirmación de pago (SI/NO) cuando es ambiguo
const pendingPaymentConfirm = new Map(); // chatId -> timeoutId
// Espera de nombre de profesor
const awaitingProf = new Map(); // chatId -> true

// --- IPC helper para reportar estado al dashboard ---
function report(type, data = {}) {
  try { if (process.send) process.send({ type, data }); } catch {}
}

// Escuchar órdenes del orquestador (dashboard)
process.on('message', async (m) => {
  if (!m || typeof m !== 'object') return;
  if (m.type === 'logout') {
    try { await client.logout(); } catch (e) { console.warn('logout() falló:', e?.message || e); }
    try { await client.destroy(); } catch {}
    report('status', { connected:false, ready:false, needsQR:true, qr:null });
    try { if (process.send) process.send({ type:'logout_ok' }); } catch {}
  }
});

// Reporte inicial de arranque
report('status', { started: true, connected: false, ready: false, needsQR: false });

////////////////////////////////////////////////////////////////////////////////
// 2️⃣  Eventos de sesión (QR / auth / ready / desconexión)
////////////////////////////////////////////////////////////////////////////////
client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
  console.log('🔑 QR recibido.');
  report('qr', qr);
  report('status', { needsQR: true, connected: false, ready: false });
});

client.on('authenticated', () => {
  console.log('✅ Autenticado.');
  report('status', { connected: true, needsQR: false });
});

client.on('ready', () => {
  console.log('Mi WAID:', client.info?.wid?._serialized);
  console.log('💚 WhatsApp Web listo');
  report('ready');
  report('status', { connected: true, ready: true, needsQR: false, qr: null });

  // Restaurar estado de plataforma desde DB
  restoreOutagesFromDB();

  // Scheduler
  try {
    const groups = JSON.parse(fs.readFileSync('config/groups.json', 'utf8'));
    const stmt = db.prepare(`
      INSERT INTO scheduler_logs(group_name, group_id, day_key, slot, subject, ok, error)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    startScheduler(client, groups, ({ sheetName, gid, dayKey, slot, subject, ok, error }) => {
      stmt.run(sheetName, gid, dayKey, slot, subject, ok ? 1 : 0, error || null);
    });
    console.log('⏱️ Scheduler reactivado con grupos de config/groups.json');
  } catch (e) {
    console.warn('No pude iniciar el scheduler:', e?.message || e);
  }
});

client.on('auth_failure', (m) => {
  console.error('❌ auth_failure:', m);
  report('status', { connected: false, ready: false, needsQR: true });
});

client.on('disconnected', (reason) => {
  console.warn('⚠️ disconnected:', reason);
  report('disconnected', { reason });
  report('status', { connected: false, ready: false });
});

////////////////////////////////////////////////////////////////////////////////
// 3️⃣  Anti-spam: cola + “ritmo humano”
////////////////////////////////////////////////////////////////////////////////
const MAX_CONCURRENCY = 3;
let activeSends = 0;
const sendQueue = [];

function processSendQueue() {
  if (activeSends >= MAX_CONCURRENCY) return;
  const item = sendQueue.shift();
  if (!item) return;
  activeSends++;
  Promise.resolve()
    .then(item.fn)
    .then(item.resolve)
    .catch(item.reject)
    .finally(() => {
      activeSends--;
      processSendQueue();
    });
}

function enqueueSend(fn) {
  return new Promise((resolve, reject) => {
    sendQueue.push({ fn, resolve, reject });
    processSendQueue();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function typingDelayFor(text = '') {
  const base = rand(500, 1200);
  const perChar = Math.min(2000, text.length * 15);
  return base + perChar;
}

async function replyHuman(msg, text) {
  return enqueueSend(async () => {
    try {
      const chat = await msg.getChat();
      await chat.sendStateTyping();
      await sleep(typingDelayFor(text));
      const res = await msg.reply(text);
      try { await chat.clearState(); } catch {}
      return res;
    } catch {
      return msg.reply(text);
    }
  });
}

async function sendHumanTo(chatId, text, opts = {}) {
  return enqueueSend(async () => {
    try {
      const chat = await client.getChatById(chatId);
      await chat.sendStateTyping();
      await sleep(typingDelayFor(text));
      const res = await client.sendMessage(chatId, text, opts);
      try { await chat.clearState(); } catch {}
      return res;
    } catch {
      return client.sendMessage(chatId, text, opts);
    }
  });
}

// Detectar grupo A/B desde el texto
function detectGroupFromText(t) {
  const m = String(t).toLowerCase().match(/\b(grupo|horario|para|del|de)?\s*(grupo\s*)?([ab])\b/);
  return m ? m[3].toUpperCase() : null;
}

// Normalizar WA number tipo "57xxxx@c.us" -> "+57xxxxxxxxxx"
function normalizedFrom(msgFrom) {
  const digits = String(msgFrom).replace(/\D+/g, '');
  if (!digits) return '';
  return digits.startsWith('57') ? `+${digits}` : `+57${digits}`;
}
function isAdminSender(msg) {
  if (ADMIN && msg.from === ADMIN) return true;
  const norm = normalizedFrom(msg.from);
  return ADMIN_NUMBERS.includes(norm);
}

// ===== Detección robusta de consultas de estado =====
function matchesStatusQuery(raw) {
  const serviceRx = /(q10|zoom|plataforma)/i;
  const stateRx   = /(estado|ca[ií]d[ao]|intermitente|no\s*func|funciona|status)/i;
  return serviceRx.test(raw) && stateRx.test(raw);
}

////////////////////////////////////////////////////////////////////////////////
// 4️⃣  Manejador de mensajes
////////////////////////////////////////////////////////////////////////////////
client.on('message', async msg => {
  try {
    if (msg.fromMe) return;

    const chatId = msg.from;
    const raw    = (msg.body || '').trim();
    const text   = raw.toLowerCase();

    // Utilidad: devolver WAID cuando te escriben "id" o "/id"
    if (text === 'id' || text === '/id') {
      await replyHuman(msg, `Tu ID de WhatsApp es: ${msg.from}`);
      return;
    }

    // ===============  A. COMANDOS ADMIN  ===============
    if (isAdminSender(msg) && text.startsWith('/')) {

      // 1) Aviso masivo libre: /aviso <mensaje>
      if (/^\/aviso\b/i.test(text)) {
        const payload = raw.replace(/^\/aviso\s*/i, '').trim();
        if (!payload) {
          await replyHuman(msg, 'Uso: */aviso* <mensaje para enviar a todos los grupos>');
          return;
        }
        const aviso = [
          '📢 *Aviso importante*',
          payload
        ].join('\n');
        await broadcastToGroups(aviso);
        await replyHuman(msg, '✅ Aviso enviado a los grupos configurados.');
        return;
      }

      // 2) Comandos de estado (/status, /estado, /q10, /zoom, /plataforma ...)
      const res = applyAdminCommand(raw, true);
      if (res.matched) {
        // persistimos cuando NO es consulta
        if (!/^\/(status|estado)\b/i.test(text)) {
          saveOutagesToDB();
        }

        await replyHuman(msg, res.reply || '✅ Comando aplicado.');

        // Broadcast cuando hay incidencias o normalización
        if (/^\/plataforma presenta inconvenientes/i.test(text) || /^\/q10 down/i.test(text) || /^\/zoom down/i.test(text)) {
          const banner = getPlatformStatusMessage();
          const aviso = [
            '⚠️ *Aviso importante*',
            'Estamos realizando *actualizaciones* en la plataforma (Q10/Zoom).',
            'El servicio puede estar *intermitente*. Les informaremos cuando se normalicen los procesos.',
            '',
            banner
          ].join('\n');
          await broadcastToGroups(aviso);
        }

        if (/^\/plataforma funcionando correctamente/i.test(text)) {
          const okMsg = '✅ *Actualización*: Plataforma *operativa*. Q10 y Zoom funcionando correctamente.';
          await broadcastToGroups(okMsg);
        }
        return;
      }
      // Si es admin pero el comando no matchea, seguimos flujo normal
    }

    // Pausar / reanudar IA
    if (text === '/humano') {
      pausedChats.add(chatId);
      db.prepare('INSERT OR IGNORE INTO paused_chats(chat_id) VALUES (?)').run(chatId);
      return msg.reply('Entendido, paso el turno a un asesor humano. 👋');
    }
    if (text === '/bot') {
      pausedChats.delete(chatId);
      db.prepare('DELETE FROM paused_chats WHERE chat_id = ?').run(chatId);
      return msg.reply('Listo, continúo yo. 😊');
    }

    // Ignorar grupos y chats pausados
    if (msg.from.endsWith('@g.us') || pausedChats.has(chatId)) return;

    // Opt-out
    if (/^\s*(stop|baja|parar|cancelar|no\s+molestar|no\s+enviar|no\s+(?:mas|más))\s*$/i.test(text)) {
      pausedChats.add(chatId);
      db.prepare('INSERT OR IGNORE INTO paused_chats(chat_id) VALUES (?)').run(chatId);
      await replyHuman(msg, 'Entendido ✅ No te escribiré más por este canal. Si deseas reactivar, responde con */bot*.');
      return;
    }

    // ---- Apagado suave (respetar horarios) ----
    const { settings, windows } = getConfig(); // cache ~20s
    const softEnabled = String(settings.bot_soft_enabled ?? '1') === '1';
    const tz = settings.bot_tz || 'America/Bogota';

    if (softEnabled) {
      const isAdmin = ADMIN && chatId === ADMIN;
      if (!isAdmin) {
        const now = getNowInTZ(tz);
        const within = isWithinWorkingHours(now.dow, now.hour, now.minute, windows);
        if (!within) {
          const reply = settings.bot_soft_off_reply
            || 'Estamos fuera de horario. Te respondemos en nuestro horario de atención.';
          await replyHuman(msg, reply);
          recordResponse(chatId);
          return;
        }
      }
    }

    // Leer userRow
    let userRow = db.prepare('SELECT name, group_pref FROM users WHERE chat_id = ?').get(chatId);

    // ───────── Confirmación pendiente de pago (SI/NO) ─────────
    const pendPay = pendingPaymentConfirm.get(chatId);
    if (pendPay) {
      if (/^\s*(si|sí|s|es|correcto)\s*$/i.test(text)) {
        clearTimeout(pendPay);
        pendingPaymentConfirm.delete(chatId);
        await replyHuman(msg, paymentRedirectMessage());
        recordResponse(chatId);
        return;
      }
      if (/^\s*(no|n|negativo)\s*$/i.test(text)) {
        clearTimeout(pendPay);
        pendingPaymentConfirm.delete(chatId);
      } else {
        await replyHuman(msg, '¿Es el comprobante de pago de la mensualidad? Responde *SI* o *NO*.');
        return;
      }
    }

    // ───────── Detección PRIORITARIA de pago/comprobante ─────────
    const decision = detectPaymentIntent({
      text: raw,
      hasMedia: msg.hasMedia === true,
      type: msg.type
    });
    if (decision === 'auto') {
      await replyHuman(msg, paymentRedirectMessage());
      recordResponse(chatId);
      return;
    }
    if (decision === 'ask') {
      await replyHuman(msg, '¿Es el comprobante de pago de la mensualidad? Responde *SI* o *NO*.');
      const tId = setTimeout(() => pendingPaymentConfirm.delete(chatId), 120000);
      pendingPaymentConfirm.set(chatId, tId);
      return;
    }

    // ───────── Manejo de elección pendiente A/B (horario) ─────────
    const pend = pendingScheduleChoice.get(chatId);
    if (pend) {
      const g = detectGroupFromText(text) || (/^[ab]$/i.test(text.trim()) ? text.trim().toUpperCase() : null);
      if (g === 'A' || g === 'B') {
        clearTimeout(pend.timer);
        pendingScheduleChoice.delete(chatId);
        db.prepare('UPDATE users SET group_pref = ? WHERE chat_id = ?').run(g, chatId);
        userRow = userRow ? { ...userRow, group_pref: g } : { name: null, group_pref: g };
        await replyHuman(msg, buildScheduleMessage(pend.hint, g));
        recordResponse(chatId);
        return;
      } else {
        await replyHuman(msg, '¿De qué grupo necesitas el horario? *A* o *B* (responde solo A o B)');
        return;
      }
    }

    // ===============  B. INTENCIONES RÁPIDAS (antes de IA)  ===============
    // Estado de plataforma (Q10/Zoom)
    if (matchesStatusQuery(raw)) {
      await replyHuman(msg, getPlatformStatusMessage());
      recordResponse(chatId);
      return;
    }

    // Número de profesor
    if (KEYWORDS.numeroProfe.some(rx => rx.test(raw))) {
      awaitingProf.set(chatId, true);
      await replyHuman(msg, ASK_WHICH_PROF);
      recordResponse(chatId);
      return;
    }
    if (awaitingProf.get(chatId)) {
      awaitingProf.delete(chatId);
      await replyHuman(msg, formatProfNumberResponse(text));
      recordResponse(chatId);
      return;
    }

    // Grabaciones / En vivo / Zoom error / Pagos / Matrícula
    if (KEYWORDS.grabadas.some(rx => rx.test(raw))) {
      await replyHuman(msg, QUICK.q10Rec);
      recordResponse(chatId);
      return;
    }
    if (KEYWORDS.vivo.some(rx => rx.test(raw))) {
      await replyHuman(msg, QUICK.q10Live);
      recordResponse(chatId);
      return;
    }
    if (KEYWORDS.zoomError.some(rx => rx.test(raw))) {
      await replyHuman(msg, QUICK.zoomFix);
      recordResponse(chatId);
      return;
    }
    if (KEYWORDS.pagos.some(rx => rx.test(raw))) {
      await replyHuman(msg, PAYMENT_INFO);
      recordResponse(chatId);
      return;
    }
    if (KEYWORDS.matricula.some(rx => rx.test(raw))) {
      await replyHuman(msg, MATRICULATION_RESPONSE);
      recordResponse(chatId);
      return;
    }

    // ───── Clasificación (horario / groserías / crisis) ─────
    const cat = classify(raw);

    // Horario
    if (cat === 'SCHEDULE') {
      const g = detectGroupFromText(text);
      if (g === 'A' || g === 'B') {
        await replyHuman(msg, buildScheduleMessage(msg.body, g));
        recordResponse(chatId);
        return;
      }
      if (userRow?.group_pref === 'A' || userRow?.group_pref === 'B') {
        await replyHuman(msg, buildScheduleMessage(msg.body, userRow.group_pref));
        recordResponse(chatId);
        return;
      }
      const timer = setTimeout(() => {
        pendingScheduleChoice.delete(chatId);
      }, 150000);
      pendingScheduleChoice.set(chatId, { hint: msg.body, timer });
      await replyHuman(msg, '¿Quieres el *horario del Grupo A* o del *Grupo B*? (responde A o B)');
      recordResponse(chatId);
      return;
    }

    // Escalado por groserías/crisis
    if (cat === 'TOXIC' || cat === 'DISTRESS') {
      const userMsg = (cat === 'DISTRESS')
        ? 'Te vamos a comunicar con un asesor humano. Si es una emergencia, por favor contacta a servicios de emergencia locales.'
        : 'Te vamos a comunicar con un asesor humano para continuar la conversación.';
      await replyHuman(msg, '🤝 ' + userMsg);
      if (ADMIN) {
        await sendHumanTo(
          ADMIN,
          `⚠️ *Escalado ${cat}*\nDe: ${msg.from}\nMensaje: "${raw}"`
        );
      }
      recordResponse(chatId);
      return;
    }

    // Stickers
    if (msg.type === 'sticker') {
      await replyHuman(msg, '¡Qué lindo sticker! 😊');
      return;
    }

    // Onboarding de nombre
    if (!userRow) {
      if (/^(hola|buenos dias|buenas tardes|buenas noches)[!?¡\s]*$/i.test(text)) {
        await replyHuman(msg, '¡Hola! Un gusto conocerte, ¿cómo te llamas? 😊');
        db.prepare('INSERT INTO users(chat_id) VALUES (?)').run(chatId);
        userRow = { name: null, group_pref: null };
        return;
      }
    } else if (userRow.name == null) {
      const name = raw.split('\n')[0].trim();
      db.prepare('UPDATE users SET name = ? WHERE chat_id = ?').run(name, chatId);
      userRow = { ...userRow, name };
      await replyHuman(msg, `¡Encantado de conocerte, ${name}! ¿En qué te puedo ayudar? 😊`);
      recordResponse(chatId);
      return;
    }

    // Tutorial / info del curso
    const isTrainingQuery = /(capacita|inscrip|cupos|matricul|precio|valor|inicio|temario|clases|horario)/i.test(text);
    const asked = !!db.prepare('SELECT 1 FROM tutorial_asked WHERE chat_id = ?').get(chatId);
    const done  = !!db.prepare('SELECT 1 FROM tutorial_done  WHERE chat_id = ?').get(chatId);

    if (isTrainingQuery && !asked) {
      await replyHuman(msg, 'Antes de darte esa información, ¿conoces cómo funciona la capacitación? 🤔');
      db.prepare('INSERT INTO tutorial_asked(chat_id) VALUES (?)').run(chatId);
      return;
    }
    if (asked && !done) {
      if (/^s[ií]/i.test(text)) {
        db.prepare('INSERT INTO tutorial_done(chat_id) VALUES (?)').run(chatId);
      } else {
        await replyHuman(msg,
          'Este video resume la capacitación. 🎥\n' +
          'https://www.youtube.com/watch?v=xujKKee_meI&ab_channel=NASLYSOFIABELTRANSANCHEZ\n' +
          'Míralo y me dices si te quedan dudas.'
        );
        db.prepare('INSERT INTO tutorial_done(chat_id) VALUES (?)').run(chatId);
        return;
      }
    }

    // Saludos / respuestas cortas
    const tokens = raw.split(/\s+/);
    if (tokens.length === 1) {
      if (/^(hola|buenos dias|buenas tardes|buenas noches)$/i.test(text)) {
        const saludo = raw.charAt(0).toUpperCase() + raw.slice(1);
        await replyHuman(msg, `${saludo}! ¿En qué te puedo ayudar? 😊`);
        recordResponse(chatId);
        return;
      }
      if (/^(gracias|ok|vale|listo)$/i.test(text)) {
        await replyHuman(msg, '¡Genial! ¿Hay algo más en lo que pueda ayudarte?');
        recordResponse(chatId);
        return;
      }
    }

    // Comprobante / matrícula
    if (/comprobante/i.test(text) && /matricul/i.test(text)) {
      await replyHuman(msg, MATRICULATION_RESPONSE);
      recordResponse(chatId);
      return;
    }

    // Medios de pago (info de cuentas)
    if (/(cuentas?|medios de pago|transferencia)/i.test(text)) {
      await replyHuman(msg, PAYMENT_INFO);
      recordResponse(chatId);
      return;
    }

    // Audio -> Whisper
    if (msg.hasMedia) {
      const media = await msg.downloadMedia();
      if (media?.mimetype?.startsWith('audio/')) {
        try {
          const tmp = path.join(process.cwd(), `tmp_${Date.now()}.ogg`);
          fs.writeFileSync(tmp, Buffer.from(media.data, 'base64'));
          const tr = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tmp),
            model: 'whisper-1'
          });
          fs.unlinkSync(tmp);
          msg.body = String(tr.text || '').trim();
        } catch {
          await replyHuman(msg, 'Lo siento, no pude entender tu nota de voz.');
          return;
        }
      }
    }

    // ================= IA (few-shot) =================
    const userText = (msg.body || '').trim();
    if (!history.has(chatId)) history.set(chatId, [ BASE_SYSTEM_PROMPT ]);
    const convo = history.get(chatId);
    convo.push({ role: 'user', content: userText });

    const fewShot = EXAMPLES.flatMap(ex => [
      { role: 'user',      content: ex.user },
      { role: 'assistant', content: ex.bot  }
    ]);
    const recent = convo.slice(-6);

    try {
      const { choices } = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [ BASE_SYSTEM_PROMPT, ...fewShot, ...recent ]
      });
      let reply = choices[0].message.content.trim();
      await replyHuman(msg, reply);
      recordResponse(chatId);
    } catch (e) {
      console.error('OpenAI error:', e?.message || e);
      await replyHuman(msg, 'Lo siento, ocurrió un error procesando tu mensaje.');
    }
  } catch (e) {
    console.error('handler error:', e?.message || e);
  }
});

////////////////////////////////////////////////////////////////////////////////
// 🔖 Helper
////////////////////////////////////////////////////////////////////////////////
function recordResponse(chatId) {
  db.prepare(`
    INSERT OR REPLACE INTO responded_chats(chat_id, last_response)
    VALUES (?, CURRENT_TIMESTAMP)
  `).run(chatId);
}

////////////////////////////////////////////////////////////////////////////////
// 🚀 Inicializar
////////////////////////////////////////////////////////////////////////////////
client.initialize();
