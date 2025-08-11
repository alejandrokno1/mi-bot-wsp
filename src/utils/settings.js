// src/utils/settings.js
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// ───────────────────────────────────────────────────────────────
// Rutas persistentes (compatibles con Railway)
// ───────────────────────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH  = process.env.DB_PATH  || path.join(DATA_DIR, 'bot-data.db');

// Asegurar carpeta contenedora
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

// Abrir BD
const db = new Database(DB_PATH);

// Esquema (alineado con bot.js)
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS bot_windows (
    dow     INTEGER PRIMARY KEY,              -- 0..6 (domingo..sábado)
    start   TEXT NOT NULL DEFAULT '00:00',
    end     TEXT NOT NULL DEFAULT '00:00',
    enabled INTEGER NOT NULL DEFAULT 0
  );
`);

// ---------------- Helpers ----------------
function parseVal(v) {
  if (v === '0' || v === 0) return false;
  if (v === '1' || v === 1) return true;
  try { return JSON.parse(v); } catch { return v; } // intenta JSON, si no deja string
}

// ---------------- API ----------------
export function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = parseVal(r.value);
  return out;
}

export function setSettings(obj = {}) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const tx = db.transaction((entries) => {
    for (const [key, value] of entries) {
      stmt.run({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      });
    }
  });

  tx(Object.entries(obj));
}

export function listWindows() {
  // esquema sin columna "id"
  return db
    .prepare('SELECT dow, start, end, enabled FROM bot_windows ORDER BY dow')
    .all();
}

export function replaceWindows(windows = []) {
  // windows: [{ dow, start, end, enabled }]
  const del = db.prepare('DELETE FROM bot_windows');
  const ins = db.prepare('INSERT INTO bot_windows (dow, start, end, enabled) VALUES (?, ?, ?, ?)');

  const tx = db.transaction((arr) => {
    del.run();
    for (const w of arr) {
      const dow = Number(w.dow);
      if (!Number.isInteger(dow) || dow < 0 || dow > 6) continue;
      const start = String(w.start ?? '00:00');
      const end   = String(w.end   ?? '00:00');
      const enabled = w.enabled ? 1 : 0;
      ins.run(dow, start, end, enabled);
    }
  });

  tx(windows);
}
