// scripts/migrate.js
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const db = new Database('bot-data.db');

// ----- esquema -----
db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_windows (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  dow     INTEGER NOT NULL CHECK (dow BETWEEN 0 AND 6), -- 0=Dom ... 6=Sab
  start   TEXT NOT NULL,  -- "HH:MM"
  end     TEXT NOT NULL,  -- "HH:MM"
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1))
);
`);

// ----- helpers -----
function setSetting(key, val) {
  const value = typeof val === 'string' ? val : JSON.stringify(val);
  db.prepare(
    `INSERT INTO settings (key,value) VALUES (?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run(key, value);
}

function seedWindows() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM bot_windows').get().c;
  if (count > 0) return;
  const ins = db.prepare('INSERT INTO bot_windows (dow,start,end,enabled) VALUES (?,?,?,?)');
  const rows = [
    [1,'08:00','18:00',1], // Lun
    [2,'08:00','18:00',1], // Mar
    [3,'08:00','18:00',1], // Mié
    [4,'08:00','18:00',1], // Jue
    [5,'08:00','18:00',1], // Vie
    [6,'08:00','12:00',1], // Sáb
    [0,'00:00','00:00',0], // Dom (apagado)
  ];
  const tx = db.transaction(() => rows.forEach(r => ins.run(...r)));
  tx();
}

// ----- defaults -----
setSetting('bot_mode', 'off'); // estado deseado al arrancar (apagado duro)
setSetting('bot_tz', process.env.TZ || 'America/Bogota');

setSetting('bot_soft_enabled', '1'); // apagado suave activo
setSetting('bot_soft_off_reply', 'Estamos fuera de horario. Te respondemos en nuestro horario de atención.');

// Intentar inicializar el contexto desde contextoBot.js (si existe)
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname  = path.dirname(__filename);
  const rootDir    = path.resolve(__dirname, '..'); // carpeta raíz del proyecto
  const ctxPath    = path.join(rootDir, 'contextoBot.js');
  if (fs.existsSync(ctxPath)) {
    const ctxText = fs.readFileSync(ctxPath, 'utf8');
    setSetting('bot_context', ctxText);
  } else {
    setSetting('bot_context', '');
  }
} catch {
  setSetting('bot_context', '');
}

seedWindows();

// ----- salida -----
const settings = db.prepare('SELECT key,value FROM settings').all();
const windows  = db.prepare('SELECT * FROM bot_windows ORDER BY dow,start').all();

console.log('✅ Migración OK');
console.log('settings:', settings);
console.log('bot_windows:', windows);

db.close();
