import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'yaml'
import { validateRegistry, hashBytes, integrity, resultFailed, parseJSON, estimateTokens, estimatorVersion } from '../scripts/registry-v2.mjs'
import { migrate, selectedHashes, transaction, serialize } from '../scripts/registry-v2-operations.mjs'

export function fixture() {
  const bytes = Buffer.from('synthetic data\r\n')
  return { schemaVersion: 2, packages: { sample: { core: ['example'], optional: [], detect: { files: [], extensions: [], dependencies: [] } } }, skills: { example: { owner: 'sample', kind: 'core', path: 'example/data.txt', contentHash: hashBytes(bytes), maxTokens: 100, defaultPermission: 'ask', workflows: {}, references: {} } } }
}
test('deterministic malformed JSON and unknown-field matrix rejects without normalization', () => {
  for (const text of ['', '{', '[] trailing', '{"a":1,"a":2}', '{"a":{"b":1,"b":2}}', '{"schemaVersion":2,}']) assert.throws(() => parseJSON(text))
  assert.throws(() => parseJSON('{"a":1,"\\u0061":2}'))
  for (const field of ['extra', 'constructor', '__proto__', 'unicode-π']) {
    for (const location of ['root', 'package', 'detect', 'skill']) {
      const registry = fixture()
      const target = location === 'root' ? registry : location === 'package' ? registry.packages.sample : location === 'detect' ? registry.packages.sample.detect : registry.skills.example
      Object.defineProperty(target, field, { value: true, enumerable: true })
      assert.throws(() => validateRegistry(registry), `${location}/${field}`)
    }
  }
  assert.equal(estimatorVersion, 'utf8-bytes-v1')
  for (let length = 0; length <= 32; length++) assert.equal(estimateTokens(Buffer.alloc(length)), Math.ceil(length / 4))
  assert.equal(estimateTokens(Buffer.from('π🙂')), 2)
  assert.notEqual(hashBytes(Buffer.from('π\r\n')), hashBytes(Buffer.from('π\n')))
})

