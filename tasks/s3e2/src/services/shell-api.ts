import { AI_DEVS_API_KEY } from '../../../../config.js'
import {
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_HTTP_RETRIES,
  MAX_RATE_LIMIT_WAIT_MS,
  MAX_SHELL_RAW_JSON_CHARS,
  SHELL_URL,
} from '../config.js'
import type { Logger } from '../core/logger.js'
import { noopLogger } from '../core/logger.js'
import {
  checkGitignoreRules,
  extractPathsFromCmd,
  formatGitignoreBlockedResponse,
  parseGitignore,
  type GitignoreRule,
} from '../guardrails/gitignore.js'
import { checkPathBlocklist, formatBlockedResponse } from '../guardrails/path-blocklist.js'
import {
  formatGuardOutput,
  SHELL_RECOVERY_HINTS,
  truncateShellOutput,
  type ShellValidationReason,
} from './shell-output-sanitizer.js'
import {
  extractHubShellFields,
  formatShellResponse,
  isBannedShellResponse,
  shellDataAsText,
} from './shell-response.js'

const sleep = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, Math.max(0, ms)))

const parseRetryAfter = (headers: Headers): number | null => {
  const raw = headers.get('retry-after')
  if (!raw) return null
  const asNumber = Number(raw)
  if (Number.isFinite(asNumber)) return asNumber * 1000
  const asDate = Date.parse(raw)
  return Number.isNaN(asDate) ? null : asDate - Date.now()
}

export interface ShellResult {
  success: boolean
  status: number
  output: string
  message?: string
  code?: number
  data?: unknown
  blocked?: boolean
  retried?: boolean
  truncated?: boolean
  sanitizerRejected?: boolean
  recoveryHints?: string
}

export class ShellApiUnavailableError extends Error {
  readonly cmd: string
  readonly retries: number

  constructor(message: string, cmd: string, retries: number) {
    super(message)
    this.name = 'ShellApiUnavailableError'
    this.cmd = cmd
    this.retries = retries
  }
}

const gitignoreCache = new Map<string, GitignoreRule[]>()

const dirname = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  if (idx <= 0) return '/'
  return normalized.slice(0, idx) || '/'
}

const toShellGuardResult = (
  response: Response,
  reason: ShellValidationReason,
  path: string,
  retried: boolean,
): ShellResult => ({
  success: false,
  status: response.status,
  output: formatGuardOutput(reason, path),
  message: 'System Error: Command returned binary data or exceeded limits',
  sanitizerRejected: true,
  recoveryHints: SHELL_RECOVERY_HINTS,
  retried,
})

const fetchGitignoreRules = async (dir: string, log: Logger): Promise<GitignoreRule[]> => {
  const cacheKey = dir.replace(/\/+$/, '') || '/'
  const cached = gitignoreCache.get(cacheKey)
  if (cached) return cached

  const gitignorePath = cacheKey === '/' ? '/.gitignore' : `${cacheKey}/.gitignore`
  const result = await executeShellRaw(`cat ${gitignorePath}`, log)

  if (!result.success) {
    gitignoreCache.set(cacheKey, [])
    return []
  }

  const text = shellDataAsText(result.data) ?? result.output
  if (!text.trim()) {
    gitignoreCache.set(cacheKey, [])
    return []
  }

  const rules = parseGitignore(text)
  gitignoreCache.set(cacheKey, rules)
  return rules
}

const validateCmd = async (cmd: string, log: Logger): Promise<ShellResult | null> => {
  const blocklist = checkPathBlocklist(cmd)
  if (!blocklist.allowed) {
    log.warn('shell.blocked.path', { cmd, reason: blocklist.reason })
    return {
      success: false,
      status: 403,
      output: formatBlockedResponse(blocklist.reason ?? 'Forbidden path'),
      message: blocklist.reason,
      blocked: true,
    }
  }

  const paths = extractPathsFromCmd(cmd)
  for (const filePath of paths) {
    if (!filePath.startsWith('/')) continue
    const dir = dirname(filePath)
    const rules = await fetchGitignoreRules(dir, log)
    const check = checkGitignoreRules(filePath, rules)
    if (!check.allowed) {
      log.warn('shell.blocked.gitignore', { cmd, path: filePath, reason: check.reason })
      return {
        success: false,
        status: 403,
        output: formatGitignoreBlockedResponse(check.reason ?? 'Protected by .gitignore'),
        message: check.reason,
        blocked: true,
      }
    }
  }

  return null
}

