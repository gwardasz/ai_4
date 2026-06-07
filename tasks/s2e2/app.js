import { run } from "./src/agent.js";
import { tools, createHandlers } from "./src/tools/index.js";
import {
  model,
  instructions,
  TEST_MODE_INSTRUCTIONS,
  TEST_MODE,
  LOG_LEVEL,
  LOG_CONSOLE,
  VISION_PREPROCESS,
  BBOX_PROFILE_LIVE
} from "./src/config.js";
import { createLogger } from "./src/utils/logger.js";
import { logStats } from "./src/helpers/stats.js";
import { runProbe } from "./src/probe.js";
import { ensureTargetBoardExists } from "./src/board.js";
import { ensureBoardBBoxExists } from "./src/bbox.js";
import { promptCheckpoint, printProbeReport } from "./src/utils/checkpoint.js";

const logger = createLogger({ level: LOG_LEVEL, consoleMode: LOG_CONSOLE });

if (!ensureTargetBoardExists()) {
  console.error("Missing reference/target_board.json — run: node scripts/extract-target.js");
  process.exit(1);
}

if (VISION_PREPROCESS && !ensureBoardBBoxExists(BBOX_PROFILE_LIVE)) {
  console.error("Missing reference/board_bbox_live.json — run: node scripts/calibrate-bbox.js --hub");
  process.exit(1);
}

const handlers = createHandlers(logger);
const agentInstructions = TEST_MODE ? `${instructions}\n\n${TEST_MODE_INSTRUCTIONS}` : instructions;
const config = { model, instructions: agentInstructions, tools, handlers };

let probeContext = null;

if (TEST_MODE) {
  logger.info("testmode.probe.start", {});
  probeContext = await runProbe(logger);
  printProbeReport(probeContext);

  const approved = await promptCheckpoint({
    stage: 1,
    title: "Vision probe — review grids before agent starts"
  });

  if (!approved) {
    console.log("\nAborted at vision checkpoint.\n");
    process.exit(0);
  }
}

const { reply, flag, aborted } = await run(config, logger, {
  testMode: TEST_MODE,
  probeContext
});

logStats();

console.log("\n=== AGENT FINISHED ===");
console.log(reply);
if (flag) {
  console.log(`\nFLAG: ${flag}`);
} else if (aborted) {
  process.exitCode = 0;
} else {
  console.log("\nNo flag captured. Inspect logs/ for details.");
  process.exitCode = 1;
}
