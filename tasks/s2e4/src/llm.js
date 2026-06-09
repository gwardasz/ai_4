import { AI_API_KEY, EXTRA_API_HEADERS, RESPONSES_API_ENDPOINT } from "../../../config.js";

export const chat = async ({ model, input, tools, instructions, maxOutputTokens, toolChoice = "auto" }) => {
  const body = { model, input };

  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }

  if (instructions) {
    body.instructions = instructions;
  }

  if (maxOutputTokens) {
    body.max_output_tokens = maxOutputTokens;
  }

  const response = await fetch(RESPONSES_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_API_KEY}`,
      ...EXTRA_API_HEADERS
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    const message = data?.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
};

export const extractToolCalls = (response) =>
  (response.output ?? []).filter((item) => item.type === "function_call");

export const extractText = (response) => {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const message = (response.output ?? []).find((item) => item.type === "message");
  return message?.content?.find((part) => part.type === "output_text")?.text ?? null;
};
