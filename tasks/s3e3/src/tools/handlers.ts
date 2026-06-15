import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import type { AgentCommand } from '../config.js'
import type { Logger } from '../core/logger.js'
import { withTool } from '../core/tracing/index.js'
import { buildAgentContext } from '../radar/analyze.js'
import { validateCommand } from '../radar/guardrail.js'
import type { ParsedState } from '../radar/types.js'
import { submitCommand } from '../services/reactor-api.js'

export interface ToolResponse {
  success: boolean
  blockedBy?: 'guardrail'
  message?: string
  recoveryHints?: string
  radar?: ReturnType<typeof buildAgentContext>['radar']
  hub?: Record<string, unknown>
  flag?: string | null
  stateUpdated?: boolean
}

export interface ToolHandlersContext {
  getState: () => ParsedState
  setState: (state: ParsedState) => void
  log: Logger
}

export interface ToolHandlers {
  execute_command: (args: { command: AgentCommand }) => Promise<ToolResponse>
  request_restart: (args: { reason: string }) => Promise<ToolResponse>
}

const isAgentCommand = (value: unknown): value is AgentCommand =>
  value === 'left' || value === 'right' || value === 'wait'

export const createHandlers = (ctx: ToolHandlersContext): ToolHandlers => ({
  execute_command: async ({ command }) =>
    withTool({ name: 'execute_command', input: { command } }, async () => {
      if (!isAgentCommand(command)) {
        return {
          success: false,
          message: 'Invalid command. Use left, right, or wait.',
          recoveryHints: 'Call execute_command with a valid command enum.',
        }
      }

      const state = ctx.getState()
      const guard = validateCommand(state, command)

      if (!guard.allowed) {
        ctx.log.warn('guardrail.block', { command, message: guard.message })
        return {
          success: false,
          blockedBy: guard.blockedBy,
          message: guard.message,
          recoveryHints: guard.recoveryHints,
          radar: buildAgentContext(state).radar,
          hub: state.hub,
          stateUpdated: false,
        }
      }

      const result = await withTool(
        { name: `reactor-api:${command}`, input: { command } },
        () => submitCommand(command, ctx.log),
      )

      ctx.setState(result.state)

      const context = buildAgentContext(result.state)
      return {
        success: result.ok,
        message: typeof result.state.hub.message === 'string' ? result.state.hub.message : undefined,
        radar: context.radar,
        hub: context.hub,
        flag: result.flag,
        stateUpdated: true,
      }
    }),

  request_restart: async ({ reason }) =>
    withTool({ name: 'request_restart', input: { reason } }, async () => {
      const rl = createInterface({ input, output })
      try {
        console.log('\n--- Operator approval required ---')
        console.log(`Reason: ${reason}`)
        const answer = await rl.question('Approve reset? [y/N]: ')
        const approved = answer.trim().toLowerCase() === 'y'

        if (!approved) {
          return {
            success: false,
            message: 'Operator declined restart.',
            recoveryHints: 'Try a different navigation strategy without resetting.',
            radar: buildAgentContext(ctx.getState()).radar,
            hub: ctx.getState().hub,
            stateUpdated: false,
          }
        }

        const reset = await submitCommand('reset', ctx.log)
        const start = await submitCommand('start', ctx.log)
        ctx.setState(start.state)

        const context = buildAgentContext(start.state)
        return {
          success: true,
          message: 'Board reset and restarted.',
          radar: context.radar,
          hub: context.hub,
          flag: start.flag ?? reset.flag,
          stateUpdated: true,
        }
      } finally {
        rl.close()
      }
    }),
})
