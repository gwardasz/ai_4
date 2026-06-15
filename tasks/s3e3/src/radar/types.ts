export type BlockDirection = 'up' | 'down'

export interface ReactorBlock {
  col: number
  top_row: number
  bottom_row: number
  direction: BlockDirection
}

export interface ReactorPosition {
  col: number
  row: number
}

export interface ReactorApiResponse {
  code: number
  message: string
  board: string[][]
  player: ReactorPosition
  goal: ReactorPosition
  blocks: ReactorBlock[]
  reached_goal: boolean
  [key: string]: unknown
}

export interface ParsedState {
  hasSpatial: boolean
  board?: string[][]
  player?: ReactorPosition
  goal?: ReactorPosition
  blocks?: ReactorBlock[]
  hub: Record<string, unknown>
}

export type ColumnRadar =
  | { status: 'wall' }
  | { status: 'edge' }
  | { status: 'clear' }
  | { dist: number; dir: BlockDirection }

export interface RadarSnapshot {
  position: ReactorPosition
  columns: {
    L: ColumnRadar
    C: ColumnRadar
    R: ColumnRadar
  }
  target: { dir: 'right'; dist: number }
}

export interface RadarUnavailable {
  status: 'unavailable'
  reason: string
}

export interface AgentContextPayload {
  radar?: RadarSnapshot | RadarUnavailable
  hub: Record<string, unknown>
}
