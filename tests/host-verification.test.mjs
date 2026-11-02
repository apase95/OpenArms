import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlan, parseArgs } from '../scripts/test-policy.mjs'

const scheduled = (args) => createPlan(['plugins/skill-router-tui.tsx'], parseArgs(args)).decisions
  .filter(entry => ['required', 'recommended'].includes(entry.status)).map(entry => entry.mode)

test('verify and pre-push are host-only even at an integration boundary', () => {
  assert.deepEqual(scheduled([]), ['syntax', 'related'])
  assert.deepEqual(scheduled(['--pre-push']), ['syntax', 'full'])
})

test('legacy smoke remains an explicit opt-in with its static prerequisite', () => {
  assert.deepEqual(scheduled(['tui-smoke']), ['smoke-static', 'tui-smoke'])
})
