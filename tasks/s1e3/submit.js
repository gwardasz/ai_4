import { AI_DEVS_API_KEY } from "../../config.js";

const publicUrl = process.argv[2] ?? process.env.PUBLIC_URL;
const sessionID = process.argv[3] ?? `s1e3-${Date.now()}`;

if (!AI_DEVS_API_KEY) {
  console.error("Brak AI_DEVS_API_KEY w .env");
  process.exit(1);
}

if (!publicUrl) {
  console.error("Użycie: node submit.js <public-url> [sessionID]");
  console.error("Lub ustaw PUBLIC_URL w .env");
  process.exit(1);
}

const payload = {
  apikey: AI_DEVS_API_KEY,
  task: "proxy",
  answer: {
    url: publicUrl,
    sessionID
  }
};

console.log("Wysyłam do hub.ag3nts.org/verify...\n", JSON.stringify(payload, null, 2));

const response = await fetch("https://hub.ag3nts.org/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});

const result = await response.text();
console.log("\nOdpowiedź serwera:\n", result);
