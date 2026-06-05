import { fetchItems, postVerify, resetCounter } from "../services/categorize-api.js";
import { validatePrompts } from "../utils/tokens.js";
import { PROMPT_TOKEN_LIMIT } from "../config.js";
import { noopLogger } from "../utils/logger.js";

const HUB_CONTEXT_MAX = 300;

const RECOVERY_HINTS = {
  validation: "Add the missing placeholders and retry.",
  token_limit: "Shorten the static prefix; item description counts toward 100 tokens.",
  no_flag: "Read hub responses in items[]. Refine the template and retry.",
  network: "Transient error — retry the cycle."
};

// Wykrywa flage {FLG:...} w dowolnym miejscu odpowiedzi serwisu.
const FLAG_RE = /\{\{?FLG:[^}]+\}?\}/i;
const findFlag = (value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const match = FLAG_RE.exec(text);
  return match ? match[0] : null;
};

const fillTemplate = (template, item) =>
  template.replaceAll("{id}", item.id).replaceAll("{description}", item.description);

// Surowa odpowiedz huba do analizy przez model; umiarkowany trim tylko po to, by nie zalac kontekstu.
// Pelna wersja trafia do logs/ przez logger (debug).
const toHubPayload = (data, max = HUB_CONTEXT_MAX) => {
  if (data === null || data === undefined) return data;
  if (typeof data === "string") {
    return data.length > max ? `${data.slice(0, max)}...` : data;
  }
  const text = JSON.stringify(data);
  if (text.length <= max) return data;
  return { _truncated: `${text.slice(0, max)}...` };
};

const buildResult = ({ success, outcome, message, recoveryHints, ...rest }) => {
  const payload = { success, outcome, message, ...rest };
  if (recoveryHints) payload.recoveryHints = recoveryHints;
  return payload;
};

/**
 * Fabryka handlerow z wstrzyknietym loggerem.
 * Odpowiedzi: outcome tylko z naszego harnessu; surowe hub w items[] — bez parsowania API huba.
 */
export const createHandlers = (log = noopLogger) => ({
  async run_classification_cycle({ promptTemplate }) {
    if (typeof promptTemplate !== "string" || !promptTemplate.trim()) {
      return buildResult({
        success: false,
        outcome: "validation",
        message: "promptTemplate must be a non-empty string.",
        recoveryHints: RECOVERY_HINTS.validation
      });
    }

    const missing = ["{id}", "{description}"].filter((ph) => !promptTemplate.includes(ph));
    if (missing.length > 0) {
      return buildResult({
        success: false,
        outcome: "validation",
        message: `Template is missing placeholder(s): ${missing.join(", ")}.`,
        recoveryHints: RECOVERY_HINTS.validation
      });
    }

    let items;
    try {
      items = await fetchItems(log);
    } catch (error) {
      const outcome = error.kind === "config" ? "config" : "network";
      return buildResult({
        success: false,
        outcome,
        abort: error.kind === "config",
        message: `Could not download the cargo CSV: ${error.message}`,
        recoveryHints: error.kind === "config" ? undefined : RECOVERY_HINTS.network
      });
    }

    const filled = items.map((item) => ({ id: item.id, prompt: fillTemplate(promptTemplate, item) }));
    const tokenReport = validatePrompts(filled, PROMPT_TOKEN_LIMIT);

    if (!tokenReport.allWithinLimit) {
      const offenders = tokenReport.perItem.filter((entry) => !entry.withinLimit);
      log.warn("categorize.tokens.over", { limit: PROMPT_TOKEN_LIMIT, max: tokenReport.maxTokens, offenders });
      return buildResult({
        success: false,
        outcome: "token_limit",
        tokenLimit: PROMPT_TOKEN_LIMIT,
        maxTokens: tokenReport.maxTokens,
        offenders,
        promptTemplate,
        message:
          `Filled prompt exceeds ${PROMPT_TOKEN_LIMIT} tokens for ${offenders.length} item(s) ` +
          `(longest: ${tokenReport.maxTokens}). Nothing was sent.`,
        recoveryHints: RECOVERY_HINTS.token_limit
      });
    }

    try {
      await resetCounter(log);
    } catch (error) {
      return buildResult({
        success: false,
        outcome: "network",
        message: `Budget reset failed: ${error.message}`,
        recoveryHints: RECOVERY_HINTS.network
      });
    }

    const cycleItems = [];
    let flag = null;

    for (const item of items) {
      const tokens = tokenReport.perItem.find((entry) => entry.id === item.id)?.tokens ?? null;

      let res;
      try {
        res = await postVerify(fillTemplate(promptTemplate, item), log);
      } catch (error) {
        cycleItems.push({ id: item.id, tokens, error: error.message });
        continue;
      }

      log.debug("categorize.hub.raw", { id: item.id, data: res.data });
      cycleItems.push({ id: item.id, tokens, hub: toHubPayload(res.data) });

      flag = findFlag(res.data);
      if (flag) break;
    }

    log.info("categorize.cycle", {
      items: items.length,
      sent: cycleItems.length,
      maxTokens: tokenReport.maxTokens,
      flag: Boolean(flag)
    });

    if (flag) {
      return buildResult({
        success: true,
        outcome: "solved",
        flag,
        maxTokens: tokenReport.maxTokens,
        itemCount: items.length,
        promptTemplate,
        items: cycleItems,
        message: "Flag captured."
      });
    }

    return buildResult({
      success: false,
      outcome: "no_flag",
      maxTokens: tokenReport.maxTokens,
      itemCount: items.length,
      promptTemplate,
      items: cycleItems,
      message: "Cycle finished without flag. Read hub responses in items.",
      recoveryHints: RECOVERY_HINTS.no_flag
    });
  }
});
