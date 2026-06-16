import http from "node:http";
import { loadData } from "./lib/data.js";
import { clampOutput, findCitiesAll, findItem } from "./lib/search.js";

const PORT = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT, 10) : 3000;
const data = loadData();

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

const sendJSON = (res, statusCode, output) => {
  const text = clampOutput(String(output));
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ output: text }));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method !== "POST") {
    return sendJSON(res, 405, "Metoda niedozwolona. Uzyj POST.");
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    return sendJSON(res, 400, "Blad: nieprawidlowy JSON");
  }

  const params = typeof payload?.params === "string" ? payload.params.trim() : "";
  if (!params) {
    return sendJSON(res, 400, "Blad: brak pola params (tekst)");
  }

  console.log(`[${url.pathname}] params=${params}`);

  if (url.pathname === "/api/find_item") {
    return sendJSON(res, 200, findItem(params, data));
  }

  if (url.pathname === "/api/find_cities_all") {
    return sendJSON(res, 200, findCitiesAll(params, data));
  }

  return sendJSON(res, 404, "Nie znaleziono narzedzia");
});

server.listen(PORT, () => {
  console.log(`Serwer nasluchuje na http://localhost:${PORT}`);
  console.log(`  POST /api/find_item`);
  console.log(`  POST /api/find_cities_all`);
  console.log(`Zaladowano ${data.items.length} przedmiotow, ${data.cityByCode.size} miast`);
});
