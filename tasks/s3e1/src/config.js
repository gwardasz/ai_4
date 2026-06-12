import { resolve } from "node:path";
import { resolveModelForProvider} from "../../../config.js";

export const HUB_BASE_URL = process.env.HUB_BASE_URL?.trim().replace(/\/+$/, "");
if (!HUB_BASE_URL) {
  throw new Error("Missing HUB_BASE_URL in environment (.env). Set HUB_BASE_URL=https://<host>.");
}

export const AI_DEVS_API_KEY = process.env.AI_DEVS_API_KEY?.trim();

if (!AI_DEVS_API_KEY) {
  throw new Error("Missing AI_DEVS_API_KEY in environment (.env).");
}
export const TASK_NAME = "evaluation";
export const VERIFY_URL = `${HUB_BASE_URL}/verify`;
export const DOCS_URL = `${HUB_BASE_URL}/dane/sensors.zip`;

export const WORKSPACE_ROOT = resolve(import.meta.dirname, "..", "workspace");
