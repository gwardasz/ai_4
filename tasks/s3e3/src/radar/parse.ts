import type { ParsedState, ReactorApiResponse } from './types.js'

const SPATIAL_KEYS = new Set(['board', 'player', 'goal', 'blocks'])

const isBlock = (value: unknown): value is ReactorApiResponse['blocks'][number] => {
  if (!value || typeof value !== 'object') return false
  const b = value as Record<string, unknown>
  return (
    typeof b.col === 'number' &&
    typeof b.top_row === 'number' &&
    typeof b.bottom_row === 'number' &&
    (b.direction === 'up' || b.direction === 'down')
  )
}

const isPosition = (value: unknown): value is ReactorApiResponse['player'] => {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return typeof p.col === 'number' && typeof p.row === 'number'
}

const isBoard = (value: unknown): value is string[][] =>
  Array.isArray(value) &&
  value.every(
    (row) =>
      Array.isArray(row) && row.every((cell) => typeof cell === 'string'),
  )

const hasCompleteSpatial = (raw: Record<string, unknown>): boolean =>
  isBoard(raw.board) &&
  isPosition(raw.player) &&
  isPosition(raw.goal) &&
  Array.isArray(raw.blocks) &&
  raw.blocks.every(isBlock)

const buildHubFromSpatial = (raw: Record<string, unknown>): Record<string, unknown> => {
  const hub: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!SPATIAL_KEYS.has(key)) {
      hub[key] = value
    }
  }
  return hub
}

export const parseReactorResponse = (data: unknown): ParsedState => {
  if (!data || typeof data !== 'object') {
    throw new Error('Reactor API response must be a JSON object.')
  }

  const raw = data as Record<string, unknown>

  if (!hasCompleteSpatial(raw)) {
    return {
      hasSpatial: false,
      hub: { ...raw },
    }
  }

  return {
    hasSpatial: true,
    board: raw.board as string[][],
    player: raw.player as ReactorApiResponse['player'],
    goal: raw.goal as ReactorApiResponse['goal'],
    blocks: raw.blocks as ReactorApiResponse['blocks'],
    hub: buildHubFromSpatial(raw),
  }
}

export const hasSpatialState = (state: ParsedState): boolean => state.hasSpatial

export const buildHubPayload = (state: ParsedState): Record<string, unknown> => ({
  ...state.hub,
})

const crushKeywords = ['crush', 'squash', 'collision', 'destroyed']

export const isCrushed = (state: ParsedState): boolean => {
  const crushed = state.hub.crushed ?? state.hub.dead ?? state.hub.game_over
  if (typeof crushed === 'boolean') return crushed

  const message = typeof state.hub.message === 'string' ? state.hub.message.toLowerCase() : ''
  return crushKeywords.some((kw) => message.includes(kw))
}

export const isGoalReached = (state: ParsedState): boolean => {
  if (state.hub.reached_goal === true) return true

  if (!state.hasSpatial || !state.player || !state.goal) {
    return false
  }

  return state.player.col === state.goal.col && state.player.row === state.goal.row
}

export const isTerminalHubState = (state: ParsedState): boolean =>
  !state.hasSpatial || isCrushed(state) || isGoalReached(state)
