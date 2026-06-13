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

export const MAX_TOOL_ROUNDS = Number(process.env.MAX_TOOL_ROUNDS ?? 24)
export const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info'
export const maxOutputTokens = Number(process.env.MAX_OUTPUT_TOKENS ?? 8192)

export const MAX_HTTP_RETRIES = Number(process.env.MAX_HTTP_RETRIES ?? 6)
export const BASE_BACKOFF_MS = Number(process.env.BASE_BACKOFF_MS ?? 1000)
export const MAX_BACKOFF_MS = Number(process.env.MAX_BACKOFF_MS ?? 20000)
export const MAX_RATE_LIMIT_WAIT_MS = Number(process.env.MAX_RATE_LIMIT_WAIT_MS ?? 120000)

export const DEADLOCK_STALL_ROUNDS = Number(process.env.DEADLOCK_STALL_ROUNDS ?? 4)
export const DEADLOCK_REPEAT_THRESHOLD = Number(process.env.DEADLOCK_REPEAT_THRESHOLD ?? 3)

export const HUB_BASE_URL = process.env.HUB_BASE_URL?.trim().replace(/\/+$/, '')

if (!AI_DEVS_API_KEY) {
  throw new Error('Missing AI_DEVS_API_KEY in environment (.env).')
}

export const TASK_NAME = 'firmware'
export const SHELL_URL = `${HUB_BASE_URL}/api/shell`
export const VERIFY_URL = `${HUB_BASE_URL}/verify`

export const agentModel = resolveModelForProvider(
  process.env.FIRMWARE_MODEL ?? 'anthropic/claude-sonnet-4-6',
)

export const CONFIRMATION_RE = /^ECCS-[a-f0-9]{40}$/i

export const START_TRIGGER = 'Begin firmware recovery mission.'
