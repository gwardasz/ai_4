import { randomUUID } from 'node:crypto'
import {
  DEADLOCK_REPEAT_THRESHOLD,
  DEADLOCK_STALL_ROUNDS,
  MAX_TOOL_ROUNDS,
  START_TRIGGER,
  agentModel,
  maxOutputTokens,
} from '../config.js'
import type { Logger } from '../core/logger.js'
import {
  advanceTurn,
  getPromptRefByName,
  recordTraceError,
  setPromptRef,
  setTraceOutput,
  withAgent,
} from '../core/tracing/index.js'
import {
  chatTraced,
  extractText,
  extractToolCalls,
  type FunctionCallOutput,
} from '../llm/traced.js'
import { buildFirmwareSystemPrompt } from './prompt.js'
import { clearGitignoreCache, rebootVm } from '../services/shell-api.js'
import { tools } from '../tools/definitions.js'
import { createHandlers, type ToolHandlers, type ToolResponse } from '../tools/handlers.js'

export interface AgentRunResult {
  reply: string
  flag: string | null
  turns: number
  usage: { input?: number; output?: number; total?: number }
}

const FALLBACK_REPLY = 'Reached the tool-round limit without capturing the flag.'

const toOutput = (callId: string, payload: ToolResponse) => ({
  type: 'function_call_output' as const,
  call_id: callId,
  output: JSON.stringify(payload),
})

const mergeUsage = (
  left: { input?: number; output?: number; total?: number },
  right?: { input?: number; output?: number; total?: number },
) => ({
  input: (left.input ?? 0) + (right?.input ?? 0),
  output: (left.output ?? 0) + (right?.output ?? 0),
  total: (left.total ?? 0) + (right?.total ?? 0),
})

const fingerprintObservation = (results: ToolResponse[]): string =>
  results.map((r) => `${r.success}:${r.output?.slice(0, 200) ?? r.message ?? ''}`).join('|')

const executeToolCalls = async (
  toolCalls: FunctionCallOutput[],
  handlers: ToolHandlers,
  log: Logger,
): Promise<{ outputs: ReturnType<typeof toOutput>[]; flag: string | null; observations: ToolResponse[] }> => {
  const outputs = []
  const observations: ToolResponse[] = []
  let flag: string | null = null

  for (const call of toolCalls) {
    let args: Record<string, unknown>
    try {
      args = JSON.parse(call.arguments) as Record<string, unknown>
    } catch {
      log.warn('tool.call', { name: call.name, args: '[invalid JSON]' })
      const payload: ToolResponse = {
        success: false,
        message: 'Tool arguments were not valid JSON.',
        recoveryHints: `Re-issue ${call.name} with valid JSON matching the tool schema.`,
      }
      observations.push(payload)
      outputs.push(toOutput(call.call_id, payload))
      continue
    }

    log.info('tool.call', { name: call.name, args })

    const handler = handlers[call.name as keyof ToolHandlers]
    if (!handler) {
      const payload: ToolResponse = {
        success: false,
        message: `Unknown tool: ${call.name}`,
        recoveryHints: `Available tools: ${Object.keys(handlers).join(', ')}.`,
      }
      observations.push(payload)
      outputs.push(toOutput(call.call_id, payload))
      continue
    }

    const result = await (handler as (args: Record<string, unknown>) => Promise<ToolResponse>)(args)
    log.info('tool.result', { name: call.name, success: result.success, hasFlag: Boolean(result.flag) })
    observations.push(result)
    outputs.push(toOutput(call.call_id, result))

    if (result.flag) {
      flag = result.flag
    }
  }

  return { outputs, flag, observations }
}

const handleDeadlock = async (
  state: {
    lastFingerprint: string | null
    stallRounds: number
    recentCommands: string[]
  },
  log: Logger,
): Promise<void> => {
  log.warn('agent.deadlock', {
    stallRounds: state.stallRounds,
    recentCommands: state.recentCommands.slice(-DEADLOCK_REPEAT_THRESHOLD),
  })
  clearGitignoreCache()
  await rebootVm(log)
  state.stallRounds = 0
  state.lastFingerprint = null
  state.recentCommands = []
}

