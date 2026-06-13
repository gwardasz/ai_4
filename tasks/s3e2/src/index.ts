import { randomUUID } from 'node:crypto'
import { agentModel, LOG_LEVEL } from './config.js'
import { runFirmwareAgent } from './agent/run.js'
import { createLogger } from './core/logger.js'
import {
  flush,
  initTracing,
  shutdownTracing,
  syncPrompts,
  withTrace,
} from './core/tracing/index.js'
import { tools } from './tools/definitions.js'

const logger = createLogger({ service: 's3e2-firmware', level: LOG_LEVEL })

initTracing({ logger, serviceName: 's3e2-firmware' })

await syncPrompts().catch((error) => {
  logger.warn('Prompt sync failed; continuing without prompt refs', {
    error: error instanceof Error ? error.message : String(error),
  })
})

const sessionId = randomUUID()

logger.info('agent.start', {
  model: agentModel,
  tools: tools.map((t) => t.name),
  sessionId,
  tracing: process.env.LANGFUSE_PUBLIC_KEY ? 'enabled' : 'disabled',
})

let exitCode = 0

try {
  const result = await withTrace(
    {
      name: 'firmware-run',
      sessionId,
      input: { trigger: 'CLI start' },
      metadata: { model: agentModel },
      tags: ['firmware', 'shell', 'cli'],
    },
    () => runFirmwareAgent(logger),
  )

  console.log('\n=== FIRMWARE AGENT FINISHED ===')
  console.log(result.reply)
  if (result.flag) {
    console.log(`\nFLAG: ${result.flag}`)
  } else {
    console.log('\nNo flag captured. Inspect logs for details.')
    exitCode = 1
  }
} catch (error) {
  logger.error('agent.failed', {
    error: error instanceof Error ? error.message : String(error),
  })
  console.error('\nAgent execution failed:', error instanceof Error ? error.message : error)
  exitCode = 1
} finally {
  await flush()
  await shutdownTracing()
}

process.exit(exitCode)
