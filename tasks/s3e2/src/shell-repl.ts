import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { SHELL_URL } from './config.js'
import { createLogger } from './core/logger.js'
import { rebootVm, ShellApiUnavailableError } from './services/shell-api.js'
import { createHandlers, type ToolResponse } from './tools/handlers.js'

const log = createLogger({ service: 's3e2-shell-repl' })
const handlers = createHandlers(log)

const printResult = (result: ToolResponse): void => {
  console.log('\n--- result ---')
  console.log(`success: ${result.success}`)
  if (result.message) {
    console.log(`message: ${result.message}`)
  }
  if (result.recoveryHints) {
    console.log(`hint: ${result.recoveryHints}`)
  }
  if (result.flag) {
    console.log(`flag: ${result.flag}`)
  }
  if (result.output !== undefined) {
    console.log('output:')
    console.log(result.output)
  }
  console.log('---\n')
}

const runCommand = async (cmd: string): Promise<ToolResponse> => {
  const trimmed = cmd.trim()
  if (!trimmed) {
    return { success: false, message: 'Empty command.' }
  }

  if (trimmed === 'reboot') {
    const reboot = await rebootVm(log)
    return {
      success: reboot.success,
      message: reboot.message,
      output: reboot.output,
    }
  }

  if (trimmed.startsWith('verify ')) {
    const confirmation = trimmed.slice('verify '.length).trim()
    return handlers.submit_confirmation({ confirmation })
  }

  return handlers.run_shell({ cmd: trimmed })
}

const runOneShot = async (cmd: string): Promise<number> => {
  try {
    const result = await runCommand(cmd)
    printResult(result)
    return result.success ? 0 : 1
  } catch (error) {
    if (error instanceof ShellApiUnavailableError) {
      log.error('shell.unavailable', {
        cmd: error.cmd,
        retries: error.retries,
        message: error.message,
      })
      console.error(`\nShell API unreachable: ${error.message}`)
      return 1
    }
    throw error
  }
}

const runInteractive = async (): Promise<number> => {
  console.log(`Shell REPL — same run_shell stack as the agent`)
  console.log(`Target: ${SHELL_URL}`)
  console.log(`Commands: exit | verify ECCS-... | reboot | <shell cmd>\n`)

  const rl = readline.createInterface({ input, output, terminal: true })

  try {
    for (;;) {
      const line = await rl.question('shell> ')
      const trimmed = line.trim()

      if (!trimmed) {
        continue
      }

      if (trimmed === 'exit' || trimmed === 'quit') {
        break
      }

      try {
        const result = await runCommand(trimmed)
        printResult(result)
      } catch (error) {
        if (error instanceof ShellApiUnavailableError) {
          log.error('shell.unavailable', {
            cmd: error.cmd,
            retries: error.retries,
            message: error.message,
          })
          console.error(`\nShell API unreachable: ${error.message}`)
          return 1
        }

        log.error('shell.repl.error', {
          error: error instanceof Error ? error.message : String(error),
        })
        console.error(`Error: ${error instanceof Error ? error.message : error}`)
      }
    }
  } finally {
    rl.close()
  }

  return 0
}

const main = async (): Promise<number> => {
  const argvCmd = process.argv.slice(2).join(' ').trim()
  return argvCmd ? runOneShot(argvCmd) : runInteractive()
}

const exitCode = await main().catch((error) => {
  log.error('shell.repl.fatal', {
    error: error instanceof Error ? error.message : String(error),
  })
  console.error(error instanceof Error ? error.message : error)
  return 1
})

process.exitCode = exitCode
