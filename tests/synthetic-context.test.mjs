import test from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs } from '../scripts/test-policy.mjs'
import { contextBytes, contextInputs, syntheticDigest } from '../scripts/synthetic-context.mjs'
import { commandFor } from '../scripts/arms-test.mjs'
import path from 'node:path'

test('synthetic runtime is explicit and forwarded in parsed options', () => {
  assert.equal(parseArgs(['smoke-runtime', '--synthetic']).synthetic, true)
  assert.equal(parseArgs(['verify', '--synthetic']).synthetic, true)
  for (const mode of ['build', 'smoke-runtime', 'tui-smoke']) assert.ok(commandFor(mode, [], {}, false, true)[1].includes('--synthetic'))
})
test('preparation reads only exact ordinary inputs: sentinel forbids real registry/skills and enumeration', () => {
  const visited = []
  let edited = false
  const io = {
    readdirSync() { throw Error('Enumeration forbidden') },
    lstatSync(file) {
      const relative = path.relative('/sentinel', file)
      assert.ok(relative !== 'registry.json' && !relative.startsWith('skills'))
      visited.push(relative)
      return { isSymbolicLink: () => false, isFile: () => contextInputs.includes(relative), isDirectory: () => !contextInputs.includes(relative) }
    },
    openSync(file) { assert.ok(contextInputs.includes(path.relative('/sentinel', file))); return file },
    readFileSync(file) { return Buffer.from(file + (edited ? 'changed' : '')) }, closeSync() {},
  }
  const entries = contextBytes('/sentinel', io)
  assert.equal(entries.get('skills/editor.md').toString(), 'Synthetic sandbox editor; ordinary test data.')
  assert.ok(visited.length > contextInputs.length)
  const fingerprint = syntheticDigest(entries, { mode: 'synthetic' })
  assert.notEqual(fingerprint, syntheticDigest(entries, { mode: 'repository' }))
  edited = true
  assert.notEqual(fingerprint, syntheticDigest(contextBytes('/sentinel', io), { mode: 'synthetic' }))
  assert.notEqual(fingerprint, syntheticDigest(contextBytes('/sentinel', io, { 'registry.json': 'edited fixture' }), { mode: 'synthetic' }))
  assert.notEqual(fingerprint, syntheticDigest(entries, { mode: 'synthetic', config: 'changed' }))
  assert.throws(() => contextBytes('/sentinel', { ...io, lstatSync: () => ({ isSymbolicLink: () => true }) }), /Unsafe/)
})
test('synthetic mode rejects installed and non-smoke execution', () => {
  assert.throws(() => parseArgs(['verify', '--synthetic', '--installed']), /incompatible/)
  assert.throws(() => parseArgs(['full', '--synthetic']), /requires/)
})
