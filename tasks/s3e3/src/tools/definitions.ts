import type { ResponseTool } from '../llm/client.js'

export const tools: ResponseTool[] = [
  {
    type: 'function',
    name: 'execute_command',
    description:
      'Execute one reactor navigation command. Allowed values: left, right, wait. One command per call.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          enum: ['left', 'right', 'wait'],
          description: 'Movement command for the transport robot.',
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'request_restart',
    description:
      'Escalate to the human operator when no viable path remains. Pauses until operator approves a board reset.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Why a restart is needed (e.g. all commands blocked by guardrail).',
        },
      },
      required: ['reason'],
      additionalProperties: false,
    },
    strict: true,
  },
]
