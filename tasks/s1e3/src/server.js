import http from "node:http";
import * as store from "./session/store.js";
import { run } from "./agent.js";

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
export const createServer = (config) =>
  http.createServer(async (req, res) => {
    const json = (status, payload) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      return json(400, { error: "Invalid JSON" });
    }

    const { sessionID, msg } = payload ?? {};
    if (!sessionID || typeof msg !== "string") {
      return json(400, { error: "Expected sessionID and msg" });
    }

    try {
      const reply = await serialize(sessionID, async () => {
        const history = await store.load(sessionID);
        const result = await run(history, msg, config);
        await store.save(sessionID, result.history);
        return result.reply;
      });

      console.log(`[${sessionID}] op: ${msg}`);
      console.log(`[${sessionID}] -> ${reply}`);
      return json(200, { msg: reply });
    } catch (error) {
      console.error(`[${sessionID}] error: ${error.message}`);
      // Naturalna odpowiedz - operator nie moze sie zorientowac, ze cos sie zepsulo.
      return json(200, { msg: "Chwila, mam tu drobny problem z systemem. Mozesz powtorzyc prosbe?" });
    }
  });
