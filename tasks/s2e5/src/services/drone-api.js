import { dirname } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { AI_DEVS_API_KEY } from "../../../../config.js";
import {
  VERIFY_URL,
  TASK_NAME,
  DOCS_URL,
  DOCS_CACHE_PATH,
  MAX_HTTP_RETRIES,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_RATE_LIMIT_WAIT_MS
} from "../config.js";
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

export const htmlToPlainText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

export const buildVerifyPayload = (instructions) => ({
  apikey: AI_DEVS_API_KEY,
  task: TASK_NAME,
  answer: { instructions }
});

export const submitInstructions = async (instructions, log = noopLogger) => {
  if (!Array.isArray(instructions) || instructions.length === 0) {
    throw new Error("instructions must be a non-empty array.");
  }

  const payload = buildVerifyPayload(instructions);

  log.info("verify.request", { count: instructions.length, preview: instructions.slice(0, 5) });

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

    return { ok: response.ok, status: response.status, data, raw, flag };
  }
};

export const fetchDroneDocs = async (log = noopLogger) => {
  log.info("docs.fetch", { url: DOCS_URL });

  const response = await fetch(DOCS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch drone docs (${response.status}).`);
  }

  const html = await response.text();
  await mkdir(dirname(DOCS_CACHE_PATH), { recursive: true });
  await writeFile(DOCS_CACHE_PATH, html, "utf-8");

  const text = htmlToPlainText(html);
  log.info("docs.cached", { path: DOCS_CACHE_PATH, length: text.length });

  return { html, text, cachedAt: new Date().toISOString(), path: DOCS_CACHE_PATH };
};

export const loadCachedDocs = async () => {
  const html = await readFile(DOCS_CACHE_PATH, "utf-8");
  return { html, text: htmlToPlainText(html), path: DOCS_CACHE_PATH };
};
