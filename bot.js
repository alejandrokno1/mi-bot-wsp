// bot.js
import 'dotenv/config';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { startScheduler } from './schedule.js';
import {
  BASE_SYSTEM_PROMPT,
  EXAMPLES,
  MATRICULATION_RESPONSE,
  PAYMENT_INFO
} from './contextoBot.js';

////////////////////////////////////////////////////////////////////////////////
// 0️⃣  Base de datos y tablas
////////////////////////////////////////////////////////////////////////////////
const db = new Database('bot-data.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS paused_chats (
    chat_id TEXT PRIMARY KEY
  );
  CREATE TABLE IF NOT EXISTS responded_chats (
    chat_id TEXT PRIMARY KEY,
    last_response TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tutorial_asked (
    chat_id TEXT PRIMARY KEY
  );
  CREATE TABLE IF NOT EXISTS tutorial_done (
    chat_id TEXT PRIMARY KEY
  );
  CREATE TABLE IF NOT EXISTS users (
    chat_id TEXT PRIMARY KEY,
    name    TEXT
  );
`);

const pausedChats = new Set(
  db.prepare('SELECT chat_id FROM paused_chats').all().map(r => r.chat_id)
);

////////////////////////////////////////////////////////////////////////////////
// 1️⃣  Cliente WhatsApp & OpenAI
////////////////////////////////////////////////////////////////////////////////
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'bot-ia' })
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const history = new Map();

////////////////////////////////////////////////////////////////////////////////
// 2️⃣  Generar QR y arrancar scheduler
////////////////////////////////////////////////////////////////////////////////
client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => {
  console.log('✅ WhatsApp Web listo');
  const grupoA  = ['120363403319105147@g.us'];
  const gruposB = [
    '120363403158418634@g.us',
    '120363421046850498@g.us'
  ];
  startScheduler(client, { A: grupoA, B: gruposB });
});

////////////////////////////////////////////////////////////////////////////////
// 3️⃣  Manejador de mensajes
////////////////////////////////////////////////////////////////////////////////
client.on('message', async msg => {
  // 0️⃣ Ignorar mensajes propios
  if (msg.fromMe) return;

  const chatId = msg.from;
  const raw    = (msg.body || '').trim();
  const text   = raw.toLowerCase();

  // 1️⃣ Comandos de pausa / reanudar
  if (text === '/humano') {
    pausedChats.add(chatId);
    db.prepare('INSERT OR IGNORE INTO paused_chats(chat_id) VALUES (?)').run(chatId);
    return msg.reply('Entendido, paso el turno a un asesor humano. 👋');
  }
  if (text === '/bot') {
    pausedChats.delete(chatId);
    db.prepare('DELETE FROM paused_chats WHERE chat_id = ?').run(chatId);
    return msg.reply('Listo, continúo yo. 😊');
  }

  // 2️⃣ Ignorar grupos y chats pausados
  if (msg.from.endsWith('@g.us') || pausedChats.has(chatId)) return;

  // ───────── Manejo de stickers ───────────────────────────────────────────────
  if (msg.type === 'sticker') {
    // Puedes personalizar o eliminar este reply si prefieres silenciar stickers
    await msg.reply('¡Qué lindo sticker! 😊');
    return;
  }

  // ───────── Onboarding de nombre ────────────────────────────────────────────
  const userRow = db.prepare('SELECT name FROM users WHERE chat_id = ?').get(chatId);
  if (!userRow) {
    // 2.a) Aún no registrado: si saluda, le pedimos nombre
    if (/^(hola|buenos días|buenas tardes|buenas noches)[!?¡\s]*$/i.test(text)) {
      await msg.reply('¡Hola! Un gusto conocerte, ¿cómo te llamas? 😊');
      db.prepare('INSERT INTO users(chat_id) VALUES (?)').run(chatId);
      return;
    }
  } else if (userRow.name == null) {
    // 2.b) Ya preguntamos nombre: tomamos el mensaje como nombre
    const name = raw.split('\n')[0].trim();
    db.prepare('UPDATE users SET name = ? WHERE chat_id = ?').run(name, chatId);
    await msg.reply(`¡Encantado de conocerte, ${name}! ¿En qué te puedo ayudar? 😊`);
    recordResponse(chatId);
    return;
  }

  // ───────── Estado del tutorial ──────────────────────────────────────────────
  const isTrainingQuery = /(capacita|inscrip|cupos|matricul|precio|valor|inicio|temario|clases|horario)/i.test(text);
  const asked = !!db.prepare('SELECT 1 FROM tutorial_asked WHERE chat_id = ?').get(chatId);
  const done  = !!db.prepare('SELECT 1 FROM tutorial_done  WHERE chat_id = ?').get(chatId);

  if (isTrainingQuery && !asked) {
    await msg.reply('Antes de darte esa información, ¿conoces cómo funciona la capacitación? 🤔');
    db.prepare('INSERT INTO tutorial_asked(chat_id) VALUES (?)').run(chatId);
    return;
  }
  if (asked && !done) {
    if (/^s[ií]/i.test(text)) {
      db.prepare('INSERT INTO tutorial_done(chat_id) VALUES (?)').run(chatId);
    } else {
      await msg.reply(
        'Este video resume todos los aspectos importantes de la capacitación. 🎥\n' +
        'https://www.youtube.com/watch?v=xujKKee_meI&ab_channel=NASLYSOFIABELTRANSANCHEZ\n' +
        'Por favor, míralo completo y dime si tienes dudas.'
      );
      db.prepare('INSERT INTO tutorial_done(chat_id) VALUES (?)').run(chatId);
      return;
    }
  }

  // ───────── Saludos / respuestas muy cortas ─────────────────────────────────
  // Solo cuando sea exactamente un saludo de una palabra
  const tokens = raw.split(/\s+/);
  if (tokens.length === 1) {
    if (/^(hola|buenos días|buenas tardes|buenas noches)$/i.test(text)) {
      const saludo = raw.charAt(0).toUpperCase() + raw.slice(1);
      await msg.reply(`${saludo}! ¿En qué te puedo ayudar? 😊`);
      recordResponse(chatId);
      return;
    }
    if (/^(gracias|ok|vale|listo)$/i.test(text)) {
      await msg.reply('¡Genial! ¿Hay algo más en lo que pueda ayudarte?');
      recordResponse(chatId);
      return;
    }
  }

  // ───────── Comprobante / matrícula ─────────────────────────────────────────
  if (/comprobante/i.test(text) && /matricul/i.test(text)) {
    await msg.reply(MATRICULATION_RESPONSE);
    recordResponse(chatId);
    return;
  }

  // ───────── Cuentas / medios de pago ────────────────────────────────────────
  if (/(cuentas?|medios de pago|transferencia)/i.test(text)) {
    await msg.reply(PAYMENT_INFO);
    recordResponse(chatId);
    return;
  }

  // ───────── Procesar audio con Whisper ──────────────────────────────────────
  if (msg.hasMedia) {
    const media = await msg.downloadMedia();
    if (media.mimetype?.startsWith('audio/')) {
      try {
        const tmp = path.join(process.cwd(), `tmp_${Date.now()}.ogg`);
        fs.writeFileSync(tmp, Buffer.from(media.data, 'base64'));
        const tr = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tmp),
          model: 'whisper-1'
        });
        fs.unlinkSync(tmp);
        msg.body = tr.text.trim();
      } catch {
        await msg.reply('Lo siento, no pude entender tu nota de voz.');
        return;
      }
    }
  }

  // ───────── Flujo de IA (few-shot) ──────────────────────────────────────────
  const userText = (msg.body||'').trim();
  if (!history.has(chatId)) history.set(chatId, [ BASE_SYSTEM_PROMPT ]);
  const convo = history.get(chatId);
  convo.push({ role:'user', content:userText });

  const fewShot = EXAMPLES.flatMap(ex=>[
    { role:'user',      content: ex.user },
    { role:'assistant', content: ex.bot  }
  ]);
  const recent = convo.slice(-6);

  try {
    const { choices } = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [ BASE_SYSTEM_PROMPT, ...fewShot, ...recent ]
    });
    const reply = choices[0].message.content.trim();
    convo.push({ role:'assistant', content: reply });
    await msg.reply(reply);
    recordResponse(chatId);
  } catch {
    await msg.reply('Lo siento, ocurrió un error procesando tu mensaje.');
  }
});

////////////////////////////////////////////////////////////////////////////////
// 🔖 Helper para registrar la última respuesta
////////////////////////////////////////////////////////////////////////////////
function recordResponse(chatId) {
  db.prepare(`
    INSERT OR REPLACE INTO responded_chats(chat_id, last_response)
    VALUES (?, CURRENT_TIMESTAMP)
  `).run(chatId);
}

////////////////////////////////////////////////////////////////////////////////
// 🚀 Inicializar el bot
////////////////////////////////////////////////////////////////////////////////
client.initialize();
