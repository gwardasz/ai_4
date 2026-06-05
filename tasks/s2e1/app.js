import { run } from "./src/agent.js";
import { tools, createHandlers } from "./src/tools/index.js";
import { model, instructions, LOG_LEVEL, LOG_CONSOLE } from "./src/config.js";
import { createLogger } from "./src/utils/logger.js";
import { logStats } from "./src/helpers/stats.js";

const logger = createLogger({ level: LOG_LEVEL, consoleMode: LOG_CONSOLE });
const handlers = createHandlers(logger);
const config = { model, instructions, tools, handlers };

const { reply, flag } = await run(config, logger);

// Zuzycie tokenow AGENTA (inzyniera promptow), w tym tokeny cachowane.
logStats();

console.log("\n=== AGENT FINISHED ===");
console.log(reply);
if (flag) {
  console.log(`\nFLAG: ${flag}`);
} else {
  console.log("\nNo flag captured. Inspect logs/ for details.");
  process.exitCode = 1;
}
