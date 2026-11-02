import path from "node:path"
import { constants } from "node:fs"
import { open, readFile, realpath, stat, lstat } from "node:fs/promises"
import { discoverPackages } from './package-catalog.ts'
import type { Registry } from './types.ts'
import { createHash } from "node:crypto"
import { TextDecoder } from "node:util"
import { StateStore, HOME_SESSION } from "./state-store.ts"
import { resolveProjectRoot } from "./project.ts"
import { runtimePaths } from "./runtime.ts"
import { HARD_CAP } from "./output-governor.ts"
import type { RotationSelection } from './session-handoff.ts'

const fail = (code: string): never => { throw Object.assign(new Error(code), { localCode: code }) }
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
const inside = (root: string, file: string) => { const rel = path.relative(root, file); return rel !== "" && !rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel) }
const syncProject = (project: import('./types.ts').ProjectState) => {
  delete project.verifiedGrants
  for (const session of Object.values(project.sessions)) {
    session.packages = structuredClone(project.lastSelection)
    session.approvedMismatch = []
    delete session.verified
    delete session.taskPackage
    delete session.taskLoadedSkills
    delete session.taskSession
    delete session.loadHistory
  }
}
async function snapshot(root: string) {
  try {
    root = await realpath(root).catch((error: any) => { if (error.code === 'ENOENT') return path.resolve(root); throw error })
    // Root directory mtime does not change when a nested manifest is edited.
    // Re-read metadata so injection revalidation observes catalog changes.
    const catalog = await discoverPackages(root)
    const registry: Registry = { version: 1, packages: {}, skills: {} }
    for (const pkg of catalog.packages) {
      registry.packages[pkg.id] = { core: [], optional: pkg.skills.map(skill => skill.id), detect: { always: true } }
      for (const skill of pkg.skills) registry.skills[skill.id] = path.relative(root, skill.path)
    }
    // Root identity controls toggle migration; catalog edits must not reset toggles.
    const catalogFingerprint = hash(Buffer.from(JSON.stringify(catalog)))
    const result = { root, registry, errors: catalog.errors, catalogFingerprint, registryHash: `catalog-v1:${hash(Buffer.from(root))}` }
    return result
  } catch { return fail("INVALID_LIBRARY") }
}

export const DEFAULT_SKILL_BUDGET = 153600 // 150 KB

