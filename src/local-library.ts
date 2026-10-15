import path from "node:path"
import { constants } from "node:fs"
import { open, readFile, realpath, stat } from "node:fs/promises"
import { createHash } from "node:crypto"
import { TextDecoder } from "node:util"
import { registrySelection } from "./registry.ts"
import { StateStore, HOME_SESSION } from "./state-store.ts"
import { resolveProjectRoot } from "./project.ts"
import { runtimePaths } from "./runtime.ts"
import { HARD_CAP } from "./output-governor.ts"

const fail = (code: string): never => { throw Object.assign(new Error(code), { localCode: code }) }
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
const inside = (root: string, file: string) => { const rel = path.relative(root, file); return rel !== "" && !rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel) }
async function snapshot(root: string) {
  try {
    root = await realpath(root)
    const skills = await realpath(path.join(root, "skills"))
    if (!inside(root, skills) || !(await stat(skills)).isDirectory()) fail("INVALID_LIBRARY")
    const registryFile = await realpath(path.join(root, "registry.json"))
    if (!inside(root, registryFile) || !(await stat(registryFile)).isFile()) fail("INVALID_LIBRARY")
    const bytes = await readFile(registryFile)
    const registry = registrySelection(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)))
    return { root, registry, registryHash: hash(bytes) }
  } catch { return fail("INVALID_LIBRARY") }
}

