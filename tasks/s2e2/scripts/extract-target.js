import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { writeFile, readFile } from "node:fs/promises";
import {
  analyzeBoardFromBuffer,
  validateGrid
} from "../src/board.js";
import { ensureBoardBBoxExists, runBboxCalibration } from "../src/bbox.js";
import {
  SOLVED_BOARD_URL,
  visionModel,
  VISION_PREPROCESS,
  BBOX_PROFILE_TARGET
} from "../src/config.js";
import { noopLogger } from "../src/utils/logger.js";

const OUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "reference", "target_board.json");

const run = async () => {
  console.log(`Fetching solved board: ${SOLVED_BOARD_URL}`);
  console.log(`Vision model: ${visionModel}`);

  const response = await fetch(SOLVED_BOARD_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch solved image (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (VISION_PREPROCESS && !ensureBoardBBoxExists(BBOX_PROFILE_TARGET)) {
    console.log("\nNo board_bbox_target.json — running target bbox calibration first...\n");
    await runBboxCalibration(buffer, { profile: BBOX_PROFILE_TARGET, interactive: true, log: noopLogger });
  }

  const grid = await analyzeBoardFromBuffer(buffer, noopLogger, { bboxProfile: BBOX_PROFILE_TARGET });
  const validated = validateGrid(grid);

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(validated, null, 2)}\n`, "utf8");

  console.log(`\nSaved target board to ${OUT_PATH}\n`);
  console.log(await readFile(OUT_PATH, "utf8"));
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
