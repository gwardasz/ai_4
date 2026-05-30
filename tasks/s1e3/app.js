import { createServer } from "./src/server.js";
import { initStore } from "./src/session/store.js";
import { model, instructions, PORT, LOG_LEVEL } from "./src/config.js";
import { tools, handlers } from "./src/tools/index.js";
import { createLogger } from "./src/utils/logger.js";

const config = { model, instructions, tools, handlers };
const logger = createLogger({ level: LOG_LEVEL });

await initStore();

const server = createServer(config, logger);
server.listen(PORT, () => {
  logger.info("server.listening", { port: PORT });
});
