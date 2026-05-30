import http from "node:http";
import { randomUUID } from "node:crypto";
import * as store from "./session/store.js";
import { run } from "./agent.js";
import { noopLogger } from "./utils/logger.js";

// Serializacja per sessionID - rownolegle requesty tej samej sesji nie nadpisuja sobie pliku.
const chains = new Map();
const serialize = (key, task) => {
  const prev = chains.get(key) ?? Promise.resolve();
  const result = prev.then(task, task);
  chains.set(key, result.catch(() => {}));
  return result;
};

const readBody = async (req) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
};

// Cienka warstwa transportowa: parse + walidacja + delegacja do agenta + odpowiedz.
// Zero logiki domenowej, zero wiedzy o LLM.
export const createServer = (config, logger = noopLogger) =>
  http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const requestId = randomUUID().slice(0, 8);

    const send = (log, status, payload, reason) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
      if (reason) {
        log.warn("request.rejected", { status, reason });
      } else {
        log.info("request.responded", { status, latencyMs: Date.now() - startedAt });
      }
    };

    if (req.method !== "POST") {
      return send(logger.child({ requestId }), 405, { error: "Method not allowed" }, "method_not_allowed");
    }

    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      return send(logger.child({ requestId }), 400, { error: "Invalid JSON" }, "invalid_json");
    }

    const { sessionID, msg } = payload ?? {};
    if (!sessionID || typeof msg !== "string") {
      return send(logger.child({ requestId }), 400, { error: "Expected sessionID and msg" }, "validation");
    }

    const log = logger.child({ requestId, sessionID });
    log.info("request.received", { msg, msgLength: msg.length });

    try {
      const reply = await serialize(sessionID, async () => {
        const history = await store.load(sessionID);
        const result = await run(history, msg, config, log);
        await store.save(sessionID, result.history);
        return result.reply;
      });

      return send(log, 200, { msg: reply });
    } catch (error) {
      log.error("request.error", { message: error.message });
      // Naturalna odpowiedz - operator nie moze sie zorientowac, ze cos sie zepsulo.
      return send(log, 200, { msg: "Chwila, mam tu drobny problem z systemem. Mozesz powtorzyc prosbe?" });
    }
  });
