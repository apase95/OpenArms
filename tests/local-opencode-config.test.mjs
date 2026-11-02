import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'

test('portable profile separates adapters and resolves both workflow prompts', () => {
  const base = new URL('../examples/local-opencode/', import.meta.url)
  const config = JSON.parse(readFileSync(new URL('opencode.json', base), 'utf8'))
  const tui = JSON.parse(readFileSync(new URL('tui.json', base), 'utf8'))
  assert.equal(config.default_agent, 'build')
  assert.match(config.plugin[0], /skill-router-server\.ts$/)
  assert.match(tui.plugin[0], /skill-router-tui\.tsx$/)
  for (const agent of ['build', 'general']) {
    const match = /^\{file:(.+)\}$/.exec(config.agent[agent].prompt)
    assert.ok(match)
    assert.ok(existsSync(new URL(match[1], base)))
  }
  assert.equal(config.agent.explore.mode, 'subagent')
  assert.equal(config.agent.general.mode, 'subagent')
  assert.match(config.model, /^YOUR_PROVIDER\//)
  assert.equal(config.provider, undefined)
  assert.equal(config.permission, undefined)
})
