import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { vision } from "./vision.js";
import { cropToBBox } from "./image/preprocess.js";
import { BBOX_PROFILES, WORKSPACE_ROOT, BBOX_PROFILE_TARGET, BBOX_PROFILE_LIVE } from "./config.js";
import { resolveInWorkspace, toWorkspaceRelative } from "./utils/paths.js";
import { extractJson } from "./utils/json.js";
import { validateBBox } from "./bbox-coords.js";
import { runBboxAdjustLoop } from "./utils/bbox-prompt.js";
import { noopLogger } from "./utils/logger.js";

const LEGACY_BBOX_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "reference", "board_bbox.json");

export const VISION_PROMPT_BBOX = `Locate the 3x3 puzzle board in this image.

Coordinate system: normalized 0–1000, where [0, 0] is the top-left corner of the image and [1000, 1000] is the bottom-right corner.

Return ONLY valid JSON (no markdown fences) with the exact, tight bounding box of the puzzle board grid:
{
"x1": 120,
"y1": 80,
"x2": 880,
"y2": 920
}

(x1, y1) = exact top-left corner of the top-left tile.
(x2, y2) = exact bottom-right corner of the bottom-right tile.

CRITICAL: The bounding box must have ZERO margin or padding. Map coordinates strictly to the outer visible edges of the 3x3 tiles themselves. Do not include any decorative borders, background, or UI elements outside the tiles. Do not include extra fields.`;

export { validateBBox } from "./bbox-coords.js";

export const parseBboxResponse = (text) => validateBBox(extractJson(text));

const resolveProfile = (profile) => {
  const meta = BBOX_PROFILES[profile];
  if (!meta) throw new Error(`Unknown bbox profile "${profile}". Use "${BBOX_PROFILE_TARGET}" or "${BBOX_PROFILE_LIVE}".`);
  return meta;
};

/** Jednorazowa migracja starego board_bbox.json → board_bbox_target.json */
export const migrateLegacyBBox = () => {
  const targetPath = BBOX_PROFILES[BBOX_PROFILE_TARGET].path;
  if (existsSync(LEGACY_BBOX_PATH) && !existsSync(targetPath)) {
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(LEGACY_BBOX_PATH, targetPath);
    console.log(`Migrated reference/board_bbox.json → reference/board_bbox_target.json\n`);
  }
};

export const ensureBoardBBoxExists = (profile) => {
  migrateLegacyBBox();
  return existsSync(resolveProfile(profile).path);
};

export const loadBoardBBox = async (profile = BBOX_PROFILE_LIVE) => {
  migrateLegacyBBox();
  const { path, label } = resolveProfile(profile);
  if (!existsSync(path)) {
    const script = profile === BBOX_PROFILE_TARGET
      ? "node scripts/calibrate-bbox.js"
      : "node scripts/calibrate-bbox.js --hub";
    throw new Error(`Missing ${path} (${label}) — run: ${script}`);
  }
  const raw = await readFile(path, "utf8");
  return validateBBox(JSON.parse(raw));
};

export const saveBoardBBox = async (bbox, profile) => {
  const { path } = resolveProfile(profile);
  const validated = validateBBox(bbox);
  mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  return validated;
};

export const saveBboxPreview = async (rawBuffer, bbox, profile) => {
  const { preview } = resolveProfile(profile);
  const previewBuffer = await cropToBBox(rawBuffer, bbox);
  mkdirSync(WORKSPACE_ROOT, { recursive: true });
  const absolute = resolveInWorkspace(preview);
  await writeFile(absolute, previewBuffer);
  return toWorkspaceRelative(absolute);
};

export const detectBBoxWithVision = async (buffer, log = noopLogger) => {
  const text = await vision({
    question: VISION_PROMPT_BBOX,
    images: [{ base64: buffer.toString("base64"), mimeType: "image/png" }]
  });
  log.debug("bbox.vision.raw", { text: text.slice(0, 500) });
  return parseBboxResponse(text);
};

export const runBboxCalibration = async (
  rawBuffer,
  { profile = BBOX_PROFILE_TARGET, interactive = true, skipVision = false, log = noopLogger } = {}
) => {
  const { path, label } = resolveProfile(profile);
  log.info("bbox.calibration.start", { profile, skipVision });
  console.log(`Bbox profile: ${label}\n`);

  let bbox;
  if (skipVision) {
    if (!ensureBoardBBoxExists(profile)) {
      throw new Error(`No ${path} — run without --manual first, or create the file.`);
    }
    bbox = await loadBoardBBox(profile);
    console.log(`\nLoaded existing bbox: ${JSON.stringify(bbox)}\n`);
  } else {
    bbox = await detectBBoxWithVision(rawBuffer, log);
    console.log(`\nVision detected bbox (0–1000): ${JSON.stringify(bbox)}\n`);
  }

  if (!interactive) {
    await saveBoardBBox(bbox, profile);
    log.info("bbox.calibration.saved", { profile, bbox, path });
    return bbox;
  }

  const savePreview = (candidate) => saveBboxPreview(rawBuffer, candidate, profile);
  const final = await runBboxAdjustLoop(bbox, { savePreview });

  if (!final) {
    log.info("bbox.calibration.aborted", { profile });
    process.exit(0);
  }

  await saveBoardBBox(final, profile);
  log.info("bbox.calibration.saved", { profile, bbox: final, path });
  console.log(`\nSaved bbox to ${path}\n`);
  return final;
};
