import { homedir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readFile } from "node:fs/promises"
import { readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { registrySelection } from "./registry.ts"
import { resolveProjectRoot } from "./project.ts"
import { StateStore, HOME_SESSION } from "./state-store.ts"
import { createVerifiedLoader, validateVerifiedRequest } from "./verified-loader.mjs"
import { hashBytes, parseJSON, readRegular } from "../scripts/registry-v2.mjs"

export { HOME_SESSION }

export function runtimePaths(options: { libraryRoot?: string; stateFile?: string } = {}) {
  const libraryRoot = options.libraryRoot ?? process.env.OPENARMS_LIBRARY_ROOT
    ?? path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const stateBase = process.env.XDG_STATE_HOME || path.join(homedir(), ".local", "state")
  return {
    libraryRoot,
    registryFile: path.join(libraryRoot, "registry.json"),
    stateFile: options.stateFile ?? path.join(stateBase, "openarms", "state.json"),
  }
}

export async function createRuntime(options: {
  directory: string
  worktree?: string
  libraryRoot?: string
  stateFile?: string
  approvedRegistryHash?: string
  budgetPolicy?: any
}) {
  const paths = runtimePaths(options)
  const projectRoot = resolveProjectRoot(options.worktree, options.directory)
  const snapshot = parseJSON(await readFile(paths.registryFile, "utf8"))
  const registry = registrySelection(snapshot)
  const registryHash = hashBytes(Buffer.from(JSON.stringify(snapshot)))
  // Host/operator configuration only, never model args or permission dialogs.
  const approvedHash = options.approvedRegistryHash ?? process.env.OPENARMS_APPROVED_REGISTRY_HASH
  const store = await StateStore.open(paths.stateFile)
  await store.reconcileRegistry(projectRoot, registry)
  await store.reconcileVerifiedRegistry(projectRoot, snapshot)
  const integrityErrors = new Set(["HASH_MISMATCH", "FILE_MISSING", "READ_ERROR", "NON_REGULAR_FILE", "UNSAFE_PATH", "CONCURRENT_FILE_CHANGE", "INVALID_ENCODING"])
  // Separate, advisory failure projection: never grants authority and never changes
  // failed-load state/lock/history/once metadata. Shared by server and TUI processes
  // using the same private state directory. Missing/corrupt telemetry is ignored.
  const failureFile = (sessionID: string, skill: string) => path.join(path.dirname(paths.stateFile), `.verified-status-${hashBytes(Buffer.from(JSON.stringify([projectRoot, sessionID, skill]))).slice(7)}.json`)
  const failureStatus = (sessionID: string, skill: string, boundary: string) => {
    try {
      const bytes = readRegular(failureFile(sessionID, skill))
      if (bytes.length > 1024) return
      const entry = parseJSON(bytes.toString("utf8"))
      if (entry.revision === registryHash && entry.boundary === boundary && integrityErrors.has(entry.code)) return { state: "Unverified", decision: "deny", reason: entry.code }
    } catch { /* Advisory telemetry is not source approval or a content loader. */ }
  }
  const publishFailure = (sessionID: string, skill: string, boundary: string, code?: string) => {
    const file = failureFile(sessionID, skill)
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      if (!code) { unlinkSync(file); return }
      writeFileSync(temporary, JSON.stringify({ revision: registryHash, boundary, code }), { flag: "wx", mode: 0o600 })
      renameSync(temporary, file)
    } catch { /* A telemetry failure must not change the production load result. */ }
    finally { try { unlinkSync(temporary) } catch {} }
  }
  const tickets = new WeakMap<object, { sessionID: string; request: any; boundary: string }>()
  const transact = async (sessionID: string, request: any, scope?: string, boundary?: string) => {
    let stage = "STATE_IO_ERROR"
    try {
    if (typeof sessionID !== "string" || !sessionID) return { ok: false, state: "Denied", error: { code: "INVALID_CONTEXT" } }
    const expectedBoundary = (await store.getSession(projectRoot, sessionID))?.taskBoundary
      ?? (await store.startSession(projectRoot, sessionID)).taskBoundary
    stage = "REGISTRY_IO_ERROR"
    const bytes = await readFile(paths.registryFile, "utf8")
    stage = "INVALID_REGISTRY"
    const disk = parseJSON(bytes)
    if (hashBytes(Buffer.from(JSON.stringify(disk))) !== registryHash) return { ok: false, state: "Unverified", error: { code: "CONCURRENT_REGISTRY_CHANGE" } }
    stage = "STATE_IO_ERROR"
    return await store.verifiedTransaction(projectRoot, sessionID, (session, root, project) => {
      if (session.taskBoundary !== expectedBoundary || (boundary !== undefined && session.taskBoundary !== boundary)) return { ok: false, state: "Denied", error: { code: "TASK_CHANGED" } }
      const authorityID = session.taskSession ?? sessionID
      const authority = project.sessions[authorityID]
      const unchanged = () => {
        let bytes
        try { bytes = readFileSync(paths.registryFile, "utf8") }
        catch { throw Object.assign(new Error("REGISTRY_IO_ERROR"), { loaderCode: "REGISTRY_IO_ERROR" }) }
        let disk
        try { disk = parseJSON(bytes) }
        catch { throw Object.assign(new Error("INVALID_REGISTRY"), { loaderCode: "INVALID_REGISTRY" }) }
        if (hashBytes(Buffer.from(JSON.stringify(disk))) !== registryHash) throw Object.assign(new Error("CONCURRENT_REGISTRY_CHANGE"), { loaderCode: "CONCURRENT_REGISTRY_CHANGE" })
      }
      const loader = createVerifiedLoader({ root: paths.libraryRoot, registry: snapshot, approvedRevision: snapshot.schemaVersion === 2 && approvedHash === registryHash, hooks: { beforeCommit: unchanged, finalRevalidate: unchanged }, ...(options.budgetPolicy ? { budgetPolicy: options.budgetPolicy } : {}) })
      const saved = session.verified ?? { grants: [], records: [], locks: [] }
      loader.restore({ ...saved, locks: (authority.verified?.locks ?? []).map(lock => ({ ...lock, session: sessionID })), grants: [...saved.grants.filter(grant => grant.scope !== "project"), ...(session.childFallback ? [] : project.verifiedGrants ?? [])] }, { taskState: true })
      const context = { project: root, session: sessionID, task: session.taskBoundary!, enabledSkills: Object.entries(session.packages).flatMap(([name, selected]) => [...(registry.packages[name]?.core ?? []), ...selected]), ...(session.childFallback ? { requireApprovalSkills: Object.values(registry.packages).flatMap(p => p.optional) } : {}) }
      if (scope === "status") {
        const status = loader.status(request, context)
        const failure = failureStatus(sessionID, request?.skill, session.taskBoundary!)
         if (failure && ["Enabled", "Available"].includes(status.state)) return { ok: false, status: failure, authorization: status, boundary: session.taskBoundary }
        // Runtime markers never override a denial or stale source revision.
        if (status.state === "Enabled") {
          if (session.taskLoadedSkills?.includes(request.skill)) status.state = "Used"
          else if (saved.records.some(record => record.skill === request.skill && record.revision === registryHash)) status.state = "Loaded"
        }
        return { ok: false, status, authorization: status, boundary: session.taskBoundary }
      }
      let result
      if (scope) {
        try {
          if (scope.startsWith("revoke:")) loader.revoke(request, context, scope.slice(7))
          else loader.grant(request, context, scope)
          unchanged(); result = { ok: true }
        }
        catch (error: any) { return { ok: false, state: "Denied", error: { code: error.loaderCode ?? "INVALID_GRANT" } } }
      } else result = loader.load_verified_skill(request, context)
      // Under the same state lock, so an older failure cannot race past a newer
      // successful transaction's removal. Grants/revokes do not clear integrity failure.
      if (!scope && result.ok) publishFailure(sessionID, request.skill, session.taskBoundary!)
      else if (!scope && integrityErrors.has(result.error?.code)) publishFailure(sessionID, request.skill, session.taskBoundary!, result.error.code)
      if (result.ok) {
        // Registry changes by cooperative operator writers must abort publication.
        session.verified = loader.inspect()
         if (!session.childFallback) project.verifiedGrants = session.verified.grants.filter(grant => grant.scope === "project")
         else if (scope === "project" || scope === "revoke:project") return { ok: false, state: "Denied", error: { code: "CHILD_SCOPE_REQUIRES_SESSION" } }
        session.verified.grants = session.verified.grants.filter(grant => grant.scope !== "project")
        const lock = session.verified.locks[0]
        session.taskPackage = lock?.owner
        session.taskLoadedSkills = lock?.usedSkills
        authority.verified ??= { grants: [], records: [], locks: [] }
        authority.verified.locks = session.verified.locks.map(lock => ({ ...lock, session: authorityID }))
        for (const [id, member] of Object.entries(project.sessions)) if (id === authorityID || member.taskSession === authorityID) {
          member.taskPackage = lock?.owner
          member.taskLoadedSkills = lock?.usedSkills?.slice()
        }
      }
      return result
    })
    } catch {
      // Native I/O details and state recovery metadata stay inside the operator
      // store; never expose exception messages, paths, or content to UI/models.
      return { ok: false, state: "Unverified", error: { code: stage } }
    }
  }
  const loadVerifiedSkill = (request: any, context: { sessionID: string }) => transact(context.sessionID, request)
  const grantVerifiedSkill = (request: any, context: { sessionID: string }, scope: string) => transact(context.sessionID, request, scope)
  const getVerifiedStatus = async (request: any, context: { sessionID: string }) => {
    const result = await transact(context.sessionID, request, "status")
    return result.status ?? { state: result.state, reason: result.error?.code }
  }
  // Identity-bound, one-shot host UI tickets. Copies/model JSON are not capabilities.
  // Capture before opening a dialog; transaction checks that boundary again at commit.
  const prepareVerifiedGrant = async (request: any, context: { sessionID: string }) => {
    let selected
    try { selected = validateVerifiedRequest(request) }
    catch { return Object.freeze({ status: { state: "Denied", reason: "INVALID_REQUEST" }, authorization: { state: "Denied", reason: "INVALID_REQUEST" } }) }
    const result = await transact(context.sessionID, selected, "status")
    const ticket = Object.freeze({ skill: selected.skill, status: result.status ?? { state: result.state, reason: result.error?.code }, authorization: result.authorization ?? { state: result.state, reason: result.error?.code } })
    if (result.boundary) tickets.set(ticket, { sessionID: context.sessionID, request: selected, boundary: result.boundary })
    return ticket
  }
  const commitTicket = async (ticket: object, scope: string, revoke = false) => {
    const captured = tickets.get(ticket)
    tickets.delete(ticket)
    if (!captured || !["once", "session", "project"].includes(scope)) return { ok: false, state: "Denied", error: { code: "INVALID_GRANT" } }
    return transact(captured.sessionID, captured.request, revoke ? `revoke:${scope}` : scope, captured.boundary)
  }
  const commitVerifiedGrant = (ticket: object, scope: string) => commitTicket(ticket, scope)
  const commitVerifiedRevoke = (ticket: object, scope: string) => commitTicket(ticket, scope, true)
  return { ...paths, projectRoot, registry, registryHash, store, loadVerifiedSkill, grantVerifiedSkill, getVerifiedStatus, prepareVerifiedGrant, commitVerifiedGrant, commitVerifiedRevoke }
}
