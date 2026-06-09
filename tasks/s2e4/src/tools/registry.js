import { createWorkspaceHandlers } from "./handlers/workspace.js";
import { createZmailHandlers } from "./handlers/zmail.js";
import { createAnalystHandlers } from "./handlers/analyst.js";
import { createOrchestratorHandlers } from "./handlers/orchestrator.js";
import { createMessageHandler } from "../agent/sessions.js";
import { noopLogger } from "../utils/logger.js";

export const createHandlersForAgent = (agentName, log = noopLogger, ctx = {}) => {
  const handlers = {};

  if (agentName === "orchestrator") {
    Object.assign(handlers, createOrchestratorHandlers(log));
  }

  if (agentName === "zmail") {
    Object.assign(handlers, createZmailHandlers(log, ctx));
  }

  if (agentName === "analyst") {
    Object.assign(handlers, createAnalystHandlers(log));
  }

  if (["orchestrator", "zmail", "analyst"].includes(agentName)) {
    Object.assign(handlers, createWorkspaceHandlers(agentName, log));
  }

  if (agentName === "zmail" || agentName === "analyst") {
    handlers.message = createMessageHandler(agentName, log);
  }

  return handlers;
};

export const createRunnerContext = ({ log, cycle, runAgent }) => ({
  log,
  cycle,
  runAgent
});
