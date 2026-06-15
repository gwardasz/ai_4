import type { AgentCommand } from '../config.js'
import type { ParsedState } from './types.js'
import { isOutOfBounds, wouldCollide } from './simulate.js'

export interface GuardrailBlockResult {
  allowed: false
  blockedBy: 'guardrail'
  message: string
  recoveryHints: string
}

export interface GuardrailAllowResult {
  allowed: true
}

export type GuardrailResult = GuardrailAllowResult | GuardrailBlockResult

const GUARDRAIL_MESSAGE =
  'Guardrail: action not executed — immediate collision predicted.'

const GUARDRAIL_HINTS =
  'Select a different command (left, right, or wait). If no safe action is available, call request_restart to ask the operator for a reset.'

const UNAVAILABLE_MESSAGE =
  'Guardrail: action not executed — board state unavailable.'

const UNAVAILABLE_HINTS =
  'Read hub.message for the hub status. Call request_restart if the robot was crushed or the run must be reset.'

export const validateCommand = (
  state: ParsedState,
  command: AgentCommand,
): GuardrailResult => {
  if (!state.hasSpatial) {
    return {
      allowed: false,
      blockedBy: 'guardrail',
      message: UNAVAILABLE_MESSAGE,
      recoveryHints: UNAVAILABLE_HINTS,
    }
  }

  if (isOutOfBounds(state, command)) {
    return {
      allowed: false,
      blockedBy: 'guardrail',
      message: `Guardrail: action not executed — ${command} is out of bounds.`,
      recoveryHints: GUARDRAIL_HINTS,
    }
  }

  if (wouldCollide(state, command)) {
    return {
      allowed: false,
      blockedBy: 'guardrail',
      message: GUARDRAIL_MESSAGE,
      recoveryHints: GUARDRAIL_HINTS,
    }
  }

  return { allowed: true }
}
