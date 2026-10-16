import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, open, rename, rm, readdir, readFile } from 'node:fs/promises'
import { parseJSON, validateRegistry } from '../scripts/registry-v2.mjs'
import type { VerifiedRegistry } from './registry-v2-types.ts'
import type { RawSkillPackage } from './skill-archive-extractor.ts'
import { auditSkillPackage } from './skill-security-audit.ts'
import { reviewSkillAudit, type AuditReviewUI } from './skill-audit-review.ts'
import { buildDecompilerSource, type ValidatedDecompilerDraft } from './skill-decompiler-service.ts'
import { validateDecompiledSkill } from './skill-decompiler.ts'
import { prepareSkillScope, type ScopePlan } from './skill-scope-resolver.ts'

const fail = (code: string): never => { throw Error(`DECOMPILER_WRITER_${code}`) }
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
async function exists(file: string) { try { return await lstat(file) } catch (e: any) { if (e.code !== 'ENOENT') throw e } }
function safe(file: string) {
  if (!file || /[\\%:\x00-\x20?#]/.test(file) || file.startsWith('/') || file.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) fail('PATH')
}
async function tree(dir: string): Promise<void> {
  for (const name of await readdir(dir)) {
    const file = path.join(dir, name), info = await lstat(file)
    if (info.isSymbolicLink() || (!info.isDirectory() && (!info.isFile() || info.nlink !== 1))) fail('UNSAFE_EXISTING')
    if (info.isDirectory()) await tree(file)
  }
}
async function syncDirectory(dir: string) { const handle = await open(dir, 'r'); try { await handle.sync() } finally { await handle.close() } }
/** API-only owner-controlled filesystem transaction. Registration is explicit; never loads files.
 * Host configuration/UI are trusted; this is not openat-based hostile-FS isolation.
 */
export async function writeDecompiledSkill(raw: RawSkillPackage, draft: ValidatedDecompilerDraft, options: {
  scopePlan: ScopePlan; callerAuditReviewUI: AuditReviewUI
  confirmWrite: (request: Readonly<{ target: string; fingerprint: string; files: readonly string[] }>) => Promise<boolean>
  fault?: (point: 'staged' | 'backed-up' | 'committed' | 'registry-staged') => Promise<void>
  /** Opt in to registry publication in this same audited transaction. */
  register?: boolean
}) {
  const plan = Object.freeze({ ...options.scopePlan })
  const fingerprint = auditSkillPackage(raw).fingerprint
  const draftKey = JSON.stringify(draft)
  if (!fingerprint || draft.rawFingerprint !== fingerprint || typeof options.confirmWrite !== 'function') fail('INPUT')
  const check = () => {
    if (auditSkillPackage(raw).fingerprint !== fingerprint || JSON.stringify(draft) !== draftKey) fail('CHANGED')
    const source = buildDecompilerSource(raw)
    if (source !== draft.source) fail('SOURCE')
    const { skill } = validateDecompiledSkill(source, draft.skill, { assets: raw.assets.map(a => a.path) })
    if (path.basename(plan.target) !== skill.id || plan.target !== path.join(plan.base, skill.id)) fail('TARGET')
    if (draft.assets.length !== raw.assets.length || raw.assets.some(a => !draft.assets.some(m => m.path === a.path && m.bytes === a.bytes.length && m.sha256 === hash(a.bytes)))) fail('ASSETS')
    const files = [{ path: 'SKILL.md', bytes: Buffer.from(skill.coreInterface) }, ...skill.references.map(r => ({ path: `references/${r.id}.md`, bytes: Buffer.from(`${r.title}\n${r.content}`) })), ...raw.assets.map(a => ({ path: a.path, bytes: Buffer.from(a.bytes) }))]
    const seen = new Set<string>()
    for (const file of files) { safe(file.path); const key = file.path.toLowerCase(); if (seen.has(key)) fail('COLLISION'); seen.add(key) }
    for (const key of seen) { const parts = key.split('/'); parts.pop(); while (parts.length) { if (seen.has(parts.join('/'))) fail('COLLISION'); parts.pop() } }
    const rendered = files.map(f => f.bytes.toString('utf8')).join('\n')
    for (const [, link] of source.matchAll(/!?\[[^\]\n]*\]\(([^)\n]*)\)/g)) if (raw.assets.some(a => a.path === link) && !rendered.includes(`](${link})`)) fail('ASSET_LINK')
    return files
  }
  let files = check()
  await prepareSkillScope(plan); check()
  const lockPath = path.join(plan.base, `.${path.basename(plan.target)}.writer-lock`)
  const lock = await open(lockPath, 'wx', 0o600)
  let stage: string | undefined, backup: string | undefined, committed = false, error: unknown
  let registryLock: Awaited<ReturnType<typeof open>> | undefined, registryTemporary: string | undefined, published = false
  const registryLockPath = path.join(path.dirname(plan.registry), '.registry-lock')
  try {
    let registry: VerifiedRegistry | undefined
    if (options.register) {
      if (path.basename(plan.registry) !== 'registry.json') fail('REGISTRY_PATH')
      const deadline = Date.now() + 5000
      for (;;) {
        try { registryLock = await open(registryLockPath, 'wx', 0o600); break }
        catch (e: any) { if (e.code !== 'EEXIST') throw e; if (Date.now() >= deadline) fail('REGISTRY_BUSY'); await new Promise(resolve => setTimeout(resolve, 10)) }
      }
      await prepareSkillScope(plan)
      try { registry = parseJSON(await readFile(plan.registry, 'utf8')); validateRegistry(registry) }
      catch (e: any) {
        if (e.code !== 'ENOENT') throw e
        registry = { schemaVersion: 2, packages: {}, skills: {} }
      }
      // Never migrate/hash arbitrary legacy files as trusted during installation.
      const id = draft.skill.id
      if (Object.hasOwn(registry!.skills, id)) {
        if (!plan.overwrite || registry!.skills[id].owner !== id || registry!.packages[id]?.core.join(',') !== id || registry!.packages[id]?.optional.length) fail('REGISTRY_CONFLICT')
      } else if (Object.hasOwn(registry!.packages, id)) fail('REGISTRY_CONFLICT')
      const entry = (file: { path: string; bytes: Buffer }) => ({ path: `skills/${id}/${file.path}`, contentHash: `sha256:${hash(file.bytes)}` as const, maxTokens: Math.max(1, file.bytes.length) })
      registry!.packages[id] = { core: [id], optional: [], detect: { files: [], extensions: [], dependencies: [] } }
      registry!.skills[id] = { ...entry(files[0]), owner: id, kind: 'core', defaultPermission: 'ask', workflows: {}, references: Object.fromEntries(draft.skill.references.map(ref => [ref.id, entry(files.find(file => file.path === `references/${ref.id}.md`)!)])) }
      validateRegistry(registry)
    }
    await prepareSkillScope(plan); check()
    if (await exists(plan.target)) await tree(plan.target)
    const generated: RawSkillPackage = { trust: 'untrusted', root: '', document: { path: 'SKILL.md', text: files[0].bytes.toString('utf8') }, assets: files.slice(1) }
    for (const input of [raw, generated]) {
      if (await reviewSkillAudit(input, auditSkillPackage(input), options.callerAuditReviewUI) !== 'staged-review-only') fail('AUDIT_DENIED')
      check()
    }
    if (await options.confirmWrite(Object.freeze({ target: plan.target, fingerprint, files: Object.freeze(files.map(f => f.path)) })) !== true) fail('CONSENT')
    files = check()
    stage = await mkdtemp(path.join(plan.base, '.decompiler-stage-'))
    for (const file of files) {
      const target = path.join(stage, file.path)
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
      const temporary = `${target}.tmp-${randomUUID()}`, handle = await open(temporary, 'wx', 0o600)
      try { await handle.writeFile(file.bytes); await handle.sync() } finally { await handle.close() }
      await rename(temporary, target); await syncDirectory(path.dirname(target))
    }
    await options.fault?.('staged'); check()
    await prepareSkillScope(plan); check()
    if (await exists(plan.target)) {
      await tree(plan.target)
      backup = path.join(plan.base, `.decompiler-backup-${randomUUID()}`)
      await rename(plan.target, backup)
      await options.fault?.('backed-up'); check()
    }
    // All cooperating writers hold the same exclusive lock. External hostile
    // renames are explicitly outside the owner-controlled filesystem contract.
    if (await exists(plan.target)) fail('TARGET_EXISTS')
    await rename(stage, plan.target); stage = undefined; committed = true
    await options.fault?.('committed'); check(); await syncDirectory(plan.base)
    if (registry) {
      // Hashes were derived from validated buffers, never from mutable installed files.
      registryTemporary = `${plan.registry}.tmp-${randomUUID()}`
      const handle = await open(registryTemporary, 'wx', 0o600)
      try { await handle.writeFile(JSON.stringify(registry, null, 2) + '\n'); await handle.sync() } finally { await handle.close() }
      await options.fault?.('registry-staged'); check()
      await rename(registryTemporary, plan.registry); registryTemporary = undefined; published = true
      await syncDirectory(path.dirname(plan.registry))
    }
  } catch (cause) { error = cause }
  const cleanupErrors: unknown[] = []
  const cleanup = async (operation: () => Promise<unknown>) => { try { await operation() } catch (e) { cleanupErrors.push(e) } }
  if (error && committed && !published) await cleanup(() => rm(plan.target, { recursive: true }))
  if (error && backup && !published) await cleanup(() => rename(backup!, plan.target))
  if ((!error || published) && backup) await cleanup(() => rm(backup!, { recursive: true }))
  if (stage) await cleanup(() => rm(stage!, { recursive: true }))
  if (registryTemporary) await cleanup(() => rm(registryTemporary!))
  if (registryLock) { await cleanup(() => registryLock!.close()); await cleanup(() => rm(registryLockPath)) }
  await cleanup(() => lock.close()); await cleanup(() => rm(lockPath))
  if (cleanupErrors.length) throw new AggregateError([...(error ? [error] : []), ...cleanupErrors], 'Decompiler writer cleanup failed')
  if (error) {
    if (published) throw new AggregateError([error], 'Registry published; durability uncertain. Installed files retained; inspect before retry.')
    throw error
  }
  return Object.freeze({ trust: options.register ? 'registered' as const : 'unregistered' as const, target: plan.target, rawFingerprint: fingerprint, files: Object.freeze(files.map(f => Object.freeze({ path: f.path, bytes: f.bytes.length, sha256: hash(f.bytes) }))) })
}

/** Coherent API-only audited write + registration; no automatic selection or load. */
export const registerDecompiledSkill = (raw: RawSkillPackage, draft: ValidatedDecompilerDraft, options: Omit<Parameters<typeof writeDecompiledSkill>[2], 'register'>) => writeDecompiledSkill(raw, draft, { ...options, register: true })