/** Independent local semantics. No approval, grant, environment or bundled fallback. */
export async function createLocalRuntime(options: { directory: string; worktree?: string; stateFile?: string; maxBytes?: number }) {
  const projectRoot = resolveProjectRoot(options.worktree, options.directory)
  const store = await StateStore.open(runtimePaths({ stateFile: options.stateFile }).stateFile)
  const maxBytes = options.maxBytes ?? DEFAULT_SKILL_BUDGET
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("INVALID_BUDGET")
  const getLibrary = async () => (await store.getLibrary(projectRoot)) ?? { revision: "unset", root: undefined, registryHash: undefined }
  const refresh = async () => {
    let config = await getLibrary()
    if (!config.root) config = await store.configureLibrary(projectRoot, await snapshot(path.join(projectRoot, '.openarms/packages')), config.revision)
    const current = await snapshot(config.root)
    if (current.root !== config.root || current.registryHash !== config.registryHash) {
      try { config = await store.configureLibrary(projectRoot, current, config.revision) }
      catch { fail("LIBRARY_CHANGED") }
    }
    return { ...current, revision: config.revision }
  }
  const configureLibrary = async (root: string, expectedRevision: string, confirmed = false) => {
    if (!confirmed) return getLibrary()
    if (typeof root !== "string" || !path.isAbsolute(root)) fail("INVALID_LIBRARY")
    return store.configureLibrary(projectRoot, await snapshot(await realpath(root)), expectedRevision)
  }
  const selectPackage = async (sessionID: string, name: string, optional: string[], revision: string) => {
    const current = await refresh()
    if (revision !== current.revision) fail("LIBRARY_CHANGED")
    const definition = Object.hasOwn(current.registry.packages, name) ? current.registry.packages[name] : undefined
    if (!definition || optional.some(id => !definition.optional.includes(id))) fail("UNKNOWN_ID")
    const result = await store.localTransaction(projectRoot, sessionID, revision, (session, _root, project) => {
      if (project.library?.revision !== revision) return { ok: false }
      session.packages = structuredClone(project.lastSelection)
      session.packages[name] = [...new Set(optional)]
      delete session.autoSelection
      session.selectionReady = true
      if (sessionID === HOME_SESSION) session.pendingHomeSelection = true
       project.lastSelection = structuredClone(session.packages)
       syncProject(project)
      return { ok: true }
    })
    if (!result.ok) fail("LIBRARY_CHANGED")
  }
  const initializeLocalSession = async (sessionID: string, revision: string, _legacyRestore = false, parentID?: string, reset = false) => {
    const current = await refresh()
    if (current.revision !== revision) fail("LIBRARY_CHANGED")
    return store.localTransaction(projectRoot, sessionID, revision, (session, _root, project) => {
      if (project.library?.revision !== revision) fail("LIBRARY_CHANGED")
      if (!reset && session.selectionReady) return { ok: true, session: structuredClone(session) }
      const home = project.sessions[HOME_SESSION]
       session.packages = structuredClone(project.lastSelection)
      if (!parentID && home?.pendingHomeSelection && sessionID !== HOME_SESSION) delete home.pendingHomeSelection
      session.selectionReady = true
      session.approvedMismatch = []
      session.autoSelection = JSON.stringify(session.packages)
      delete session.verified
      delete session.taskPackage
      delete session.taskLoadedSkills
      delete session.taskSession
      delete session.pendingHomeSelection
      delete session.loadHistory
      return { ok: true, session: structuredClone(session) }
    })
  }
  const mutateSelection = async (sessionID: string, action: "use" | "add" | "remove" | "disable" | "clear", name: string, ids: string[], revision: string) => {
    const current = await refresh()
    if (current.revision !== revision) fail("LIBRARY_CHANGED")
    const definition = Object.hasOwn(current.registry.packages, name) ? current.registry.packages[name] : undefined
    if (!["clear", "remove", "disable"].includes(action) && (!definition || ids.some(id => ![...definition.core, ...definition.optional].includes(id)))) fail("UNKNOWN_ID")
    return store.localTransaction(projectRoot, sessionID, revision, (session, _root, project) => {
      if (project.library?.revision !== revision) fail("LIBRARY_CHANGED")
      if (action === 'remove' || action === 'disable') {
        const persisted = Object.hasOwn(project.lastSelection, name) ? project.lastSelection[name] : undefined
        if (!definition && !persisted) fail('UNKNOWN_ID')
        if (ids.some(id => !definition?.optional.includes(id) && !persisted?.includes(id))) fail('UNKNOWN_ID')
      }
      session.packages = structuredClone(project.lastSelection)
      delete session.autoSelection
      if (action === "clear") session.packages = {}
      else if (action === "disable") delete session.packages[name]
      else if (action === "remove") session.packages[name] = (session.packages[name] ?? []).filter(id => !ids.includes(id))
      else session.packages[name] = [...new Set([...(session.packages[name] ?? []), ...(ids.length ? ids : definition!.optional)])]
      if (session.packages[name]?.length === 0) delete session.packages[name]
      const selected = new Set(Object.values(session.packages).flat())
      session.loadHistory = session.loadHistory?.map(record => ({ ...record, skills: record.skills.filter(id => selected.has(id)) })).filter(record => record.skills.length)
      session.taskLoadedSkills = session.taskLoadedSkills?.filter(id => selected.has(id))
      session.selectionReady = true
      if (sessionID === HOME_SESSION) session.pendingHomeSelection = true
       project.lastSelection = structuredClone(session.packages)
       syncProject(project)
      return { ok: true }
    })
  }
  const loadSkill = async (sessionID: string, id: string, topic?: string) => {
    try {
      if (typeof sessionID !== "string" || !sessionID || sessionID === "[object Object]") fail("INVALID_CONTEXT")
      const current = await refresh()
      if (typeof id !== "string" || !Object.hasOwn(current.registry.skills, id)) fail("UNKNOWN_ID")
       const result = await store.localTransaction(projectRoot, sessionID, current.revision, async (session, _root, project) => {
         if (project.library?.revision !== current.revision) fail("LIBRARY_CHANGED")
         const before = await snapshot(current.root)
          if (before.root !== current.root || JSON.stringify(before.registry) !== JSON.stringify(current.registry)) fail("LIBRARY_CHANGED")
         const selected = Object.values(project.lastSelection).flat()
        if (!selected.includes(id)) fail("NOT_SELECTED")
          if (topic !== undefined) fail('UNKNOWN_TOPIC')
          const relative = current.registry.skills[id]
         const lexical = path.resolve(current.root, relative)
          const skillsRoot = path.join(current.root, id.split('/')[0])
         if (!inside(skillsRoot, lexical)) fail("UNSAFE_PATH")
          {
           let cursor = skillsRoot
           for (const segment of path.relative(skillsRoot, lexical).split(path.sep)) {
             cursor = path.join(cursor, segment)
             if ((await lstat(cursor)).isSymbolicLink()) fail('UNSAFE_PATH')
           }
         }
        const file = await realpath(lexical)
        if (!inside(skillsRoot, file)) fail("UNSAFE_PATH")
        const expectedFile = await stat(file)
        const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
        let content: string
        try {
          const info = await handle.stat()
          if (!info.isFile()) fail("NON_REGULAR_FILE")
          if (info.dev !== expectedFile.dev || info.ino !== expectedFile.ino || await realpath(lexical) !== file) fail("CONCURRENT_FILE_CHANGE")
          if (info.size > maxBytes) fail("OUTPUT_TOO_LARGE")
          const buffer = Buffer.alloc(maxBytes + 1)
          let size = 0
          while (size < buffer.length) {
            const read = await handle.read(buffer, size, buffer.length - size, null)
            if (!read.bytesRead) break
            size += read.bytesRead
          }
           if (size > maxBytes) fail("OUTPUT_TOO_LARGE")
          try { content = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size)) }
          catch { fail("INVALID_ENCODING") }
           const after = await handle.stat()
           const identity = await lstat(lexical)
           if (!identity.isFile() || identity.dev !== info.dev || identity.ino !== info.ino || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs || await realpath(lexical) !== file) fail("CONCURRENT_FILE_CHANGE")
        } finally { await handle.close() }
        const after = await snapshot(current.root)
         if (after.root !== current.root || JSON.stringify(after.registry) !== JSON.stringify(current.registry)) fail("LIBRARY_CHANGED")
        const response = { ok: true, content: content!, skill: id, revision: current.revision }
        const responseCap = Math.max(HARD_CAP, maxBytes + 2048)
        if (Buffer.byteLength(JSON.stringify(response), "utf8") > responseCap) fail("OUTPUT_TOO_LARGE")
        return response
      })
      return result
    } catch (error: any) { return { ok: false, error: { code: error.localCode ?? "READ_ERROR" } } }
  }
  const getSkillStatus = async (sessionID: string, id: string) => {
    try {
      const current = await refresh()
      if (!Object.hasOwn(current.registry.skills, id)) return { state: "ERROR", reason: "UNKNOWN_ID" }
      const selected = Object.values(await store.getLastSelection(projectRoot)).flat().includes(id)
      if (!selected) return { state: 'OFF' }
      const result = await loadSkill(sessionID, id)
      return result.ok ? { state: 'ON' } : { state: 'ERROR', reason: result.error?.code }
    } catch (error: any) { return { state: "ERROR", reason: error.localCode ?? "READ_ERROR" } }
  }
  const buildInjection = async (sessionID: string) => {
    try {
      const current = await refresh()
      const ids = [...new Set(Object.values(await store.getLastSelection(projectRoot)).flat())].sort()
      const parts = ['Enabled project skill instructions (not host/OS permission grants). OFF affects subsequent turns only.']
      const injected: string[] = []
      for (const id of ids) {
        const result = await loadSkill(sessionID, id)
        const part = result.ok ? `\nSkill ${id}:\n${result.content}` : `\nSkill ${id}: ERROR (${result.error?.code})`
        if (Buffer.byteLength(parts.join('\n') + part, 'utf8') > maxBytes) return { instruction: 'Skill injection ERROR: OUTPUT_TOO_LARGE. Disable skills or reduce their size.', skills: [], revision: current.revision }
        parts.push(part)
        if (result.ok) injected.push(id)
      }
      const final = await refresh()
      if (final.revision !== current.revision || final.catalogFingerprint !== current.catalogFingerprint || JSON.stringify([...new Set(Object.values(await store.getLastSelection(projectRoot)).flat())].sort()) !== JSON.stringify(ids)) return { instruction: 'Skill injection ERROR: configuration changed during assembly. Retry next turn.', skills: [], revision: current.revision }
      return { instruction: parts.join('\n'), skills: injected, revision: current.revision }
    } catch { return { instruction: 'Skill injection ERROR: library unavailable. No fallback library was used.', skills: [], revision: '' } }
  }
  const buildInstruction = async (sessionID: string) => (await buildInjection(sessionID)).instruction
  const handoffSelection = async (source: string): Promise<RotationSelection> => {
    const current = await refresh()
    await initializeLocalSession(source, current.revision)
    const packages = Object.fromEntries(Object.entries(await store.getLastSelection(projectRoot)).sort(([a], [b]) => a.localeCompare(b)).map(([name, ids]) => [name, [...ids].sort()]))
    const skills = [...new Set(Object.entries(packages).flatMap(([name, ids]) => {
      const definition = current.registry.packages[name]
      if (!definition || ids.some(id => !definition.optional.includes(id))) fail('STALE_SELECTION')
      return [...definition.core, ...ids]
    }))].sort()
    return { revision: current.revision, packages, skills }
  }
  const restored = new Map<string, string>()
  const restoreHandoffSelection = async (target: string, source: string, selected: RotationSelection) => {
    if (target === source || target === HOME_SESSION || JSON.stringify(await handoffSelection(source)) !== JSON.stringify(selected)) fail('STALE_SELECTION')
    const result = await store.localTransaction(projectRoot, target, selected.revision, (session, _root, project) => {
      const sourcePackages = project.sessions[source]?.packages
      const normalized = sourcePackages && Object.fromEntries(Object.entries(sourcePackages).sort(([a], [b]) => a.localeCompare(b)).map(([name, ids]) => [name, [...ids].sort()]))
      if (JSON.stringify(normalized) !== JSON.stringify(selected.packages) || project.library?.revision !== selected.revision) fail('STALE_SELECTION')
      session.packages = structuredClone(selected.packages)
      session.selectionReady = true
      delete session.autoSelection
      session.approvedMismatch = []
      delete session.verified
      delete session.taskPackage
      delete session.taskSession
      delete session.taskLoadedSkills
      delete session.loadHistory
      delete session.pendingHomeSelection
      restored.set(target, JSON.stringify(session))
      return { ok: true }
    })
    return result
  }
  const checkHandoffSelection = async (target: string, source: string, selected: RotationSelection) => {
    if (JSON.stringify(await handoffSelection(source)) !== JSON.stringify(selected) || JSON.stringify(await handoffSelection(target)) !== JSON.stringify(selected)) fail('STALE_SELECTION')
    return store.localTransaction(projectRoot, target, selected.revision, (session, _root, project) => {
      if (!restored.has(target) || restored.get(target) !== JSON.stringify(session)) fail('STALE_SELECTION')
      const normalized = (packages: Record<string, string[]>) => Object.fromEntries(Object.entries(packages).sort(([a], [b]) => a.localeCompare(b)).map(([name, ids]) => [name, [...ids].sort()]))
      if (project.library?.revision !== selected.revision || JSON.stringify(normalized(project.lastSelection)) !== JSON.stringify(selected.packages) || JSON.stringify(normalized(session.packages)) !== JSON.stringify(selected.packages)) fail('STALE_SELECTION')
      return { ok: true }
    })
  }
  return { projectRoot, stateFile: runtimePaths({ stateFile: options.stateFile }).stateFile, store, getLibrary, configureLibrary, refreshLibrary: refresh, selectPackage, initializeLocalSession, mutateSelection, loadSkill, getSkillStatus, buildInstruction, buildInjection, handoffSelection, restoreHandoffSelection, checkHandoffSelection }
}
