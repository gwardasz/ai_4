// Schematy narzedzi widoczne dla modelu. Dokladnie tyle, ile handlerow w handlers.js.
export const tools = [
  {
    type: "function",
    name: "railway_api",
    description:
      "Send ONE action to the railway API (task 'railway') and return its raw response. " +
      'ALWAYS start with {"action":"help"} to get the API self-documentation, then follow it EXACTLY. ' +
      "Use only the action and parameter names returned by help. " +
      "Rate limits and 503 errors are retried/awaited automatically in code — do NOT add your own delays, sleeps, or duplicate calls; every request consumes a strict rate-limit budget.",
    parameters: {
      type: "object",
      properties: {
        answer: {
          type: "object",
          description:
            'The exact answer body to send, e.g. {"action":"help"} or an action with the parameters described by help.',
          additionalProperties: true
        }
      },
      required: ["answer"],
      additionalProperties: false
    },
    strict: false
  }
];
