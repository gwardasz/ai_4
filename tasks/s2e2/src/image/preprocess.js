import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  VISION_BINARIZE_THRESHOLD,
  VISION_BBOX_PADDING,
  VISION_INPUT_MODE,
  VISION_PREPROCESS_DEBUG,
  VISION_SHARPEN,
  VISION_CELL_INSET,
  WORKSPACE_ROOT,
  BBOX_PROFILE_LIVE
} from "../config.js";
import { ALL_CELLS } from "../constants.js";
import { loadBoardBBox } from "../bbox.js";
import { resolveInWorkspace, toWorkspaceRelative } from "../utils/paths.js";
import { noopLogger } from "../utils/logger.js";

const SCALE = 1000;

export const bboxToPixels = (bbox, width, height, padding = VISION_BBOX_PADDING) => {
  let left = Math.round((bbox.x1 / SCALE) * width);
  let top = Math.round((bbox.y1 / SCALE) * height);
  let right = Math.round((bbox.x2 / SCALE) * width);
  let bottom = Math.round((bbox.y2 / SCALE) * height);

  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width, right + padding);
  bottom = Math.min(height, bottom + padding);

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
};

export const cropToBBox = async (rawBuffer, bbox) => {
  const meta = await sharp(rawBuffer).metadata();
  const { width, height } = meta;
  if (!width || !height) throw new Error("Could not read image dimensions.");

  const region = bboxToPixels(bbox, width, height);
  return sharp(rawBuffer).extract(region).png().toBuffer();
};

const computeAutoThreshold = async (buffer) => {
  const { data } = await sharp(buffer).grayscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  return Math.round(sum / data.length);
};

export const binarize = async (buffer) => {
  let pipeline = sharp(buffer).grayscale();
  if (VISION_SHARPEN) pipeline = pipeline.sharpen();
  const threshold =
    VISION_BINARIZE_THRESHOLD ?? (await computeAutoThreshold(await pipeline.clone().toBuffer()));
  return pipeline.threshold(threshold).png().toBuffer();
};

/** Obcina insetPercent z każdej krawędzi kafelka (np. 0.1 = 10%). */
export const trimCellInsets = async (cellBuffer, insetPercent = VISION_CELL_INSET) => {
  if (insetPercent <= 0) return cellBuffer;

  const meta = await sharp(cellBuffer).metadata();
  const { width, height } = meta;
  if (!width || !height) return cellBuffer;

  const insetX = Math.floor(width * insetPercent);
  const insetY = Math.floor(height * insetPercent);
  const innerW = width - insetX * 2;
  const innerH = height - insetY * 2;
  if (innerW < 1 || innerH < 1) return cellBuffer;

  return sharp(cellBuffer)
    .extract({ left: insetX, top: insetY, width: innerW, height: innerH })
    .png()
    .toBuffer();
};

export const splitIntoCells = async (boardBuffer, gridSize = 3) => {
  const meta = await sharp(boardBuffer).metadata();
  const { width, height } = meta;
  if (!width || !height) throw new Error("Could not read board image dimensions.");

  const cellW = Math.floor(width / gridSize);
  const cellH = Math.floor(height / gridSize);
  const cells = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const cell = ALL_CELLS[row * gridSize + col];
      const rawCell = await sharp(boardBuffer)
        .extract({ left: col * cellW, top: row * cellH, width: cellW, height: cellH })
        .png()
        .toBuffer();
      const buffer = await trimCellInsets(rawCell);
      cells.push({ cell, buffer });
    }
  }
  return cells;
};

const saveDebugArtifacts = async (ts, { boardCropBuffer, boardBinBuffer, cells }) => {
  mkdirSync(WORKSPACE_ROOT, { recursive: true });
  const dir = resolveInWorkspace(`preprocess-${ts}`);
  mkdirSync(dir, { recursive: true });

  await writeFile(join(dir, "01-board-crop.png"), boardCropBuffer);
  await writeFile(join(dir, "02-board-bin.png"), boardBinBuffer);

  if (cells?.length) {
    const cellsDir = join(dir, "cells");
    mkdirSync(cellsDir, { recursive: true });
    for (const { cell, buffer } of cells) {
      await writeFile(join(cellsDir, `${cell}.png`), buffer);
    }
  }

  return toWorkspaceRelative(dir);
};

export const preprocessBoardImage = async (rawBuffer, log = noopLogger, { bboxProfile = BBOX_PROFILE_LIVE } = {}) => {
  const bbox = await loadBoardBBox(bboxProfile);
  const boardCropBuffer = await cropToBBox(rawBuffer, bbox);
  const boardBinBuffer = await binarize(boardCropBuffer);

  let cells;
  if (VISION_INPUT_MODE === "cells") {
    cells = await splitIntoCells(boardBinBuffer);
  }

  log.debug("preprocess.done", {
    bboxProfile,
    bbox,
    inputMode: VISION_INPUT_MODE,
    cellCount: cells?.length ?? 0,
    cellInset: VISION_INPUT_MODE === "cells" ? VISION_CELL_INSET : 0
  });

  if (VISION_PREPROCESS_DEBUG) {
    const debugPath = await saveDebugArtifacts(Date.now(), { boardCropBuffer, boardBinBuffer, cells });
    log.debug("preprocess.debug", { debugPath });
  }

  return { bbox, boardCropBuffer, boardBinBuffer, cells };
};
