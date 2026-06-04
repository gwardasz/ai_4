import { AI_DEVS_API_KEY } from "../../../../config.js";
import {
  VERIFY_URL,
  TASK_NAME,
  MAX_503_RETRIES,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_RATE_LIMIT_WAIT_MS
} from "../config.js";
import { noopLogger } from "../utils/logger.js";

// Nazwy naglowkow limitow, jakie spotyka sie u roznych providerow/proxy (case-insensitive).
const REMAINING_HEADERS = ["ratelimit-remaining", "x-ratelimit-remaining"];
const RESET_HEADERS = ["ratelimit-reset", "x-ratelimit-reset"];

// Stan limitera trzymany w module - wspoldzielony przez kolejne wywolania w ramach przebiegu.
const limiter = { resetAt: null };

const sleep = (ms) => new Promise((done) => setTimeout(done, Math.max(0, ms)));

// Wybiera pierwszy obecny naglowek z listy aliasow.
const pickHeader = (headers, names) => {
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null && value !== "") return value;
  }
  return null;
};

// Zamienia wartosc naglowka (sekundy delta, epoch w s, epoch w ms, lub data HTTP) na timestamp w ms.
const toResetTimestamp = (raw) => {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const asNumber = Number(text);
  if (Number.isFinite(asNumber)) {
    if (asNumber > 1e12) return asNumber;            // epoch w milisekundach
    if (asNumber > 1e9) return asNumber * 1000;      // epoch w sekundach
    return Date.now() + asNumber * 1000;             // delta w sekundach (np. Retry-After)
  }

  const asDate = Date.parse(text);                   // data HTTP (Retry-After: <http-date>)
  return Number.isNaN(asDate) ? null : asDate;
};

// Zbiera istotne naglowki do logu i decyzji o limitach.
const collectHeaders = (headers) => ({
  retryAfter: headers.get("retry-after"),
  remaining: pickHeader(headers, REMAINING_HEADERS),
  reset: pickHeader(headers, RESET_HEADERS)
});

// Aktualizuje stan limitera na podstawie odpowiedzi. Pauzujemy gdy limit wyczerpany lub 429.
const updateLimiter = (status, info) => {
  const remaining = info.remaining === null ? null : Number(info.remaining);
  const isLimited = status === 429 || remaining === 0;

  if (isLimited) {
    const resetAt = toResetTimestamp(info.retryAfter ?? info.reset) ?? Date.now() + BASE_BACKOFF_MS;
    limiter.resetAt = resetAt;
  } else if (remaining !== null && remaining > 0) {
    limiter.resetAt = null;
  }
};

// Czeka do resetu limitu, jesli jest aktywny. Deterministyczne - nie zalezy od LLM.
const waitForLimiter = async (log) => {
  if (!limiter.resetAt) return;
  const waitMs = Math.min(limiter.resetAt - Date.now(), MAX_RATE_LIMIT_WAIT_MS);
  if (waitMs <= 0) {
    limiter.resetAt = null;
    return;
  }
  log.info("railway.ratelimit.wait", { waitMs });
  await sleep(waitMs);
  limiter.resetAt = null;
};

const buildBody = (answer) =>
  JSON.stringify({ apikey: AI_DEVS_API_KEY, task: TASK_NAME, answer });

/**
 * Wysyla jedna akcje do API railway, deterministycznie obslugujac limity i bledy 503.
 * - przed wysylka czeka, jesli limit jest aktywny (z poprzedniej odpowiedzi),
 * - 503: retry z wykladniczym backoffem + jitter (do MAX_503_RETRIES),
 * - 429 / wyczerpany limit: czeka do resetu i ponawia (z limitem prob).
 * Zwraca { ok, status, data, headers } lub rzuca z error.kind dla bledow konfiguracji/sieci.
 */
export const callRailway = async (answer, log = noopLogger) => {
  if (!AI_DEVS_API_KEY) {
    const error = new Error("Missing AI_DEVS_API_KEY in environment (.env).");
    error.kind = "config";
    throw error;
  }

  let retries503 = 0;
  let rateLimitRetries = 0;

  for (;;) {
    await waitForLimiter(log);

    log.info("railway.request", { answer });

    let response;
    try {
      response = await fetch(VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: buildBody(answer)
      });
    } catch {
      const error = new Error("Network error reaching the railway API.");
      error.kind = "network";
      throw error;
    }

    const headerInfo = collectHeaders(response.headers);
    updateLimiter(response.status, headerInfo);

    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }

    log.info("railway.response", { status: response.status, headers: headerInfo });
    log.debug("railway.response.data", { status: response.status, data });

    // 503 - celowa symulacja przeciazenia. Backoff wykladniczy + jitter, bez udzialu LLM.
    if (response.status === 503) {
      if (retries503 >= MAX_503_RETRIES) {
        log.warn("railway.503.exhausted", { retries: retries503 });
        return { ok: false, status: 503, data, headers: headerInfo, retriesExhausted: true };
      }
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** retries503, MAX_BACKOFF_MS);
      const jitter = Math.floor(Math.random() * BASE_BACKOFF_MS);
      const delay = backoff + jitter;
      retries503 += 1;
      log.info("railway.503.retry", { attempt: retries503, delay });
      await sleep(delay);
      continue;
    }

    // 429 - twardy rate limit. Czekamy do resetu (ustawionego w updateLimiter) i ponawiamy.
    if (response.status === 429) {
      if (rateLimitRetries >= MAX_503_RETRIES) {
        log.warn("railway.429.exhausted", { retries: rateLimitRetries });
        return { ok: false, status: 429, data, headers: headerInfo, retriesExhausted: true };
      }
      rateLimitRetries += 1;
      log.info("railway.429.retry", { attempt: rateLimitRetries });
      continue;
    }

    return { ok: response.ok, status: response.status, data, headers: headerInfo };
  }
};
