// dashboard.js
import express from 'express';
import path from 'path';
import Database from 'better-sqlite3';
import { loadSchedule, scheduleMap } from './src/utils/schedule.js';
import { fileURLToPath } from 'url';

// ----------------------------------------
// Paths robustos (relativos a este archivo)
// ----------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const db   = new Database('bot-data.db');

// ------------------------
// Middlewares básicos
// ------------------------
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Vistas y estáticos (no dependen del cwd)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use('/static', express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=3600')
}));

// ------------------------
// Carga inicial del horario
// ------------------------
loadSchedule();

// 1) Menú principal
app.get('/', (req, res) => {
  res.render('index');
});

// 2) Vista de “chats respondidos”
app.get('/responded', (req, res) => {
  res.render('responded');
});

// ---------------------------------------
// 3) API responded-data con filtros/paginación
//    Query params:
//      q:      búsqueda por chat_id o name
//      status: responded | paused
//      page:   1..N   (default 1)
//      pageSize:       (default 50, máx 200)
// ---------------------------------------
function makeUnionBase() {
  return `
    SELECT * FROM (
      -- Responded
      SELECT
        rc.chat_id                            AS chat_id,
        u.name                                AS name,
        datetime(rc.last_response, 'localtime') AS last_response,
        'responded'                           AS status,
        (ta.chat_id IS NOT NULL)              AS video_enviado,
        (td.chat_id IS NOT NULL)              AS confirmado_visto
      FROM responded_chats rc
      LEFT JOIN users u           ON rc.chat_id = u.chat_id
      LEFT JOIN tutorial_asked ta ON rc.chat_id = ta.chat_id
      LEFT JOIN tutorial_done  td ON rc.chat_id = td.chat_id

      UNION ALL

      -- Paused
      SELECT
        pc.chat_id                            AS chat_id,
        u.name                                AS name,
        NULL                                  AS last_response,
        'paused'                              AS status,
        (ta.chat_id IS NOT NULL)              AS video_enviado,
        (td.chat_id IS NOT NULL)              AS confirmado_visto
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

    const base = makeUnionBase();

    const where = `
      WHERE (:status IS NULL OR status = :status)
        AND (:q IS NULL OR chat_id LIKE :q OR COALESCE(name,'') LIKE :q)
    `;

    const order = `
      ORDER BY
        last_response IS NULL,   -- responded primero
        last_response DESC
    `;

    const limit = ` LIMIT :limit OFFSET :offset `;

    // Total para paginación
    const totalSql = `
      SELECT COUNT(*) AS total FROM (
        ${base}
        ${where}
      )
    `;
    const totalRow = db.prepare(totalSql).get({
      status,
      q: qLike
    });
    const total = totalRow?.total ?? 0;

    // Datos paginados
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

// 4) Horario de clases (vista)
app.get('/schedule', (req, res) => {
  res.render('schedule', { scheduleMap });
});

// 5) Recargar horario (Excel) y volver a la vista
app.post('/reload-schedule', (req, res) => {
  try {
    loadSchedule();
    res.redirect('/schedule');
  } catch (e) {
    console.error('[/reload-schedule] error:', e);
    res.status(500).send('No se pudo recargar el horario.');
  }
});

// 6) Actualización de nombre (inline edit)
app.post('/api/update-name', (req, res) => {
  try {
    const { chat_id, name } = req.body || {};
    if (!chat_id) return res.status(400).json({ success: false, error: 'chat_id requerido' });

    db.prepare('UPDATE users SET name = ? WHERE chat_id = ?').run(name ?? null, chat_id);
    res.json({ success: true });
  } catch (e) {
    console.error('[/api/update-name] error:', e);
    res.status(500).json({ success: false, error: 'No se pudo actualizar el nombre' });
  }
});

// 7) Salud simple (para monitoreo manual o n8n)
app.get('/health', (req, res) => {
  try {
    // chequeo trivial de DB
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

// 8) Levanta el servidor
app.listen(PORT, () => {
  console.log(`📊 Dashboard corriendo en http://localhost:${PORT}`);
});
