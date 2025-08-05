// bot.js
import 'dotenv/config';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { startScheduler } from './schedule.js';  // scheduler adaptado a A/B

// 0️⃣ Base de datos
const db = new Database('bot-data.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS paused_chats (
    chat_id TEXT PRIMARY KEY
  );
  CREATE TABLE IF NOT EXISTS responded_chats (
    chat_id TEXT PRIMARY KEY,
    last_response TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);
const pausedChats = new Set(
  db.prepare('SELECT chat_id FROM paused_chats').all().map(r => r.chat_id)
);

// 1️⃣ Contexto y OpenAI
import {
  BASE_SYSTEM_PROMPT,
  EXAMPLES,
  MATRICULATION_RESPONSE,
  PAYMENT_INFO
} from './contextoBot.js';

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'bot-ia' })
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const history = new Map();

// 2️⃣ QR & ready
client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => {
  console.log('✅ WhatsApp listo');
  // IDs de tus grupos
  const grupoA = ['120363403319105147@g.us'];
  const gruposB = [
    '120363403158418634@g.us',
    '120363421046850498@g.us'
  ];

  // Pasamos las claves A y B que espera schedule.js
  startScheduler(client, {
    A: grupoA,
    B: gruposB
  });
});

// 3️⃣ Listener de mensajes
client.on('message', async msg => {
  if (msg.fromMe) return;

  const from = msg.from;
  const raw = (msg.body || '').trim();
  const text = raw.toLowerCase();

  // /humano & /bot
  if (text === '/humano') {
    pausedChats.add(from);
    db.prepare('INSERT OR IGNORE INTO paused_chats(chat_id) VALUES (?)').run(from);
    return msg.reply('👤 Turno a humano');
  }
  if (text === '/bot') {
    pausedChats.delete(from);
    db.prepare('DELETE FROM paused_chats WHERE chat_id = ?').run(from);
    return msg.reply('🤖 Vuelvo yo');
  }
  if (pausedChats.has(from) || msg.from.endsWith('@g.us')) return;

  // Saludos breves
  if (raw.split(/\s+/).length <= 3) {
    if (/^(hola|buenos días|buenas tardes|buenas noches)/i.test(text)) {
      const saludo = raw[0].toUpperCase() + raw.slice(1);
      await msg.reply(`${saludo}! ¿En qué te ayudo?`);
      recordResponse(from);
      return;
    }
    if (/^(gracias|ok|vale|listo)/i.test(text)) {
      await msg.reply('¡Genial! ¿Algo más?');
      recordResponse(from);
      return;
    }
  }

  // Comprobante/matrícula
  if (/comprobante/.test(text) && /matricul/.test(text)) {
    await msg.reply(MATRICULATION_RESPONSE);
    recordResponse(from);
    return;
  }
  // Pago
  if (/(cuentas?|medios de pago|transferencia)/.test(text)) {
    await msg.reply(PAYMENT_INFO);
    recordResponse(from);
    return;
  }

  // Audio → Whisper
  if (msg.hasMedia) {
    const media = await msg.downloadMedia();
    if (media.mimetype.startsWith('audio/')) {
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
        return msg.reply('No entendí tu nota de voz 😕');
      }
    }
  }

  // ChatGPT few-shot
  const userText = (msg.body || '').trim();
  if (!history.has(from)) history.set(from, [BASE_SYSTEM_PROMPT]);
  const convo = history.get(from);
  convo.push({ role: 'user', content: userText });
  const few = EXAMPLES.flatMap(ex => [
    { role: 'user', content: ex.user },
    { role: 'assistant', content: ex.bot }
  ]);
  const recent = convo.slice(-6);

  try {
    const { choices } = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [BASE_SYSTEM_PROMPT, ...few, ...recent]
    });
    const reply = choices[0].message.content.trim();
    convo.push({ role: 'assistant', content: reply });
    await msg.reply(reply);
    recordResponse(from);
  } catch {
    await msg.reply('Error procesando tu mensaje.');
  }
});

// 4️⃣ Helpers
function recordResponse(chatId) {
  db.prepare(`
    INSERT OR REPLACE INTO responded_chats(chat_id, last_response)
    VALUES(?, CURRENT_TIMESTAMP)
  `).run(chatId);
}

// 5️⃣ Launch
client.initialize();
