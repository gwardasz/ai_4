import {
  validateShellValue,
  type ShellValidationReason,
} from './shell-output-sanitizer.js'

export interface HubShellFields {
  code?: number
  message?: string
  data?: unknown
}

export type FormatShellResult =
  | { kind: 'ok'; text: string }
  | { kind: 'error'; reason: ShellValidationReason; path: string }

export const isHubShellBody = (obj: Record<string, unknown>): boolean =>
  'message' in obj || 'code' in obj || 'data' in obj

export const extractHubShellFields = (data: unknown): HubShellFields | null => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null
  }

  const obj = data as Record<string, unknown>
  if (!isHubShellBody(obj)) {
    return null
  }

  const fields: HubShellFields = {}
  if (obj.code !== undefined) fields.code = Number(obj.code)
  if (obj.message !== undefined) fields.message = String(obj.message)
  if (obj.data !== undefined) fields.data = obj.data
  return fields
}

export const sanitizeParsedShellBody = (
  data: unknown,
): { ok: true; body: unknown } | { ok: false; reason: ShellValidationReason; path: string } => {
  const validated = validateShellValue(data, '$')
  if (!validated.ok) {
    return validated
  }
  return { ok: true, body: validated.value }
}

const stringifySanitizedBody = (body: unknown): string => {
  if (typeof body === 'string') {
    return body
  }
  return JSON.stringify(body, null, 2)
}

export const formatShellResponse = (data: unknown, raw: string): FormatShellResult => {
  if (typeof data === 'string') {
    const sanitized = sanitizeParsedShellBody(data)
    if (!sanitized.ok) {
      return { kind: 'error', reason: sanitized.reason, path: sanitized.path }
    }
    return { kind: 'ok', text: stringifySanitizedBody(sanitized.body) }
  }

  if (!data || typeof data !== 'object') {
    const fallback = raw || ''
    if (!fallback) {
      return { kind: 'ok', text: '' }
    }
    const sanitized = sanitizeParsedShellBody(fallback)
    if (!sanitized.ok) {
      return { kind: 'error', reason: sanitized.reason, path: sanitized.path }
    }
    return { kind: 'ok', text: stringifySanitizedBody(sanitized.body) }
  }

  const obj = data as Record<string, unknown>

  if ('raw' in obj && typeof obj.raw === 'string' && Object.keys(obj).length === 1) {
    const sanitized = sanitizeParsedShellBody(obj.raw)
    if (!sanitized.ok) {
      return { kind: 'error', reason: sanitized.reason, path: sanitized.path }
    }
    return { kind: 'ok', text: stringifySanitizedBody(sanitized.body) }
  }

  const sanitized = sanitizeParsedShellBody(data)
  if (!sanitized.ok) {
    return { kind: 'error', reason: sanitized.reason, path: sanitized.path }
  }

  return { kind: 'ok', text: stringifySanitizedBody(sanitized.body) }
}

export const shellDataAsText = (data: unknown): string | null => {
  const validated = validateShellValue(data, '$')
  if (!validated.ok) {
    return null
  }

  const safe = validated.value
  if (typeof safe === 'string') return safe
  if (Array.isArray(safe)) {
    return safe.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n')
  }
  if (safe !== undefined && safe !== null) {
    return JSON.stringify(safe, null, 2)
  }
  return null
}

export const isBannedShellResponse = (
  obj: Record<string, unknown>,
  output: string,
): boolean => {
  const messageText = typeof obj.message === 'string' ? obj.message : output
  return obj.banned === true || messageText.toLowerCase().includes('banned')
}

export const formatShellResponseText = (data: unknown, raw: string): string => {
  const formatted = formatShellResponse(data, raw)
  if (formatted.kind === 'error') {
    return ''
  }
  return formatted.text
}
