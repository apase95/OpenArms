import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { classify } from '../scripts/test-policy.mjs'

test('host launcher has an explicit offline test mapping and valid bash syntax', () => {
  assert.notEqual(classify('sandbox/host.sh').kind, 'needs-review')
  execFileSync('bash', ['-n', 'sandbox/host.sh'])
})
test('host launcher retains host config/data read-only mounts', () => {
  const script = readFileSync('sandbox/host.sh', 'utf8')
  assert.match(script, /--ro-bind "\$HOME\/\.config\/opencode"/)
  assert.match(script, /--ro-bind "\$HOME\/\.local\/share\/opencode"/)
})
