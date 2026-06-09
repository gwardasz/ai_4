import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "../state/store.js";
import { noopLogger } from "../utils/logger.js";

/** @type {Map<string, object>} */
const sessions = new Map();

/** @type {object[]} */
const deferred = [];

export const createSessionId = () => randomUUID();

export const suspendSession = (sessionId, payload, log = noopLogger) => {
  const entry = { sessionId, status: "waiting", suspendedAt: new Date().toISOString(), ...payload };
  sessions.set(sessionId, entry);
  deferred.push(entry);
  log.info("session.suspended", { sessionId, agent: payload.agentName, question: payload.question?.slice(0, 120) });
  return entry;
};

export const resumeSession = (sessionId, reply) => {
  const entry = sessions.get(sessionId);
  if (!entry || entry.status !== "waiting") return null;
  entry.status = "ready";
  entry.reply = reply;
  entry.resumedAt = new Date().toISOString();
  return entry;
};

export const consumeSession = (sessionId) => {
  const entry = sessions.get(sessionId);
  if (!entry || entry.status !== "ready") return null;
  sessions.delete(sessionId);
  const idx = deferred.findIndex((s) => s.sessionId === sessionId);
  if (idx >= 0) deferred.splice(idx, 1);
  return entry;
};

export const getDeferredSessions = () => [...deferred];

export const markSessionDeferred = (sessionId, log = noopLogger) => {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  entry.status = "deferred";
  log.warn("session.deferred", { sessionId, agent: entry.agentName });
};

export const appendInboxMessage = async ({ from, content, sessionId }, log = noopLogger) => {
  const inbox = await readJson("messages/inbox.json", { messages: [] });
  inbox.messages.push({
    from,
    content,
    sessionId,
    at: new Date().toISOString()
  });
  await writeJson("messages/inbox.json", inbox);
  log.info("message.sent", { from, sessionId });
};

export const createMessageHandler = (agentName, log = noopLogger) => {
  return async ({ content, sessionId }) => {
    if (!content?.trim()) {
      return { success: false, message: "content is required." };
    }

    const id = sessionId ?? createSessionId();
    await appendInboxMessage({ from: agentName, content, sessionId: id }, log);

    return {
      success: true,
      waiting: true,
      sessionId: id,
      message: "Message sent to orchestrator. Agent suspended until reply_to_agent is called.",
      question: content
    };
  };
};
