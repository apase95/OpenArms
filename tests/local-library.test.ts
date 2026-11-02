import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, symlink, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createLocalRuntime } from '../src/local-library.ts'
import { executeLocalSkillsCommand } from '../src/skills-service.ts'

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'arms-local-'))
  try { await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}
async function library(root: string, text = 'Synthetic instructions') {
  await mkdir(path.join(root, 'demo'), { recursive: true })
  await writeFile(path.join(root, 'demo/package.json'), JSON.stringify({ skills: { example: 'example.md', extra: 'extra.md' } }))
  await writeFile(path.join(root, 'demo/example.md'), text)
  await writeFile(path.join(root, 'demo/extra.md'), 'Synthetic extra')
}
const options = (root: string) => ({ directory: root, stateFile: path.join(root, 'state.json') })
const enabled = { demo: ['demo/example'] }
const authority = ['loadHistory', 'verified', 'taskPackage', 'taskLoadedSkills', 'taskSession']

test('default root is project-local, OFF, and independent of legacy registry/environment', async () => fixture(async root => {
  await library(path.join(root, '.openarms/packages'))
  await writeFile(path.join(root, 'registry.json'), '{invalid legacy registry')
  const runtime = await createLocalRuntime(options(root))
  const current = await runtime.refreshLibrary()
  assert.equal(current.root, path.join(root, '.openarms/packages'))
  assert.deepEqual(await runtime.store.getLastSelection(root), {})
  assert.equal((await runtime.getSkillStatus('s', 'demo/example')).state, 'OFF')
  assert.doesNotMatch(await runtime.buildInstruction('s'), /Synthetic instructions/)
  await runtime.mutateSelection('s', 'use', 'demo', [], current.revision)
  assert.match(await runtime.buildInstruction('s'), /Synthetic instructions/)
  assert.match(await runtime.buildInstruction('s'), /Synthetic extra/)
  await runtime.mutateSelection('s', 'disable', 'demo', [], current.revision)
  assert.doesNotMatch(await runtime.buildInstruction('s'), /Synthetic instructions/)
}))

test('Home, reopened roots and children share live project toggles without grants or locks', async () => fixture(async root => {
  await library(root)
  const a = await createLocalRuntime(options(root)), b = await createLocalRuntime(options(root))
  const config = await a.configureLibrary(root, 'unset', true)
  await a.selectPackage('old', 'demo', enabled.demo, config.revision)
  for (const id of ['__skill_router_home__', 'root', 'child', 'old']) {
    await Promise.all([a.initializeLocalSession(id, config.revision, false, 'old'), b.initializeLocalSession(id, config.revision, false, 'old')])
    assert.match(await executeLocalSkillsCommand(a, id, 'status'), /demo\/example\tON/)
    const session = await a.store.getSession(root, id)
    assert.deepEqual(session?.packages, enabled)
    for (const field of authority) assert.equal(session?.[field], undefined)
  }
  await b.mutateSelection('child', 'remove', 'demo', enabled.demo, config.revision)
  for (const id of ['old', 'root', 'child']) {
    assert.deepEqual((await a.store.getSession(root, id))?.packages, {})
    assert.doesNotMatch(await a.buildInstruction(id), /Synthetic instructions/)
  }
  await a.selectPackage('old', 'demo', enabled.demo, config.revision)
  const other = path.join(root, 'other'); await mkdir(other)
  const isolated = await createLocalRuntime({ directory: other, stateFile: options(root).stateFile })
  await isolated.configureLibrary(root, 'unset', true)
  assert.deepEqual(await isolated.store.getLastSelection(other), {})
  assert.doesNotMatch(await isolated.buildInstruction('old'), /Synthetic instructions/)
}))

test('canonical initial symlink root preserves unchanged enabled IDs', async () => fixture(async root => {
  const source = path.join(root, 'a'), alias = path.join(root, 'alias')
  await library(source); await symlink(source, alias)
  const runtime = await createLocalRuntime(options(root))
  const config = await runtime.configureLibrary(alias, 'unset', true)
  assert.equal(config.root, source)
  await runtime.selectPackage('s', 'demo', enabled.demo, config.revision)
  assert.equal((await runtime.refreshLibrary()).revision, config.revision)
  assert.equal((await runtime.loadSkill('s', 'demo/example')).content, 'Synthetic instructions')
}))

