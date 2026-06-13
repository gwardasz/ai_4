import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkGitignoreRules,
  extractPathsFromCmd,
  isIgnoredByRules,
  parseGitignore,
} from '../src/guardrails/gitignore.js'

describe('gitignore', () => {
  it('parses basic rules', () => {
    const rules = parseGitignore('# comment\n*.log\n!important.log\nsecret/\n')
    assert.equal(rules.length, 3)
    assert.equal(rules[0]?.pattern, '*.log')
    assert.equal(rules[1]?.negated, true)
    assert.equal(rules[2]?.directory, true)
  })

  it('matches ignored files', () => {
    const rules = parseGitignore('*.log\nconfig.local\n')
    assert.equal(isIgnoredByRules('app.log', rules), true)
    assert.equal(isIgnoredByRules('config.local', rules), true)
    assert.equal(isIgnoredByRules('readme.txt', rules), false)
  })

  it('extracts paths from shell commands', () => {
    const paths = extractPathsFromCmd('cat /opt/firmware/settings.ini')
    assert.ok(paths.some((p) => p.includes('settings.ini')))
  })

  it('blocks gitignored paths', () => {
    const rules = parseGitignore('credentials.txt\n')
    const result = checkGitignoreRules('credentials.txt', rules)
    assert.equal(result.allowed, false)
    assert.match(result.reason ?? '', /gitignore/i)
  })
})
