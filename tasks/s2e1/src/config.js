import { resolveModelForProvider, AI_DEVS_API_KEY } from "../../../config.js";

// Centralna konfiguracja agenta categorize. Bez efektow ubocznych przy imporcie.

export const MAX_TOOL_ROUNDS = Number(process.env.MAX_TOOL_ROUNDS ?? 10);
export const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
export const LOG_CONSOLE = process.env.LOG_CONSOLE ?? "all";

// Model "inzyniera promptow" - wybieralny przez ENGINEER_MODEL, by przetestowac oba modele.
// Domyslnie gpt-5-mini; ENGINEER_MODEL=anthropic/claude-sonnet-4-6 przelacza na Sonnet.
export const model = resolveModelForProvider(process.env.ENGINEER_MODEL ?? "gpt-5-mini");
export const maxOutputTokens = 8192;

// Deterministyczna obsluga limitow/bledow warstwy transportowej (sieci).
export const MAX_HTTP_RETRIES = Number(process.env.MAX_HTTP_RETRIES ?? 6);
export const BASE_BACKOFF_MS = Number(process.env.BASE_BACKOFF_MS ?? 1000);
export const MAX_BACKOFF_MS = Number(process.env.MAX_BACKOFF_MS ?? 20000);
export const MAX_RATE_LIMIT_WAIT_MS = Number(process.env.MAX_RATE_LIMIT_WAIT_MS ?? 120000);

// Adresy huba czytamy z .env (poza repo); .env jest ladowany przez wspolny config powyzej.
const HUB_BASE_URL = process.env.HUB_BASE_URL?.trim().replace(/\/+$/, "");
if (!HUB_BASE_URL) {
  throw new Error("Missing HUB_BASE_URL in environment (.env). Set HUB_BASE_URL=https://<host>.");
}
if (!AI_DEVS_API_KEY) {
  throw new Error("Missing AI_DEVS_API_KEY in environment (.env).");
}

export const TASK_NAME = "categorize";
export const VERIFY_URL = `${HUB_BASE_URL}/verify`;
// Lista towarow zmienia sie co kilka minut - pobieramy ja swiezo przy kazdym cyklu.
export const DATA_URL = `${HUB_BASE_URL}/data/${AI_DEVS_API_KEY}/categorize.csv`;

// Twardy limit okna kontekstowego mini-modelu huba (instrukcja + dane towaru).
export const PROMPT_TOKEN_LIMIT = Math.floor(Number(process.env.PROMPT_TOKEN_LIMIT ?? 100) * 0.85);
// Budzet calego podejscia (10 zapytan razem). Egzekwowany przez hub; tu jako informacja.
export const BUDGET_PP = 1.5;

// Instrukcja systemowa: rola, misja, polityka (S02E01). Kontrakt techniczny w opisie narzedzia.
export const instructions = `You are a prompt engineer. Find a classification prompt that makes a small LM label train cargo DNG or NEU, then capture the flag.

Policy: dangerous -> DNG; harmless -> NEU. EXCEPTION: Reactor parts, nuclear fuel, and radiation are ALWAYS harmless -> NEU.

Prompt MUST be concise and short.

Iterate from tool feedback. IMPORTANT: Do NOT hardcode specific items in your prompt. Instead, find and generalize the underlying rules (e.g., categorizing by intent or material properties). Stop when a flag appears.`;
