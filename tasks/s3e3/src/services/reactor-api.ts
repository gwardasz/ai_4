import { AI_DEVS_API_KEY } from '../../../../config.js'
import {
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_HTTP_RETRIES,
  MAX_RATE_LIMIT_WAIT_MS,
  TASK_NAME,
  VERIFY_URL,
  type ReactorCommand,
} from '../config.js'
import type { Logger } from '../core/logger.js'
import { noopLogger } from '../core/logger.js'
import { parseReactorResponse } from '../radar/parse.js'
import type { ParsedState } from '../radar/types.js'

const sleep = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, Math.max(0, ms)))

export const FLAG_RE = /\{\{?FLG:[^}]+\}?\}/i

export const extractFlag = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  const match = FLAG_RE.exec(text)
  return match ? match[0] : null
}

const parseRetryAfter = (headers: Headers): number | null => {
  const raw = headers.get('retry-after')
  if (!raw) return null
  const asNumber = Number(raw)
  if (Number.isFinite(asNumber)) return asNumber * 1000
  const asDate = Date.parse(raw)
  return Number.isNaN(asDate) ? null : asDate - Date.now()
}

export interface ReactorApiResult {
  ok: boolean
  status: number
  data: unknown
  raw: string
  flag: string | null
  state: ParsedState
}

export const buildReactorPayload = (command: ReactorCommand) => ({
  apikey: AI_DEVS_API_KEY,
  task: TASK_NAME,
  answer: { command },
})

export const submitCommand = async (
  command: ReactorCommand,
  log: Logger = noopLogger,
): Promise<ReactorApiResult> => {
  const payload = buildReactorPayload(command)

  log.info('reactor.request', { command })

  let retries = 0

  for (;;) {
    let response: Response
    try {
      response = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error('reactor.network', { message })
      throw new Error('Network error reaching verify endpoint.')
    }

    const raw = await response.text()
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      data = { raw }
    }

    if ((response.status === 503 || response.status === 429) && retries < MAX_HTTP_RETRIES) {
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** retries, MAX_BACKOFF_MS)
      const retryAfter = parseRetryAfter(response.headers)
      const wait = Math.min(retryAfter ?? backoff, MAX_RATE_LIMIT_WAIT_MS)
      retries += 1
      log.info('reactor.retry', { status: response.status, attempt: retries, wait })
      await sleep(wait)
      continue
    }

    const flag = extractFlag(data) ?? extractFlag(raw)
    const state = parseReactorResponse(data)

    log.info('reactor.response', {
      status: response.status,
      ok: response.ok,
      command,
      playerCol: state.player?.col ?? null,
      hasSpatial: state.hasSpatial,
      reachedGoal: state.hub.reached_goal,
      hasFlag: Boolean(flag),
    })
    if (flag) log.info('reactor.flag', { flag })

    return {
      ok: response.ok,
      status: response.status,
      data,
      raw,
      flag,
      state,
    }
  }
}
