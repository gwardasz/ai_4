import { resolve, join } from "node:path";
import { resolveModelForProvider, AI_DEVS_API_KEY } from "../../../config.js";

export const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
export const LOG_CONSOLE = process.env.LOG_CONSOLE ?? "all";

export const MAX_TURNS = Number(process.env.MAX_TURNS ?? 12);
export const MAX_DEPTH = Number(process.env.MAX_DEPTH ?? 2);
export const MAX_CYCLES = Number(process.env.MAX_CYCLES ?? 120);
export const CYCLE_SLEEP_MS = Number(process.env.CYCLE_SLEEP_MS ?? 15_000);
export const MAX_SEARCHES_PER_CYCLE = Number(process.env.MAX_SEARCHES_PER_CYCLE ?? 5);
export const maxOutputTokens = 8192;

export const orchestratorModel = resolveModelForProvider(
  process.env.ORCHESTRATOR_MODEL ?? "gpt-5.4-mini"
);
export const specialistModel = resolveModelForProvider(
  process.env.SPECIALIST_MODEL ?? "gpt-5.4-mini"
);

export const HUB_BASE_URL = process.env.HUB_BASE_URL?.trim().replace(/\/+$/, "");
if (!HUB_BASE_URL) {
  throw new Error("Missing HUB_BASE_URL in environment (.env).");
}
if (!AI_DEVS_API_KEY) {
  throw new Error("Missing AI_DEVS_API_KEY in environment (.env).");
}

export const TASK_NAME = "mailbox";
export const ZMAIL_URL = `${HUB_BASE_URL}/api/zmail`;
export const VERIFY_URL = `${HUB_BASE_URL}/verify`;

const TASK_ROOT = resolve(import.meta.dirname, "..");
export const WORKSPACE_BASE = join(TASK_ROOT, "workspace");
export const AGENTS_ROOT = join(WORKSPACE_BASE, "agents");

let workspaceRoot = null;

export const getWorkspaceRoot = () => {
  if (!workspaceRoot) {
    throw new Error("Workspace not initialized. Run mission init before using workspace paths.");
  }
  return workspaceRoot;
};

export const setWorkspaceRoot = (path) => {
  workspaceRoot = path;
};

export const MAX_HTTP_RETRIES = Number(process.env.MAX_HTTP_RETRIES ?? 6);
export const BASE_BACKOFF_MS = Number(process.env.BASE_BACKOFF_MS ?? 1000);
export const MAX_BACKOFF_MS = Number(process.env.MAX_BACKOFF_MS ?? 20_000);
export const MAX_RATE_LIMIT_WAIT_MS = Number(process.env.MAX_RATE_LIMIT_WAIT_MS ?? 120_000);

export { AI_DEVS_API_KEY };
