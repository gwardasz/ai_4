export const tools = [
  {
    type: "function",
    name: "fetch_drone_docs",
    description:
      "Fetch DRN-BMB7 drone API documentation (HTML), cache it locally, and return plain-text content. " +
      "Call once before building instructions. Docs describe instruction syntax and mission requirements.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "submit_instructions",
    description:
      "Submit an ordered array of drone instruction strings to the hub /verify endpoint. " +
      "Returns hub feedback on success or error. Iterate when the API reports problems.",
    parameters: {
      type: "object",
      properties: {
        instructions: {
          type: "array",
          items: { type: "string" },
          description: "Ordered list of drone API instruction strings, e.g. setDestinationObject(PWR6132PL)."
        }
      },
      required: ["instructions"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "hard_reset",
    description:
      "Send hardReset to restore the drone to factory defaults. Use when repeated configuration errors stack up.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    strict: true
  }
];