test('canonical root retarget rejects captured reads and retires project/session metadata', async () => fixture(async root => {
  const source = path.join(root, 'a'), other = path.join(root, 'b')
  await library(source, 'Synthetic A'); await library(other, 'Synthetic B')
  const a = await createLocalRuntime(options(root)), b = await createLocalRuntime(options(root))
  const config = await a.configureLibrary(source, 'unset', true)
  await a.selectPackage('s', 'demo', enabled.demo, config.revision)
  const transaction = a.store.localTransaction.bind(a.store)
  let entered!: () => void, release!: () => void
  const captured = new Promise<void>(resolve => { entered = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  a.store.localTransaction = async (...args) => { entered(); await gate; return transaction(...args) }
  const reading = a.loadSkill('s', 'demo/example'); await captured
  await rename(source, path.join(root, 'old-a')); await symlink(other, source)
  release()
  assert.equal((await reading).error?.code, 'LIBRARY_CHANGED')
  const changed = await b.refreshLibrary()
  assert.equal(changed.root, other); assert.notEqual(changed.revision, config.revision)
  assert.deepEqual(await b.store.getLastSelection(root), {})
  const session = await b.store.getSession(root, 's')
  assert.deepEqual(session?.packages, {})
  for (const field of authority) assert.equal(session?.[field], undefined)
  await assert.rejects(b.selectPackage('s', 'demo', enabled.demo, config.revision), /LIBRARY_CHANGED/)
  await b.selectPackage('s', 'demo', enabled.demo, changed.revision)
  assert.equal((await a.loadSkill('s', 'demo/example')).content, 'Synthetic B')
}))

test('invalid context and in-flight source switches cannot publish old content', async () => fixture(async root => {
  const source = path.join(root, 'a'), other = path.join(root, 'b')
  await library(source); await library(other, 'Synthetic B')
  const a = await createLocalRuntime(options(root)), b = await createLocalRuntime(options(root))
  const config = await a.configureLibrary(source, 'unset', true)
  await a.selectPackage('s', 'demo', enabled.demo, config.revision)
  assert.equal((await a.loadSkill('', 'demo/example')).error?.code, 'INVALID_CONTEXT')
  const transaction = a.store.localTransaction.bind(a.store)
  let entered!: () => void, release!: () => void
  const captured = new Promise<void>(resolve => { entered = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  a.store.localTransaction = async (...args) => { entered(); await gate; return transaction(...args) }
  const reading = a.loadSkill('s', 'demo/example'); await captured
  await b.configureLibrary(other, config.revision, true); release()
  assert.equal((await reading).error?.code, 'LIBRARY_CHANGED')
  assert.equal((await b.getSkillStatus('s', 'demo/example')).state, 'OFF')
  assert.doesNotMatch(await b.buildInstruction('s'), /Synthetic instructions/)
}))

test('confirmed source changes reset OFF; stale mutations and obsolete state APIs reject', async () => fixture(async root => {
  await library(root)
  const runtime = await createLocalRuntime(options(root))
  const config = await runtime.configureLibrary(root, 'unset', true)
  await runtime.selectPackage('s', 'demo', enabled.demo, config.revision)
  await runtime.configureLibrary(root, config.revision, false)
  assert.deepEqual(await runtime.store.getLastSelection(root), enabled)
  const changed = await runtime.configureLibrary(root, config.revision, true)
  assert.notEqual(changed.revision, config.revision)
  assert.deepEqual(await runtime.store.getLastSelection(root), {})
  await assert.rejects(runtime.initializeLocalSession('s', config.revision), /LIBRARY_CHANGED/)
  await assert.rejects(runtime.mutateSelection('s', 'add', 'demo', enabled.demo, config.revision), /LIBRARY_CHANGED/)
  await assert.rejects(executeLocalSkillsCommand(runtime, 's', 'use demo demo/example', config.revision), /LIBRARY_CHANGED/)
  await assert.rejects(runtime.store.setPackage(root, 's', 'demo', []), /LOCAL_LIBRARY_REQUIRES_REVISION/)
  await assert.rejects(runtime.store.restoreSession(root, 's'), /LOCAL_LIBRARY_REQUIRES_REVISION/)
  await assert.rejects(runtime.store.verifiedTransaction(root, 's', () => ({ ok: true })), /LOCAL_LIBRARY_REQUIRES_REVISION/)
}))

test('manifest edits are live; new IDs remain OFF and legacy metadata cannot enable them', async () => fixture(async root => {
  await library(root)
  const runtime = await createLocalRuntime(options(root))
  const config = await runtime.configureLibrary(root, 'unset', true)
  await runtime.selectPackage('s', 'demo', enabled.demo, config.revision)
  await writeFile(path.join(root, 'registry.json'), '{old metadata is ignored')
  assert.match(await runtime.buildInstruction('s'), /Synthetic instructions/)
  await writeFile(path.join(root, 'demo/package.json'), JSON.stringify({ skills: { added: 'extra.md' } }))
  assert.equal((await runtime.getSkillStatus('s', 'demo/example')).state, 'ERROR')
  assert.equal((await runtime.getSkillStatus('s', 'demo/added')).state, 'OFF')
  assert.doesNotMatch(await runtime.buildInstruction('s'), /Synthetic instructions/)
  assert.equal((await runtime.loadSkill('s', 'unknown')).error?.code, 'UNKNOWN_ID')
}))

test('safe reads reject escaping symlinks, oversized bytes, invalid UTF8 and missing roots', async () => fixture(async root => {
  const source = path.join(root, 'library'); await library(source)
  const file = path.join(source, 'demo/example.md')
  await writeFile(path.join(root, 'outside.md'), 'outside')
  await rm(file); await symlink(path.join(root, 'outside.md'), file)
  const runtime = await createLocalRuntime({ ...options(root), maxBytes: 4 })
  const config = await runtime.configureLibrary(source, 'unset', true)
  await runtime.selectPackage('s', 'demo', enabled.demo, config.revision)
  assert.equal((await runtime.loadSkill('s', 'demo/example')).error?.code, 'UNSAFE_PATH')
  await rm(file); await writeFile(file, 'oversized')
  assert.equal((await runtime.loadSkill('s', 'demo/example')).error?.code, 'OUTPUT_TOO_LARGE')
  await writeFile(file, Buffer.from([0xc3, 0x28]))
  assert.equal((await runtime.loadSkill('s', 'demo/example')).error?.code, 'INVALID_ENCODING')
  await assert.rejects(runtime.configureLibrary(path.join(root, 'missing'), config.revision, true))
  assert.equal((await runtime.getLibrary()).revision, config.revision)
}))
