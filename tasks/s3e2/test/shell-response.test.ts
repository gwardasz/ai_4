import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatShellResponse,
  isBannedShellResponse,
  shellDataAsText,
} from '../src/services/shell-response.js'

const helpPayload = {
  code: 190,
  message: 'Available commands.',
  data: [
    'help - show available commands and short descriptions.',
    'ls [path] - list files and directories.',
    'cat <path> - show file content (or list directory content).',
    'cd [path] - change current directory.',
    'pwd - print current working directory.',
    'rm <file> - remove a file in virtual filesystem.',
    'editline <file> <line-number> <content> - replace one line in a text file.',
    'reboot - rebuild virtual filesystem state from disk.',
    'date - print current server date and time.',
    'uptime - show virtual machine uptime in Linux format.',
    'find <pattern> - find files by name in the whole virtual filesystem (supports wildcards).',
    'history - show command history.',
    'whoami - print current user name.',
  ],
}

describe('shell-response', () => {
  it('preserves code, message, and data for help response', () => {
    const output = formatShellResponse(helpPayload, '')
    const parsed = JSON.parse(output) as typeof helpPayload

    assert.equal(parsed.code, 190)
    assert.equal(parsed.message, 'Available commands.')
    assert.ok(Array.isArray(parsed.data))
    assert.ok(parsed.data.includes('help - show available commands and short descriptions.'))
    assert.ok(parsed.data.includes('editline <file> <line-number> <content> - replace one line in a text file.'))
    assert.ok(output.includes('"data"'))
  })

  it('serializes message-only hub body as JSON', () => {
    const output = formatShellResponse({ message: 'ok' }, '')
    assert.deepEqual(JSON.parse(output), { message: 'ok' })
  })

  it('returns legacy output field as plain text', () => {
    assert.equal(formatShellResponse({ output: 'text' }, ''), 'text')
  })

  it('extracts string data for gitignore parsing', () => {
    assert.equal(shellDataAsText('*.log\nsecret/\n'), '*.log\nsecret/\n')
  })

  it('detects banned responses from message field', () => {
    assert.equal(
      isBannedShellResponse({ message: 'You are banned for 60 seconds' }, '{}'),
      true,
    )
    assert.equal(isBannedShellResponse({ message: 'ok' }, '{}'), false)
  })
})
