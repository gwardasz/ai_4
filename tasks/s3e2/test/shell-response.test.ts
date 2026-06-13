import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_SHELL_OUTPUT_CHARS } from '../src/config.js'
import {
  formatShellResponse,
  isBannedShellResponse,
  shellDataAsText,
} from '../src/services/shell-response.js'
import { truncateShellOutput } from '../src/services/shell-output-sanitizer.js'

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
    const formatted = formatShellResponse(helpPayload, '')
    assert.equal(formatted.kind, 'ok')
    if (formatted.kind !== 'ok') return

    const parsed = JSON.parse(formatted.text) as typeof helpPayload
    assert.equal(parsed.code, 190)
    assert.equal(parsed.message, 'Available commands.')
    assert.ok(Array.isArray(parsed.data))
    assert.ok(parsed.data.includes('help - show available commands and short descriptions.'))
    assert.ok(parsed.data.includes('editline <file> <line-number> <content> - replace one line in a text file.'))
    assert.ok(formatted.text.includes('"data"'))
  })

  it('preserves unknown API fields after validation', () => {
    const payload = {
      code: 190,
      message: 'ok',
      data: 'line one',
      extraField: 'extra detail',
    }
    const formatted = formatShellResponse(payload, '')
    assert.equal(formatted.kind, 'ok')
    if (formatted.kind !== 'ok') return

    const parsed = JSON.parse(formatted.text) as typeof payload
    assert.equal(parsed.extraField, 'extra detail')
    assert.equal(parsed.data, 'line one')
  })

  it('serializes message-only hub body as JSON', () => {
    const formatted = formatShellResponse({ message: 'ok' }, '')
    assert.equal(formatted.kind, 'ok')
    if (formatted.kind !== 'ok') return
    assert.deepEqual(JSON.parse(formatted.text), { message: 'ok' })
  })

  it('serializes legacy output field inside full object JSON', () => {
    const formatted = formatShellResponse({ output: 'text' }, '')
    assert.equal(formatted.kind, 'ok')
    if (formatted.kind !== 'ok') return
    assert.deepEqual(JSON.parse(formatted.text), { output: 'text' })
  })

  it('rejects binary content in data field', () => {
    const formatted = formatShellResponse({ code: 200, message: 'ok', data: 'safe\u0000binary' }, '')
    assert.equal(formatted.kind, 'error')
    if (formatted.kind !== 'error') return
    assert.equal(formatted.reason, 'binary')
    assert.equal(formatted.path, '$.data')
  })

  it('rejects binary content in unknown field when data is empty', () => {
    const formatted = formatShellResponse(
      { code: 200, message: 'ok', data: '', hidden: 'x\u0000y' },
      '',
    )
    assert.equal(formatted.kind, 'error')
    if (formatted.kind !== 'error') return
    assert.equal(formatted.path, '$.hidden')
  })

  it('truncates long validated JSON output', () => {
    const formatted = formatShellResponse(
      { code: 200, message: 'ok', data: 'x'.repeat(MAX_SHELL_OUTPUT_CHARS + 100) },
      '',
    )
    assert.equal(formatted.kind, 'ok')
    if (formatted.kind !== 'ok') return

    const truncated = truncateShellOutput(formatted.text)
    assert.equal(truncated.truncated, true)
    assert.ok(truncated.text.includes('[...Output truncated after'))
  })

  it('extracts string data for gitignore parsing', () => {
    assert.equal(shellDataAsText('*.log\nsecret/\n'), '*.log\nsecret/\n')
  })

  it('returns null for binary shell data', () => {
    assert.equal(shellDataAsText('safe\u0000binary'), null)
  })

  it('detects banned responses from message field', () => {
    assert.equal(
      isBannedShellResponse({ message: 'You are banned for 60 seconds' }, '{}'),
      true,
    )
    assert.equal(isBannedShellResponse({ message: 'ok' }, '{}'), false)
  })
})
