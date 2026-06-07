import { AI_DEVS_API_KEY } from "../../../../config.js";
import {
  VERIFY_URL,
  TASK_NAME,
  BOARD_IMAGE_URL,
  MAX_HTTP_RETRIES,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_RATE_LIMIT_WAIT_MS
} from "../config.js";
import { noopLogger } from "../utils/logger.js";

const sleep = (ms) => new Promise((done) => setTimeout(done, Math.max(0, ms)));

const parseRetryAfter = (headers) => {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return asNumber * 1000;
  const asDate = Date.parse(raw);
  return Number.isNaN(asDate) ? null : asDate - Date.now();
};

export const fetchBoardPng = async (log = noopLogger) => {
  log.info("electricity.png.fetch", { url: "board image" });

  let response;
  try {
    response = await fetch(BOARD_IMAGE_URL);
  } catch {
    const error = new Error("Network error downloading the board PNG.");
    error.kind = "network";
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`Failed to download board PNG (status ${response.status}).`);
    error.kind = response.status === 404 ? "config" : "network";
    throw error;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  log.info("electricity.png.fetched", { bytes: buffer.length });
  return buffer;
};

const buildRotateBody = (cell) =>
  JSON.stringify({ apikey: AI_DEVS_API_KEY, task: TASK_NAME, answer: { rotate: cell } });

export const postRotate = async (cell, log = noopLogger) => {
  let retries = 0;

  for (;;) {
    let response;
    try {
      response = await fetch(VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: buildRotateBody(cell)
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
      log.info("electricity.retry", { status: response.status, attempt: retries, wait });
      await sleep(wait);
      continue;
    }

    log.debug("electricity.rotate.response", { status: response.status, cell, data });
    return { ok: response.ok, status: response.status, data };
  }
};
