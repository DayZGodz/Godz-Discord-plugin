// Godz Discord Plugin - Logger
// Simple logging utility with file output

import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '..', '..', 'log');
const LOG_FILE = join(LOG_DIR, `plugin-${Date.now()}.log`);

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
let currentLevel = LEVELS.debug;

function formatMsg(level, ...args) {
  const ts = new Date().toISOString();
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  return `[${ts}] [${level.toUpperCase()}] ${msg}`;
}

function writeLog(level, ...args) {
  if (LEVELS[level] < currentLevel) return;
  const line = formatMsg(level, ...args);
  try {
    appendFileSync(LOG_FILE, line + '\n');
  } catch { /* ignore file write errors */ }
}

export const logger = {
  debug: (...args) => writeLog('debug', ...args),
  info: (...args) => writeLog('info', ...args),
  warn: (...args) => writeLog('warn', ...args),
  error: (...args) => writeLog('error', ...args),
  setLevel: (level) => { currentLevel = LEVELS[level] ?? LEVELS.info; }
};