test('Unicode path/content migrates byte-stably; one bad record rolls back the whole write', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'arms-unicode-rollback-'))
  try {
    mkdirSync(path.join(root, 'example'))
    const bytes = Buffer.from('Synthetic π🙂\r\n')
    writeFileSync(path.join(root, 'example', 'π.txt'), bytes)
    const source = { version: 1, packages: fixture().packages, skills: { example: 'example/π.txt' } }
    const decisions = { example: { defaultPermission: 'ask', maxTokens: 100 } }
    const migrated = migrate(source, root, decisions)
    assert.equal(migrated.skills.example.contentHash, hashBytes(bytes))
    assert.equal(serialize(migrate(migrated, root, {})), serialize(migrated))
    source.packages.sample.optional.push('missing')
    source.skills.missing = 'missing/interface.txt'
    const file = path.join(root, 'registry.json')
    writeFileSync(file, serialize(source))
    const before = readFileSync(file)
    assert.throws(() => transaction(file, registry => ({ output: migrate(registry, root, { ...decisions, missing: { defaultPermission: 'deny', maxTokens: 1 } }) }), { write: true, backup: true }))
    assert.deepEqual(readFileSync(file), before)
    assert.deepEqual(readFileSync(path.join(root, 'example', 'π.txt')), bytes)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test('finite required-field and child allowlist matrix rejects every missing field and invalid ID', () => {
  const make = () => {
    const registry = fixture()
    registry.skills.example.references.detail = { path: 'example/detail.txt', contentHash: registry.skills.example.contentHash, maxTokens: 10 }
    return registry
  }
  const targets = [r => r, r => r.packages.sample, r => r.packages.sample.detect, r => r.skills.example, r => r.skills.example.references.detail]
  for (const target of targets) for (const field of Object.keys(target(make()))) {
    const registry = make(); delete target(registry)[field]
    assert.throws(() => validateRegistry(registry), field)
  }
  for (const field of ['extra', '__proto__', 'constructor']) {
    const registry = make()
    Object.defineProperty(registry.skills.example.references.detail, field, { value: true, enumerable: true })
    assert.throws(() => validateRegistry(registry), field)
  }
  for (const id of ['', 'Detail', 'π', '../detail', 'detail_', 'example']) {
    const registry = make(), child = registry.skills.example.references.detail
    delete registry.skills.example.references.detail; registry.skills.example.references[id] = child
    assert.throws(() => validateRegistry(registry), id)
  }
})
test('migration requires owner decisions and is deterministic/idempotent', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'arms-migrate-'))
  try {
    mkdirSync(path.join(root, 'example')); writeFileSync(path.join(root, 'example/data.txt'), 'synthetic data\r\n')
    const v1 = { version: 1, packages: fixture().packages, skills: { example: 'example/data.txt' } }
    assert.throws(() => migrate(v1, root, {}))
    const decisions = { example: { defaultPermission: 'ask', maxTokens: 100 } }
    assert.deepEqual(migrate(v1, root, decisions), fixture())
    assert.deepEqual(migrate(fixture(), root, {}), fixture())
    v1.packages.sample.detect = { always: true, extensions: ['.txt'] }
    assert.deepEqual(migrate(v1, root, decisions).packages.sample.detect, { files: [], always: true, extensions: ['.txt'], dependencies: [] })
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test('strict schema and raw-byte integrity use only authored temporary data', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'arms-v2-'))
  try {
    mkdirSync(path.join(root, 'example'))
    writeFileSync(path.join(root, 'example/data.txt'), 'synthetic data\r\n')
    const registry = fixture()
    assert.equal(validateRegistry(registry), registry)
    const sameName = fixture()
    sameName.packages.example = sameName.packages.sample; delete sameName.packages.sample
    sameName.skills.example.owner = 'example'
    validateRegistry(sameName)
    assert.equal(integrity(registry, root).some(resultFailed), false)
    writeFileSync(path.join(root, 'example/data.txt'), 'synthetic data\n')
    assert.equal(integrity(registry, root).some(resultFailed), true)
    rmSync(path.join(root, 'example/data.txt'))
    writeFileSync(path.join(root, 'outside.txt'), 'synthetic outside bytes')
    symlinkSync(path.join(root, 'outside.txt'), path.join(root, 'example/data.txt'))
    assert.equal(integrity(registry, root).some(resultFailed), true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test('reject unknown fields, duplicate ownership, unsafe paths and child escape', () => {
  validateRegistry(JSON.parse(readFileSync(new URL('../docs/testing/registry-v2-valid.json', import.meta.url))))
  assert.throws(() => validateRegistry(JSON.parse(readFileSync(new URL('../docs/testing/registry-v2-invalid.json', import.meta.url)))))
  for (const mutate of [r => { r.extra = true }, r => { delete r.skills.example.kind }, r => { r.packages.sample.optional.push('example') }, r => { r.packages.sample.core.push('unknown') }, r => { r.skills.example.owner = 'missing' }, r => { r.skills.example.path = '../data' }, r => { r.skills.example.path = '/absolute' }, r => { r.skills.example.path = 'example//data' }, r => { r.skills.example.maxTokens = 0 }, r => { r.skills.example.maxTokens = 1.1 }, r => { r.skills.example.contentHash = 'sha256:' + 'A'.repeat(64) }, r => { r.skills.example.defaultPermission = 'default' }, r => { r.skills.example.references.child = { path: 'sibling/data', contentHash: r.skills.example.contentHash, maxTokens: 1 } }, r => { r.skills.example.references.child = { path: 'EXAMPLE/DATA.TXT', contentHash: r.skills.example.contentHash, maxTokens: 1 } }]) {
    const registry = fixture(); mutate(registry); assert.throws(() => validateRegistry(registry))
  }
})
test('registered children and budget threshold are audited independently', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'arms-child-'))
  try {
    mkdirSync(path.join(root, 'example'))
    writeFileSync(path.join(root, 'example/data.txt'), 'synthetic data\r\n')
    const registry = fixture(), bytes = Buffer.from('12345')
    registry.skills.example.references.detail = { path: 'example/detail.txt', contentHash: hashBytes(bytes), maxTokens: 1 }
    writeFileSync(path.join(root, 'example/detail.txt'), bytes)
    const results = integrity(registry, root)
    assert.deepEqual(results.filter(resultFailed).map(row => [row.id, row.rule]), [['detail', 'budget']])
    rmSync(path.join(root, 'example/detail.txt'))
    assert.equal(integrity(registry, root).find(row => row.id === 'detail').rule, 'safe-file')
    assert.throws(() => selectedHashes(registry, root, []))
    assert.throws(() => migrate({ version: 1, packages: fixture().packages, skills: { example: 'example/data.txt' } }, root, { example: { maxTokens: 1, defaultPermission: 'deny' }, unknown: {} }))
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test('CI gate executes production CLI for valid, byte-drift, symlink and duplicate fixtures', () => {
  const result = spawnSync(process.execPath, ['scripts/registry-v2-ci.mjs'], { encoding: 'utf8', timeout: 1500 })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim().split('\n').length, 4)
})
test('CI wiring runs the production fixture gate before canonical runtime full', () => {
  const workflow = parse(readFileSync(new URL('../.github/workflows/registry-integrity.yml', import.meta.url), 'utf8'))
  const steps = workflow.jobs['synthetic-integrity'].steps
  const gate = steps.findIndex(step => step.run === 'node scripts/registry-v2-ci.mjs')
  const runtime = steps.findIndex(step => step.run?.startsWith('node scripts/arms-test.mjs full '))
  assert.ok(gate >= 0 && runtime > gate)
  assert.ok(steps.some(step => step.run === 'npm ci'))
  assert.deepEqual(workflow.on, ['push', 'pull_request'])
})
test('CLI rejects duplicate JSON keys instead of silently dropping ownership metadata', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'arms-duplicate-json-'))
  try {
    const registryPath = path.join(root, 'registry.json')
    writeFileSync(registryPath, '{"schemaVersion":1,"schemaVersion":2,"packages":{},"skills":{}}')
    const result = spawnSync(process.execPath, ['scripts/registry-v2-cli.mjs', 'integrity', '--root', root, '--registry', registryPath], { encoding: 'utf8', timeout: 1000 })
    assert.equal(result.status, 2)
    assert.match(result.stderr, /json/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test('selected hashes, atomic migration backup and concurrency rejection', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'arms-transaction-'))
  try {
    mkdirSync(path.join(root, 'example')); writeFileSync(path.join(root, 'example/data.txt'), 'synthetic data\r\n')
    const registryPath = path.join(root, 'registry.json'), v1 = { version: 1, packages: fixture().packages, skills: { example: 'example/data.txt' } }
    writeFileSync(registryPath, serialize(v1))
    const original = readFileSync(registryPath)
    transaction(registryPath, source => ({ output: migrate(source, root, { example: { defaultPermission: 'ask', maxTokens: 100 } }) }), { write: true, backup: true })
    assert.deepEqual(readFileSync(registryPath + '.bak'), original)
    assert.deepEqual(JSON.parse(readFileSync(registryPath)), fixture())
    writeFileSync(registryPath, JSON.stringify(fixture()))
    const compact = readFileSync(registryPath)
    assert.equal(transaction(registryPath, source => ({ output: source }), { write: true, backup: true }).changed, false)
    assert.deepEqual(readFileSync(registryPath), compact)
    assert.throws(() => selectedHashes(fixture(), root, ['unknown']))
    assert.equal(selectedHashes(fixture(), root, ['example'])[0].oldHash, fixture().skills.example.contentHash)
    assert.throws(() => transaction(registryPath, source => {
      source.skills.example.defaultPermission = 'deny'
      return { output: source, revalidate: () => writeFileSync(registryPath, serialize(fixture()) + ' ') }
    }, { write: true }), /Concurrent registry/)
    const unchanged = readFileSync(registryPath)
    const checked = spawnSync(process.execPath, ['scripts/registry-v2-cli.mjs', 'hash', '--check', '--root', root, '--registry', registryPath, '--skill', 'example'], { timeout: 1000 })
    assert.equal(checked.status, 0)
    assert.deepEqual(readFileSync(registryPath), unchanged)
    writeFileSync(path.join(root, 'example/data.txt'), 'changed')
    const drift = spawnSync(process.execPath, ['scripts/registry-v2-cli.mjs', 'hash', '--check', '--root', root, '--registry', registryPath, '--skill', 'example'], { timeout: 1000 })
    assert.equal(drift.status, 1)
    assert.deepEqual(readFileSync(registryPath), unchanged)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