/** Independent local semantics. No approval, grant, environment or bundled fallback. */
export async function createLocalRuntime(options: { directory: string; worktree?: string; stateFile?: string; maxBytes?: number }) {
  const projectRoot = resolveProjectRoot(options.worktree, options.directory)
  const store = await StateStore.open(runtimePaths({ stateFile: options.stateFile }).stateFile)
  const maxBytes = options.maxBytes ?? HARD_CAP - 1024
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("INVALID_BUDGET")
  const getLibrary = async () => (await store.getLibrary(projectRoot)) ?? { revision: "unset", root: undefined, registryHash: undefined }
  const refresh = async () => {
    let config = await getLibrary()
    if (!config.root) fail("NOT_CONFIGURED")
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
    return store.configureLibrary(projectRoot, await snapshot(root), expectedRevision)
  }
  const selectPackage = async (sessionID: string, name: string, optional: string[], revision: string) => {
    const current = await refresh()
    if (revision !== current.revision) fail("LIBRARY_CHANGED")
    const definition = Object.hasOwn(current.registry.packages, name) ? current.registry.packages[name] : undefined
    if (!definition || optional.some(id => !definition.optional.includes(id))) fail("UNKNOWN_ID")
    const result = await store.localTransaction(projectRoot, sessionID, revision, (session, _root, project) => {
      if (project.library?.revision !== revision) return { ok: false }
      session.packages[name] = [...new Set(optional)]
      session.selectionReady = true
      if (sessionID === HOME_SESSION) session.pendingHomeSelection = true
      project.lastSelection = structuredClone(session.packages)
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
       session.packages = sessionID === HOME_SESSION
         ? structuredClone(project.lastSelection)
         : !parentID && !reset && home?.pendingHomeSelection
        ? structuredClone(home.packages)
         : !parentID && !reset && sessionID !== HOME_SESSION ? structuredClone(project.lastSelection) : {}
      if (!parentID && home?.pendingHomeSelection && sessionID !== HOME_SESSION) delete home.pendingHomeSelection
      session.selectionReady = true
      session.approvedMismatch = []
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
    if (action !== "clear" && (!definition || ids.some(id => ![...definition.core, ...definition.optional].includes(id)))) fail("UNKNOWN_ID")
    if (action === "remove" && ids.some(id => definition!.core.includes(id))) fail("CORE_REQUIRED")
    return store.localTransaction(projectRoot, sessionID, revision, (session, _root, project) => {
      if (project.library?.revision !== revision) fail("LIBRARY_CHANGED")
      if (["add", "remove", "disable"].includes(action) && !Object.hasOwn(session.packages, name)) fail("NOT_SELECTED")
      if (action === "clear") session.packages = {}
      else if (action === "disable") delete session.packages[name]
      else if (action === "remove") session.packages[name] = session.packages[name].filter(id => !ids.includes(id))
      else session.packages[name] = [...new Set([...(session.packages[name] ?? []), ...ids.filter(id => definition!.optional.includes(id))])]
      const selected = new Set(Object.entries(session.packages).flatMap(([owner, optional]) => [...current.registry.packages[owner].core, ...optional]))
      session.loadHistory = session.loadHistory?.map(record => ({ ...record, skills: record.skills.filter(id => selected.has(id)) })).filter(record => record.skills.length)
      session.taskLoadedSkills = session.taskLoadedSkills?.filter(id => selected.has(id))
      session.selectionReady = true
      if (sessionID === HOME_SESSION) session.pendingHomeSelection = true
      project.lastSelection = structuredClone(session.packages)
      return { ok: true }
    })
  }
  const loadSkill = async (sessionID: string, id: string) => {
    try {
      if (typeof sessionID !== "string" || !sessionID || sessionID === "[object Object]") fail("INVALID_CONTEXT")
      const current = await refresh()
      if (typeof id !== "string" || !Object.hasOwn(current.registry.skills, id)) fail("UNKNOWN_ID")
       const result = await store.localTransaction(projectRoot, sessionID, current.revision, async (session, _root, project) => {
         if (project.library?.revision !== current.revision) fail("LIBRARY_CHANGED")
         const before = await snapshot(current.root)
         if (before.root !== current.root || before.registryHash !== current.registryHash) fail("LIBRARY_CHANGED")
        const selected = Object.entries(session.packages).flatMap(([name, optional]) => [...(current.registry.packages[name]?.core ?? []), ...optional])
        if (!selected.includes(id)) fail("NOT_SELECTED")
        const relative = current.registry.skills[id]
        const lexical = path.resolve(current.root, relative)
        const skillsRoot = path.join(current.root, "skills")
        if (!inside(skillsRoot, lexical)) fail("UNSAFE_PATH")
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
          if (after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs || await realpath(lexical) !== file) fail("CONCURRENT_FILE_CHANGE")
        } finally { await handle.close() }
        const after = await snapshot(current.root)
        if (after.root !== current.root || after.registryHash !== current.registryHash) fail("LIBRARY_CHANGED")
        const response = { ok: true, content: content!, skill: id, revision: current.revision }
        if (Buffer.byteLength(JSON.stringify(response), "utf8") > HARD_CAP) fail("OUTPUT_TOO_LARGE")
        session.taskLoadedSkills = [...new Set([...(session.taskLoadedSkills ?? []), id])]
        const owner = Object.keys(current.registry.packages).find(name => [...current.registry.packages[name].core, ...current.registry.packages[name].optional].includes(id))!
        session.loadHistory = [...(session.loadHistory ?? []), { packageName: owner, skills: [id], loadedAt: new Date().toISOString() }].slice(-20)
        return response
      })
      return result
    } catch (error: any) { return { ok: false, error: { code: error.localCode ?? "READ_ERROR" } } }
  }
  const getSkillStatus = async (sessionID: string, id: string) => {
    try {
      const current = await refresh()
      if (!Object.hasOwn(current.registry.skills, id)) return { state: "Missing", reason: "UNKNOWN_ID" }
      const session = await store.getSession(projectRoot, sessionID)
      if (session?.loadHistory?.some(record => record.skills.includes(id))) return { state: "Loaded" }
      const selected = Object.entries(session?.packages ?? {}).some(([name, optional]) => optional.includes(id) || current.registry.packages[name]?.core.includes(id))
      return { state: selected ? "Selected" : "Missing" }
    } catch (error: any) { return { state: "Missing", reason: error.localCode ?? "READ_ERROR" } }
  }
  const buildInstruction = async (sessionID: string) => {
    try {
      const current = await refresh()
      const session = await store.getSession(projectRoot, sessionID)
      const ids = Object.entries(session?.packages ?? {}).flatMap(([name, optional]) => [...(current.registry.packages[name]?.core ?? []), ...optional])
      return ids.length ? `Selected local skill IDs: ${[...new Set(ids)].join(", ")}. Load exact IDs only through load_skill. Never obtain skill content through files, web or subagents. Skill selection does not grant shell or file permissions.` : "No local skills selected. Do not load skill content."
    } catch { return "Local skill library is not configured or unavailable. Do not load skill content or use a fallback library." }
  }
  return { projectRoot, stateFile: runtimePaths({ stateFile: options.stateFile }).stateFile, store, getLibrary, configureLibrary, refreshLibrary: refresh, selectPackage, initializeLocalSession, mutateSelection, loadSkill, getSkillStatus, buildInstruction }
}
