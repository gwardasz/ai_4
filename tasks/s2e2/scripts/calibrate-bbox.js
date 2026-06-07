import { fetchBoardPng } from "../src/services/electricity-api.js";
import { runBboxCalibration } from "../src/bbox.js";
import {
  SOLVED_BOARD_URL,
  BOARD_IMAGE_URL,
  visionModel,
  BBOX_PROFILE_TARGET,
  BBOX_PROFILE_LIVE
} from "../src/config.js";
import { createLogger } from "../src/utils/logger.js";
import { LOG_LEVEL } from "../src/config.js";

const useHub = process.argv.includes("--hub");
const manualOnly = process.argv.includes("--manual");
const profile = useHub ? BBOX_PROFILE_LIVE : BBOX_PROFILE_TARGET;
const logger = createLogger({ level: LOG_LEVEL });

const run = async () => {
  let buffer;
  if (useHub) {
    console.log(`Fetching live board: ${BOARD_IMAGE_URL}`);
    buffer = await fetchBoardPng(logger);
  } else {
    console.log(`Fetching solved board: ${SOLVED_BOARD_URL}`);
    const response = await fetch(SOLVED_BOARD_URL);
    if (!response.ok) throw new Error(`Failed to fetch solved image (${response.status})`);
    buffer = Buffer.from(await response.arrayBuffer());
  }

  if (manualOnly) {
    console.log(`Manual mode — skipping vision, starting from reference/board_bbox_${profile}.json\n`);
  } else {
    console.log(`Vision model: ${visionModel}\n`);
  }

  await runBboxCalibration(buffer, { profile, interactive: true, skipVision: manualOnly, log: logger });
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
