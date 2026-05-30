import { createServer } from "./src/server.js";
import { initStore } from "./src/session/store.js";
import { model, instructions, PORT } from "./src/config.js";
import { tools, handlers } from "./src/tools/index.js";

const config = { model, instructions, tools, handlers };

await initStore();

const server = createServer(config);
server.listen(PORT, () => {
  console.log(`Proxy listening on http://localhost:${PORT}`);
});
