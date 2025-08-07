// dashboard.js
import express from 'express';
import path from 'path';
import bodyParser from 'body-parser';
import Database from 'better-sqlite3';
import { loadSchedule, scheduleMap } from './schedule.js';

// Inicializa la base de datos
const db = new Database('bot-data.db');

// Carga el horario en memoria al inicio
loadSchedule();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de vistas y estáticos
app.set('views', path.join(process.cwd(), 'views'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: false }));
app.use('/static', express.static(path.join(process.cwd(), 'public')));

// ─────────────────────────────────────────────────────────────────────────────
// 1) Menú principal
// ─────────────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.render('index');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2) Chats pausados
// ─────────────────────────────────────────────────────────────────────────────
app.get('/paused', (req, res) => {
  const chats = db.prepare('SELECT chat_id FROM paused_chats').all();
  res.render('paused', { chats });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3) Chats respondidos (vista), con hora convertida a localtime
// ─────────────────────────────────────────────────────────────────────────────
app.get('/responded', (req, res) => {
  const chats = db.prepare(`
    SELECT
      rc.chat_id,
      u.name,
      datetime(rc.last_response, 'localtime') AS last_response
    FROM responded_chats rc
    LEFT JOIN users u ON rc.chat_id = u.chat_id
    ORDER BY rc.last_response DESC
  `).all();
  res.render('responded', { chats });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4) Endpoint JSON para polling en vivo desde responded.ejs
// ─────────────────────────────────────────────────────────────────────────────
app.get('/responded-data', (req, res) => {
  const data = db.prepare(`
    SELECT
      rc.chat_id,
      u.name,
      datetime(rc.last_response, 'localtime') AS last_response
    FROM responded_chats rc
    LEFT JOIN users u ON rc.chat_id = u.chat_id
    ORDER BY rc.last_response DESC
  `).all();
  res.json(data);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5) Horario de clases
// ─────────────────────────────────────────────────────────────────────────────
app.get('/schedule', (req, res) => {
  res.render('schedule', { scheduleMap });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6) Recargar horario (Excel)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/reload-schedule', (req, res) => {
  loadSchedule();
  res.redirect('/schedule');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7) Estado del tutorial (asked vs. done), con nombres de usuario
// ─────────────────────────────────────────────────────────────────────────────
app.get('/tutorial-status', (req, res) => {
  const rows = db.prepare(`
    SELECT 
      u.chat_id,
      u.name,
      ta.chat_id IS NOT NULL AS asked,
      td.chat_id IS NOT NULL AS done
    FROM users u
    LEFT JOIN tutorial_asked ta ON u.chat_id = ta.chat_id
    LEFT JOIN tutorial_done  td ON u.chat_id = td.chat_id
    ORDER BY COALESCE(u.name, u.chat_id) COLLATE NOCASE
  `).all();
  res.render('tutorial-status', { rows });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8) Levanta el servidor
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`📊 Dashboard corriendo en http://localhost:${PORT}`);
});
