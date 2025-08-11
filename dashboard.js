// dashboard.js
import express from 'express';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { loadSchedule, scheduleMap } from './src/utils/schedule.js';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode'; // ⬅️ nuevo

// Helpers de configuración
import {
  getAllSettings, setSettings,
  listWindows, replaceWindows
} from './src/utils/settings.js';

// Orquestador del bot (apagado duro)
import {
  startBot, stopBot, restartBot, getBotStatus, logoutBot
} from './src/orchestrator/botManager.js';

// ----------------------------------------
// Paths robustos
// ----------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// === usar el mismo DB_PATH del bot (con fallback a ./data/bot-data.db)
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH  = process.env.DB_PATH  || path.join(DATA_DIR, 'bot-data.db');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

// === bootstrap de tablas mínimas (mismo esquema que bot.js)
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

// ----------------------------------------
// Middlewares básicos
// ----------------------------------------
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Vistas y estáticos
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use('/static', express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=3600')
}));

// ----------------------------------------
// Carga inicial del horario (schedule.js ya usa EXCEL_PATH/ENV)
// ----------------------------------------
loadSchedule();

// ----------------------------------------
// Middleware opcional por token para /api/*
// ----------------------------------------
function requireAdminToken(req, res, next) {
  const must = process.env.ADMIN_TOKEN;
  if (!must) return next(); // sin token → libre (dev)
  const got = req.get('x-admin-token') || req.query.token;
  if (got !== must) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  next();
}

// ----------------------------------------
// 1) Páginas principales
// ----------------------------------------
app.get('/', (req, res) => res.render('index'));
app.get('/bot-config', (req, res) => res.render('bot-config'));
app.get('/responded', (req, res) => res.render('responded'));
app.get('/schedule', (req, res) => res.render('schedule', { scheduleMap }));

// ----------------------------------------
// 1.1) QR del bot (png y página)
// ----------------------------------------
app.get('/qr.png', async (req, res) => {
  try {
    const st = getBotStatus();         // botManager debe exponer { needsQR, qr, ... }
    if (!st?.needsQR || !st?.qr) {
      return res.status(404).send('No hay QR pendiente.');
    }
    const buf = await QRCode.toBuffer(st.qr, { width: 512, margin: 1 });
    res.setHeader('Content-Type', 'image/png');
    res.send(buf);
  } catch (e) {
    console.error('[/qr.png] error:', e);
    res.status(500).send('Error generando QR');
  }
});

app.get('/qr', (req, res) => {
  const st = getBotStatus();
  if (!st?.needsQR || !st?.qr) {
    return res
      .status(200)
      .send('<html><body style="font-family:sans-serif;padding:24px">No hay QR pendiente. Si el bot necesita autenticación, vuelve a cargar esta página.<br/><a href="/">Volver</a></body></html>');
  }
  res.send(`
    <html>
      <head><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
      <body style="background:#111;color:#eee;display:flex;align-items:center;justify-content:center;min-height:100vh;">
        <div style="text-align:center">
          <img src="/qr.png" alt="QR" style="max-width:90vw;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5)" />
          <div style="margin-top:12px;opacity:.8">Escanéalo con WhatsApp &rarr; Dispositivos vinculados</div>
        </div>
      </body>
    </html>
  `);
});

// ----------------------------------------
// 2) API Responded Data (con filtros/paginación)
// ----------------------------------------
function makeUnionBase() {
  return `
    SELECT * FROM (
      -- Responded
      SELECT
        rc.chat_id AS chat_id,
        u.name AS name,
        datetime(rc.last_response, 'localtime') AS last_response,
        'responded' AS status,
        (ta.chat_id IS NOT NULL) AS video_enviado,
        (td.chat_id IS NOT NULL) AS confirmado_visto
      FROM responded_chats rc
      LEFT JOIN users u           ON rc.chat_id = u.chat_id
      LEFT JOIN tutorial_asked ta ON rc.chat_id = ta.chat_id
      LEFT JOIN tutorial_done  td ON rc.chat_id = td.chat_id

      UNION ALL

      -- Paused
      SELECT
        pc.chat_id AS chat_id,
        u.name AS name,
        NULL AS last_response,
        'paused' AS status,
        (ta.chat_id IS NOT NULL) AS video_enviado,
        (td.chat_id IS NOT NULL) AS confirmado_visto
      FROM paused_chats pc
      LEFT JOIN users u           ON pc.chat_id = u.chat_id
      LEFT JOIN tutorial_asked ta ON pc.chat_id = ta.chat_id
      LEFT JOIN tutorial_done  td ON pc.chat_id = td.chat_id
    ) AS T
  `;
}

