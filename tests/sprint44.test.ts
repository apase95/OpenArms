import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createLocalRuntime } from '../src/local-library.ts'
import { registerDecompiledSkill } from '../src/skill-decompiler-writer.ts'
import { resolveSkillScope } from '../src/skill-scope-resolver.ts'
import { decompileSkillPackage } from '../src/skill-decompiler-service.ts'

const digest = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`
test('v2 core/topic integrity, selection, invalid IDs and symlink boundaries', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sprint44-'))
  try {
    await mkdir(path.join(root, 'skills/demo/references'), { recursive: true })
    await writeFile(path.join(root, 'skills/demo/SKILL.md'), 'Core')
    await writeFile(path.join(root, 'skills/demo/references/detail.md'), 'Detail')
    const registry = { schemaVersion: 2, packages: { demo: { core: ['demo'], optional: [], detect: { files: [], extensions: [], dependencies: [] } } }, skills: { demo: { owner: 'demo', kind: 'core', path: 'skills/demo/SKILL.md', contentHash: digest('Core'), maxTokens: 100, defaultPermission: 'deny', workflows: {}, references: { detail: { path: 'skills/demo/references/detail.md', contentHash: digest('Detail'), maxTokens: 100 } } } } }
    await writeFile(path.join(root, 'registry.json'), JSON.stringify(registry))
    const runtime = await createLocalRuntime({ directory: root, stateFile: path.join(root, 'state.json') })
    const config = await runtime.configureLibrary(root, 'unset', true)
    assert.equal((await runtime.loadSkill('s', 'demo', 'detail')).error?.code, 'NOT_SELECTED')
    await runtime.selectPackage('s', 'demo', [], config.revision)
    assert.equal((await runtime.loadSkill('s', 'demo')).content, 'Core')
    assert.equal((await runtime.loadSkill('s', 'demo', 'detail')).content, 'Detail')
    for (const topic of ['', '../detail', 'other', '/detail', 'demo']) assert.equal((await runtime.loadSkill('s', 'demo', topic)).error?.code, 'UNKNOWN_TOPIC')
    await runtime.selectPackage('fresh', 'demo', [], config.revision)
    await writeFile(path.join(root, 'skills/demo/references/detail.md'), 'DetaiL')
    assert.equal((await runtime.loadSkill('fresh', 'demo', 'detail')).error?.code, 'HASH_MISMATCH')
    assert.equal((await runtime.getSkillStatus('fresh', 'demo')).state, 'Selected')
    assert.equal((await runtime.store.getSession(root, 'fresh'))?.loadHistory, undefined)
    await writeFile(path.join(root, 'skills/demo/SKILL.md'), 'CorE')
    assert.equal((await runtime.loadSkill('fresh', 'demo')).error?.code, 'HASH_MISMATCH')
    await rm(path.join(root, 'skills/demo/references/detail.md'))
    await symlink('../SKILL.md', path.join(root, 'skills/demo/references/detail.md'))
    assert.equal((await runtime.loadSkill('fresh', 'demo', 'detail')).error?.code, 'UNSAFE_PATH')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('audited registration serializes different installs, both scopes, rollback and invalid registry', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sprint44-writer-'))
  const ui = { choose: async () => true, record: async () => {} }
  try {
    for (const scope of ['local', 'global'] as const) {
      const make = async (id: string, overwrite = false) => {
        const raw = { trust: 'untrusted' as const, root: '', document: { path: 'SKILL.md', text: `# ${id}\nMust retain evidence.\n` + 'Authored neutral explanation.\n'.repeat(100) }, assets: [] }
        const skill = { id, description: 'Synthetic.', coreInterface: `# ${id}\nMust retain evidence.\n[Detail](references/${id}-detail.md)`, references: [{ id: `${id}-detail`, title: 'Detail', content: 'Authored detail.' }] }
        const draft = await decompileSkillPackage(raw, { selectedModel: { providerID: 'openai', modelID: 'gpt-6.1-sol' }, callerAuditReviewUI: ui, adapter: { generate: async () => JSON.stringify(skill) } })
        const scopePlan = resolveSkillScope({ projectRoot: path.join(root, scope), scope, env: { XDG_CONFIG_HOME: path.join(root, 'xdg') }, skillName: id, overwrite })
        return { raw, draft, options: { scopePlan, callerAuditReviewUI: ui, confirmWrite: async () => true } }
      }
      const a = await make('alpha'), b = await make('beta')
      const results = await Promise.all([a, b].map(x => registerDecompiledSkill(x.raw, x.draft, x.options)))
      assert.ok(results.every(x => x.trust === 'registered'))
      const registry = JSON.parse(await readFile(a.options.scopePlan.registry, 'utf8'))
      assert.deepEqual(Object.keys(registry.skills).sort(), ['alpha', 'beta'])
      assert.equal(registry.skills.alpha.contentHash, digest(a.draft.skill.coreInterface))
      const runtime = await createLocalRuntime({ directory: root, stateFile: path.join(root, `${scope}-state.json`) })
      const config = await runtime.configureLibrary(path.dirname(a.options.scopePlan.registry), 'unset', true)
      await runtime.selectPackage('s', 'alpha', [], config.revision)
      assert.equal((await runtime.loadSkill('s', 'alpha', 'alpha-detail')).content, 'Detail\nAuthored detail.')
      const overwrite = await make('alpha', true)
      for (const point of ['staged', 'backed-up', 'committed', 'registry-staged']) {
        await assert.rejects(registerDecompiledSkill(overwrite.raw, overwrite.draft, { ...overwrite.options, fault: async at => { if (at === point) throw Error('injected') } }), /injected/)
        assert.deepEqual(JSON.parse(await readFile(a.options.scopePlan.registry, 'utf8')), registry)
        assert.equal(await readFile(path.join(a.options.scopePlan.target, 'SKILL.md'), 'utf8'), a.draft.skill.coreInterface)
      }
      assert.deepEqual((await readdir(a.options.scopePlan.base)).sort(), ['alpha', 'beta'])
      const c = await make('gamma')
      await writeFile(c.options.scopePlan.registry, '{invalid')
      await assert.rejects(registerDecompiledSkill(c.raw, c.draft, c.options), /json/)
      assert.deepEqual((await readdir(c.options.scopePlan.base)).sort(), ['alpha', 'beta'])
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
