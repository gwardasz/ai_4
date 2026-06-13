import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { checkPathBlocklist } from '../src/guardrails/path-blocklist.js'

describe('path-blocklist', () => {
  it('allows safe firmware paths', () => {
    assert.equal(checkPathBlocklist('help').allowed, true)
    assert.equal(checkPathBlocklist('ls /opt/firmware/cooler').allowed, true)
    assert.equal(checkPathBlocklist('./settings.ini').allowed, true)
  })

  it('blocks forbidden system paths', () => {
    for (const cmd of ['cat /etc/passwd', 'ls /root', 'ps /proc/1']) {
      const result = checkPathBlocklist(cmd)
      assert.equal(result.allowed, false)
      assert.match(result.reason ?? '', /forbidden/i)
    }
  })

  it('does not block paths that merely contain blocked substring', () => {
    assert.equal(checkPathBlocklist('ls /opt/procedure').allowed, true)
  })
})
