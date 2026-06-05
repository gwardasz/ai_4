import { mkdirSync, appendFile } from "node:fs";
import { join, resolve } from "node:path";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEYS = new Set(["apikey", "code", "authorization"]);

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

// Zwiezly opis danych do linii konsoli.
const summarize = (data) =>
  Object.entries(data)
    .map(([key, value]) => {
      const text = typeof value === "object" ? JSON.stringify(value) : String(value);
      return `${key}=${text.length > 120 ? `${text.slice(0, 120)}...` : text}`;
    })
    .join(" ");

// Widok konwersacji - tylko zapytanie startowe i tekstowa odpowiedz modelu (pelny tekst).
const CONVERSATION_VIEW = {
  "agent.query": (data) => ({ who: "task", text: data.query }),
  "agent.reply": (data) => ({ who: "agent", text: data.reply })
};

const buildLogger = ({ level, dir, consoleMode }) => {
  const threshold = LEVELS[level] ?? LEVELS.info;

  const emit = (lvl, event, data = {}) => {
    const passesLevel = LEVELS[lvl] >= threshold;
    const now = new Date();

    if (consoleMode === "conversation") {
      const view = CONVERSATION_VIEW[event];
      if (view) {
        const { who, text } = view(data);
        console.log(`${clock(now)} ${who}: ${text}`);
      }
    } else if (passesLevel) {
      const prefix = `${clock(now)} ${lvl.toUpperCase().padEnd(5)} `;
      const summary = summarize(data);
      const line = `${prefix}${event}${summary ? ` ${summary}` : ""}`;
      (lvl === "error" ? console.error : console.log)(line);
    }

    if (passesLevel) {
      const record = { ts: now.toISOString(), level: lvl, event, ...data };
      appendFile(join(dir, `${dayStamp(now)}.jsonl`), `${JSON.stringify(record)}\n`, () => {});
    }
  };

  return {
    debug: (event, data) => emit("debug", event, data),
    info: (event, data) => emit("info", event, data),
    warn: (event, data) => emit("warn", event, data),
    error: (event, data) => emit("error", event, data)
  };
};

export const createLogger = ({ level = "info", dir = DEFAULT_DIR, consoleMode = "all" } = {}) => {
  // Jawne utworzenie katalogu - NIE jako side-effect importu.
  mkdirSync(dir, { recursive: true });
  return buildLogger({ level, dir, consoleMode });
};

// Logger zerowy - domyslny w warstwach, by dzialaly bez wstrzyknietego loggera (testy, standalone).
export const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};
