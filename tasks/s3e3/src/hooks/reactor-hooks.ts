import type { AgentCommand } from '../config.js'

export interface ReactorHookState {
  steps_taken: number
  guardrail_blocks: number
  last_failed_command: AgentCommand | null
  repeated_failures: number
}

export interface HookBeforeFinishResult {
  allow: boolean
  inject_message?: string
}

export interface ReactorHooks {
  state: ReactorHookState
  beforeToolCall: (toolName: string, args: Record<string, unknown>) => void
  afterToolResult: (
    toolName: string,
    result: { success: boolean; blockedBy?: string; stateUpdated?: boolean },
  ) => void
  beforeFinish: (reachedGoal: boolean) => HookBeforeFinishResult
}

export const createReactorHooks = (stallThreshold: number): ReactorHooks => {
  const state: ReactorHookState = {
    steps_taken: 0,
    guardrail_blocks: 0,
    last_failed_command: null,
    repeated_failures: 0,
  }

  return {
    state,
    beforeToolCall: (toolName, args) => {
      if (toolName === 'execute_command' && typeof args.command === 'string') {
        const cmd = args.command as AgentCommand
        if (cmd !== 'left' && cmd !== 'right' && cmd !== 'wait') {
          throw new Error(`Invalid execute_command value: ${args.command}`)
        }
      }
    },
    afterToolResult: (toolName, result) => {
      if (toolName !== 'execute_command') return

      if (result.blockedBy === 'guardrail') {
        state.guardrail_blocks += 1
        state.repeated_failures += 1
        return
      }

      if (result.stateUpdated && result.success) {
        state.steps_taken += 1
        state.repeated_failures = 0
        state.last_failed_command = null
      }
    },
    beforeFinish: (reachedGoal) => {
      if (reachedGoal) {
        return { allow: true }
      }

      if (state.repeated_failures >= stallThreshold) {
        return {
          allow: false,
          inject_message:
            'Navigation is stalled after repeated guardrail blocks. Call request_restart or choose a different command.',
        }
      }

      return {
        allow: false,
        inject_message:
          'Goal not reached yet. Continue navigating using execute_command based on the latest radar and hub snapshot.',
      }
    },
  }
}
