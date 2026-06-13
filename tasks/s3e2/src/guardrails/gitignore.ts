export interface GitignoreRule {
  pattern: string
  negated: boolean
  directory: boolean
}

export interface GitignoreCheckResult {
  allowed: boolean
  reason?: string
  matchedPattern?: string
}

const escapeRegex = (value: string): string =>
  value.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\?/g, '[^/]').replace(/\*\*/g, '{{GLOBSTAR}}').replace(/\*/g, '[^/]*').replace(/\{\{GLOBSTAR\}\}/g, '.*')

export const parseGitignore = (content: string): GitignoreRule[] => {
  const rules: GitignoreRule[] = []

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    let pattern = line
    let negated = false

    if (pattern.startsWith('!')) {
      negated = true
      pattern = pattern.slice(1)
    }

    const directory = pattern.endsWith('/')
    if (directory) {
      pattern = pattern.slice(0, -1)
    }

    rules.push({ pattern, negated, directory })
  }

  return rules
}

const basename = (filePath: string): string => {
  const parts = filePath.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? filePath
}

const matchRule = (filePath: string, rule: GitignoreRule): boolean => {
  const name = basename(filePath)
  const regexSource = `^${escapeRegex(rule.pattern)}${rule.directory ? '(\\/|$)' : '(\\/|$)?'}`
  const regex = new RegExp(regexSource)

  if (regex.test(filePath) || regex.test(name)) {
    return true
  }

  if (rule.pattern.includes('/')) {
    return regex.test(filePath)
  }

  return regex.test(name)
}

export const isIgnoredByRules = (filePath: string, rules: GitignoreRule[]): boolean => {
  let ignored = false

  for (const rule of rules) {
    if (matchRule(filePath, rule)) {
      ignored = !rule.negated
    }
  }

  return ignored
}

const PATH_TOKEN_RE = /(?:^|[\s"'=])(\/(?:[\w.-]+\/)*[\w.-]+|\.\/(?:[\w.-]+\/)*[\w.-]+|[\w.-]+\/[\w./-]+)/g

export const extractPathsFromCmd = (cmd: string): string[] => {
  const matches = cmd.match(PATH_TOKEN_RE) ?? []
  const paths = matches.map((m) => m.trim().replace(/^[\s"'=]+/, '')).filter(Boolean)
  return [...new Set(paths)]
}

export const checkGitignoreRules = (
  filePath: string,
  rules: GitignoreRule[],
): GitignoreCheckResult => {
  if (rules.length === 0) {
    return { allowed: true }
  }

  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '')

  if (isIgnoredByRules(normalized, rules)) {
    const matched = rules.find((rule) => matchRule(normalized, rule) && !rule.negated)
    return {
      allowed: false,
      reason: `Access denied: "${normalized}" is listed in .gitignore.`,
      matchedPattern: matched?.pattern,
    }
  }

  return { allowed: true }
}

export const formatGitignoreBlockedResponse = (reason: string): string =>
  JSON.stringify({
    success: false,
    blocked: true,
    message: reason,
    hint: 'This path is protected by .gitignore. Use a different file or location.',
  })
