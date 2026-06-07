import { resolve } from "node:path";
import { resolveModelForProvider, AI_DEVS_API_KEY } from "../../../config.js";

export const MAX_TOOL_ROUNDS = Number(process.env.MAX_TOOL_ROUNDS ?? 10);
export const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
export const LOG_CONSOLE = process.env.LOG_CONSOLE ?? "all";
export const TEST_MODE = process.env.TEST_MODE === "1" || process.env.TEST_MODE === "true";

export const model = resolveModelForProvider(process.env.AGENT_MODEL ?? "gpt-5-mini");
export const visionModel = resolveModelForProvider(
  process.env.VISION_MODEL ?? "google/gemini-3-flash-preview"
);
export const maxOutputTokens = 8192;

export const MAX_HTTP_RETRIES = Number(process.env.MAX_HTTP_RETRIES ?? 6);
export const BASE_BACKOFF_MS = Number(process.env.BASE_BACKOFF_MS ?? 1000);
export const MAX_BACKOFF_MS = Number(process.env.MAX_BACKOFF_MS ?? 20000);
export const MAX_RATE_LIMIT_WAIT_MS = Number(process.env.MAX_RATE_LIMIT_WAIT_MS ?? 120000);

export const VISION_PREPROCESS =
  process.env.VISION_PREPROCESS !== "0" && process.env.VISION_PREPROCESS !== "false";
export const VISION_INPUT_MODE = process.env.VISION_INPUT_MODE === "board" ? "board" : "cells";
export const VISION_PREPROCESS_DEBUG =
  process.env.VISION_PREPROCESS_DEBUG === "1" || process.env.VISION_PREPROCESS_DEBUG === "true";
export const VISION_SHARPEN =
  process.env.VISION_SHARPEN === "1" || process.env.VISION_SHARPEN === "true";
export const VISION_BBOX_PADDING = Number(process.env.VISION_BBOX_PADDING ?? 6);
export const VISION_BINARIZE_THRESHOLD = process.env.VISION_BINARIZE_THRESHOLD
  ? Number(process.env.VISION_BINARIZE_THRESHOLD)
  : null;
/** Odcięcie z każdej strony kafelka przed vision (0–0.49). Domyślnie 10% — usuwa artefakty siatki. */
export const VISION_CELL_INSET = Math.min(
  0.49,
  Math.max(0, Number(process.env.VISION_CELL_INSET ?? 0.1))
);

export const HUB_BASE_URL = process.env.HUB_BASE_URL?.trim().replace(/\/+$/, "");
if (!HUB_BASE_URL) {
  throw new Error("Missing HUB_BASE_URL in environment (.env). Set HUB_BASE_URL=https://<host>.");
}
if (!AI_DEVS_API_KEY) {
  throw new Error("Missing AI_DEVS_API_KEY in environment (.env).");
}

export const TASK_NAME = "electricity";
export const VERIFY_URL = `${HUB_BASE_URL}/verify`;
export const BOARD_IMAGE_URL = `${HUB_BASE_URL}/data/${AI_DEVS_API_KEY}/electricity.png`;
export const SOLVED_BOARD_URL = `${HUB_BASE_URL}/i/solved_electricity.png`;

export const WORKSPACE_ROOT = resolve(import.meta.dirname, "..", "workspace");
export const TARGET_BOARD_PATH = resolve(import.meta.dirname, "..", "reference", "target_board.json");
export const BOARD_BBOX_TARGET_PATH = resolve(import.meta.dirname, "..", "reference", "board_bbox_target.json");
export const BOARD_BBOX_LIVE_PATH = resolve(import.meta.dirname, "..", "reference", "board_bbox_live.json");
/** @deprecated użyj BOARD_BBOX_TARGET_PATH / BOARD_BBOX_LIVE_PATH */
export const BOARD_BBOX_PATH = BOARD_BBOX_TARGET_PATH;

/** Bbox obrazu solved — `calibrate-bbox.js` bez flagi, `extract-target.js` */
export const BBOX_PROFILE_TARGET = "target";
/** Bbox live PNG z huba — `calibrate-bbox.js --hub`, agent / `get_board_state` */
export const BBOX_PROFILE_LIVE = "live";

export const BBOX_PROFILES = {
  [BBOX_PROFILE_TARGET]: {
    path: BOARD_BBOX_TARGET_PATH,
    preview: "bbox-preview-target.png",
    label: "target (solved image)"
  },
  [BBOX_PROFILE_LIVE]: {
    path: BOARD_BBOX_LIVE_PATH,
    preview: "bbox-preview-live.png",
    label: "live (hub board image)"
  }
};

export const instructions = `You solve a 3×3 tile-rotation puzzle. Read the current board and the target pattern with tools, decide which tiles to rotate and how many quarter-turns clockwise (1–3), then apply rotations. After applying changes, re-read the board and apply corrections if needed. Stop when a flag is returned.`;

export const TEST_MODE_INSTRUCTIONS = `Before any rotation, describe differences between current and target in plain text (which cells need how many clockwise quarter-turns). Do not call rotate_tile until you receive approval.`;
