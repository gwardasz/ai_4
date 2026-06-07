import { readFile, writeFile, mkdirSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import { dirname } from "node:path";
import { fetchBoardPng } from "./services/electricity-api.js";
import { vision } from "./vision.js";
import { TARGET_BOARD_PATH, WORKSPACE_ROOT, visionModel } from "./config.js";
import { resolveInWorkspace, toWorkspaceRelative } from "./utils/paths.js";
import { normalizeConnections } from "./utils/tiles.js";
import { noopLogger } from "./utils/logger.js";

export const ALL_CELLS = ["1x1", "1x2", "1x3", "2x1", "2x2", "2x3", "3x1", "3x2", "3x3"];

export const VISION_PROMPT = `You analyze a 3x3 electrical cable puzzle board image.

Grid addressing (row x column, rows 1-3 top to bottom, columns 1-3 left to right):
1x1 | 1x2 | 1x3
2x1 | 2x2 | 2x3
3x1 | 3x2 | 3x3

For each cell, list which edges have an open cable connection using only these letters:
- N = top edge
- E = right edge
- S = bottom edge
- W = left edge

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "1x1": { "connections": ["E", "S"] },
  "1x2": { "connections": ["W", "E"] },
  ...
  "3x3": { "connections": ["W", "N"] }
}

Include all 9 cells. Sort connection letters alphabetically. Do not add labels or extra fields.`;

const extractJson = (text) => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1].trim() : text.trim();
  return JSON.parse(candidate);
};

export const validateGrid = (grid) => {
  if (!grid || typeof grid !== "object") {
    throw new Error("Vision response is not a JSON object.");
  }

  const normalized = {};
  for (const cell of ALL_CELLS) {
    const entry = grid[cell];
    if (!entry || !Array.isArray(entry.connections)) {
      throw new Error(`Missing or invalid connections for cell ${cell}.`);
    }
    normalized[cell] = { connections: normalizeConnections(entry.connections) };
  }
  return normalized;
};

export const parseVisionResponse = (text) => validateGrid(extractJson(text));

export const loadTargetBoard = async () => {
  const raw = await readFileAsync(TARGET_BOARD_PATH, "utf8");
  return validateGrid(JSON.parse(raw));
};

export const saveBoardImage = async (buffer) => {
  mkdirSync(WORKSPACE_ROOT, { recursive: true });
  const relativePath = `board-${Date.now()}.png`;
  const absolute = resolveInWorkspace(relativePath);
  await writeFile(absolute, buffer);
  return toWorkspaceRelative(absolute);
};

export const analyzeBoardFromBuffer = async (buffer, log = noopLogger) => {
  const text = await vision({
    imageBase64: buffer.toString("base64"),
    mimeType: "image/png",
    question: VISION_PROMPT
  });
  log.debug("board.vision.raw", { text: text.slice(0, 2000) });
  return parseVisionResponse(text);
};

export const fetchAndAnalyzeBoard = async (log = noopLogger) => {
  const buffer = await fetchBoardPng(log);
  const imagePath = await saveBoardImage(buffer);
  const grid = await analyzeBoardFromBuffer(buffer, log);
  const fetchedAt = new Date().toISOString();
  log.debug("board.vision", { grid, imagePath, fetchedAt, visionModel });
  return { grid, imagePath, fetchedAt, visionModel };
};

export const analyzeBoardFromFile = async (absolutePath, log = noopLogger) => {
  const buffer = await readFileAsync(absolutePath);
  const grid = await analyzeBoardFromBuffer(buffer, log);
  log.debug("board.vision", { grid, imagePath: absolutePath, visionModel });
  return grid;
};

export const ensureTargetBoardExists = () => {
  try {
    readFile(TARGET_BOARD_PATH);
    return true;
  } catch {
    return false;
  }
};

export const saveTargetBoard = async (grid) => {
  mkdirSync(dirname(TARGET_BOARD_PATH), { recursive: true });
  await writeFile(TARGET_BOARD_PATH, `${JSON.stringify(validateGrid(grid), null, 2)}\n`, "utf8");
};
