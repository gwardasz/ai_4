import { probeMap } from "../src/probe.js";
import { MAP_ANALYSIS_PATH } from "../src/config.js";
import { createLogger } from "../src/utils/logger.js";
import { LOG_LEVEL, LOG_CONSOLE } from "../src/config.js";

const logger = createLogger({ level: LOG_LEVEL, consoleMode: LOG_CONSOLE });

const analysis = await probeMap(logger);

console.log("\n=== MAP PROBE ===");
console.log(JSON.stringify(analysis, null, 2));
console.log(`\nSaved to: ${MAP_ANALYSIS_PATH}`);
