import { resolve } from "node:path";
import { resolveModelForProvider, AI_DEVS_API_KEY } from "../../../config.js";

export const MAX_TOOL_ROUNDS = Number(process.env.MAX_TOOL_ROUNDS ?? 12);
export const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
export const LOG_CONSOLE = process.env.LOG_CONSOLE ?? "all";

export const agentModel = resolveModelForProvider(process.env.AGENT_MODEL ?? "gpt-5-mini");
export const visionModel = resolveModelForProvider(
  process.env.VISION_MODEL ?? "google/gemini-3-flash-preview"
);
export const maxOutputTokens = 8192;

export const MAX_HTTP_RETRIES = Number(process.env.MAX_HTTP_RETRIES ?? 6);
export const BASE_BACKOFF_MS = Number(process.env.BASE_BACKOFF_MS ?? 1000);
export const MAX_BACKOFF_MS = Number(process.env.MAX_BACKOFF_MS ?? 20000);
export const MAX_RATE_LIMIT_WAIT_MS = Number(process.env.MAX_RATE_LIMIT_WAIT_MS ?? 120000);

export const HUB_BASE_URL = process.env.HUB_BASE_URL?.trim().replace(/\/+$/, "");
if (!HUB_BASE_URL) {
  throw new Error("Missing HUB_BASE_URL in environment (.env). Set HUB_BASE_URL=https://<host>.");
}
if (!AI_DEVS_API_KEY) {
  throw new Error("Missing AI_DEVS_API_KEY in environment (.env).");
}

export const TASK_NAME = "drone";
export const POWER_PLANT_ID = "PWR6132PL";
export const VERIFY_URL = `${HUB_BASE_URL}/verify`;
export const MAP_IMAGE_URL = `${HUB_BASE_URL}/data/${AI_DEVS_API_KEY}/drone.png`;
export const DOCS_URL = `${HUB_BASE_URL}/dane/drone.html`;

export const WORKSPACE_ROOT = resolve(import.meta.dirname, "..", "workspace");
export const AGENTS_ROOT = resolve(WORKSPACE_ROOT, "agents");
export const PROBE_DIR = resolve(WORKSPACE_ROOT, "probe");
export const DOCS_CACHE_PATH = resolve(WORKSPACE_ROOT, "docs", "drone.html");
export const MAP_ANALYSIS_PATH = resolve(PROBE_DIR, "map-analysis.json");

export const START_TRIGGER = "Begin mission planning.";
