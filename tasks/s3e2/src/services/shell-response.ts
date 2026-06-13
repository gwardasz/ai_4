export interface HubShellFields {
  code?: number
  message?: string
  data?: unknown
}

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

export const formatShellResponse = (data: unknown, raw: string): string => {
  if (typeof data === 'string') return data
  if (!data || typeof data !== 'object') return raw || ''

  const obj = data as Record<string, unknown>
  const hub = extractHubShellFields(obj)

  if (hub) {
    const payload: Record<string, unknown> = {}
    if (hub.code !== undefined && !Number.isNaN(hub.code)) payload.code = hub.code
    if (hub.message !== undefined) payload.message = hub.message
    if (hub.data !== undefined) payload.data = hub.data
    return JSON.stringify(payload, null, 2)
  }

  if (typeof obj.output === 'string') return obj.output
  if (typeof obj.error === 'string') return obj.error
  if (typeof obj.result === 'string') return obj.result
  return JSON.stringify(data, null, 2)
}

export const shellDataAsText = (data: unknown): string | null => {
  if (typeof data === 'string') return data
  if (Array.isArray(data)) {
    return data.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n')
  }
  if (data !== undefined && data !== null) {
    return JSON.stringify(data, null, 2)
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
