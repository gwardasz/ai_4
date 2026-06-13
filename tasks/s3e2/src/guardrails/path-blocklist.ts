const BLOCKED_SEGMENTS = ['/etc', '/root', '/proc'] as const

export interface PathBlocklistResult {
  allowed: boolean
  reason?: string
}

const normalizeForCheck = (cmd: string): string => cmd.replace(/\\/g, '/').toLowerCase()

const segmentPattern = (segment: string): RegExp => {
  const escaped = segment.replace('/', '\\/')
  return new RegExp(`(^|[\\s"'=(])${escaped}(/|$|[\\s"'\\])])`)
}

export const checkPathBlocklist = (cmd: string): PathBlocklistResult => {
  const normalized = normalizeForCheck(cmd)

  for (const segment of BLOCKED_SEGMENTS) {
    if (segmentPattern(segment).test(normalized)) {
      return {
        allowed: false,
        reason: `Access denied: path "${segment}" is forbidden on this VM.`,
      }
    }
  }

  return { allowed: true }
}

export const formatBlockedResponse = (reason: string): string =>
  JSON.stringify({
    success: false,
    blocked: true,
    message: reason,
    hint: 'Do not retry this path. Find an alternative approach within allowed directories.',
  })
