import { processQuery } from "./src/executor.js";
import { api } from "./src/config.js";
import { tools, handlers } from "./src/tools/index.js";
import { initializeSandbox } from "./src/utils/sandbox.js";

const config = {
  model: api.model,
  tools,
  handlers,
  instructions: api.instructions
};

const queries = [
    // List of queries to test the agent's capabilities
    `MISSION OBJECTIVE:
Find the suspect who approached a power plant and report them to the server.
Execute these steps strictly in order:
    1. Retrieve the master suspect list and the power plant data filename.
    2. Cross-reference them to identify the single suspect who was present at a plant.
    3. Fetch that specific suspect's exact access level.
    4. Submit the final report with the suspect's details, plant ID, and access level.
Final output: Return ONLY the exact FLAG string received from the server.`
];

const main = async () => {
  await initializeSandbox();
  console.log("Sandbox prepared: empty state\n");

  for (const query of queries) {
    await processQuery(query, config);
  }
};

main().catch(console.error);