import { mkdirSync, appendFile } from "node:fs";
import { join, resolve } from "node:path";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEYS = new Set(["code", "apikey", "authorization"]);

// Domyslny katalog logow: src/utils -> ../../logs (katalog zadania).
const DEFAULT_DIR = resolve(import.meta.dirname, "..", "..", "logs");

// Plytka redakcja sekretow w polach strukturalnych (np. argumentach narzedzi).
export const redact = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(copy)) {
    copy[key] = SECRET_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : copy[key];
  }
  return copy;
};

const pad = (n) => String(n).padStart(2, "0");
const clock = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
const dayStamp = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// Zwiezly opis danych do linii konsoli (bez kontekstu, ktory jest w prefiksie).
const summarize = (data) =>
  Object.entries(data)
    .map(([key, value]) => {
      const text = typeof value === "object" ? JSON.stringify(value) : String(value);
      return `${key}=${text.length > 80 ? `${text.slice(0, 80)}...` : text}`;
    })
    .join(" ");

const buildLogger = ({ level, dir, context, file }) => {
  const threshold = LEVELS[level] ?? LEVELS.info;

  const emit = (lvl, event, data = {}) => {
    if (LEVELS[lvl] < threshold) return;

    const now = new Date();
    const record = { ts: now.toISOString(), level: lvl, event, ...context, ...data };

    const tag = [context.requestId, context.sessionID].filter(Boolean).join("/");
    const prefix = `${clock(now)} ${lvl.toUpperCase().padEnd(5)} ${tag ? `[${tag}] ` : ""}`;
    const summary = summarize(data);
    const line = `${prefix}${event}${summary ? ` ${summary}` : ""}`;
    (lvl === "error" ? console.error : console.log)(line);

    // Zapis do pliku jest asynchroniczny i nie moze wywrocic obslugi zadania.
    appendFile(join(dir, `${dayStamp(now)}.jsonl`), `${JSON.stringify(record)}\n`, () => {});
  };

  return {
    debug: (event, data) => emit("debug", event, data),
    info: (event, data) => emit("info", event, data),
    warn: (event, data) => emit("warn", event, data),
    error: (event, data) => emit("error", event, data),
    child: (extra) => buildLogger({ level, dir, file, context: { ...context, ...extra } })
  };
};

export const createLogger = ({ level = "info", dir = DEFAULT_DIR } = {}) => {
  // Jawne utworzenie katalogu - NIE jako side-effect importu.
  mkdirSync(dir, { recursive: true });
  return buildLogger({ level, dir, context: {} });
};

// Logger zerowy - domyslny w agencie, by dzialal bez wstrzyknietego loggera (testy, tryb standalone).
export const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return noopLogger;
  }
};
