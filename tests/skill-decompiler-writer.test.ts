import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, readdir, stat, symlink, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decompileSkillPackage } from '../src/skill-decompiler-service.ts'
import { resolveSkillScope } from '../src/skill-scope-resolver.ts'
import { writeDecompiledSkill } from '../src/skill-decompiler-writer.ts'

test('synthetic workflow writer commits private unregistered bytes; consent mutation fails closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'writer-test-'))
  try {
    const raw = { trust: 'untrusted' as const, root: '', document: { path: 'SKILL.md', text: '# Workflow\nMust retain rollback.\n' + 'Neutral authored detail.\n'.repeat(120) }, assets: [] as {path:string;bytes:Buffer}[] }
    const skill = { id: 'workflow', description: 'Synthetic.', coreInterface: '# Workflow\nMust retain rollback.\n[Detail](references/detail.md)', references: [{ id: 'detail', title: 'Detail', content: 'Authored procedure.' }] }
    const ui = { choose: async () => true, record: async () => {} }
    const draft = await decompileSkillPackage(raw, { selectedModel: { providerID: 'openai', modelID: 'gpt-6.1-sol' }, callerAuditReviewUI: ui, adapter: { generate: async () => JSON.stringify(skill) } })
    const scopePlan = resolveSkillScope({ projectRoot: root, skillName: skill.id })
    const result = await writeDecompiledSkill(raw, draft, { scopePlan, callerAuditReviewUI: ui, confirmWrite: async () => true })
    assert.equal(result.trust, 'unregistered')
    assert.equal(await readFile(join(scopePlan.target, 'SKILL.md'), 'utf8'), skill.coreInterface)
    assert.equal((await stat(join(scopePlan.target, 'SKILL.md'))).mode & 0o777, 0o600)
    assert.equal((await stat(scopePlan.target)).mode & 0o777, 0o700)
    await assert.rejects(readFile(scopePlan.registry), /ENOENT/)
    await rm(scopePlan.target, { recursive: true })
    await assert.rejects(writeDecompiledSkill(raw, draft, { scopePlan, callerAuditReviewUI: ui, confirmWrite: async () => { raw.document.text += 'changed'; return true } }), /CHANGED/)
    assert.deepEqual(await readdir(scopePlan.base), [])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('integrated workflow/cloud/docs fixtures: byte savings, assets, rollback, lock and forgery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'writer-test-'))
  try {
    for (const id of ['workflow', 'cloud', 'docs']) {
      const raw = { trust: 'untrusted' as const, root: '', document: { path: 'SKILL.md', text: `# ${id}\nMust preserve evidence.\n[Data](assets/data.png)\n` + 'Synthetic authored neutral explanation.\n'.repeat(120) }, assets: [{ path: 'assets/data.png', bytes: Buffer.from([0, 255, 11]) }] }
      const skill = { id, description: 'Authored synthetic fixture.', coreInterface: `# ${id}\nMust preserve evidence.\n[Details](references/details.md)`, references: [{ id: 'details', title: 'Details', content: '[Data](assets/data.png)' }] }
      const ui = { choose: async () => true, record: async () => {} }
      const draft = await decompileSkillPackage(raw, { selectedModel: { providerID: 'openai', modelID: 'gpt-6.1-sol' }, callerAuditReviewUI: ui, adapter: { generate: async () => JSON.stringify(skill) } })
      assert.ok(draft.report.coreEstimate < 800)
      assert.ok(1 - Buffer.byteLength(skill.coreInterface) / Buffer.byteLength(raw.document.text) >= .6)
      const scopePlan = resolveSkillScope({ projectRoot: root, skillName: id })
      const options = { scopePlan, callerAuditReviewUI: ui, confirmWrite: async () => true }
      await assert.rejects(writeDecompiledSkill(raw, { ...draft, skill: { ...skill, coreInterface: 'Forged' } }, options), /ORPHAN_REFERENCE|CONSTRAINT/)
      await assert.rejects(writeDecompiledSkill(raw, draft, { ...options, confirmWrite: async () => false }), /CONSENT/)
      await writeDecompiledSkill(raw, draft, options)
      assert.deepEqual(await readFile(join(scopePlan.target, 'assets/data.png')), raw.assets[0].bytes)
      const overwrite = { ...options, scopePlan: resolveSkillScope({ projectRoot: root, skillName: id, overwrite: true }) }
      await assert.rejects(writeDecompiledSkill(raw, draft, { ...overwrite, fault: async point => { if (point === 'backed-up') throw Error('injected') } }), /injected/)
      assert.equal(await readFile(join(scopePlan.target, 'SKILL.md'), 'utf8'), skill.coreInterface)
      await assert.rejects(writeDecompiledSkill(raw, draft, { ...overwrite, confirmWrite: async () => { await assert.rejects(writeDecompiledSkill(raw, draft, overwrite), /EEXIST/); return true } , fault: async point => { if (point === 'committed') throw Error('rollback') } }), /rollback/)
      assert.equal(await readFile(join(scopePlan.target, 'SKILL.md'), 'utf8'), skill.coreInterface)
      await symlink(root, join(scopePlan.target, 'redirect'))
      await assert.rejects(writeDecompiledSkill(raw, draft, overwrite), /UNSAFE_EXISTING/)
      await rm(scopePlan.target, { recursive: true })
      assert.deepEqual(await readdir(scopePlan.base), [])
    }
    await mkdir(join(root, 'redirect-root'))
    await symlink(join(root, 'redirect-root'), join(root, 'alias'))
    // Parent symlinks are rejected before any staging write.
    const plan = resolveSkillScope({ projectRoot: join(root, 'alias'), skillName: 'workflow' })
    const { prepareSkillScope } = await import('../src/skill-scope-resolver.ts')
    await assert.rejects(prepareSkillScope(plan), /Unsafe scope parent/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
