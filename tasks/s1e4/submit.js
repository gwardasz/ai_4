import { readFile } from "node:fs/promises";
import { submitDeclaration } from "./src/services/verify-api.js";

// Reczny fallback wysylki: tresc deklaracji z pliku (argument CLI) lub ze STDIN.
// Uzycie: node submit.js <sciezka-do-pliku-z-deklaracja>
const file = process.argv[2];

const readStdin = async () => {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
};

const declaration = file ? await readFile(file, "utf-8") : await readStdin();

if (!declaration.trim()) {
  console.error("Brak tresci deklaracji. Podaj plik: node submit.js <plik> (albo przekaz przez STDIN).");
  process.exit(1);
}

console.log("Wysyłam deklarację do /verify...\n");
const { ok, status, data } = await submitDeclaration(declaration);
console.log(`Status: ${status} (${ok ? "ok" : "rejected"})`);
console.log(JSON.stringify(data, null, 2));
