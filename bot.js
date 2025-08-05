// bot.js
import 'dotenv/config';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';  // SQLite integration
import { startScheduler } from './schedule.js';

// 0️⃣ Abrir o crear base de datos local (bot-data.db)
const db = new Database('bot-data.db');
// Crear tablas si no existen
db.exec(`
  CREATE TABLE IF NOT EXISTS paused_chats (
    chat_id TEXT PRIMARY KEY
  );
  CREATE TABLE IF NOT EXISTS responded_chats (
    chat_id TEXT PRIMARY KEY,
    last_response TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

// Cargar chats pausados en memoria
const pausedChats = new Set(
  db.prepare('SELECT chat_id FROM paused_chats').all().map(r => r.chat_id)
);

// Importa tu contexto y respuestas
import {
  BASE_SYSTEM_PROMPT,
  EXAMPLES,
  MATRICULATION_RESPONSE,
  PAYMENT_INFO
} from './contextoBot.js';

////////////////////////////////////////////////////////////////////////////////
// 1) Inicialización de clientes
////////////////////////////////////////////////////////////////////////////////
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'bot-ia' })
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

////////////////////////////////////////////////////////////////////////////////
// 2) Historial de conversación por chat
////////////////////////////////////////////////////////////////////////////////
const history = new Map();

////////////////////////////////////////////////////////////////////////////////
// 3) Mostrar QR para login
////////////////////////////////////////////////////////////////////////////////
client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('🔗 Escanea este QR con WhatsApp Business para iniciar sesión');
});

////////////////////////////////////////////////////////////////////////////////
// 4) Al conectarse
////////////////////////////////////////////////////////////////////////////////
client.on('ready', () => {
  console.log('✅ WhatsApp Web (Business) conectado y listo!');

  // Inicia el scheduler basado en el Excel
  const groupId = '120363403319105147@g.us';  // tu ID de grupo
  startScheduler(client, groupId);
});

////////////////////////////////////////////////////////////////////////////////
// 5) Manejador de mensajes
////////////////////////////////////////////////////////////////////////////////
client.on('message', async msg => {
  // Ignorar mensajes propios
  if (msg.fromMe) return;
  // Ignorar mensajes de grupo
  if (msg.from.endsWith('@g.us')) return;

  const chatId = msg.from;
  const raw    = (msg.body || '').trim();
  const text   = raw.toLowerCase();

  // 5.1) PAUSA / REANUDA
  if (text === '/humano') {
    pausedChats.add(chatId);
    db.prepare('INSERT OR IGNORE INTO paused_chats(chat_id) VALUES (?)').run(chatId);
    await msg.reply('Entendido, paso el turno a un asesor humano. 👋');
    return;
  }
  if (text === '/bot') {
    pausedChats.delete(chatId);
    db.prepare('DELETE FROM paused_chats WHERE chat_id = ?').run(chatId);
    await msg.reply('Listo, continúo yo. 😊');
    return;
  }
  if (pausedChats.has(chatId)) return;

  // 5.2) Saludos y respuestas muy cortas
  if (raw.split(/\s+/).length <= 3) {
    if (/^(hola|buenos días|buenas tardes|buenas noches)[!?¡\s]*$/i.test(text)) {
      const saludo = raw.charAt(0).toUpperCase() + raw.slice(1);
      const reply = `${saludo}! ¿En qué te puedo ayudar?`;
      await msg.reply(reply);
      recordResponse(chatId);
      return;
    }
    if (/^(gracias|ok|vale|listo)[.!¡]*$/i.test(text)) {
      const reply = '¡Genial! ¿Hay algo más en lo que pueda ayudarte?';
      await msg.reply(reply);
      recordResponse(chatId);
      return;
    }
  }

  // 5.3) Consulta comprobante/matrícula
  if (/comprobante/i.test(text) && /matricul/i.test(text)) {
    await msg.reply(MATRICULATION_RESPONSE);
    recordResponse(chatId);
    return;
  }
  // 5.4) Consulta de cuentas
  if (/(cuentas?|medios de pago|dónde puedo pagar|transferencia)/i.test(text)) {
    await msg.reply(PAYMENT_INFO);
    recordResponse(chatId);
    return;
  }

  // 5.5) Procesar audio
  if (msg.hasMedia) {
    const media = await msg.downloadMedia();
    if (media.mimetype?.startsWith('audio/')) {
      try {
        const buffer = Buffer.from(media.data, 'base64');
        const tmpPath = path.join(process.cwd(), `tmp_${Date.now()}.ogg`);
        fs.writeFileSync(tmpPath, buffer);

        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tmpPath),
          model: 'whisper-1'
        });
        const transcript = transcription.text.trim();
        fs.unlinkSync(tmpPath);
        msg.body = transcript;
      } catch {
        await msg.reply('Lo siento, no pude entender tu nota de voz.');
        return;
      }
    }
  }

  // 5.6) Flujo de IA con contexto
  const userText = (msg.body || '').trim();
  if (!history.has(chatId)) history.set(chatId, [ BASE_SYSTEM_PROMPT ]);
  const convo = history.get(chatId);
  convo.push({ role: 'user', content: userText });

  const fewShot = EXAMPLES.flatMap(ex => [
    { role: 'user',      content: ex.user },
    { role: 'assistant', content: ex.bot  }
  ]);
  const recent = convo.slice(-6);

  try {
    const { choices } = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [ BASE_SYSTEM_PROMPT, ...fewShot, ...recent ]
    });
    const reply = choices[0].message.content.trim();
    convo.push({ role: 'assistant', content: reply });
    await msg.reply(reply);
    recordResponse(chatId);
  } catch (err) {
    const fallback = err.code === 'context_length_exceeded'
      ? 'Lo siento, la conversación es muy larga. ¿Podrías resumirla?'  
      : 'Lo siento, ha ocurrido un error procesando tu mensaje.';
    await msg.reply(fallback);
  }
});

////////////////////////////////////////////////////////////////////////////////
// Función para registrar chats respondidos
////////////////////////////////////////////////////////////////////////////////
function recordResponse(chatId) {
  db.prepare(`INSERT OR REPLACE INTO responded_chats(chat_id, last_response)
               VALUES (?, CURRENT_TIMESTAMP)`).run(chatId);
}

////////////////////////////////////////////////////////////////////////////////
// 6) Iniciar el bot
////////////////////////////////////////////////////////////////////////////////
client.initialize();
