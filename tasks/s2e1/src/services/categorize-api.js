import { AI_DEVS_API_KEY } from "../../../../config.js";
import {
  VERIFY_URL,
  TASK_NAME,
  DATA_URL,
  MAX_HTTP_RETRIES,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_RATE_LIMIT_WAIT_MS
} from "../config.js";
import { noopLogger } from "../utils/logger.js";

const sleep = (ms) => new Promise((done) => setTimeout(done, Math.max(0, ms)));

// Zamienia naglowek Retry-After (sekundy albo data HTTP) na czas oczekiwania w ms.
const parseRetryAfter = (headers) => {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return asNumber * 1000;
  const asDate = Date.parse(raw);
  return Number.isNaN(asDate) ? null : asDate - Date.now();
};

// Minimalny parser CSV (RFC4180-ish): obsluga cudzyslowow, przecinkow w polach i CRLF.
const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const clean = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
};

/**
 * Pobiera SWIEZA liste towarow (CSV zmienia sie co kilka minut) i zwraca [{ id, description }].
 * Rzuca z error.kind ("config" | "network") dla bledow nie do naprawienia przez ponowienie.
 */
export const fetchItems = async (log = noopLogger) => {
  log.info("categorize.csv.fetch", { source: "data csv" });

  let response;
  try {
    response = await fetch(DATA_URL);
  } catch {
    const error = new Error("Network error downloading the cargo CSV.");
    error.kind = "network";
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`Failed to download the cargo CSV (status ${response.status}).`);
    error.kind = response.status === 404 ? "config" : "network";
    throw error;
  }

  const rows = parseCsv(await response.text());
  if (rows.length === 0) {
    const error = new Error("The downloaded cargo CSV is empty.");
    error.kind = "network";
    throw error;
  }

  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const idIdx = header.indexOf("id");
  const descIdx = header.findIndex(
    (cell) => cell.startsWith("desc") || cell.includes("opis") || cell.includes("nazw")
  );
  const hasHeader = idIdx !== -1 || descIdx !== -1;

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const idCol = idIdx === -1 ? 0 : idIdx;
  const descCol = descIdx === -1 ? 1 : descIdx;

  const items = dataRows
    .map((cells) => ({
      id: (cells[idCol] ?? "").trim(),
      description: (cells[descCol] ?? "").trim()
    }))
    .filter((item) => item.id !== "" || item.description !== "");

  log.info("categorize.csv.parsed", { count: items.length });
  log.debug("categorize.csv.items", { items });
  return items;
};

const buildBody = (promptText) =>
  JSON.stringify({ apikey: AI_DEVS_API_KEY, task: TASK_NAME, answer: { prompt: promptText } });

/**
 * Wysyla pojedynczy prompt do /verify. Deterministycznie ponawia 503/429 (backoff + Retry-After),
 * bez udzialu LLM. Zwraca { ok, status, data }; rzuca tylko przy bledzie sieci.
 */
export const postVerify = async (promptText, log = noopLogger) => {
  let retries = 0;

  for (;;) {
    let response;
    try {
      response = await fetch(VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: buildBody(promptText)
      });
    } catch {
      const error = new Error("Network error reaching the verify endpoint.");
      error.kind = "network";
      throw error;
    }

    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }

    if ((response.status === 503 || response.status === 429) && retries < MAX_HTTP_RETRIES) {
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** retries, MAX_BACKOFF_MS);
      const jitter = Math.floor(Math.random() * BASE_BACKOFF_MS);
      const retryAfter = parseRetryAfter(response.headers);
      const wait = Math.min(retryAfter ?? backoff + jitter, MAX_RATE_LIMIT_WAIT_MS);
      retries += 1;
      log.info("categorize.retry", { status: response.status, attempt: retries, wait });
      await sleep(wait);
      continue;
    }

    log.debug("categorize.verify.response", { status: response.status, data });
    return { ok: response.ok, status: response.status, data };
  }
};

// Reset licznika budzetu - wysylany jako prompt "reset" przed kazda nowa proba.
export const resetCounter = (log = noopLogger) => postVerify("reset", log);
