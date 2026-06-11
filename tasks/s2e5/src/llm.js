import { AI_API_KEY, EXTRA_API_HEADERS, RESPONSES_API_ENDPOINT } from "../../../config.js";
import {
  MAX_HTTP_RETRIES,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_RATE_LIMIT_WAIT_MS
} from "./config.js";
import { noopLogger } from "./utils/logger.js";

const sleep = (ms) => new Promise((done) => setTimeout(done, Math.max(0, ms)));

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const parseRetryAfter = (headers) => {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return asNumber * 1000;
  const asDate = Date.parse(raw);
  return Number.isNaN(asDate) ? null : asDate - Date.now();
};

const isRetryable = (status, message) => {
  if (status >= 400 && status < 500 && status !== 429) return false;
  if (RETRYABLE_STATUSES.has(status)) return true;
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("provider returned error") ||
    lower.includes("overloaded") ||
    lower.includes("rate limit") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("timeout")
  );
};

const backoffWait = (retries, headers) => {
  const backoff = Math.min(BASE_BACKOFF_MS * 2 ** retries, MAX_BACKOFF_MS);
  const jitter = Math.floor(Math.random() * BASE_BACKOFF_MS);
  const retryAfter = parseRetryAfter(headers);
  return Math.min(retryAfter ?? backoff + jitter, MAX_RATE_LIMIT_WAIT_MS);
};

export const chat = async ({
  model,
  input,
  tools,
  instructions,
  maxOutputTokens,
  toolChoice = "auto",
  log = noopLogger
}) => {
  const body = { model, input };

  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }

  if (instructions) {
    body.instructions = instructions;
  }

  if (maxOutputTokens) {
    body.max_output_tokens = maxOutputTokens;
  }

  let retries = 0;

  for (;;) {
    let response;
    try {
      response = await fetch(RESPONSES_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_API_KEY}`,
          ...EXTRA_API_HEADERS
        },
        body: JSON.stringify(body)
      });
    } catch (err) {
      if (retries < MAX_HTTP_RETRIES) {
        const wait = backoffWait(retries, null);
        retries += 1;
        log.info("llm.retry", { reason: "network", attempt: retries, wait, message: err.message });
        await sleep(wait);
        continue;
      }
      throw new Error(`Network error reaching LLM API: ${err.message}`);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      if (retries < MAX_HTTP_RETRIES && isRetryable(response.status)) {
        const wait = backoffWait(retries, response.headers);
        retries += 1;
        log.info("llm.retry", {
          reason: "invalid_json",
          attempt: retries,
          status: response.status,
          wait
        });
        await sleep(wait);
        continue;
      }
      throw new Error(`Invalid JSON from LLM API (status ${response.status})`);
    }

    if (!response.ok || data.error) {
      let message = data?.error?.message ?? `Request failed with status ${response.status}`;
      const raw = data?.error?.metadata?.raw;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const providerMessage = parsed?.error?.message;
          if (providerMessage) message = providerMessage;
        } catch {
          // keep outer message
        }
      }
      if (isRetryable(response.status, message) && retries < MAX_HTTP_RETRIES) {
        const wait = backoffWait(retries, response.headers);
        retries += 1;
        log.info("llm.retry", { attempt: retries, status: response.status, wait, message });
        await sleep(wait);
        continue;
      }
      log.error("llm.error", { status: response.status, model: body.model, message });
      throw new Error(message);
    }

    return data;
  }
};

export const extractToolCalls = (response) =>
  (response.output ?? []).filter((item) => item.type === "function_call");

export const extractText = (response) => {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const message = (response.output ?? []).find((item) => item.type === "message");
  return message?.content?.find((part) => part.type === "output_text")?.text ?? null;
};
