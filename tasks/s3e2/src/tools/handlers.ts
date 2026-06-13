import { isValidConfirmation } from '../config.js'
import type { Logger } from '../core/logger.js'
import { withTool } from '../core/tracing/index.js'
import { executeShell } from '../services/shell-api.js'
import { submitConfirmation } from '../services/verify-api.js'

export interface ToolResponse {
  success: boolean
  message?: string
  output?: string
  flag?: string | null
  recoveryHints?: string
}

export interface ToolHandlers {
  run_shell: (args: { cmd: string }) => Promise<ToolResponse>
  submit_confirmation: (args: { confirmation: string }) => Promise<ToolResponse>
}

export const createHandlers = (log: Logger): ToolHandlers => ({
  run_shell: async ({ cmd }) =>
    withTool({ name: 'run_shell', input: { cmd } }, async () => {
      if (typeof cmd !== 'string' || !cmd.trim()) {
        return {
          success: false,
          message: 'cmd must be a non-empty string.',
          recoveryHints: 'Provide a valid shell command string.',
        }
      }

      const result = await executeShell(cmd.trim(), log)
      return {
        success: result.success,
        message: result.message,
        output: result.output,
        recoveryHints: result.blocked
          ? 'This command was blocked by security policy. Try a different path or approach.'
          : undefined,
      }
    }),

  submit_confirmation: async ({ confirmation }) =>
    withTool({ name: 'submit_confirmation', input: { confirmation } }, async () => {
      if (typeof confirmation !== 'string' || !isValidConfirmation(confirmation)) {
        return {
          success: false,
          message: 'Invalid confirmation format. Code must start with ECCS-',
          recoveryHints: 'Run cooler.bin with correct settings and copy the exact ECCS code from its output.',
        }
      }

      const verify = await submitConfirmation(confirmation.trim(), log)
      return {
        success: verify.ok,
        message: verify.ok ? 'Confirmation accepted.' : 'Verification rejected.',
        output: typeof verify.data === 'string' ? verify.data : JSON.stringify(verify.data),
        flag: verify.flag,
      }
    }),
})
