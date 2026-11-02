import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createLocalRuntime } from '../src/local-library.ts'
import { executeLocalSkillsCommand } from '../src/skills-service.ts'

test('local inspect shares the status title and renderer never invents activation', async () => {
  const source = await readFile(new URL('../plugins/skill-router-tui.tsx', import.meta.url), 'utf8')
  assert.match(source, /inspect: "Skill Status"/)
  assert.doesNotMatch(source, /Skill Inspect|Activated/)
})

test('local report aliases preserve OFF, readable ON and load ERROR', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'arms-toggle-'))
  try {
    const pkg = path.join(dir, '.openarms/packages/demo')
    await mkdir(pkg, { recursive: true })
    await writeFile(path.join(pkg, 'package.json'), JSON.stringify({ skills: { edit: 'edit.md' } }))
    await writeFile(path.join(pkg, 'edit.md'), 'INSTRUCTION')
    const runtime = await createLocalRuntime({ directory: dir, stateFile: path.join(dir, 'state.json') })
    for (const state of ['OFF', 'ON', 'ERROR']) {
      if (state === 'ON') await executeLocalSkillsCommand(runtime, 'a', 'use demo')
      if (state === 'ERROR') await rm(path.join(pkg, 'edit.md'))
      for (const command of ['status', 'inspect', 'list demo']) {
        const report = await executeLocalSkillsCommand(runtime, 'a', command)
        assert.ok(report.includes(`demo/edit\t${state}`), report)
        assert.doesNotMatch(report, /Selected|Loaded|Used|Activated/)
        if (state === 'ERROR') assert.match(report, /ERROR \([^)]+\)/)
      }
    }
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('catalog edits between assembled skills fail closed without resetting toggles', async () => {
  for (const edit of ['remove', 'remap']) {
    const dir = await mkdtemp(path.join(tmpdir(), 'arms-toggle-'))
    try {
      const pkg = path.join(dir, '.openarms/packages/demo')
      await mkdir(pkg, { recursive: true })
      const manifest = path.join(pkg, 'package.json')
      await writeFile(manifest, JSON.stringify({ skills: { a: 'a.md', b: 'b.md' } }))
      await writeFile(path.join(pkg, 'a.md'), 'STALE_A')
      await writeFile(path.join(pkg, 'b.md'), 'SYNTHETIC_B')
      const runtime = await createLocalRuntime({ directory: dir, stateFile: path.join(dir, 'state.json') })
      const current = await runtime.refreshLibrary()
      await runtime.mutateSelection('a', 'use', 'demo', [], current.revision)
      const transaction = runtime.store.localTransaction.bind(runtime.store)
      let changed = false
      runtime.store.localTransaction = async (...args) => {
        const result = await transaction(...args)
        if (!changed) {
          changed = true
          await writeFile(manifest, JSON.stringify({ skills: edit === 'remove' ? { b: 'b.md' } : { a: 'replacement.md', b: 'b.md' } }))
        }
        return result
      }
      const result = await runtime.buildInjection('a')
      assert.deepEqual(result.skills, [])
      assert.doesNotMatch(result.instruction, /STALE_A|SYNTHETIC_B/)
      assert.match(result.instruction, /configuration changed/)
      assert.equal((await runtime.refreshLibrary()).revision, current.revision)
      assert.deepEqual(await runtime.store.getLastSelection(runtime.projectRoot), { demo: ['demo/a', 'demo/b'] })
    } finally { await rm(dir, { recursive: true, force: true }) }
  }
})

test('missing enabled IDs stay visible and can be OFFed before definitions return', async () => {
  for (const action of ['remove demo demo/edit', 'disable demo']) {
    const dir = await mkdtemp(path.join(tmpdir(), 'arms-toggle-'))
    try {
      const pkg = path.join(dir, '.openarms/packages/demo')
      await mkdir(pkg, { recursive: true })
      const manifest = path.join(pkg, 'package.json')
      const metadata = JSON.stringify({ skills: { edit: 'edit.md' } })
      await writeFile(manifest, metadata)
      await writeFile(path.join(pkg, 'edit.md'), 'RESTORED_INSTRUCTION')
      const runtime = await createLocalRuntime({ directory: dir, stateFile: path.join(dir, 'state.json') })
      await executeLocalSkillsCommand(runtime, 'a', 'use demo')
      if (action.startsWith('remove')) await writeFile(manifest, JSON.stringify({ skills: {} }))
      else await rm(manifest)
      for (const command of ['status', 'inspect', 'list demo']) {
        assert.match(await executeLocalSkillsCommand(runtime, 'b', command), /demo\/edit\tERROR \(UNKNOWN_ID\)/)
      }
      await executeLocalSkillsCommand(runtime, 'b', action)
      await writeFile(manifest, metadata)
      assert.equal((await runtime.getSkillStatus('a', 'demo/edit')).state, 'OFF')
      assert.doesNotMatch(await runtime.buildInstruction('a'), /RESTORED_INSTRUCTION/)
    } finally { await rm(dir, { recursive: true, force: true }) }
  }
})

test('project toggles inject automatically across sessions and OFF stops future injection', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'arms-toggle-'))
  try {
    const pkg = path.join(dir, '.openarms/packages/demo')
    await mkdir(pkg, { recursive: true })
    await writeFile(path.join(pkg, 'package.json'), JSON.stringify({ skills: { edit: 'edit.md' } }))
    await writeFile(path.join(pkg, 'edit.md'), 'SYNTHETIC_ENABLED_INSTRUCTION')
    const runtime = await createLocalRuntime({ directory: dir, stateFile: path.join(dir, 'state.json') })
    const current = await runtime.refreshLibrary()
    assert.equal((await runtime.getSkillStatus('a', 'demo/edit')).state, 'OFF')
    await runtime.mutateSelection('a', 'use', 'demo', [], current.revision)
    assert.match(await runtime.buildInstruction('b'), /SYNTHETIC_ENABLED_INSTRUCTION/)
    await runtime.mutateSelection('b', 'remove', 'demo', ['demo/edit'], current.revision)
    assert.doesNotMatch(await runtime.buildInstruction('a'), /SYNTHETIC_ENABLED_INSTRUCTION/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('enabled symlink escape is ERROR and never injected', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'arms-toggle-'))
  try {
    const pkg = path.join(dir, '.openarms/packages/demo')
    await mkdir(pkg, { recursive: true })
    await writeFile(path.join(pkg, 'package.json'), JSON.stringify({ skills: { edit: 'edit.md' } }))
    await writeFile(path.join(dir, 'outside.md'), 'MUST_NOT_INJECT')
    await symlink(path.join(dir, 'outside.md'), path.join(pkg, 'edit.md'))
    const runtime = await createLocalRuntime({ directory: dir, stateFile: path.join(dir, 'state.json') })
    const current = await runtime.refreshLibrary()
    await runtime.mutateSelection('a', 'use', 'demo', [], current.revision)
    assert.equal((await runtime.getSkillStatus('a', 'demo/edit')).state, 'ERROR')
    assert.doesNotMatch(await runtime.buildInstruction('a'), /MUST_NOT_INJECT/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
