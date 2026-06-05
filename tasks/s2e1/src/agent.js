import { chat, extractToolCalls, extractText } from "./llm.js";
import { MAX_TOOL_ROUNDS, maxOutputTokens } from "./config.js";
import { noopLogger, redact } from "./utils/logger.js";

const FALLBACK_REPLY = "Reached the tool-round limit without capturing the flag.";

const toOutput = (callId, payload) => ({
  type: "function_call_output",
  call_id: callId,
  output: JSON.stringify(payload)
});

// Wykonuje wywolania narzedzi sekwencyjnie (cykl bije w hub - nie zalewamy go rownolegle).
const executeToolCalls = async (toolCalls, handlers, log) => {
  const executed = [];

  for (const call of toolCalls) {
    let args;
    try {
      args = JSON.parse(call.arguments);
    } catch {
      log.warn("tool.call", { name: call.name, args: "[invalid JSON]" });
      executed.push({
        output: toOutput(call.call_id, {
          success: false,
          message: "Tool arguments were not valid JSON.",
          recoveryHints: `Re-issue the ${call.name} call with a valid JSON object matching the tool schema.`
        }),
        result: null
      });
      continue;
    }

    log.info("tool.call", { name: call.name, args: redact(args) });

    const handler = handlers[call.name];
    if (!handler) {
      executed.push({
        output: toOutput(call.call_id, {
          success: false,
          message: `Unknown tool: ${call.name}`,
          recoveryHints: `Available tools: ${Object.keys(handlers).join(", ")}.`
        }),
        result: null
      });
      continue;
    }

    const result = await handler(args);
    log.info("tool.result", { name: call.name, success: result?.success });
    log.debug("tool.result.data", { name: call.name, data: result });
    executed.push({ output: toOutput(call.call_id, result), result });
  }

  return executed;
};

// Minimalny, neutralny sygnal startowy. Cel i kroki opisuje instrukcja systemowa - tu bez powielania.
const START_TRIGGER = "Begin.";

/**
 * Jednorazowa petla agenta: rusza od neutralnego sygnalu startowego, iteruje az model przestanie
 * wolac narzedzia lub zdobedzie flage. Konfiguracja (model, tools, handlers, instructions) wstrzykiwana przez DI.
 */
export const run = async ({ model, tools, handlers, instructions }, log = noopLogger) => {
  let conversation = [{ role: "user", content: START_TRIGGER }];
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
    let aborted = null;
    for (const { result } of executed) {
      if (result?.flag) flag = result.flag;
      if (result?.abort) aborted = result.message ?? "Run aborted by a tool.";
    }

    conversation = [...conversation, ...response.output, ...executed.map((e) => e.output)];

    // Flaga zdobyta - konczymy od razu, bez kolejnej (kosztownej) rundy modelu.
    if (flag) {
      log.info("agent.flag", { flag });
      return { reply: `Task solved. Flag captured: ${flag}`, history: conversation, flag };
    }

    // Deterministyczne przerwanie (np. blad konfiguracji) - nie czekamy na decyzje LLM.
    if (aborted) {
      log.warn("agent.aborted", { reason: aborted });
      return { reply: aborted, history: conversation, flag };
    }
  }

  log.warn("agent.maxRounds", { rounds: MAX_TOOL_ROUNDS });
  return { reply: FALLBACK_REPLY, history: conversation, flag };
};
