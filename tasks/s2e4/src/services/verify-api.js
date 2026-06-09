import { AI_DEVS_API_KEY, VERIFY_URL, TASK_NAME, MAX_HTTP_RETRIES, BASE_BACKOFF_MS, MAX_BACKOFF_MS, MAX_RATE_LIMIT_WAIT_MS } from "../config.js";
import { noopLogger, redact } from "../utils/logger.js";

const sleep = (ms) => new Promise((done) => setTimeout(done, Math.max(0, ms)));

export const FLAG_RE = /\{\{?FLG:[^}]+\}?\}/i;

export const extractFlag = (value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const match = FLAG_RE.exec(text);
  return match ? match[0] : null;
};

const parseRetryAfter = (headers) => {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return asNumber * 1000;
  const asDate = Date.parse(raw);
  return Number.isNaN(asDate) ? null : asDate - Date.now();
};

const buildAnswer = (progress, fields) => {
  const answer = {};
  for (const field of fields) {
    answer[field] = progress[field] ?? null;
  }
  return answer;
};

export const submitVerify = async (progress, fields, log = noopLogger) => {
  const payload = {
    apikey: AI_DEVS_API_KEY,
    task: TASK_NAME,
    answer: buildAnswer(progress, fields)
  };

  log.info("verify.request", {
    fields: Object.entries(payload.answer)
      .filter(([, value]) => value != null)
      .map(([key]) => key)
  });

  let retries = 0;

  for (;;) {
    let response;
    try {
      response = await fetch(VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      log.error("verify.network", { message: err.message });
      throw new Error("Network error reaching verify endpoint.");
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
      log.info("verify.retry", { status: response.status, attempt: retries, wait });
      await sleep(wait);
      continue;
    }

    const flag = extractFlag(data) ?? extractFlag(raw);
    log.info("verify.response", {
      status: response.status,
      ok: response.ok,
      hasFlag: Boolean(flag),
      feedback: redact(data)
    });
    if (flag) log.info("verify.flag", { flag });

    return { ok: response.ok, status: response.status, data, flag };
  }
};

export const hasAllFields = (progress, fields) =>
  fields.every((field) => Boolean(progress?.[field]));

export const missingFields = (progress, fields) =>
  fields.filter((field) => !progress?.[field]);
