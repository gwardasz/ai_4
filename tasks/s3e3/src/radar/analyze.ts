import { GRID_COLS, PLAYER_ROW } from '../config.js'
import type {
  AgentContextPayload,
  ColumnRadar,
  ParsedState,
  RadarSnapshot,
  ReactorBlock,
} from './types.js'
import { blockOccupiesRow } from './simulate.js'

const findBlockInColumn = (
  blocks: ReactorBlock[],
  col: number,
): ReactorBlock | undefined => blocks.find((b) => b.col === col)

const columnRadar = (
  block: ReactorBlock | undefined,
  playerRow: number,
): ColumnRadar => {
  if (!block) {
    return { status: 'clear' }
  }

  if (blockOccupiesRow(block, playerRow)) {
    return { dist: 0, dir: block.direction }
  }

  if (block.bottom_row < playerRow) {
    return { dist: playerRow - block.bottom_row, dir: block.direction }
  }

  return { dist: block.top_row - playerRow, dir: block.direction }
}

export const analyzeRadar = (state: ParsedState): RadarSnapshot => {
  if (!state.hasSpatial || !state.player || !state.goal || !state.blocks) {
    throw new Error('Cannot analyze radar without spatial state.')
  }

  const { player, goal, blocks } = state
  const col = player.col

  const leftCol = col - 1
  const rightCol = col + 1

  const L: ColumnRadar =
    col <= 1
      ? { status: 'wall' }
      : columnRadar(findBlockInColumn(blocks, leftCol), player.row)

  const C: ColumnRadar = columnRadar(findBlockInColumn(blocks, col), player.row)

  const R: ColumnRadar =
    col >= GRID_COLS
      ? { status: 'edge' }
      : columnRadar(findBlockInColumn(blocks, rightCol), player.row)

  return {
    position: { col: player.col, row: PLAYER_ROW },
    columns: { L, C, R },
    target: { dir: 'right', dist: Math.max(0, goal.col - player.col) },
  }
}

export const buildAgentContext = (state: ParsedState): AgentContextPayload => {
  if (!state.hasSpatial) {
    return {
      hub: state.hub,
      radar: {
        status: 'unavailable',
        reason: 'Spatial board state not provided by hub.',
      },
    }
  }

  return {
    radar: analyzeRadar(state),
    hub: state.hub,
  }
}
