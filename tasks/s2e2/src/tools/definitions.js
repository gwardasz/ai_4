export const tools = [
  {
    type: "function",
    name: "get_board_state",
    description:
      "Fetch the current puzzle board PNG from the hub, analyze it with vision, and return a 3x3 grid. " +
      "Each cell (e.g. 1x1) has connections: N/E/S/W for open cable edges. " +
      "Call again after rotations to verify or apply corrections.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "get_target_board",
    description:
      "Return the target board pattern to match. Each cell has connections N/E/S/W. " +
      "Compare with current state to plan clockwise quarter-turn rotations (1-3 per cell).",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "rotate_tile",
    description:
      "Rotate one tile 90 degrees clockwise. Each quarter-turn costs one hub API call. " +
      "Pass times (1-3) to rotate multiple quarter-turns in one tool call.",
    parameters: {
      type: "object",
      properties: {
        cell: {
          type: "string",
          description: 'Cell address, e.g. "2x3" (row 1-3, column 1-3).'
        },
        times: {
          type: "integer",
          description: "Number of clockwise quarter-turns (1-3)."
        }
      },
      required: ["cell", "times"],
      additionalProperties: false
    },
    strict: true
  }
];
