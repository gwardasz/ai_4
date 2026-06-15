import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AI_DEVS_API_KEY, resolveModelForProvider } from '../../../config.js'

const taskDir = path.dirname(fileURLToPath(import.meta.url))
const taskRoot = path.resolve(taskDir, '..')
const repoRoot = path.resolve(taskRoot, '../..')
const taskEnvFile = path.join(taskRoot, '.env')
const rootEnvFile = path.join(repoRoot, '.env')

const loadEnvFile = (filePath: string): void => {
  if (existsSync(filePath) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(filePath)
  }
}

loadEnvFile(rootEnvFile)
loadEnvFile(taskEnvFile)

export const MAX_STEPS = Number(process.env.MAX_STEPS ?? 80)
export const MAX_LLM_TURNS_PER_STEP = Number(process.env.MAX_LLM_TURNS_PER_STEP ?? 4)
export const MAX_TOOL_ROUNDS = Number(process.env.MAX_TOOL_ROUNDS ?? 120)
export const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info'
export const maxOutputTokens = Number(process.env.MAX_OUTPUT_TOKENS ?? 4096)

export const MAX_HTTP_RETRIES = Number(process.env.MAX_HTTP_RETRIES ?? 6)
export const BASE_BACKOFF_MS = Number(process.env.BASE_BACKOFF_MS ?? 1000)
export const MAX_BACKOFF_MS = Number(process.env.MAX_BACKOFF_MS ?? 20000)
export const MAX_RATE_LIMIT_WAIT_MS = Number(process.env.MAX_RATE_LIMIT_WAIT_MS ?? 120000)

export const STALL_THRESHOLD = Number(process.env.STALL_THRESHOLD ?? 5)

export const GRID_COLS = 7
export const GRID_ROWS = 5
export const PLAYER_ROW = 5

export const HUB_BASE_URL = process.env.HUB_BASE_URL?.trim().replace(/\/+$/, '')

if (!AI_DEVS_API_KEY) {
  throw new Error('Missing AI_DEVS_API_KEY in environment (.env).')
}

if (!HUB_BASE_URL) {
  throw new Error('Missing HUB_BASE_URL in environment (.env).')
}

export const TASK_NAME = 'reactor'
export const VERIFY_URL = `${HUB_BASE_URL}/verify`

export const agentModel = resolveModelForProvider(
  process.env.REACTOR_MODEL ?? 'gpt-4.1-mini',
)

export const START_TRIGGER = 'Navigate the reactor corridor and reach the cooling module slot at column 7.'

export type ReactorCommand = 'start' | 'reset' | 'left' | 'right' | 'wait'
export type AgentCommand = 'left' | 'right' | 'wait'
