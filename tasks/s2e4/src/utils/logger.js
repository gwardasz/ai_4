import { mkdirSync, appendFile } from "node:fs";
import { join, resolve } from "node:path";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEYS = new Set(["apikey"]);

const DEFAULT_DIR = resolve(import.meta.dirname, "..", "..", "logs");

export const redact = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => redact(item));
  const copy = { ...obj };
  for (const key of Object.keys(copy)) {
    if (SECRET_KEYS.has(key.toLowerCase())) {
      copy[key] = "[REDACTED]";
    } else if (copy[key] && typeof copy[key] === "object") {
      copy[key] = redact(copy[key]);
    }
  }
  return copy;
};

const pad = (n) => String(n).padStart(2, "0");
const clock = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
const dayStamp = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const summarize = (data, { maxLen = 120 } = {}) =>
  Object.entries(data)
    .map(([key, value]) => {
      const text = typeof value === "object" ? JSON.stringify(value) : String(value);
      return `${key}=${text.length > maxLen ? `${text.slice(0, maxLen)}...` : text}`;
    })
    .join(" ");

const CONVERSATION_VIEW = {
  "cycle.start": (data) => {
    const missing = data.missing?.length ? data.missing.join(", ") : "none";
    return { who: "system", text: `Cycle ${data.cycle} — missing: ${missing}` };
  },
  "agent.delegate": (data) => ({
    who: data.from ?? "orchestrator",
    text: `→ ${data.to}: ${data.taskPreview ?? ""}`
  }),
  "agent.complete": (data) => ({ who: data.agent ?? "agent", text: data.summary ?? "done" }),
  "verify.flag": (data) => ({ who: "system", text: `Flag captured: ${data.flag}` })
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
      const maxLen = lvl === "debug" ? 4000 : 120;
      const summary = summarize(data, { maxLen });
      const line = `${prefix}${event}${summary ? ` ${summary}` : ""}`;
      (lvl === "error" ? console.error : console.log)(line);
    }

    if (passesLevel) {
      const record = { ts: now.toISOString(), level: lvl, event, ...data };
      appendFile(join(dir, `${dayStamp(now)}.jsonl`), `${JSON.stringify(record)}\n`, () => {});
    }
  };

  const makeLogger = (ctx = {}) => ({
    debug: (event, data) => emit("debug", event, { ...ctx, ...data }),
    info: (event, data) => emit("info", event, { ...ctx, ...data }),
    warn: (event, data) => emit("warn", event, { ...ctx, ...data }),
    error: (event, data) => emit("error", event, { ...ctx, ...data }),
    child: (childCtx) => makeLogger({ ...ctx, ...childCtx })
  });

  return makeLogger();
};

export const createLogger = ({ level = "info", dir = DEFAULT_DIR, consoleMode = "all" } = {}) => {
  mkdirSync(dir, { recursive: true });
  return buildLogger({ level, dir, consoleMode });
};

export const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => noopLogger
};
