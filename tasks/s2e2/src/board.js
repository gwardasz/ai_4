import { mkdirSync, existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fetchBoardPng } from "./services/electricity-api.js";
import { vision } from "./vision.js";
import {
  TARGET_BOARD_PATH,
  WORKSPACE_ROOT,
  visionModel,
  VISION_PREPROCESS,
  VISION_INPUT_MODE,
  BBOX_PROFILE_LIVE
} from "./config.js";
import { resolveInWorkspace, toWorkspaceRelative } from "./utils/paths.js";
import { normalizeConnections } from "./utils/tiles.js";
import { extractJson } from "./utils/json.js";
import { preprocessBoardImage } from "./image/preprocess.js";
import { noopLogger } from "./utils/logger.js";
import { ALL_CELLS } from "./constants.js";

export { ALL_CELLS };

const EDGE_TOLERANCE = `Edge tolerance: cable art may stop slightly before the cell border. If a cable clearly aims at an edge and nearly reaches it, still mark that edge as connected.`;

const CONNECTIONS_JSON_SHAPE = `Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "1x1": { "connections": ["E", "S"] },
  "1x2": { "connections": ["W", "E"] },
  ...
  "3x3": { "connections": ["W", "N"] }
}

Include all 9 cells. Sort connection letters alphabetically. Do not add labels or extra fields.`;

export const VISION_PROMPT_RAW = `You analyze a 3x3 electrical cable puzzle board image.

Grid addressing (row x column, rows 1-3 top to bottom, columns 1-3 left to right):
1x1 | 1x2 | 1x3
2x1 | 2x2 | 2x3
3x1 | 3x2 | 3x3

For each cell, list which edges have an open cable connection using only these letters:
- N = top edge
- E = right edge
- S = bottom edge
- W = left edge

${EDGE_TOLERANCE}

${CONNECTIONS_JSON_SHAPE}`;

export const VISION_PROMPT_BOARD = `You analyze a preprocessed 3x3 electrical cable puzzle board image (cropped and binarized).

The image shows only the puzzle grid. Grid addressing (row x column):
1x1 | 1x2 | 1x3
2x1 | 2x2 | 2x3
3x1 | 3x2 | 3x3

For each cell, list open cable edges: N, E, S, W.
${EDGE_TOLERANCE}

${CONNECTIONS_JSON_SHAPE}`;

export const VISION_PROMPT_CELLS = `You analyze 9 preprocessed tile images.

Images are provided in this order:
1x1, 1x2, 1x3, 2x1, 2x2, 2x3, 3x1, 3x2, 3x3

For each cell, list the directions of thick lines radiating from the center using N, E, S, W. Constraint: Each cell must contain between 2 and 4 directions. 
Important: If a continuous thick line completely crosses the cell through the center (horizontally or vertically), you must explicitly list both corresponding directions (e.g., list both E and W for a full horizontal line, and both N and S for a full vertical line).

${CONNECTIONS_JSON_SHAPE}`;

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
  const raw = await readFile(TARGET_BOARD_PATH, "utf8");
  return validateGrid(JSON.parse(raw));
};

export const saveBoardImage = async (buffer) => {
  mkdirSync(WORKSPACE_ROOT, { recursive: true });
  const relativePath = `board-${Date.now()}.png`;
  const absolute = resolveInWorkspace(relativePath);
  await writeFile(absolute, buffer);
  return toWorkspaceRelative(absolute);
};

const analyzeRaw = async (buffer, log) => {
  const text = await vision({
    question: VISION_PROMPT_RAW,
    images: [{ base64: buffer.toString("base64"), mimeType: "image/png" }]
  });
  log.debug("board.vision.raw", { text: text.slice(0, 2000), mode: "raw" });
  return parseVisionResponse(text);
};

const analyzePreprocessed = async (buffer, log, { bboxProfile = BBOX_PROFILE_LIVE } = {}) => {
  const preprocessed = await preprocessBoardImage(buffer, log, { bboxProfile });
  let question;
  let images;

  if (VISION_INPUT_MODE === "cells") {
    question = VISION_PROMPT_CELLS;
    images = preprocessed.cells.map(({ buffer: cellBuffer }) => ({
      base64: cellBuffer.toString("base64"),
      mimeType: "image/png"
    }));
  } else {
    question = VISION_PROMPT_BOARD;
    images = [{ base64: preprocessed.boardBinBuffer.toString("base64"), mimeType: "image/png" }];
  }

  log.debug("board.vision.prompt", {
    bboxProfile,
    mode: VISION_INPUT_MODE,
    imageCount: images.length,
    bbox: preprocessed.bbox
  });

  const text = await vision({ question, images });
  log.debug("board.vision.raw", { text: text.slice(0, 2000), mode: VISION_INPUT_MODE });
  return parseVisionResponse(text);
};

export const analyzeBoardFromBuffer = async (buffer, log = noopLogger, { bboxProfile = BBOX_PROFILE_LIVE } = {}) => {
  if (VISION_PREPROCESS) {
    return analyzePreprocessed(buffer, log, { bboxProfile });
  }
  return analyzeRaw(buffer, log);
};

export const fetchAndAnalyzeBoard = async (log = noopLogger) => {
  const buffer = await fetchBoardPng(log);
  const imagePath = await saveBoardImage(buffer);
  const grid = await analyzeBoardFromBuffer(buffer, log, { bboxProfile: BBOX_PROFILE_LIVE });
  const fetchedAt = new Date().toISOString();
  log.debug("board.vision", { grid, imagePath, fetchedAt, visionModel, preprocess: VISION_PREPROCESS });
  return { grid, imagePath, fetchedAt, visionModel };
};

export const analyzeBoardFromFile = async (absolutePath, log = noopLogger) => {
  const buffer = await readFile(absolutePath);
  const grid = await analyzeBoardFromBuffer(buffer, log);
  log.debug("board.vision", { grid, imagePath: absolutePath, visionModel });
  return grid;
};

export const ensureTargetBoardExists = () => existsSync(TARGET_BOARD_PATH);

export const saveTargetBoard = async (grid) => {
  mkdirSync(dirname(TARGET_BOARD_PATH), { recursive: true });
  await writeFile(TARGET_BOARD_PATH, `${JSON.stringify(validateGrid(grid), null, 2)}\n`, "utf8");
};
