// src/utils/settings.js
import Database from 'better-sqlite3';

const db = new Database('bot-data.db');

function parseVal(v) {
  if (v === '0' || v === 0) return false;
  if (v === '1' || v === 1) return true;
  // intenta JSON, si no, deja string
  try { return JSON.parse(v); } catch { return v; }
}

export function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = parseVal(r.value);
  return out;
}

export function setSettings(obj = {}) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `);
  const tx = db.transaction((entries) => {
    for (const [key, value] of entries) {
      stmt.run({ key, value: typeof value === 'string' ? value : JSON.stringify(value) });
    }
  });
  tx(Object.entries(obj));
}

export function listWindows() {
  return db.prepare('SELECT id, dow, start, end, enabled FROM bot_windows ORDER BY dow, start').all();
}

export function replaceWindows(windows = []) {
  // windows: [{dow,start,end,enabled}]
  const del = db.prepare('DELETE FROM bot_windows');
  const ins = db.prepare('INSERT INTO bot_windows (dow,start,end,enabled) VALUES (?,?,?,?)');
  const tx = db.transaction(() => {
    del.run();
    for (const w of windows) {
      const dow = Number(w.dow);
      const start = String(w.start || '00:00');
      const end   = String(w.end   || '00:00');
      const enabled = w.enabled ? 1 : 0;
      if (Number.isNaN(dow) || dow < 0 || dow > 6) continue;
      ins.run(dow, start, end, enabled);
    }
  });
  tx();
}

// (Más adelante podremos añadir aquí helpers como isWithinWorkingHours)
