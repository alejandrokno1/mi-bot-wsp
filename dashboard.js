// dashboard.js
import express from 'express';
import path from 'path';
import Database from 'better-sqlite3';
import { loadSchedule, scheduleMap } from './src/utils/schedule.js';
import { fileURLToPath } from 'url';

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
const db   = new Database('bot-data.db');

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
// Carga inicial del horario
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
app.listen(PORT, () => {
  console.log(`📊 Dashboard corriendo en http://localhost:${PORT}`);
});