const buildShellResult = (
  response: Response,
  data: unknown,
  output: string,
  retried: boolean,
  truncated: boolean,
): ShellResult => {
  const hub = extractHubShellFields(data)

  return {
    success: response.ok,
    status: response.status,
    output,
    ...(hub?.message !== undefined ? { message: hub.message } : {}),
    ...(hub?.code !== undefined && !Number.isNaN(hub.code) ? { code: hub.code } : {}),
    ...(hub?.data !== undefined ? { data: hub.data } : {}),
    retried,
    truncated,
  }
}

const formatShellOutput = (
  data: unknown,
  raw: string,
  response: Response,
  retried: boolean,
): ShellResult | null => {
  const formatted = formatShellResponse(data, raw)
  if (formatted.kind === 'error') {
    return toShellGuardResult(response, formatted.reason, formatted.path, retried)
  }

  const { text, truncated } = truncateShellOutput(formatted.text)
  return buildShellResult(response, data, text, retried, truncated)
}

const executeShellRaw = async (cmd: string, log: Logger): Promise<ShellResult> => {
  const payload = { apikey: AI_DEVS_API_KEY, cmd }
  let retries = 0

  for (;;) {
    let response: Response
    try {
      response = await fetch(SHELL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (retries < MAX_HTTP_RETRIES) {
        const wait = Math.min(BASE_BACKOFF_MS * 2 ** retries, MAX_BACKOFF_MS)
        retries += 1
        log.info('shell.retry', { reason: 'network', attempt: retries, wait, cmd })
        await sleep(wait)
        continue
      }
      log.error('shell.unavailable', {
        cmd,
        retries,
        reason: 'network',
        message,
        url: SHELL_URL,
      })
      throw new ShellApiUnavailableError(
        `Shell API unreachable after ${retries} retries: ${message}`,
        cmd,
        retries,
      )
    }

    const raw = await response.text()

    if (raw.length > MAX_SHELL_RAW_JSON_CHARS) {
      log.warn('shell.sanitizer', {
        cmd,
        reason: 'response_too_large',
        rawLength: raw.length,
      })
      return toShellGuardResult(response, 'response_too_large', '$', retries > 0)
    }

    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      data = { raw }
    }

    if ((response.status === 429 || response.status === 503) && retries < MAX_HTTP_RETRIES) {
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** retries, MAX_BACKOFF_MS)
      const retryAfter = parseRetryAfter(response.headers)
      const wait = Math.min(retryAfter ?? backoff, MAX_RATE_LIMIT_WAIT_MS)
      retries += 1
      log.info('shell.retry', { status: response.status, attempt: retries, wait, cmd })
      await sleep(wait)
      continue
    }

    const formatted = formatShellOutput(data, raw, response, retries > 0)
    if (formatted?.sanitizerRejected) {
      log.warn('shell.sanitizer', {
        cmd,
        reason: 'validation_failed',
        outputLength: formatted.output.length,
      })
      return formatted
    }

    const output = formatted?.output ?? ''
    const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}

    if (response.status === 429) {
      return {
        success: false,
        status: 429,
        output: JSON.stringify({
          success: false,
          message: 'Rate limited by shell API. Wait and retry with a different approach.',
          detail: output,
        }),
        message: 'Rate limited',
        retried: retries > 0,
      }
    }

    if (isBannedShellResponse(obj, output)) {
      return {
        success: false,
        status: response.status,
        output: JSON.stringify({
          success: false,
          message: 'VM access banned due to security violation. Wait for ban to expire or reboot.',
          detail: output,
        }),
        message: 'Banned',
      }
    }

    return formatted ?? buildShellResult(response, data, output, retries > 0, false)
  }
}

export const executeShell = async (cmd: string, log: Logger = noopLogger): Promise<ShellResult> => {
  const blocked = await validateCmd(cmd, log)
  if (blocked) {
    return blocked
  }

  log.info('shell.request', { cmd })
  const result = await executeShellRaw(cmd, log)
  log.info('shell.response', {
    cmd,
    success: result.success,
    status: result.status,
    outputLength: result.output.length,
    truncated: result.truncated ?? false,
    sanitizerRejected: result.sanitizerRejected ?? false,
  })
  return result
}

export const rebootVm = async (log: Logger = noopLogger): Promise<ShellResult> => {
  log.warn('shell.reboot', { reason: 'deadlock recovery' })
  return executeShellRaw('reboot', log)
}

export const clearGitignoreCache = (): void => {
  gitignoreCache.clear()
}