export const runFirmwareAgent = async (log: Logger): Promise<AgentRunResult> => {
  const runId = randomUUID()
  const instructions = buildFirmwareSystemPrompt()
  const handlers = createHandlers(log)

  return withAgent(
    {
      name: 'firmware-agent',
      contextName: 'firmware',
      agentId: `firmware:${runId}`,
      task: START_TRIGGER,
      metadata: { maxTurns: MAX_TOOL_ROUNDS },
    },
    async () => {
      const promptRef = getPromptRefByName('agents/firmware')
      setPromptRef(promptRef)

      let conversation: unknown[] = [{ role: 'user', content: START_TRIGGER }]
      let usage: { input?: number; output?: number; total?: number } = {}
      let flag: string | null = null
      let turns = 0

      const deadlockState = {
        lastFingerprint: null as string | null,
        stallRounds: 0,
        recentCommands: [] as string[],
      }

      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        turns = advanceTurn()
        log.debug('agent.round', { round, turn: turns })

        let response
        try {
          response = await chatTraced({
            model: agentModel,
            tools,
            instructions,
            maxOutputTokens,
            input: conversation,
            log,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          recordTraceError({ message })
          throw error
        }

        usage = mergeUsage(usage, {
          input: response.usage?.input_tokens,
          output: response.usage?.output_tokens,
          total: response.usage?.total_tokens,
        })

        const toolCalls = extractToolCalls(response)
        log.info('llm.response', {
          toolCalls: toolCalls.length,
          tokens: response.usage?.total_tokens ?? null,
        })

        if (toolCalls.length === 0) {
          const reply = extractText(response) ?? FALLBACK_REPLY
          setTraceOutput({ reply, flag, turns, usage })
          return { reply, flag, turns, usage }
        }

        for (const call of toolCalls) {
          if (call.name === 'run_shell') {
            try {
              const args = JSON.parse(call.arguments) as { cmd?: string }
              if (typeof args.cmd === 'string') {
                deadlockState.recentCommands.push(args.cmd.trim())
                if (deadlockState.recentCommands.length > DEADLOCK_REPEAT_THRESHOLD * 2) {
                  deadlockState.recentCommands.shift()
                }
              }
            } catch {
              // ignore parse errors here; handler will report
            }
          }
        }

        const { outputs, flag: capturedFlag, observations } = await executeToolCalls(
          toolCalls,
          handlers,
          log,
        )
        conversation = [...conversation, ...toolCalls, ...outputs]

        if (capturedFlag) {
          flag = capturedFlag
          const reply = `Mission complete. Flag: ${flag}`
          setTraceOutput({ reply, flag, turns, usage })
          return { reply, flag, turns, usage }
        }

        const fingerprint = fingerprintObservation(observations)
        if (fingerprint === deadlockState.lastFingerprint) {
          deadlockState.stallRounds += 1
        } else {
          deadlockState.stallRounds = 0
          deadlockState.lastFingerprint = fingerprint
        }

        const repeated =
          deadlockState.recentCommands.length >= DEADLOCK_REPEAT_THRESHOLD &&
          new Set(deadlockState.recentCommands.slice(-DEADLOCK_REPEAT_THRESHOLD)).size === 1

        if (deadlockState.stallRounds >= DEADLOCK_STALL_ROUNDS || repeated) {
          await handleDeadlock(deadlockState, log)
          conversation.push({
            role: 'user',
            content:
              'System rebooted the VM due to lack of progress. Start again with "help" and continue the mission.',
          })
        }
      }

      log.warn('agent.maxRounds', { rounds: MAX_TOOL_ROUNDS })
      const reply = FALLBACK_REPLY
      setTraceOutput({ reply, flag, turns, usage })
      return { reply, flag, turns, usage }
    },
  )
}
