import type { ResponseTool } from '../llm/client.js'

export const tools: ResponseTool[] = [
  {
    type: 'function',
    name: 'run_shell',
    description:
      'Execute one shell command on the firmware VM. Returns stdout/stderr or error message. Run one command at a time.',
    parameters: {
      type: 'object',
      properties: {
        cmd: {
          type: 'string',
          description: 'Single shell command to execute (e.g. "help", "ls /opt/firmware").',
        },
      },
      required: ['cmd'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'submit_confirmation',
    description:
      'Submit the ECCS confirmation code to Centrala after cooler.bin runs successfully. Format: ECCS- followed by 40 hex characters.',
    parameters: {
      type: 'object',
      properties: {
        confirmation: {
          type: 'string',
          description: 'The ECCS confirmation code from cooler.bin output.',
        },
      },
      required: ['confirmation'],
      additionalProperties: false,
    },
    strict: true,
  },
]
