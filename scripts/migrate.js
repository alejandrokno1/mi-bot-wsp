// scripts/migrate.js
import 'dotenv/config';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ───────────────────────────────────────────────────────────────
// Rutas persistentes (compatibles con Railway)
// ───────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_PATH  = process.env.DB_PATH  || path.join(DATA_DIR, 'bot-data.db');

try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

const db = new Database(DB_PATH);

// ───────────────────────────────────────────────────────────────
// Esquema (alineado con bot.js / settings.js)
// ───────────────────────────────────────────────────────────────
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  -- NOTA: Clave primaria es 'dow' (0..6), sin columna 'id'.
  CREATE TABLE IF NOT EXISTS bot_windows (
    dow     INTEGER PRIMARY KEY,              -- 0..6 (domingo..sábado)
    start   TEXT NOT NULL DEFAULT '00:00',
    end     TEXT NOT NULL DEFAULT '00:00',
    enabled INTEGER NOT NULL DEFAULT 0
  );
`);

// Helpers
function setSetting(key, val) {
  const value = typeof val === 'string' ? val : JSON.stringify(val);
  db.prepare(`
    INSERT INTO settings (key,value) VALUES (?,?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function seedWindowsIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM bot_windows').get().c ?? 0;
  if (count > 0) return;

  // Semilla por defecto: Lun–Vie 08:00–18:00, Sáb 08:00–12:00, Dom apagado
  const rows = [
    { dow: 1, start: '08:00', end: '18:00', enabled: 1 },
    { dow: 2, start: '08:00', end: '18:00', enabled: 1 },
    { dow: 3, start: '08:00', end: '18:00', enabled: 1 },
    { dow: 4, start: '08:00', end: '18:00', enabled: 1 },
    { dow: 5, start: '08:00', end: '18:00', enabled: 1 },
    { dow: 6, start: '08:00', end: '12:00', enabled: 1 },
    { dow: 0, start: '00:00', end: '00:00', enabled: 0 },
  ];

  const ins = db.prepare('INSERT OR REPLACE INTO bot_windows (dow,start,end,enabled) VALUES (?,?,?,?)');
  const tx  = db.transaction(() => rows.forEach(r => ins.run(r.dow, r.start, r.end, r.enabled)));
  tx();
}

// Defaults útiles
setSetting('bot_mode', 'off'); // apagado duro al arrancar
setSetting('bot_tz', process.env.TZ || 'America/Bogota');
setSetting('bot_soft_enabled', '1'); // apagado suave activo
setSetting('bot_soft_off_reply', 'Estamos fuera de horario. Te respondemos en nuestro horario de atención.');

// Cargar el contexto por defecto desde contextoBot.js (opcional)
try {
  const ctxPath = path.join(ROOT, 'contextoBot.js');
  if (fs.existsSync(ctxPath)) {
    const ctxText = fs.readFileSync(ctxPath, 'utf8');
    setSetting('bot_context', ctxText);
  } else {
    setSetting('bot_context', '');
  }
} catch {
  setSetting('bot_context', '');
}

// Semilla de ventanas si corresponde
seedWindowsIfEmpty();

// Reporte
const settings = db.prepare('SELECT key,value FROM settings').all();
const windows  = db.prepare('SELECT dow,start,end,enabled FROM bot_windows ORDER BY dow').all();

console.log('✅ Migración OK');
console.log('DB_PATH:', DB_PATH);
console.log('settings:', settings);
console.log('bot_windows:', windows);

db.close();
