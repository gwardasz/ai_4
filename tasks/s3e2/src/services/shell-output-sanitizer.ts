import {
  BINARY_SAMPLE_CHARS,
  MAX_SHELL_OUTPUT_CHARS,
} from '../config.js'

export const TRUNCATION_SUFFIX = `\n[...Output truncated after ${MAX_SHELL_OUTPUT_CHARS} characters...]`

export const SHELL_RECOVERY_HINTS =
  'Do not cat binary files. Use targeted commands such as file, head, strings, or hexdump with limits instead.'

export type ShellValidationReason = 'binary' | 'unsafe_text' | 'response_too_large'

export type ShellValidationResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: ShellValidationReason; path: string }

export class ShellOutputValidationError extends Error {
  readonly reason: ShellValidationReason
  readonly path: string

  constructor(reason: ShellValidationReason, path: string) {
    super(`Shell output validation failed at ${path}: ${reason}`)
    this.name = 'ShellOutputValidationError'
    this.reason = reason
    this.path = path
  }
}

const analyzeString = (text: string): 'ok' | 'binary' | 'unsafe_text' => {
  const sampleLen = Math.min(text.length, BINARY_SAMPLE_CHARS)
  if (sampleLen === 0) {
    return 'ok'
  }

  let suspicious = 0
  for (let i = 0; i < sampleLen; i++) {
    const code = text.charCodeAt(i)
    if (code === 0) {
      return 'binary'
    }
    if (code < 9 || (code > 13 && code < 32)) {
      suspicious += 1
    }
  }

  if (suspicious / sampleLen > 0.3) {
    return 'unsafe_text'
  }

  return 'ok'
}

export const isBinaryString = (text: string): boolean => analyzeString(text) === 'binary'

export const isSafeTextString = (text: string): boolean => analyzeString(text) === 'ok'

export const validateShellValue = (value: unknown, path: string): ShellValidationResult => {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return { ok: true, value }
  }

  if (typeof value === 'string') {
    const verdict = analyzeString(value)
    if (verdict !== 'ok') {
      return { ok: false, reason: verdict, path }
    }
    return { ok: true, value }
  }

  if (Array.isArray(value)) {
    const sanitized: unknown[] = []
    for (let i = 0; i < value.length; i++) {
      const item = validateShellValue(value[i], `${path}[${i}]`)
      if (!item.ok) {
        return item
      }
      sanitized.push(item.value)
    }
    return { ok: true, value: sanitized }
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const item = validateShellValue(nested, `${path}.${key}`)
      if (!item.ok) {
        return item
      }
      sanitized[key] = item.value
    }
    return { ok: true, value: sanitized }
  }

  return { ok: true, value }
}

export const truncateShellOutput = (text: string): { text: string; truncated: boolean } => {
  if (text.length <= MAX_SHELL_OUTPUT_CHARS) {
    return { text, truncated: false }
  }

  return {
    text: text.slice(0, MAX_SHELL_OUTPUT_CHARS) + TRUNCATION_SUFFIX,
    truncated: true,
  }
}

export const buildSanitizedShellError = (
  reason: ShellValidationReason,
  path?: string,
): { message: string; detail: string } => {
  const message = 'System Error: Command returned binary data or exceeded limits'
  const detail =
    reason === 'response_too_large'
      ? 'Shell API response exceeded the maximum allowed JSON size before parsing.'
      : path
        ? `Validation failed at ${path} (${reason}).`
        : `Validation failed (${reason}).`

  return { message, detail }
}

export const formatGuardOutput = (
  reason: ShellValidationReason,
  path?: string,
): string =>
  JSON.stringify({
    success: false,
    ...buildSanitizedShellError(reason, path),
  })
