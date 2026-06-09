import { createLogger } from "./src/utils/logger.js";
import {
  LOG_LEVEL,
  LOG_CONSOLE,
  CYCLE_SLEEP_MS,
  MAX_CYCLES
} from "./src/config.js";
import {
  loadProgress,
  saveProgress,
  fingerprintProgress,
  updateProgressFromVerify,
  progressFieldStatus
} from "./src/state/progress.js";
import {
  submitVerify,
  hasAllFields,
  missingFields
} from "./src/services/verify-api.js";
import { runOrchestratorCycle } from "./src/agent/runner.js";
import { parseMissionFromArgv, initRun } from "./src/mission.js";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const { text: missionText, fresh } = parseMissionFromArgv();
const mission = await initRun({ text: missionText, fresh });

const logger = createLogger({ level: LOG_LEVEL, consoleMode: LOG_CONSOLE });

console.log("\n========================================");
console.log("  S2E4 Mailbox — Multi-Agent System");
console.log("========================================");
console.log(`Run ID:  ${mission.runId}`);
console.log(`Fields:  ${mission.fields.join(", ")}`);
console.log(`Mission: ${mission.text}\n`);

let flag = null;
let cycle = 0;
let lastFingerprint = null;
let staleCycles = 0;

while (!flag && cycle < MAX_CYCLES) {
  cycle += 1;
  const progress = await loadProgress();
  const missing = missingFields(progress, mission.fields);

  logger.info("cycle.start", {
    cycle,
    missing,
    filled: progressFieldStatus(progress, mission.fields)
  });

  if (hasAllFields(progress, mission.fields)) {
    logger.info("cycle.verify", { cycle });
    const verify = await submitVerify(progress, mission.fields, logger);
    await updateProgressFromVerify(verify);

    if (verify.flag) {
      flag = verify.flag;
      logger.info("cycle.flag", { flag, cycle });
      break;
    }
  }

  const fpBefore = fingerprintProgress(progress, mission.fields);

  try {
    await runOrchestratorCycle(progress, mission, { log: logger.child({ cycle }), cycle });
  } catch (err) {
    logger.error("cycle.error", { cycle, message: err.message });
  }

  const progressAfter = await loadProgress();
  progressAfter.lastCycleAt = new Date().toISOString();
  await saveProgress(progressAfter);

  const fpAfter = fingerprintProgress(progressAfter, mission.fields);
  if (fpAfter === fpBefore && fpAfter === lastFingerprint) {
    staleCycles += 1;
    if (staleCycles >= 3) {
      logger.warn("cycle.noProgress", { cycle, staleCycles });
    }
  } else {
    staleCycles = 0;
  }
  lastFingerprint = fpAfter;

  if (flag) break;

  logger.info("cycle.sleep", { ms: CYCLE_SLEEP_MS, cycle });
  await sleep(CYCLE_SLEEP_MS);
}

if (flag) {
  console.log(`\nFlag: ${flag}\n`);
  process.exit(0);
}

console.error(`\nStopped after ${cycle} cycles without flag.\n`);
process.exit(1);
