import assert from 'node:assert/strict'
import { test } from 'node:test'
import { retainImages, parseRetentionArgs } from '../sandbox/image-retention.mjs'
import * as retention from '../sandbox/image-retention.mjs'
import { readFileSync } from 'node:fs'

const id = n => `sha256:${String(n).padStart(64, '0')}`
const image = n => ({ Id: id(n), Created: `2026-01-0${n}T00:00:00Z`, RepoTags: [`openarms-sandbox:repository-${String(n).padStart(64, '0')}`], Config: { Labels: { 'org.openarms.build-fingerprint': String(n).padStart(64, '0'), 'org.openarms.library-mode': 'repository' } } })
test('Docker command gives only image removal a bounded extended timeout', () => {
  const calls = []
  const execute = (...args) => { calls.push(args); return 'ok' }
  for (const args of [['image', 'rm', id(1)], ['image', 'inspect', id(1)], ['image', 'ls', '-aq', '--no-trunc'], ['ps', '-aq', '--no-trunc'], ['container', 'inspect', 'container'], ['container', 'rm', 'container']]) {
    assert.equal(retention.dockerCommand(args, execute), 'ok')
    assert.deepEqual(calls.at(-1), ['docker', args, { encoding: 'utf8', timeout: args[0] === 'image' && args[1] === 'rm' ? 120000 : 15000, maxBuffer: 16 * 1024 * 1024 }])
  }
})
test('Docker removal timeout propagates without retry', () => {
  const error = Object.assign(Error('spawnSync docker ETIMEDOUT'), { code: 'ETIMEDOUT' })
  let calls = 0
  assert.throws(() => retention.dockerCommand(['image', 'rm', id(1)], (command, args, options) => {
    calls++
    assert.equal(options.timeout, 120000)
    throw error
  }), actual => actual === error)
  assert.equal(calls, 1)
})
test('retention timeout handoff has an exact docs-only policy mapping', () => {
  const policy = JSON.parse(readFileSync(new URL('../scripts/test-policy.json', import.meta.url), 'utf8'))
  assert.equal(policy.files['.opencode/handoff-retention-timeout.md'], 'docs')
  assert.deepEqual(policy.classes.docs.tests, [])
  assert.deepEqual(policy.classes.docs.smoke, [])
  assert.equal(policy.classes.docs.full, false)
})
function fixture(images = [image(1), image(2), image(3)]) {
  const removed = []
  const docker = args => {
    if (args[0] === 'ps') return 'container\n'
    if (args[0] === 'container') return JSON.stringify([{ Image: id(2) }])
    if (args[1] === 'ls') return images.map(i => i.Id).join('\n')
    if (args[1] === 'inspect') return JSON.stringify(args[2] === 'openarms-sandbox:local' ? [image(3)] : [images.find(i => i.Id === args[2])])
    if (args[1] === 'rm') { removed.push(args[2]); return '' }
    throw Error('unexpected command')
  }
  return { docker, removed }
}
test('dry run and explicit apply retain recent, selected and stopped-container images', () => {
  const f = fixture()
  assert.deepEqual(retainImages({ docker: f.docker, keep: 1 }).remove, [id(1)])
  assert.deepEqual(f.removed, [])
  retainImages({ docker: f.docker, keep: 1, apply: true })
  assert.deepEqual(f.removed, [id(1)])
})
test('no-override dry run keeps two recent images per mode and protects references', () => {
  const images = ['repository', 'installed', 'synthetic'].flatMap((mode, index) =>
    [1, 2, 3, 4].map(n => {
      const entry = image(n), fingerprint = String(index * 4 + n).padStart(64, '0')
      entry.Id = id(index * 4 + n)
      entry.RepoTags = [`openarms-sandbox:${mode}-${fingerprint}`]
      entry.Config.Labels = { 'org.openarms.build-fingerprint': fingerprint, 'org.openarms.library-mode': mode }
      return entry
    }))
  const f = fixture(images)
  const result = retainImages({ docker: f.docker })
  assert.equal(result.keep, 2)
  assert.deepEqual(result.remove, [id(1), id(5), id(6), id(9), id(10)].sort())
  assert.deepEqual(f.removed, [])
})
test('no-override automatic retention keeps two and preserves selected and container images', () => {
  const f = fixture([image(1), image(2), image(3), image(4)]), messages = []
  const result = retention.automaticRetention({ docker: f.docker, environment: {}, report: message => messages.push(message) })
  assert.equal(result.keep, 2)
  assert.deepEqual(f.removed, [id(1)])
  assert.match(messages.join('\n'), /removed=1 keep=2\/mode/)
})
test('malformed ownership and inspection failures fail closed before deletion', () => {
  const bad = image(1); bad.Config.Labels['org.openarms.library-mode'] = 'installed'
  const f = fixture([bad, image(2), image(3)])
  assert.throws(() => retainImages({ docker: f.docker, keep: 1, apply: true }), /ownership/)
  assert.deepEqual(f.removed, [])
  assert.throws(() => retainImages({ docker: () => { throw Error('inspection failed') }, apply: true }), /inspection failed/)
})
test('aliases and legacy images are excluded; CLI rejects unsafe arguments', () => {
  const alias = image(1); alias.RepoTags.push('other:latest')
  const f = fixture([alias, image(2), image(3)])
  assert.deepEqual(retainImages({ docker: f.docker, keep: 1 }).remove, [])
  assert.deepEqual(parseRetentionArgs(['--keep', '2', '--apply']), { keep: 2, apply: true })
  for (const args of [['--force'], ['--keep', '-1'], ['--apply', '--apply'], ['--current']]) assert.throws(() => parseRetentionArgs(args))
  assert.throws(() => retainImages({ docker: f.docker, keep: 0 }), /keep/)
})
test('automatic lifecycle applies safe retention and reports removal', () => {
  const f = fixture(), messages = []
  retention.automaticRetention({ docker: f.docker, environment: { OPENARMS_IMAGE_KEEP: '1' }, report: message => messages.push(message) })
  assert.deepEqual(f.removed, [id(1)])
  assert.match(messages.join('\n'), /removed=1/)
})
test('automatic lifecycle opt-out avoids Docker; failures remain visible and fatal', () => {
  const messages = [], docker = () => { throw Error('inspection failed') }
  retention.automaticRetention({ docker, environment: { OPENARMS_IMAGE_RETENTION: 'off' }, report: message => messages.push(message) })
  assert.match(messages.join('\n'), /disabled/)
  assert.throws(() => retention.automaticRetention({ docker, environment: {}, report: message => messages.push(message) }), /inspection failed/)
  assert.match(messages.join('\n'), /RETENTION_BLOCKED/)
  assert.throws(() => retention.automaticRetention({ docker, environment: { OPENARMS_IMAGE_KEEP: '0' }, report: () => {} }), /keep/)
})
test('runner and manual runtime builds invoke retention only after success', () => {
  const runner = readFileSync(new URL('../scripts/arms-test.mjs', import.meta.url), 'utf8')
  assert.match(runner, /if \(build.exitCode\) return build\s+automaticRetention\(\{ environment \}\)/)
  assert.match(runner, /OPENARMS_IMAGE_RETENTION: 'off'/)
  const manual = readFileSync(new URL('../sandbox/manage.mjs', import.meta.url), 'utf8')
  assert.match(manual, /action === 'build' && process.exitCode === 0/)
  assert.match(manual, /automaticRetention\(\).*catch \{ process.exitCode = 2 \}/)
})
