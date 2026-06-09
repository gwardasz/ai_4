import { AI_DEVS_API_KEY, ZMAIL_URL, MAX_HTTP_RETRIES, BASE_BACKOFF_MS, MAX_BACKOFF_MS, MAX_RATE_LIMIT_WAIT_MS } from "../config.js";
import { noopLogger, redact } from "../utils/logger.js";

const sleep = (ms) => new Promise((done) => setTimeout(done, Math.max(0, ms)));

const parseRetryAfter = (headers) => {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return asNumber * 1000;
  const asDate = Date.parse(raw);
  return Number.isNaN(asDate) ? null : asDate - Date.now();
};

export const zmailRequest = async (payload, log = noopLogger) => {
  const body = { apikey: AI_DEVS_API_KEY, ...payload };
  log.info("zmail.request", {
    action: body.action,
    query: body.query,
    page: body.page,
    ids: body.ids,
    threadID: body.threadID
  });

  let retries = 0;

  for (;;) {
    let response;
    try {
      response = await fetch(ZMAIL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (err) {
      log.error("zmail.network", { action: body.action, message: err.message });
      throw new Error("Network error reaching zmail API.");
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
      log.info("zmail.retry", { action: body.action, status: response.status, attempt: retries, wait });
      await sleep(wait);
      continue;
    }

    const topLevelKeys =
      data && typeof data === "object" && !Array.isArray(data) ? Object.keys(data) : [];
    log.debug("zmail.response", {
      action: body.action,
      status: response.status,
      topLevelKeys,
      data: redact(data)
    });
    return { ok: response.ok, status: response.status, data };
  }
};

export const zmailHelp = (log) => zmailRequest({ action: "help", page: 1 }, log);
export const zmailSearch = (query, page = 1, perPage = 10, log) =>
  zmailRequest({ action: "search", query, page, perPage }, log);
export const zmailGetMessages = (ids, log) => zmailRequest({ action: "getMessages", ids }, log);
export const zmailGetThread = (threadID, log) => zmailRequest({ action: "getThread", threadID }, log);
