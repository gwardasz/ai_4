import { createHash } from "node:crypto";
import { zmailHelp, zmailSearch, zmailGetMessages } from "../../services/zmail-api.js";
import {
  extractMailId,
  normalizeMessages,
  pickMailBody,
  buildSavedMail,
  isMailRecord
} from "../../services/zmail-parse.js";
import { readJson, writeJson, mailFilePath } from "../../state/store.js";
import { MAX_SEARCHES_PER_CYCLE } from "../../config.js";

const buildResult = ({ success, message, ...rest }) => {
  const payload = { success, ...rest };
  if (message) payload.message = message;
  return payload;
};

const hashQuery = (query) => createHash("sha256").update(query).digest("hex").slice(0, 16);

const getFetchedRegistry = () => readJson("state/fetched-mail-ids.json", { mails: {}, searches: [] });

const saveFetchedRegistry = (registry) => writeJson("state/fetched-mail-ids.json", registry);

const saveMailRecord = async (log, { id, query, metadata, body, fetchedAt }) => {
  const picked = pickMailBody(Array.isArray(body) ? body : body ? [body] : [], metadata);
  if (!picked) {
    log.warn("zmail.parse.invalid_body", { mailId: id, reason: "no_mail_record" });
    return null;
  }
  if (body != null && !isMailRecord(body)) {
    log.warn("zmail.parse.invalid_body", { mailId: id, reason: "body_not_object", fallback: "metadata_or_hit" });
  }
  const saved = buildSavedMail({ id, query, metadata, body: picked, fetchedAt });
  await writeJson(mailFilePath(id), saved);
  return saved;
};

export const createZmailHandlers = (log, { cycle = 0 } = {}) => ({
  async zmail_help() {
    const cached = await readJson("docs/zmail-help.json", null);
    if (cached?.cachedAt) {
      return buildResult({ success: true, cached: true, help: cached.data });
    }

    const { ok, status, data } = await zmailHelp(log);
    if (!ok) {
      return buildResult({ success: false, message: `zmail help failed (${status})`, data });
    }

    await writeJson("docs/zmail-help.json", { cachedAt: new Date().toISOString(), data });
    return buildResult({ success: true, cached: false, help: data });
  },

  async zmail_search({ query, page = 1, perPage = 10, fetchBodies = true }) {
    if (typeof query !== "string" || !query.trim()) {
      return buildResult({ success: false, message: "query is required." });
    }

    const registry = await getFetchedRegistry();
    const queryHash = hashQuery(`${query}|p${page}|pp${perPage}`);

    const cycleSearches = registry.searches.filter((s) => s.cycle === cycle);
    const alreadySearched = registry.searches.some((s) => s.hash === queryHash);

    if (alreadySearched) {
      log.warn("tool.guard", { agent: "zmail", reason: "search_already_run", query, queryHash });
      const cachedIds = registry.searches
        .filter((s) => s.hash === queryHash)
        .flatMap((s) => s.mailIds ?? []);
      return buildResult({
        success: true,
        cached: true,
        query,
        mailIds: cachedIds,
        message: "This exact search was already executed. Use cached mail IDs or try a different query."
      });
    }

    if (cycleSearches.length >= MAX_SEARCHES_PER_CYCLE) {
      log.warn("tool.guard", { agent: "zmail", reason: "search_limit_reached", cycle });
      return buildResult({
        success: false,
        message: `Search limit (${MAX_SEARCHES_PER_CYCLE}) reached for this cycle. Wait for next cycle.`
      });
    }

    const { ok, status, data } = await zmailSearch(query, page, perPage, log);
    if (!ok) {
      return buildResult({ success: false, message: `zmail search failed (${status})`, data });
    }

    const hits = normalizeMessages(data);
    const mailIds = [];

    for (const hit of hits) {
      const id = extractMailId(hit);
      if (!id) continue;
      mailIds.push(String(id));

      if (registry.mails[String(id)]?.status === "fetched") {
        log.warn("tool.guard", { agent: "zmail", reason: "mail_already_fetched", mailId: id });
        continue;
      }

      if (fetchBodies) {
        const full = await zmailGetMessages(id, log);
        const messages = normalizeMessages(full.data);
        const body = pickMailBody(messages, hit);
        if (!body) {
          log.warn("zmail.parse.invalid_body", { mailId: id, reason: "fetch_empty", action: "skip_save" });
          continue;
        }
        await saveMailRecord(log, {
          id,
          query,
          metadata: hit,
          body,
          fetchedAt: new Date().toISOString()
        });
        registry.mails[String(id)] = { status: "fetched", fetchedAt: new Date().toISOString(), query };
      } else {
        registry.mails[String(id)] = { status: "listed", listedAt: new Date().toISOString(), query };
      }
    }

    if (mailIds.length === 0) {
      registry.searches.push({
        hash: queryHash,
        query,
        page,
        perPage,
        cycle,
        status: "no_data",
        at: new Date().toISOString(),
        mailIds: []
      });
      await saveFetchedRegistry(registry);
      return buildResult({
        success: true,
        query,
        mailIds: [],
        status: "no_data",
        message: "No messages found. Mailbox is active — retry in a later cycle."
      });
    }

    registry.searches.push({
      hash: queryHash,
      query,
      page,
      perPage,
      cycle,
      status: "found",
      at: new Date().toISOString(),
      mailIds
    });
    await saveFetchedRegistry(registry);

    return buildResult({
      success: true,
      query,
      mailIds,
      count: mailIds.length,
      message: `Found and saved ${mailIds.length} message(s) to workspace/mails/.`
    });
  },

  async zmail_get_message({ id }) {
    if (id == null) {
      return buildResult({ success: false, message: "id is required (rowID or messageID)." });
    }

    const mailId = String(id);
    const registry = await getFetchedRegistry();

    if (registry.mails[mailId]?.status === "fetched") {
      log.warn("tool.guard", { agent: "zmail", reason: "mail_already_fetched", mailId });
      const cached = await readJson(mailFilePath(mailId), null);
      return buildResult({
        success: true,
        cached: true,
        id: mailId,
        mail: cached,
        message: "Returning cached message from workspace."
      });
    }

    const { ok, status, data } = await zmailGetMessages(mailId, log);
    if (!ok) {
      return buildResult({ success: false, message: `getMessages failed (${status})`, data });
    }

    const messages = normalizeMessages(data);
    const body = pickMailBody(messages);
    if (!body) {
      return buildResult({
        success: false,
        message: "getMessages returned no parseable mail record.",
        data
      });
    }

    const saved = await saveMailRecord(log, {
      id: mailId,
      body,
      fetchedAt: new Date().toISOString()
    });
    if (!saved) {
      return buildResult({ success: false, message: "Failed to save mail — invalid body.", data });
    }

    registry.mails[mailId] = { status: "fetched", fetchedAt: new Date().toISOString() };
    await saveFetchedRegistry(registry);

    return buildResult({ success: true, cached: false, id: mailId, mail: saved });
  }
});
