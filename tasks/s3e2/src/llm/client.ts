import { AI_API_KEY, EXTRA_API_HEADERS, RESPONSES_API_ENDPOINT } from '../../../../config.js'
import {
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_HTTP_RETRIES,
  MAX_RATE_LIMIT_WAIT_MS,
} from '../config.js'
import type { Logger } from '../core/logger.js'
import { noopLogger } from '../core/logger.js'

const sleep = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, Math.max(0, ms)))

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

const parseRetryAfter = (headers: Headers): number | null => {
  const raw = headers.get('retry-after')
  if (!raw) return null
  const asNumber = Number(raw)
  if (Number.isFinite(asNumber)) return asNumber * 1000
  const asDate = Date.parse(raw)
  return Number.isNaN(asDate) ? null : asDate - Date.now()
}

const isRetryable = (status: number, message: string): boolean => {
  if (status >= 400 && status < 500 && status !== 429) return false
  if (RETRYABLE_STATUSES.has(status)) return true
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes('provider returned error') ||
    lower.includes('overloaded') ||
    lower.includes('rate limit') ||
    lower.includes('temporarily unavailable') ||
    lower.includes('timeout')
  )
}

const backoffWait = (retries: number, headers: Headers | null): number => {
  const backoff = Math.min(BASE_BACKOFF_MS * 2 ** retries, MAX_BACKOFF_MS)
  const jitter = Math.floor(Math.random() * BASE_BACKOFF_MS)
  const retryAfter = headers ? parseRetryAfter(headers) : null
  return Math.min(retryAfter ?? backoff + jitter, MAX_RATE_LIMIT_WAIT_MS)
}

export interface ResponseTool {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
  strict?: boolean
}

export interface ChatParams {
  model: string
  input: unknown[]
  tools?: ResponseTool[]
  instructions?: string
  maxOutputTokens?: number
  toolChoice?: string
  log?: Logger
}

export interface FunctionCallOutput {
  type: 'function_call'
  call_id: string
  name: string
  arguments: string
}

export interface ResponsesApiResult {
  output?: unknown[]
  output_text?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }
  error?: { message?: string; metadata?: { raw?: string } }
}

export const chat = async ({
  model,
  input,
  tools,
  instructions,
  maxOutputTokens,
  toolChoice = 'auto',
  log = noopLogger,
}: ChatParams): Promise<ResponsesApiResult> => {
  const body: Record<string, unknown> = { model, input }

  if (tools?.length) {
    body.tools = tools
    body.tool_choice = toolChoice
  }

  if (instructions) {
    body.instructions = instructions
  }

  if (maxOutputTokens) {
    body.max_output_tokens = maxOutputTokens
  }

  let retries = 0

  for (;;) {
    let response: Response
    try {
      response = await fetch(RESPONSES_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AI_API_KEY}`,
          ...EXTRA_API_HEADERS,
        },
        body: JSON.stringify(body),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (retries < MAX_HTTP_RETRIES) {
        const wait = backoffWait(retries, null)
        retries += 1
        log.info('llm.retry', { reason: 'network', attempt: retries, wait, message })
        await sleep(wait)
        continue
      }
      throw new Error(`Network error reaching LLM API: ${message}`)
    }

    let data: ResponsesApiResult
    try {
      data = (await response.json()) as ResponsesApiResult
    } catch {
      if (retries < MAX_HTTP_RETRIES && isRetryable(response.status, '')) {
        const wait = backoffWait(retries, response.headers)
        retries += 1
        log.info('llm.retry', {
          reason: 'invalid_json',
          attempt: retries,
          status: response.status,
          wait,
        })
        await sleep(wait)
        continue
      }
      throw new Error(`Invalid JSON from LLM API (status ${response.status})`)
    }

    if (!response.ok || data.error) {
      let message = data?.error?.message ?? `Request failed with status ${response.status}`
      const raw = data?.error?.metadata?.raw
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { error?: { message?: string } }
          const providerMessage = parsed?.error?.message
          if (providerMessage) message = providerMessage
        } catch {
          // keep outer message
        }
      }
      if (isRetryable(response.status, message) && retries < MAX_HTTP_RETRIES) {
        const wait = backoffWait(retries, response.headers)
        retries += 1
        log.info('llm.retry', { attempt: retries, status: response.status, wait, message })
        await sleep(wait)
        continue
      }
      log.error('llm.error', { status: response.status, model: body.model, message })
      throw new Error(message)
    }

    return data
  }
}

export const extractToolCalls = (response: ResponsesApiResult): FunctionCallOutput[] =>
  (response.output ?? []).flatMap((item) => {
    if (
      item &&
      typeof item === 'object' &&
      'type' in item &&
      item.type === 'function_call' &&
      'call_id' in item &&
      typeof item.call_id === 'string' &&
      'name' in item &&
      typeof item.name === 'string' &&
      'arguments' in item &&
      typeof item.arguments === 'string'
    ) {
      return [
        {
          type: 'function_call',
          call_id: item.call_id,
          name: item.name,
          arguments: item.arguments,
        },
      ]
    }

    return []
  })

export const extractText = (response: ResponsesApiResult): string | null => {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text
  }

  const message = (response.output ?? []).find(
    (item) =>
      item &&
      typeof item === 'object' &&
      'type' in item &&
      item.type === 'message',
  ) as { content?: Array<{ type: string; text?: string }> } | undefined
  return message?.content?.find((part) => part.type === 'output_text')?.text ?? null
}

export const summarizeResponse = (response: ResponsesApiResult): Record<string, unknown> => {
  const toolCalls = extractToolCalls(response)
  const text = extractText(response)

  return {
    ...(text ? { text } : {}),
    ...(toolCalls.length > 0
      ? {
          tool_calls: toolCalls.map((tc) => ({
            name: tc.name,
            arguments: tc.arguments,
          })),
        }
      : {}),
  }
}

export const mapUsage = (usage?: ResponsesApiResult['usage']): {
  input?: number
  output?: number
  total?: number
} => ({
  input: usage?.input_tokens,
  output: usage?.output_tokens,
  total: usage?.total_tokens,
})
