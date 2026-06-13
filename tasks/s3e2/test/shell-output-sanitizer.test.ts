import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSanitizedShellError,
  formatGuardOutput,
  isBinaryString,
  isSafeTextString,
  truncateShellOutput,
  validateShellValue,
} from '../src/services/shell-output-sanitizer.js'
import { MAX_SHELL_OUTPUT_CHARS } from '../src/config.js'

describe('shell-output-sanitizer', () => {
  it('accepts normal UTF-8 text', () => {
    const result = validateShellValue('hello world', '$.data')
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.value, 'hello world')
    }
    assert.equal(isSafeTextString('hello world'), true)
    assert.equal(isBinaryString('hello world'), false)
  })

  it('rejects strings containing NUL bytes', () => {
    const result = validateShellValue('before\u0000after', '$.data')
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.reason, 'binary')
      assert.equal(result.path, '$.data')
    }
    assert.equal(isBinaryString('before\u0000after'), true)
  })

  it('rejects strings with high control-character ratio', () => {
    const suspicious = '\x01'.repeat(100)
    const result = validateShellValue(suspicious, '$.extraField')
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.reason, 'unsafe_text')
      assert.equal(result.path, '$.extraField')
    }
  })

  it('walks nested objects and arrays', () => {
    const payload = {
      code: 200,
      data: {
        lines: ['ok', 'also ok'],
      },
    }
    const result = validateShellValue(payload, '$')
    assert.equal(result.ok, true)
  })

  it('reports nested failure path', () => {
    const payload = {
      data: {
        lines: ['ok', 'bad\u0000'],
      },
    }
    const result = validateShellValue(payload, '$')
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.path, '$.data.lines[1]')
    }
  })

  it('truncates long output with suffix', () => {
    const longText = 'a'.repeat(MAX_SHELL_OUTPUT_CHARS + 500)
    const { text, truncated } = truncateShellOutput(longText)
    assert.equal(truncated, true)
    assert.ok(text.endsWith(`[...Output truncated after ${MAX_SHELL_OUTPUT_CHARS} characters...]`))
    assert.ok(text.length < longText.length)
  })

  it('builds guard output for agent feedback', () => {
    const output = formatGuardOutput('binary', '$.data')
    const parsed = JSON.parse(output) as { success: boolean; message: string; detail: string }
    assert.equal(parsed.success, false)
    assert.match(parsed.message, /System Error/)
    assert.match(parsed.detail, /\$\.data/)
    assert.match(buildSanitizedShellError('response_too_large').detail, /maximum allowed JSON size/)
  })
})
