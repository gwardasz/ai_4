import { run } from "./src/agent.js";
import { tools, handlers } from "./src/tools/index.js";
import { model, instructions, LOG_LEVEL, LOG_CONSOLE, DOC_ENTRY_URL } from "./src/config.js";
import { createLogger } from "./src/utils/logger.js";

const config = { model, instructions, tools, handlers };
const logger = createLogger({ level: LOG_LEVEL, consoleMode: LOG_CONSOLE });

const kickoff =
  `Start the task. Download the SPK documentation beginning at ${DOC_ENTRY_URL}, ` +
  `read everything (including any image files via understand_image), build the transport declaration ` +
  `exactly as the template requires, and submit it until you receive the flag.`;

const { reply, flag } = await run(kickoff, config, logger);

console.log("\n=== AGENT FINISHED ===");
console.log(reply);
if (flag) {
  console.log(`\nFLAG: ${flag}`);
} else {
  console.log("\nNo flag captured. Inspect logs/ for details.");
  process.exitCode = 1;
}
