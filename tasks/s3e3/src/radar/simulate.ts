import { GRID_ROWS, type AgentCommand } from '../config.js'
import type { ParsedState, ReactorBlock } from './types.js'

const cloneBlocks = (blocks: ReactorBlock[]): ReactorBlock[] =>
  blocks.map((b) => ({ ...b }))

const moveBlock = (block: ReactorBlock): void => {
  if (block.direction === 'down') {
    block.top_row += 1
    block.bottom_row += 1
    if (block.bottom_row >= GRID_ROWS) {
      block.direction = 'up'
    }
    return
  }

  block.top_row -= 1
  block.bottom_row -= 1
  if (block.top_row <= 1) {
    block.direction = 'down'
  }
}

const movePlayer = (state: ParsedState, command: AgentCommand): void => {
  if (!state.player) return

  if (command === 'left') {
    state.player = { ...state.player, col: state.player.col - 1 }
    return
  }

  if (command === 'right') {
    state.player = { ...state.player, col: state.player.col + 1 }
  }
}

const requireSpatial = (state: ParsedState): void => {
  if (!state.hasSpatial || !state.player || !state.goal || !state.blocks) {
    throw new Error('Cannot simulate command without spatial state.')
  }
}

export const simulateCommand = (
  state: ParsedState,
  command: AgentCommand,
): ParsedState => {
  requireSpatial(state)

  const next: ParsedState = {
    hasSpatial: true,
    board: state.board,
    player: { ...state.player! },
    goal: { ...state.goal! },
    blocks: cloneBlocks(state.blocks!),
    hub: { ...state.hub },
  }

  for (const block of next.blocks!) {
    moveBlock(block)
  }

  movePlayer(next, command)
  return next
}

export const blockOccupiesRow = (block: ReactorBlock, row: number): boolean =>
  block.top_row <= row && row <= block.bottom_row

export const isCollisionAtPlayer = (state: ParsedState): boolean => {
  if (!state.hasSpatial || !state.player || !state.blocks) return false

  return state.blocks.some(
    (block) =>
      block.col === state.player!.col &&
      blockOccupiesRow(block, state.player!.row),
  )
}

export const wouldCollide = (state: ParsedState, command: AgentCommand): boolean => {
  if (!state.hasSpatial) return true
  const simulated = simulateCommand(state, command)
  return isCollisionAtPlayer(simulated)
}

export const isOutOfBounds = (state: ParsedState, command: AgentCommand): boolean => {
  if (!state.hasSpatial || !state.player) return true
  if (command === 'left' && state.player.col <= 1) return true
  if (command === 'right' && state.player.col >= 7) return true
  return false
}
