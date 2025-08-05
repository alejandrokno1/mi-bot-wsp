// dashboard.js
import express from 'express';
import path from 'path';
import bodyParser from 'body-parser';
import Database from 'better-sqlite3';
import { loadSchedule, scheduleMap } from './schedule.js';

// Inicializa SQLite
const db = new Database('bot-data.db');
// Carga el horario en memoria
loadSchedule();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de EJS y body-parser
app.set('views', path.join(process.cwd(), 'views'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: false }));

// Sirve estático (CSS, JS, etc.) desde /public
app.use('/static', express.static(path.join(process.cwd(), 'public')));

// Página principal
app.get('/', (req, res) => {
  res.render('index');
});

// ----------------------
// Rutas de datos JSON
// ----------------------

// Devuelve lista de chats pausados (para polling)
app.get('/paused-data', (req, res) => {
  const chats = db.prepare('SELECT chat_id FROM paused_chats').all();
  res.json(chats);
});

// (Opcional) JSON para chats respondidos
app.get('/responded-data', (req, res) => {
  const chats = db
    .prepare('SELECT chat_id, last_response FROM responded_chats ORDER BY last_response DESC')
    .all();
  res.json(chats);
});

// ----------------------
// Rutas que renderizan vistas
// ----------------------

// Chats pausados (con polling en la vista)
app.get('/paused', (req, res) => {
  // También le pasamos los datos iniciales
  const chats = db.prepare('SELECT chat_id FROM paused_chats').all();
  res.render('paused', { chats });
});

// Chats respondidos
app.get('/responded', (req, res) => {
  const chats = db
    .prepare('SELECT chat_id, last_response FROM responded_chats ORDER BY last_response DESC')
    .all();
  res.render('responded', { chats });
});

// Horario de clases
app.get('/schedule', (req, res) => {
  console.log('📅 [Dashboard] scheduleMap:', scheduleMap);
  res.render('schedule', { scheduleMap });
});

// Reiniciar schedule (recarga Excel)
app.post('/reload-schedule', (req, res) => {
  loadSchedule();
  res.redirect('/schedule');
});

// Inicia el servidor
app.listen(PORT, () => {
  console.log(`📊 Dashboard corriendo en http://localhost:${PORT}`);
});
