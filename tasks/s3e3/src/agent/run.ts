import { randomUUID } from 'node:crypto'
import {
  MAX_LLM_TURNS_PER_STEP,
  MAX_STEPS,
  MAX_TOOL_ROUNDS,
  START_TRIGGER,
  STALL_THRESHOLD,
  agentModel,
  maxOutputTokens,
  type AgentCommand,
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
import { createReactorHooks } from '../hooks/reactor-hooks.js'
import {
  chatTraced,
  extractText,
  extractToolCalls,
  type FunctionCallOutput,
} from '../llm/traced.js'
import { buildAgentContext } from '../radar/analyze.js'
import { isCrushed, isGoalReached, isTerminalHubState } from '../radar/parse.js'
import type { ParsedState } from '../radar/types.js'
import { submitCommand } from '../services/reactor-api.js'
import { tools } from '../tools/definitions.js'
import { createHandlers, type ToolHandlers, type ToolResponse } from '../tools/handlers.js'
import { buildReactorSystemPrompt } from './prompt.js'

export interface AgentRunResult {
  reply: string
  flag: string | null
  steps: number
  turns: number
  usage: { input?: number; output?: number; total?: number }
}

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

const executeToolCalls = async (
  toolCalls: FunctionCallOutput[],
  handlers: ToolHandlers,
  hooks: ReturnType<typeof createReactorHooks>,
  log: Logger,
): Promise<{ outputs: ReturnType<typeof toOutput>[]; flag: string | null }> => {
  const outputs = []
  let flag: string | null = null

  for (const call of toolCalls) {
    let args: Record<string, unknown>
    try {
      args = JSON.parse(call.arguments) as Record<string, unknown>
    } catch {
      const payload: ToolResponse = {
        success: false,
        message: 'Tool arguments were not valid JSON.',
        recoveryHints: `Re-issue ${call.name} with valid JSON matching the tool schema.`,
      }
      outputs.push(toOutput(call.call_id, payload))
      continue
    }

    hooks.beforeToolCall(call.name, args)
    log.info('tool.call', { name: call.name, args })

    const handler = handlers[call.name as keyof ToolHandlers]
    if (!handler) {
      const payload: ToolResponse = {
        success: false,
        message: `Unknown tool: ${call.name}`,
        recoveryHints: `Available tools: ${Object.keys(handlers).join(', ')}.`,
      }
      outputs.push(toOutput(call.call_id, payload))
      continue
    }

    const result = await (handler as (args: Record<string, unknown>) => Promise<ToolResponse>)(args)
    hooks.afterToolResult(call.name, result)
    log.info('tool.result', {
      name: call.name,
      success: result.success,
      blockedBy: result.blockedBy ?? null,
      hasFlag: Boolean(result.flag),
    })

    outputs.push(toOutput(call.call_id, result))
    if (result.flag) {
      flag = result.flag
    }
  }

  return { outputs, flag }
}

export const runReactorAgent = async (log: Logger): Promise<AgentRunResult> => {
  const runId = randomUUID()
  const instructions = buildReactorSystemPrompt()
  const hooks = createReactorHooks(STALL_THRESHOLD)

  let currentState: ParsedState
  const startResult = await submitCommand('start', log)
  currentState = startResult.state

  if (startResult.flag) {
    return {
      reply: `Mission complete on start. Flag: ${startResult.flag}`,
      flag: startResult.flag,
      steps: 0,
      turns: 0,
      usage: {},
    }
  }

  return withAgent(
    {
      name: 'reactor-navigator',
      contextName: 'reactor',
      agentId: `reactor:${runId}`,
      task: START_TRIGGER,
      metadata: { maxSteps: MAX_STEPS },
    },
    async () => {
      const promptRef = getPromptRefByName('agents/reactor')
      setPromptRef(promptRef)

      const handlers = createHandlers({
        getState: () => currentState,
        setState: (state) => {
          currentState = state
        },
        log,
      })

      let conversation: unknown[] = [
        { role: 'user', content: START_TRIGGER },
        {
          role: 'user',
          content: JSON.stringify(buildAgentContext(currentState)),
        },
      ]

      let usage: { input?: number; output?: number; total?: number } = {}
      let flag: string | null = startResult.flag
      let turns = 0
      let steps = 0

      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        if (flag || isGoalReached(currentState)) {
          const reply = flag
            ? `Mission complete. Flag: ${flag}`
            : 'Goal reached.'
          setTraceOutput({ reply, flag, steps, turns, usage })
          return { reply, flag, steps, turns, usage }
        }

        if (isCrushed(currentState) || !currentState.hasSpatial) {
          conversation.push({
            role: 'user',
            content: JSON.stringify({
              ...buildAgentContext(currentState),
              notice:
                'Hub returned status without full board data. Read hub.message and decide next action (likely request_restart).',
            }),
          })
        }

        if (steps >= MAX_STEPS) {
          log.warn('agent.maxSteps', { steps: MAX_STEPS })
          break
        }

        let stepResolved = false

        for (let attempt = 0; attempt < MAX_LLM_TURNS_PER_STEP; attempt += 1) {
          turns = advanceTurn()
          log.debug('agent.turn', {
            round,
            attempt,
            turn: turns,
            playerCol: currentState.player?.col ?? null,
            hasSpatial: currentState.hasSpatial,
          })

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

          if (toolCalls.length === 0) {
            const text = extractText(response) ?? ''
            const finish = hooks.beforeFinish(isGoalReached(currentState) && currentState.hasSpatial)
            if (!finish.allow && finish.inject_message) {
              conversation.push({ role: 'assistant', content: text })
              conversation.push({ role: 'user', content: finish.inject_message })
              continue
            }
            conversation.push({ role: 'assistant', content: text })
            stepResolved = true
            break
          }

          for (const call of toolCalls) {
            if (call.name === 'execute_command') {
              try {
                const args = JSON.parse(call.arguments) as { command?: AgentCommand }
                if (args.command) {
                  hooks.state.last_failed_command = args.command
                }
              } catch {
                // handler reports invalid JSON
              }
            }
          }

          const { outputs, flag: capturedFlag } = await executeToolCalls(
            toolCalls,
            handlers,
            hooks,
            log,
          )

          conversation = [...conversation, ...toolCalls, ...outputs]

          if (capturedFlag) {
            flag = capturedFlag
            const reply = `Mission complete. Flag: ${flag}`
            setTraceOutput({ reply, flag, steps: hooks.state.steps_taken, turns, usage })
            return {
              reply,
              flag,
              steps: hooks.state.steps_taken,
              turns,
              usage,
            }
          }

          const stateChanged = outputs.some((o) => {
            try {
              const parsed = JSON.parse(o.output) as ToolResponse
              return parsed.stateUpdated === true
            } catch {
              return false
            }
          })

          if (stateChanged) {
            steps = hooks.state.steps_taken
            conversation.push({
              role: 'user',
              content: JSON.stringify(buildAgentContext(currentState)),
            })
            stepResolved = true
            break
          }
        }

        if (!stepResolved) {
          log.warn('agent.stepStall', {
            round,
            playerCol: currentState.player?.col ?? null,
            hasSpatial: currentState.hasSpatial,
            terminal: isTerminalHubState(currentState),
          })
          conversation.push({
            role: 'user',
            content:
              'No progress this step. Re-read radar and hub, then execute_command or request_restart.',
          })
        }
      }

      const reply = flag
        ? `Mission complete. Flag: ${flag}`
        : 'Reached limits before capturing the flag.'
      setTraceOutput({ reply, flag, steps: hooks.state.steps_taken, turns, usage })
      return {
        reply,
        flag,
        steps: hooks.state.steps_taken,
        turns,
        usage,
      }
    },
  )
}
