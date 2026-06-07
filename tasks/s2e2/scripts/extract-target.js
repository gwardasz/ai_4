import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  analyzeBoardFromBuffer,
  validateGrid
} from "../src/board.js";
import { visionModel, HUB_BASE_URL } from "../src/config.js";
const SOLVED_URL = `${HUB_BASE_URL}/i/solved_electricity.png`;
const OUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "reference", "target_board.json");

const run = async () => {
  console.log(`Fetching solved board: ${SOLVED_URL}`);
  console.log(`Vision model: ${visionModel}`);

  const response = await fetch(SOLVED_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch solved image (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const grid = await analyzeBoardFromBuffer(buffer);
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
