import { chat, extractToolCalls, extractText } from "./llm.js";
import { MAX_TOOL_ROUNDS, maxOutputTokens } from "./config.js";
import { noopLogger, redact } from "./utils/logger.js";

const FALLBACK_REPLY = "Reached the tool-round limit without finishing the task.";

const toOutput = (callId, payload) => ({
  type: "function_call_output",
  call_id: callId,
  output: JSON.stringify(payload)
});

// Wykonuje wszystkie wywolania narzedzi rownolegle i zwraca wyniki w formacie Responses API.
const executeToolCalls = async (toolCalls, handlers, log) =>
  Promise.all(
    toolCalls.map(async (call) => {
      let args;
      try {
        args = JSON.parse(call.arguments);
      } catch {
        log.warn("tool.call", { name: call.name, args: "[invalid JSON]" });
        return {
          output: toOutput(call.call_id, {
            success: false,
            message: "Tool arguments were not valid JSON.",
            recoveryHints: `Re-issue the ${call.name} call with a valid JSON object matching the tool schema.`
          }),
          result: null
        };
      }

      log.info("tool.call", { name: call.name, args: redact(args) });

      const handler = handlers[call.name];
      if (!handler) {
        return {
          output: toOutput(call.call_id, {
            success: false,
            message: `Unknown tool: ${call.name}`,
            recoveryHints: `Available tools: ${Object.keys(handlers).join(", ")}.`
          }),
          result: null
        };
      }

      const result = await handler(args);
      log.info("tool.result", { name: call.name, success: result?.success });
      log.debug("tool.result.data", { name: call.name, data: result });
      return { output: toOutput(call.call_id, result), result };
    })
  );

/**
 * Jednorazowa petla agenta: rusza od wiadomosci startowej, iteruje az model przestanie wolac narzedzia.
 * Konfiguracja (model, tools, handlers, instructions) wstrzykiwana przez DI; log domyslnie no-op.
 */
export const run = async (kickoff, { model, tools, handlers, instructions }, log = noopLogger) => {
  log.info("agent.query", { query: kickoff });
  let conversation = [{ role: "user", content: kickoff }];
  let flag = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    log.debug("agent.round", { round });
    const response = await chat({ model, tools, instructions, maxOutputTokens, input: conversation });
    const toolCalls = extractToolCalls(response);

    log.info("llm.response", {
      toolCalls: toolCalls.length,
      tokens: response?.usage?.total_tokens ?? null
    });

    if (toolCalls.length === 0) {
      const reply = extractText(response) ?? FALLBACK_REPLY;
      log.info("agent.reply", { reply });
      return { reply, history: conversation, flag };
    }

    const executed = await executeToolCalls(toolCalls, handlers, log);
    for (const { result } of executed) {
      if (result?.flag) flag = result.flag;
    }

    conversation = [...conversation, ...response.output, ...executed.map((e) => e.output)];

    if (flag) {
      log.info("agent.flag", { flag });
    }
  }

  log.warn("agent.maxRounds", { rounds: MAX_TOOL_ROUNDS });
  return { reply: FALLBACK_REPLY, history: conversation, flag };
};
