import { chat, extractToolCalls, extractText } from "./llm.js";
import { MAX_TOOL_ROUNDS } from "./config.js";
import { noopLogger, redact } from "./utils/logger.js";

const FALLBACK_REPLY = "Chwila, sprawdzam to w systemie - mozesz powtorzyc?";

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
        // Nie polykamy bledu po cichu - model dostaje sygnal i wskazowke jak poprawic.
        log.warn("tool.call", { name: call.name, args: "[invalid JSON]" });
        return toOutput(call.call_id, {
          success: false,
          message: "Tool arguments were not valid JSON.",
          recoveryHints: `Re-issue the ${call.name} call with a valid JSON object matching the tool schema.`
        });
      }

      log.info("tool.call", { name: call.name, args: redact(args) });

      const handler = handlers[call.name];
      if (!handler) {
        log.warn("tool.result", { name: call.name, success: false, hasRecoveryHints: true });
        return toOutput(call.call_id, {
          success: false,
          message: `Unknown tool: ${call.name}`,
          recoveryHints: `Available tools: ${Object.keys(handlers).join(", ")}. Call one of these.`
        });
      }

      const result = await handler(args);
      log.info("tool.result", {
        name: call.name,
        success: result.success,
        hasRecoveryHints: Boolean(result.recoveryHints)
      });
      return toOutput(call.call_id, result);
    })
  );

// Bezstanowa petla agenta: dostaje historie + nowa wiadomosc, oddaje odpowiedz i zaktualizowana historie.
// Cala konfiguracja (model, tools, handlers, instructions) wstrzykiwana przez DI; log domyslnie no-op.
export const run = async (history, userMsg, { model, tools, handlers, instructions }, log = noopLogger) => {
  let conversation = [...history, { role: "user", content: userMsg }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    log.debug("agent.round", { round });
    const response = await chat({ model, tools, instructions, input: conversation });
    const toolCalls = extractToolCalls(response);

    log.info("llm.response", {
      toolCalls: toolCalls.length,
      tokens: response?.usage?.total_tokens ?? null
    });

    if (toolCalls.length === 0) {
      const reply = extractText(response) ?? FALLBACK_REPLY;
      conversation = [...conversation, { role: "assistant", content: reply }];
      log.info("agent.reply", { reply, replyLength: reply.length });
      return { reply, history: conversation };
    }

    const toolResults = await executeToolCalls(toolCalls, handlers, log);
    conversation = [...conversation, ...toolCalls, ...toolResults];
  }

  log.warn("agent.maxRounds", { rounds: MAX_TOOL_ROUNDS });
  conversation = [...conversation, { role: "assistant", content: FALLBACK_REPLY }];
  return { reply: FALLBACK_REPLY, history: conversation };
};
