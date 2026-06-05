// Schemat narzedzia widoczny dla modelu. Dokladnie jeden handler w handlers.js.
export const tools = [
  {
    type: "function",
    name: "run_classification_cycle",
    description:
      "Run one full classification attempt: reset budget, fetch 10 fresh cargo items, fill the template per item, " +
      "send each prompt to the hub classifier, return per-item hub responses and token counts. " +
      "Template needs {id} and {description} placeholders, max 100 tokens per filled prompt, output DNG or NEU only. " +
      "Static instructions first, {id}/{description} last for caching.",
    parameters: {
      type: "object",
      properties: {
        promptTemplate: {
          type: "string",
          description: "Classification template with {id} and {description} placeholders."
        }
      },
      required: ["promptTemplate"],
      additionalProperties: false
    },
    strict: false
  }
];
