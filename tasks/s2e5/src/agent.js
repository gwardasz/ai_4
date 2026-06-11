import { chat, extractToolCalls, extractText } from "./llm.js";
import { MAX_TOOL_ROUNDS, maxOutputTokens, START_TRIGGER } from "./config.js";
import { noopLogger, redact } from "./utils/logger.js";

const FALLBACK_REPLY = "Reached the tool-round limit without capturing the flag.";

const toOutput = (callId, payload) => ({
  type: "function_call_output",
  call_id: callId,
  output: JSON.stringify(payload)
});

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

const buildStartMessage = (probeContext) => {
  if (!probeContext) return START_TRIGGER;

  return [
    START_TRIGGER,
    "",
    "Map probe context — use these coordinates for set(x,y); do not guess:",
    JSON.stringify(
      {
        columns: probeContext.columns,
        rows: probeContext.rows,
        damSector: probeContext.damSector,
        powerPlantSector: probeContext.powerPlantSector,
        confidence: probeContext.confidence,
        notes: probeContext.notes,
        imageUrl: probeContext.imageUrl,
        analyzedAt: probeContext.analyzedAt
      },
      null,
      2
    )
  ].join("\n");
};

export const run = async (
  { model, tools, handlers, instructions },
  log = noopLogger,
  { probeContext = null } = {}
) => {
  let conversation = [{ role: "user", content: buildStartMessage(probeContext) }];
  let flag = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    log.debug("agent.round", { round });
    const response = await chat({ model, tools, instructions, maxOutputTokens, input: conversation, log });
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
      return { reply: `Task solved. Flag captured: ${flag}`, history: conversation, flag };
    }
  }

  log.warn("agent.maxRounds", { rounds: MAX_TOOL_ROUNDS });
  return { reply: FALLBACK_REPLY, history: conversation, flag };
};
