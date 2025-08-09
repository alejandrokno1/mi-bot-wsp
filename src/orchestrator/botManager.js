// src/orchestrator/botManager.js
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Proyecto raíz (donde están bot.js y dashboard.js)
const ROOT     = path.resolve(__dirname, '../../');
const BOT_PATH = path.join(ROOT, 'bot.js');

// Ruta del perfil de LocalAuth que usa tu bot (clientId: 'bot-ia')
const AUTH_DIR = path.join(ROOT, '.wwebjs_auth', 'session-bot-ia');

// ---- Estado del proceso hijo ----
let child = null;
let lastStart = null;
let lastExit = null;
let lastExitCode = null;
let lastSignal = null;
let starting = false;
let stopping = false;

// Estado que se alimenta por IPC desde bot.js
let lastState = { connected: false, ready: false, needsQR: false, qr: null };

// ---- Logs (buffer circular) ----
const LOG_MAX = 200;
const logs = [];
function toStr(x) {
  try {
    if (x == null) return '';
    if (Buffer.isBuffer(x)) return x.toString('utf8');
    return String(x);
  } catch { return ''; }
}
function pushLog(line) {
  logs.push(toStr(line));
  if (logs.length > LOG_MAX) logs.shift();
}

// ---- Utils ----
function isRunning() {
  return !!(child && !child.killed);
}

// ---- API de estado ----
export function getBotStatus() {
  const running = isRunning();
  const pid = running ? child.pid : null;
  const uptimeSec = running && lastStart ? Math.floor((Date.now() - lastStart) / 1000) : 0;
  return {
    running, pid, uptimeSec,
    lastStart, lastExit, lastExitCode, lastSignal,
    state: lastState,
    logs: logs.slice(-50) // últimas 50 para vista rápida
  };
}

// ---- Arrancar el bot (proceso hijo) ----
export async function startBot(envAdd = {}) {
  if (isRunning() || starting) return getBotStatus();
  starting = true;
  try {
    // Reset de estado de sesión al iniciar
    lastState = { connected: false, ready: false, needsQR: false, qr: null };

    child = fork(BOT_PATH, [], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, ...envAdd },
      detached: false
    });

    lastStart = Date.now();
    lastExit = null; lastExitCode = null; lastSignal = null;

    // Mensajes del bot (IPC)
    child.on('message', (msg) => {
      try {
        if (!msg || typeof msg !== 'object') return;

        switch (msg.type) {
          case 'qr': {
            // Guardar string del QR para que la UI lo pinte
            lastState.needsQR = true;
            lastState.qr = msg.data || null;
            break;
          }

          case 'status': {
            // Mezcla flags (connected, ready, needsQR, qr, etc.)
            Object.assign(lastState, msg.data || {});
            // Si reporta ready, limpiar QR
            if (msg.data?.ready) {
              lastState.needsQR = false;
              lastState.qr = null;
            }
            break;
          }

          case 'ready': {
            lastState.connected = true;
            lastState.ready = true;
            lastState.needsQR = false;
            lastState.qr = null;
            break;
          }

          case 'disconnected': {
            lastState.connected = false;
            lastState.ready = false;
            break;
          }

          case 'logout_ok': {
            // No-op aquí; logoutBot espera esta señal
            break;
          }

          default:
            // Ignorar otros tipos
            break;
        }
      } catch (e) {
        pushLog(`[mgr][message] ${e?.message || e}`);
      }
    });

    // Logs de stdout/stderr
    child.stdout?.on('data', d => pushLog(d));
    child.stderr?.on('data', d => pushLog(d));

    // Errores del proceso
    child.on('error', (err) => {
      pushLog(`[bot error] ${err?.stack || err}`);
    });

    child.on('exit', (code, signal) => {
      lastExit = Date.now();
      lastExitCode = code;
      lastSignal = signal;
      // Reset flags de sesión al caer
      lastState.connected = false;
      lastState.ready = false;
      lastState.needsQR = false;
      lastState.qr = null;
      pushLog(`\n[bot] exited code=${code} signal=${signal}\n`);
      child = null;
    });

    return getBotStatus();
  } finally {
    starting = false;
  }
}

// ---- Parar el bot ----
export async function stopBot({ forceAfterMs = 4000 } = {}) {
  if (!child || stopping) return getBotStatus();
  stopping = true;
  try {
    return await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
      }, forceAfterMs);

      child.once('exit', () => {
        clearTimeout(timer);
        resolve(getBotStatus());
      });

      try {
        if (process.platform === 'win32') child.kill('SIGTERM');
        else child.kill('SIGINT');
      } catch {
        try { child.kill(); } catch {}
      }
    });
  } finally {
    stopping = false;
    child = null;
  }
}

// ---- Reiniciar ----
export async function restartBot() {
  await stopBot({});
  return await startBot({});
}

// ---- Cerrar sesión y volver a arrancar pidiendo QR ----
export async function logoutBot() {
  // 1) Pedir logout al child si está vivo (IPC)
  if (isRunning()) {
    try {
      await new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('logout timeout')), 4000);
        const onMsg = (msg) => {
          if (msg?.type === 'logout_ok') {
            clearTimeout(to);
            child.off('message', onMsg);
            resolve();
          }
        };
        child.on('message', onMsg);
        try { child.send({ type: 'logout' }); } catch {}
      });
    } catch (e) {
      pushLog(`[logout] ${e?.message || e}`);
    }
  }

  // 2) Parar el proceso por si sigue con vida
  await stopBot({});

  // 3) Borrar credenciales locales de LocalAuth
  try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}

  // 4) Volver a iniciar para que emita un QR nuevo
  return await startBot({});
}
