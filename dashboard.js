// dashboard.js
import express from 'express';
import path from 'path';
import bodyParser from 'body-parser';
import Database from 'better-sqlite3';
import { loadSchedule, scheduleMap } from './schedule.js';

const app = express();
const PORT = process.env.PORT || 3000;
const db   = new Database('bot-data.db');

// Carga inicial del horario
loadSchedule();

// Vistas y estáticos
app.set('views', path.join(process.cwd(), 'views'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: false }));
app.use('/static', express.static(path.join(process.cwd(), 'public')));

// 1) Menú principal
app.get('/', (req, res) => {
  res.render('index');
});

// 2) Chats respondidos (solo renderiza la vista; los datos vienen por AJAX)
app.get('/responded', (req, res) => {
  res.render('responded');
});

// 3) Endpoint JSON que devuelve:
//    - chats “responded” y “paused”
//    - nombre de usuario
//    - última respuesta (solo para responded)
//    - status (‘responded’ ó ‘paused’)
//    - estado del tutorial: asked  ⇒ video_enviado
//                         done   ⇒ confirmado_visto
app.get('/responded-data', (req, res) => {
  const sql = `
    SELECT * FROM (
      -- Chats respondidos
      SELECT
        rc.chat_id,
        u.name,
        datetime(rc.last_response, 'localtime') AS last_response,
        'responded'           AS status,
        (ta.chat_id IS NOT NULL) AS video_enviado,
        (td.chat_id IS NOT NULL) AS confirmado_visto
      FROM responded_chats rc
      LEFT JOIN users u           ON rc.chat_id = u.chat_id
      LEFT JOIN tutorial_asked ta ON rc.chat_id = ta.chat_id
      LEFT JOIN tutorial_done  td ON rc.chat_id = td.chat_id

      UNION ALL

      -- Chats pausados
      SELECT
        pc.chat_id,
        u.name,
        NULL                   AS last_response,
        'paused'              AS status,
        (ta.chat_id IS NOT NULL) AS video_enviado,
        (td.chat_id IS NOT NULL) AS confirmado_visto
      FROM paused_chats pc
      LEFT JOIN users u           ON pc.chat_id = u.chat_id
      LEFT JOIN tutorial_asked ta ON pc.chat_id = ta.chat_id
      LEFT JOIN tutorial_done  td ON pc.chat_id = td.chat_id
    )
    ORDER BY 
      -- Primero los responded (tienen last_response), luego los paused
      last_response IS NULL, 
      last_response DESC
  `;
  const data = db.prepare(sql).all();
  res.json(data);
});

// 4) Horario de clases
app.get('/schedule', (req, res) => {
  res.render('schedule', { scheduleMap });
});

// 5) Recargar horario (Excel)
app.post('/reload-schedule', (req, res) => {
  loadSchedule();
  res.redirect('/schedule');
});

// Recibe las actualizaciones de nombre editadas inline
app.post('/api/update-name', express.json(), (req, res) => {
  const { chat_id, name } = req.body;
  // Actualiza en la tabla de usuarios
  db.prepare('UPDATE users SET name = ? WHERE chat_id = ?')
    .run(name, chat_id);
  res.json({ success: true });
});




// 6) Levanta el servidor
app.listen(PORT, () => {
  console.log(`📊 Dashboard corriendo en http://localhost:${PORT}`);
});
