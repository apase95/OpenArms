import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, renameSync, chmodSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { hashBytes } from '../scripts/registry-v2.mjs'
import { createVerifiedLoader, validateVerifiedRequest, auditVerifiedResponse, validateBudgetPolicy } from '../src/verified-loader.mjs'
import { classify } from '../scripts/test-policy.mjs'

function fixture(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'arms-verified-'))
  try {
    mkdirSync(path.join(root, 'example'))
    const bytes = Buffer.from('Synthetic interface\r\n')
    writeFileSync(path.join(root, 'example/interface.txt'), bytes)
    const registry = { schemaVersion: 2, packages: { demo: { core: ['example'], optional: [], detect: { files: [], extensions: [], dependencies: [] } } }, skills: { example: { owner: 'demo', kind: 'core', path: 'example/interface.txt', contentHash: hashBytes(bytes), maxTokens: 100, defaultPermission: 'allow', workflows: {}, references: {} } } }
    run({ root, registry, bytes })
  } finally { rmSync(root, { recursive: true, force: true }) }
}
test('happy path returns only verified interface; tamper never commits', () => fixture(({ root, registry, bytes }) => {
  const loader = createVerifiedLoader({ root, registry, approvedRevision: true })
  const context = { project: 'p', session: 's', task: 't' }
  const result = loader.load_verified_skill({ skill: 'example' }, context)
  assert.equal(result.ok, true)
  assert.equal(result.sources[0].content, bytes.toString('utf8'))
  assert.equal(result.sources[0].hash, hashBytes(bytes))
  assert.equal(JSON.stringify(result).includes(root), false)
  const before = loader.inspect()
  writeFileSync(path.join(root, 'example/interface.txt'), 'tampered')
  const failure = loader.load_verified_skill({ skill: 'example' }, context)
  assert.equal(failure.error.code, 'HASH_MISMATCH')
  assert.deepEqual(loader.inspect(), before)
}))
const context = { project: 'p', session: 's', task: 't' }
test('finite malformed request/context properties preserve exact state and omit content', () => fixture(({ root, registry }) => {
  const loader = createVerifiedLoader({ root, registry, approvedRevision: true })
  const before = loader.inspect()
  for (const value of [null, [], 0, '', {}, { skill: 'Example' }, { skill: 'é' }, { skill: 'example', package: 'demo' }, { skill: 'example', workflow: 'x', reference: 'y' }]) {
    assert.deepEqual(loader.load_verified_skill(value, context), { ok: false, state: 'Denied', error: { code: 'INVALID_REQUEST' } })
    assert.deepEqual(loader.inspect(), before)
  }
  for (const field of ['project', 'session', 'task']) for (const value of [null, '', 0, [], {}]) {
    assert.deepEqual(loader.load_verified_skill({ skill: 'example' }, { ...context, [field]: value }), { ok: false, state: 'Denied', error: { code: 'INVALID_CONTEXT' } })
    assert.deepEqual(loader.inspect(), before)
  }
}))
test('unsupported platform uses stable content-free error without committing', () => fixture(({ root, registry }) => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')
  const loader = createVerifiedLoader({ root, registry, approvedRevision: true })
  const before = loader.inspect()
  try {
    // Mock the environment only; exercise the real descriptor-relative reader.
    Object.defineProperty(process, 'platform', { ...descriptor, value: 'win32' })
    assert.deepEqual(loader.load_verified_skill({ skill: 'example' }, context), { ok: false, state: 'Denied', error: { code: 'UNSUPPORTED_PLATFORM' } })
    assert.deepEqual(loader.inspect(), before)
  } finally { Object.defineProperty(process, 'platform', descriptor) }
}))
test('stable request/context/state/grant errors are content-free and do not mutate', () => fixture(({ root, registry }) => {
  const loader = createVerifiedLoader({ root, registry, approvedRevision: true })
  const before = loader.inspect()
  for (const [request, host, code] of [[{}, context, 'INVALID_REQUEST'], [{ skill: 'example' }, {}, 'INVALID_CONTEXT'], [{ skill: 'example', workflow: 'missing' }, context, 'INVALID_WORKFLOW'], [{ skill: 'example', reference: 'missing' }, context, 'INVALID_REFERENCE']]) {
    const result = loader.load_verified_skill(request, host)
    assert.equal(result.error.code, code)
    assert.equal(JSON.stringify(result).includes(root), false)
    assert.deepEqual(loader.inspect(), before)
  }
  assert.throws(() => loader.grant({ skill: 'example' }, context, 'filesystem'), /INVALID_GRANT/)
  assert.throws(() => loader.restore({ grants: [], records: [] }), /INVALID_STATE/)
  assert.throws(() => createVerifiedLoader({ root, registry, budgetPolicy: {} }), /INVALID_BUDGET_POLICY/)
  assert.deepEqual(loader.inspect(), before)
}))
test('strict adapter/core request; deny and approval precede all content I/O', () => fixture(({ root, registry }) => {
  assert.equal(classify('src/verified-loader.mjs').full, true)
  assert.deepEqual(classify('src/verified-loader.mjs').smoke, [])
  assert.ok(classify('scripts/registry-v2.mjs').tests.includes('tests/verified-loader.test.mjs'))
  assert.equal(classify('.opencode/handoff-sprint-22.md').kind, 'docs')
  for (const request of [{ package: 'demo' }, { skill: 'example', workflow: 'w', reference: 'r' }, { skill: '../example' }, { skill: 'example', extra: true }, { skill: 'example', reference: undefined }]) assert.throws(() => validateVerifiedRequest(request), /INVALID_REQUEST/)
  rmSync(path.join(root, 'example'), { recursive: true })
  registry.skills.example.defaultPermission = 'ask'
  const loader = createVerifiedLoader({ root, registry, approvedRevision: true })
  assert.deepEqual(loader.status({ skill: 'example' }, context), { state: 'Available', decision: 'ask', reason: 'APPROVAL_REQUIRED' })
  assert.equal(loader.load_verified_skill({ skill: 'example' }, context).error.code, 'APPROVAL_REQUIRED')
  assert.equal(loader.load_verified_skill({ skill: 'example' }, { ...context, enabledSkills: [] }).error.code, 'DISABLED')
  assert.equal(loader.load_verified_skill({ skill: 'example' }, { ...context, enabledSkills: null }).error.code, 'INVALID_CONTEXT')
  assert.throws(() => loader.grant({ skill: 'example', reference: 'missing' }, context, 'once'), /INVALID_REFERENCE/)
  assert.equal(loader.load_verified_skill({ skill: 'demo' }, context).error.code, 'UNKNOWN_SKILL')
  registry.skills.example.defaultPermission = 'deny'
  loader.replaceRegistry(registry, { approvedRevision: true })
  assert.equal(loader.load_verified_skill({ skill: 'example' }, context).error.code, 'DENIED')
  loader.replaceRegistry(registry)
  assert.equal(loader.load_verified_skill({ skill: 'example' }, context).error.code, 'UNVERIFIED')
  assert.deepEqual(loader.inspect(), { grants: [], records: [], locks: [] })
}))
test('task conflict blocks other owner before read; failed once load preserves grant', () => fixture(({ root, registry }) => {
  registry.packages.other = { core: ['second'], optional: [], detect: { files: [], extensions: [], dependencies: [] } }
  registry.skills.second = { ...structuredClone(registry.skills.example), owner: 'other', path: 'second/interface.txt' }
  const loader = createVerifiedLoader({ root, registry, approvedRevision: true })
  assert.equal(loader.load_verified_skill({ skill: 'example' }, context).ok, true)
  const before = loader.inspect()
  assert.equal(loader.load_verified_skill({ skill: 'second' }, context).error.code, 'TASK_CONFLICT')
  assert.deepEqual(loader.inspect(), before)
  registry.skills.example.defaultPermission = 'ask'
  const once = createVerifiedLoader({ root, registry, approvedRevision: true })
  once.grant({ skill: 'example' }, context, 'once')
  const grant = once.inspect()
  writeFileSync(path.join(root, 'example/interface.txt'), 'tampered')
  assert.equal(once.load_verified_skill({ skill: 'example' }, context).error.code, 'HASH_MISMATCH')
  assert.deepEqual(once.inspect(), grant)
}))
test('once/session/project grants bind scope and invalidate registry revision', () => fixture(({ root, registry }) => {
  registry.skills.example.defaultPermission = 'ask'
  for (const scope of ['once', 'session', 'project']) {
    const loader = createVerifiedLoader({ root, registry, approvedRevision: true })
    loader.grant({ skill: 'example' }, context, scope)
    assert.equal(loader.status({ skill: 'example' }, { ...context, project: 'other' }).reason, 'APPROVAL_REQUIRED')
    assert.equal(loader.status({ skill: 'example' }, { ...context, session: 'other' }).decision, scope === 'project' ? 'allow' : 'ask')
    assert.equal(loader.status({ skill: 'example' }, { ...context, task: 'other' }).decision, scope === 'once' ? 'ask' : 'allow')
    assert.equal(loader.load_verified_skill({ skill: 'example' }, context).ok, true)
    assert.equal(loader.status({ skill: 'example' }, context).decision, scope === 'once' ? 'ask' : 'allow')
    const next = structuredClone(registry); next.skills.example.maxTokens++
    loader.replaceRegistry(next, { approvedRevision: true })
    assert.equal(loader.status({ skill: 'example' }, context).reason, 'APPROVAL_REQUIRED')
  }
}))
test('explicit children return interface plus selected bytes, never implicit reference', () => fixture(({ root, registry }) => {
  mkdirSync(path.join(root, 'example/nested'))
  for (const [group, child, content] of [['workflows', 'workflow', 'Synthetic workflow'], ['references', 'reference', 'Synthetic reference']]) {
    writeFileSync(path.join(root, `example/nested/${child}.txt`), content)
    registry.skills.example[group][child] = { path: `example/nested/${child}.txt`, contentHash: hashBytes(Buffer.from(content)), maxTokens: 100 }
  }
  const loader = createVerifiedLoader({ root, registry, approvedRevision: true })
  assert.equal(loader.load_verified_skill({ skill: 'example' }, context).sources.length, 1)
  for (const selector of ['workflow', 'reference']) {
    const response = loader.load_verified_skill({ skill: 'example', [selector]: selector }, context)
    assert.deepEqual(response.sources.map(source => source.id), ['example', selector])
    assert.equal(response.sources[1].content, `Synthetic ${selector}`)
    assert.equal(loader.load_verified_skill({ skill: 'example', [selector]: 'missing' }, context).error.code, `INVALID_${selector.toUpperCase()}`)
  }
}))
test('deterministic registry/file races abort without lock/history, sanitized audit', () => fixture(({ root, registry, bytes }) => {
  const events = []
  let loader = createVerifiedLoader({ root, registry, approvedRevision: true, audit: event => events.push(event), hooks: { beforeCommit: () => loader.replaceRegistry(registry, { approvedRevision: true }) } })
  assert.equal(loader.load_verified_skill({ skill: 'example' }, context).error.code, 'CONCURRENT_REGISTRY_CHANGE')
  assert.equal(loader.inspect().records.length, 0)
  loader = createVerifiedLoader({ root, registry, approvedRevision: true, audit: event => events.push(event), hooks: { beforeCommit: () => {
    writeFileSync(path.join(root, 'example/new.txt'), bytes)
    renameSync(path.join(root, 'example/new.txt'), path.join(root, 'example/interface.txt'))
  } } })
  assert.equal(loader.load_verified_skill({ skill: 'example' }, context).error.code, 'CONCURRENT_FILE_CHANGE')
  assert.deepEqual(loader.inspect(), { grants: [], records: [], locks: [] })
  assert.equal(JSON.stringify(events).includes(root), false)
  assert.equal(JSON.stringify(events).includes(bytes.toString('utf8')), false)
}))
test('resolver rejects missing/nonregular/FIFO and parent/nested/broken symlinks', () => fixture(({ root, registry, bytes }) => {
  const file = path.join(root, 'example/interface.txt')
  const load = () => createVerifiedLoader({ root, registry, approvedRevision: true }).load_verified_skill({ skill: 'example' }, context)
  rmSync(file)
  assert.equal(load().error.code, 'FILE_MISSING')
  mkdirSync(file)
  assert.equal(load().error.code, 'NON_REGULAR_FILE')
  rmSync(file, { recursive: true })
  execFileSync('mkfifo', [file])
  assert.equal(load().error.code, 'NON_REGULAR_FILE')
  rmSync(file)
  writeFileSync(path.join(root, 'outside.txt'), bytes)
  symlinkSync(path.join(root, 'outside.txt'), file)
  assert.equal(load().error.code, 'UNSAFE_PATH')
  rmSync(file); symlinkSync(path.join(root, 'missing.txt'), file)
  assert.equal(load().error.code, 'UNSAFE_PATH')
  rmSync(path.join(root, 'example'), { recursive: true })
  mkdirSync(path.join(root, 'actual')); writeFileSync(path.join(root, 'actual/interface.txt'), bytes)
  symlinkSync(path.join(root, 'actual'), path.join(root, 'example'))
  assert.equal(load().error.code, 'UNSAFE_PATH')
}))
test('registry collision/sibling escape rejected before read; invalid UTF8 rejected', () => fixture(({ root, registry }) => {
  registry.skills.example.references.bad = { path: 'sibling/data.txt', contentHash: registry.skills.example.contentHash, maxTokens: 10 }
  assert.equal(createVerifiedLoader({ root, registry, approvedRevision: true }).load_verified_skill({ skill: 'example' }, context).error.code, 'UNVERIFIED')
  registry.skills.example.references.bad.path = 'example/INTERFACE.txt'
  assert.equal(createVerifiedLoader({ root, registry, approvedRevision: true }).load_verified_skill({ skill: 'example' }, context).error.code, 'UNVERIFIED')
  delete registry.skills.example.references.bad
  const invalid = Buffer.from([255]); writeFileSync(path.join(root, 'example/interface.txt'), invalid)
  registry.skills.example.contentHash = hashBytes(invalid)
  assert.equal(createVerifiedLoader({ root, registry, approvedRevision: true }).load_verified_skill({ skill: 'example' }, context).error.code, 'INVALID_ENCODING')
}))
test('versioned byte audit enforces one-token overage only for hard categories', () => fixture(({ root, registry }) => {
  const categories = Object.fromEntries(['core', 'optional', 'router', 'workflow', 'reference'].map(category => [category, { maximum: 5, enforcement: 'report-only' }]))
  categories.core.enforcement = 'hard'
  const policy = { estimatorVersion: 'utf8-bytes-v1', responseMaximum: 1000, categories }
  assert.throws(() => validateBudgetPolicy({ ...policy, estimatorVersion: 'changed' }), /INVALID_BUDGET_POLICY/)
  const source = { id: 'example', category: 'core', content: 'x'.repeat(24), maximum: 100 }
  const report = auditVerifiedResponse({ sources: [source] }, policy, 'router text')
  assert.deepEqual(report, auditVerifiedResponse({ sources: [source] }, policy, 'router text'))
  assert.equal(report.bytes, Buffer.byteLength(JSON.stringify({ sources: [source] })))
  assert.equal(report.entries.find(row => row.id === 'example').delta, 1)
  assert.equal(report.failed, true)
  source.category = 'reference'
  assert.equal(auditVerifiedResponse({ sources: [source] }, policy).failed, false)
  source.category = 'core'; source.content = 'x'.repeat(20)
  assert.equal(auditVerifiedResponse({ sources: [source] }, policy).failed, false)
  categories.core.maximum = 1
  const loader = createVerifiedLoader({ root, registry, approvedRevision: true, budgetPolicy: policy })
  assert.equal(loader.load_verified_skill({ skill: 'example' }, context).error.code, 'BUDGET_EXCEEDED')
  assert.deepEqual(loader.inspect(), { grants: [], records: [], locks: [] })
}))
test('root symlink and read failure fail closed; reentrant load cannot commit twice', () => fixture(({ root, registry }) => {
  const link = path.join(root, 'root-link')
  symlinkSync(root, link)
  assert.equal(createVerifiedLoader({ root: link, registry, approvedRevision: true }).load_verified_skill({ skill: 'example' }, context).error.code, 'UNSAFE_PATH')
  if (process.getuid?.() !== 0) {
    const file = path.join(root, 'example/interface.txt')
    chmodSync(file, 0)
    try { assert.equal(createVerifiedLoader({ root, registry, approvedRevision: true }).load_verified_skill({ skill: 'example' }, context).error.code, 'READ_ERROR') }
    finally { chmodSync(file, 0o600) }
  }
  let loader, nested
  loader = createVerifiedLoader({ root, registry, approvedRevision: true, hooks: { beforeCommit: () => { nested = loader.load_verified_skill({ skill: 'example' }, context) } } })
  assert.equal(loader.load_verified_skill({ skill: 'example' }, context).ok, true)
  assert.equal(nested.error.code, 'CONCURRENT_LOAD')
  assert.equal(loader.inspect().records.length, 1)
}))
