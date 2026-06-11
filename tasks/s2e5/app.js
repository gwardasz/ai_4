import { run } from "./src/agent.js";
import { loadAgent } from "./src/agent/loadAgent.js";
import { tools, createHandlers } from "./src/tools/index.js";
import { probeMap } from "./src/probe.js";
import { LOG_LEVEL, LOG_CONSOLE } from "./src/config.js";
import { createLogger } from "./src/utils/logger.js";

const logger = createLogger({ level: LOG_LEVEL, consoleMode: LOG_CONSOLE });

const filterTools = (allTools, allowed) => {
  if (!allowed?.length) return allTools;
  const set = new Set(allowed);
  return allTools.filter((tool) => set.has(tool.name));
};

const probeContext = await probeMap(logger);
const agent = await loadAgent("drone");
const handlers = createHandlers(logger);
const agentTools = filterTools(tools, agent.tools);

logger.info("agent.start", { model: agent.model, tools: agentTools.map((t) => t.name) });

const { reply, flag } = await run(
  {
    model: agent.model,
    tools: agentTools,
    handlers,
    instructions: agent.systemPrompt
  },
  logger,
  { probeContext }
);

console.log("\n=== AGENT FINISHED ===");
console.log(reply);
if (flag) {
  console.log(`\nFLAG: ${flag}`);
} else {
  console.log("\nNo flag captured. Inspect logs/ for details.");
  process.exitCode = 1;
}
