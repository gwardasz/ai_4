import { resolveModelForProvider } from "../../../config.js";

// Centralna konfiguracja agenta railway. Bez efektow ubocznych przy imporcie.

export const MAX_TOOL_ROUNDS = Number(process.env.MAX_TOOL_ROUNDS ?? 25);
export const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
export const LOG_CONSOLE = process.env.LOG_CONSOLE ?? "all";

export const model = resolveModelForProvider("gpt-5-mini");  // gpt-5.2
export const maxOutputTokens = 8192;

// Parametry deterministycznej obslugi limitow i bledow 503 (warstwa transportowa).
export const MAX_503_RETRIES = Number(process.env.MAX_503_RETRIES ?? 8);
export const BASE_BACKOFF_MS = Number(process.env.BASE_BACKOFF_MS ?? 1000);
export const MAX_BACKOFF_MS = Number(process.env.MAX_BACKOFF_MS ?? 30000);
// Maksymalny czas pojedynczego oczekiwania na reset limitu (zabezpieczenie przed zawieszeniem).
export const MAX_RATE_LIMIT_WAIT_MS = Number(process.env.MAX_RATE_LIMIT_WAIT_MS ?? 120000);

// Adres huba czytamy z .env (poza repo); .env jest ladowany przez wspolny config powyzej.
const HUB_BASE_URL = process.env.HUB_BASE_URL?.trim().replace(/\/+$/, "");
if (!HUB_BASE_URL) {
  throw new Error("Missing HUB_BASE_URL in environment (.env). Set HUB_BASE_URL=https://<host>.");
}

export const VERIFY_URL = `${HUB_BASE_URL}/verify`;
export const TASK_NAME = "railway";

export const instructions = `You are an agent tasked with ACTIVATING the railway route "X-01" using the "railway_api" tool.
## INSTRUCTIONS
1. START by calling {"action":"help"}. The API is self-documenting and will return the required steps and parameters.
2. Follow the documentation strictly step-by-step. NEVER guess or invent action names, parameters, or values.
3. Make each call count. Do not make redundant or exploratory calls.
4. If the API returns a logical error (e.g., wrong parameter, bad order), read the message carefully, fix the specific payload, and call again. Do not repeat failed calls without changes.
5. Your task is complete when the API returns a flag in the format {FLG:...}. Report the flag and stop.`;