app.get('/responded-data', (req, res) => {
  try {
    const qRaw     = (req.query.q ?? '').toString().trim();
    const statusIn = (req.query.status ?? '').toString().trim().toLowerCase();
    const page     = Math.max(1, parseInt(req.query.page ?? '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize ?? '50', 10)));
    const offset   = (page - 1) * pageSize;

    const allowedStatus = new Set(['responded', 'paused']);
    const status = allowedStatus.has(statusIn) ? statusIn : null;
    const qLike  = qRaw ? `%${qRaw}%` : null;

    const base  = makeUnionBase();
    const where = `
      WHERE (:status IS NULL OR status = :status)
        AND (:q IS NULL OR chat_id LIKE :q OR COALESCE(name,'') LIKE :q)
    `;
    const order = `
      ORDER BY
        last_response IS NULL,
        last_response DESC
    `;
    const limit = ` LIMIT :limit OFFSET :offset `;

    // Total
    const totalSql = `
      SELECT COUNT(*) AS total FROM (
        ${base}
        ${where}
      )
    `;
    const totalRow = db.prepare(totalSql).get({ status, q: qLike });
    const total = totalRow?.total ?? 0;

    // Datos
    const dataSql = `
      ${base}
      ${where}
      ${order}
      ${limit}
    `;
    const data = db.prepare(dataSql).all({
      status,
      q: qLike,
      limit: pageSize,
      offset
    });

    res.json({ data, page, pageSize, total });
  } catch (e) {
    console.error('[/responded-data] error:', e);
    res.status(500).json({ error: 'Error obteniendo datos.' });
  }
});

// ----------------------------------------
// 3) Recargar horario (Excel)
// ----------------------------------------
app.post('/reload-schedule', (req, res) => {
  try {
    loadSchedule();
    res.redirect('/schedule');
  } catch (e) {
    console.error('[/reload-schedule] error:', e);
    res.status(500).send('No se pudo recargar el horario.');
  }
});

// ----------------------------------------
// 4) Actualizar nombre (inline edit)
// ----------------------------------------
app.post('/api/update-name', (req, res) => {
  try {
    const { chat_id, name } = req.body || {};
    if (!chat_id) {
      return res.status(400).json({ success: false, error: 'chat_id requerido' });
    }
    db.prepare('UPDATE users SET name = ? WHERE chat_id = ?').run(name ?? null, chat_id);
    res.json({ success: true });
  } catch (e) {
    console.error('[/api/update-name] error:', e);
    res.status(500).json({ success: false, error: 'No se pudo actualizar el nombre' });
  }
});

// ----------------------------------------
// 5) API Configuración del bot
// ----------------------------------------
app.get('/api/settings', requireAdminToken, (req, res) => {
  try {
    const settings = getAllSettings();
    const windows  = listWindows();
    res.json({ ok: true, settings, windows });
  } catch (e) {
    console.error('[/api/settings GET] error:', e);
    res.status(500).json({ ok: false, error: 'No se pudieron obtener settings' });
  }
});

app.post('/api/settings', requireAdminToken, (req, res) => {
  try {
    setSettings(req.body || {});
    res.json({ ok: true });
  } catch (e) {
    console.error('[/api/settings POST] error:', e);
    res.status(500).json({ ok: false, error: 'No se pudieron guardar settings' });
  }
});

app.post('/api/windows', requireAdminToken, (req, res) => {
  try {
    const { windows } = req.body || {};
    if (!Array.isArray(windows)) {
      return res.status(400).json({ ok: false, error: 'windows debe ser un array' });
    }
    replaceWindows(windows);
    res.json({ ok: true });
  } catch (e) {
    console.error('[/api/windows POST] error:', e);
    res.status(500).json({ ok: false, error: 'No se pudieron guardar ventanas' });
  }
});

app.get('/api/windows', requireAdminToken, (req, res) => {
  try {
    res.json({ ok: true, windows: listWindows() });
  } catch (e) {
    console.error('[/api/windows GET] error:', e);
    res.status(500).json({ ok: false, error: 'No se pudieron obtener ventanas' });
  }
});

// ----------------------------------------
// 6) API Bot (apagado duro)
// ----------------------------------------
app.get('/api/bot/status', requireAdminToken, (req, res) => {
  res.json({ ok: true, ...getBotStatus() });
});

app.post('/api/bot/start', requireAdminToken, async (req, res) => {
  try {
    const st = await startBot();
    res.json({ ok: true, ...st });
  } catch (e) {
    console.error('[/api/bot/start] error:', e);
    res.status(500).json({ ok: false, error: 'No se pudo iniciar el bot' });
  }
});

app.post('/api/bot/stop', requireAdminToken, async (req, res) => {
  try {
    const st = await stopBot({});
    res.json({ ok: true, ...st });
  } catch (e) {
    console.error('[/api/bot/stop] error:', e);
    res.status(500).json({ ok: false, error: 'No se pudo detener el bot' });
  }
});

app.post('/api/bot/restart', requireAdminToken, async (req, res) => {
  try {
    const st = await restartBot();
    res.json({ ok: true, ...st });
  } catch (e) {
    console.error('[/api/bot/restart] error:', e);
    res.status(500).json({ ok: false, error: 'No se pudo reiniciar el bot' });
  }
});

app.post('/api/bot/logout', requireAdminToken, async (req, res) => {
  try {
    const st = await logoutBot();
    res.json({ ok: true, ...st });
  } catch (e) {
    console.error('[/api/bot/logout] error:', e);
    res.status(500).json({ ok: false, error: 'No se pudo cerrar sesión' });
  }
});

// ----------------------------------------
// 7) Salud simple (monitoreo)
// ----------------------------------------
app.get('/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    const sheets = Object.keys(scheduleMap || {});
    res.json({
      ok: true,
      uptime: process.uptime(),
      scheduleSheets: sheets,
      now: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// 404
app.use((req, res) => res.status(404).send('Ruta no encontrada'));

// ----------------------------------------
// Levantar servidor
// ----------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`📊 Dashboard escuchando en :${PORT}`);
});
