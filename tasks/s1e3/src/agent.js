import { chat, extractToolCalls, extractText } from "./llm.js";
import { MAX_TOOL_ROUNDS } from "./config.js";

const FALLBACK_REPLY = "Chwila, sprawdzam to w systemie - mozesz powtorzyc?";

// Wykonuje wszystkie wywolania narzedzi rownolegle i zwraca wyniki w formacie Responses API.
const toOutput = (callId, payload) => ({
  type: "function_call_output",
  call_id: callId,
  output: JSON.stringify(payload)
});

const executeToolCalls = async (toolCalls, handlers) =>
  Promise.all(
    toolCalls.map(async (call) => {
      let args;
      try {
        args = JSON.parse(call.arguments);
      } catch {
        // Nie polykamy bledu po cichu - model dostaje sygnal i wskazowke jak poprawic.
        return toOutput(call.call_id, {
          success: false,
          message: "Tool arguments were not valid JSON.",
          recoveryHints: `Re-issue the ${call.name} call with a valid JSON object matching the tool schema.`
        });
      }

      const handler = handlers[call.name];
      if (!handler) {
        return toOutput(call.call_id, {
          success: false,
          message: `Unknown tool: ${call.name}`,
          recoveryHints: `Available tools: ${Object.keys(handlers).join(", ")}. Call one of these.`
        });
      }

      return toOutput(call.call_id, await handler(args));
    })
  );

// Bezstanowa petla agenta: dostaje historie + nowa wiadomosc, oddaje odpowiedz i zaktualizowana historie.
// Cala konfiguracja (model, tools, handlers, instructions) wstrzykiwana przez DI.
export const run = async (history, userMsg, { model, tools, handlers, instructions }) => {
  let conversation = [...history, { role: "user", content: userMsg }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await chat({ model, tools, instructions, input: conversation });
    const toolCalls = extractToolCalls(response);

    if (toolCalls.length === 0) {
      const reply = extractText(response) ?? FALLBACK_REPLY;
      conversation = [...conversation, { role: "assistant", content: reply }];
      return { reply, history: conversation };
    }

    const toolResults = await executeToolCalls(toolCalls, handlers);
    conversation = [...conversation, ...toolCalls, ...toolResults];
  }

  conversation = [...conversation, { role: "assistant", content: FALLBACK_REPLY }];
  return { reply: FALLBACK_REPLY, history: conversation };
};
