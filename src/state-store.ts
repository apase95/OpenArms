import { mkdir, open, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { PackageDefinition, ProjectState, Registry, RouterState, SessionState, SkillLoadRecord } from "./types.ts"
import { validateState } from "./state-schema.ts"
import { createVerifiedLoader } from "./verified-loader.mjs"

export const HOME_SESSION = "__skill_router_home__"

const emptyState = (): RouterState => ({ version: 2, projects: {} })
const emptySession = (): SessionState => ({ packages: {}, approvedMismatch: [], taskBoundary: randomUUID(), updatedAt: new Date().toISOString() })

function sortedPackages(packages: Record<string, string[]>) {
  return Object.fromEntries(Object.keys(packages).sort().map((name) => [name, [...new Set(packages[name])].sort()]))
}

function cleanState(state: RouterState): RouterState {
  return {
    version: 2,
    projects: Object.fromEntries(Object.keys(state.projects).sort().map((root) => {
      const project = state.projects[root]
      return [root, {
        ...(project.library ? { library: project.library } : {}),
        ...(project.verifiedGrants ? { verifiedGrants: project.verifiedGrants } : {}),
        lastSelection: sortedPackages(project.lastSelection),
        sessions: Object.fromEntries(Object.keys(project.sessions).sort().map((id) => {
          const session = project.sessions[id]
          return [id, {
            ...session,
            packages: sortedPackages(session.packages),
            approvedMismatch: [...new Set(session.approvedMismatch)].sort(),
            ...(session.loadHistory ? { loadHistory: session.loadHistory.slice(-20) } : {}),
            ...(session.taskLoadedSkills ? { taskLoadedSkills: session.taskLoadedSkills.slice(-200) } : {}),
          }]
        })),
      }]
    })),
  }
}

export class StateStore {
  private file: string

  private constructor(file: string) {
    this.file = file
  }

  static async open(file: string): Promise<StateStore> {
    await mkdir(path.dirname(file), { recursive: true })
    return new StateStore(file)
  }

  private async read(): Promise<RouterState> {
    let content: string
    try {
      content = await readFile(this.file, "utf8")
    } catch (error: any) {
      if (error.code === "ENOENT") return emptyState()
      throw error
    }
    let value: unknown
    try {
      value = JSON.parse(content)
    } catch {
      throw new Error("The skill state is not valid JSON; repair or restore the state file before continuing.")
    }
    validateState(value)
    if (value.version === 1) {
      value.version = 2
      for (const project of Object.values(value.projects)) {
        delete project.verifiedGrants
        for (const session of Object.values(project.sessions)) {
        delete session.taskPackage
        delete session.taskLoadedSkills
        delete session.taskBoundary
        delete session.taskSession
        delete session.verified
        }
      }
    }
    return value
  }

  private async projectRoot(root: string) {
    return realpath(root)
  }

  private async lock() {
    const lockFile = `${this.file}.lock`
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        const handle = await open(lockFile, "wx")
        await handle.close()
        return async () => { await unlink(lockFile).catch(() => {}) }
      } catch (error: any) {
        if (error.code !== "EEXIST") throw error
        const info = await stat(lockFile).catch(() => undefined)
        if (info && Date.now() - info.mtimeMs > 30_000) await unlink(lockFile).catch(() => {})
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
    }
    throw new Error("The skill state is busy, try again")
  }

  private async update<T>(change: (state: RouterState) => T | Promise<T>, commit: (result: T) => boolean = () => true, local = false): Promise<T> {
    const unlock = await this.lock()
    const temporary = `${this.file}.tmp-${process.pid}-${Date.now()}`
    try {
      const state = await this.read()
      const protectedProjects = local ? [] : Object.entries(state.projects)
        .filter(([, project]) => project.library)
        .map(([root, project]) => [root, JSON.stringify(project)] as const)
      const result = await change(state)
      if (!commit(result)) return result
      for (const [root, previous] of protectedProjects) {
        if (JSON.stringify(state.projects[root]) !== previous) throw new Error("LOCAL_LIBRARY_REQUIRES_REVISION")
      }
      const publication = cleanState(state)
      validateState(publication)
      await writeFile(temporary, `${JSON.stringify(publication, null, 2)}\n`, { mode: 0o600 })
      await rename(temporary, this.file)
      return result
    } finally {
      await unlink(temporary).catch(() => {})
      await unlock()
    }
  }

  private ensureProject(state: RouterState, root: string) {
    return state.projects[root] ??= { lastSelection: {}, sessions: {} }
  }

  private ensureSession(project: ProjectState, sessionID: string) {
    if (typeof sessionID !== "string" || !sessionID || sessionID === "[object Object]") throw new Error("INVALID_CONTEXT: session ID must be a nonempty string")
    const session = project.sessions[sessionID] ??= emptySession()
    session.taskBoundary ??= randomUUID()
    if (session.taskSession) session.taskBoundary = project.sessions[session.taskSession].taskBoundary ??= randomUUID()
    return session
  }

  private touch(session: SessionState) {
    session.updatedAt = new Date().toISOString()
  }

  private retireTaskFamily(project: ProjectState, sessionID: string, boundary = randomUUID()) {
    for (const [id, member] of Object.entries(project.sessions)) {
      if (id !== sessionID && member.taskSession !== sessionID) continue
      member.taskBoundary = boundary
      delete member.taskPackage
      delete member.taskLoadedSkills
      if (member.verified) {
        member.verified.locks = []
        member.verified.grants = member.verified.grants.filter(grant => grant.scope !== "once")
      }
      this.touch(member)
    }
  }

  async reconcileRegistry(projectRoot: string, registry: Registry): Promise<void> {
    const root = await this.projectRoot(projectRoot)
    await this.update((state) => {
      const project = state.projects[root]
      if (!project) return
      const reconcile = (packages: Record<string, string[]>) => Object.fromEntries(
        Object.entries(packages).flatMap(([name, skills]) => {
          const definition = Object.hasOwn(registry.packages, name) ? registry.packages[name] : undefined
          if (!definition) return []
          return [[name, skills.filter((skill) => definition.optional.includes(skill))]]
        }),
      )
      project.lastSelection = reconcile(project.lastSelection)
      for (const session of Object.values(project.sessions)) {
        session.packages = reconcile(session.packages)
        session.approvedMismatch = session.approvedMismatch.filter((name) => Object.hasOwn(registry.packages, name))
        if (session.taskPackage && !Object.hasOwn(session.packages, session.taskPackage)) {
          delete session.taskPackage
          delete session.taskLoadedSkills
        }
        if (session.taskPackage && session.taskLoadedSkills) {
          const definition = registry.packages[session.taskPackage]
          const enabled = new Set([...definition.core, ...session.packages[session.taskPackage]])
          session.taskLoadedSkills = session.taskLoadedSkills.filter((skill) => enabled.has(skill.split("/")[0]))
        }
      }
    })
  }

  async getSession(projectRoot: string, sessionID: string): Promise<SessionState | undefined> {
    const root = await this.projectRoot(projectRoot)
    return structuredClone((await this.read()).projects[root]?.sessions[sessionID])
  }

  async getLibrary(projectRoot: string) {
    const root = await this.projectRoot(projectRoot)
    return structuredClone((await this.read()).projects[root]?.library)
  }

  async configureLibrary(projectRoot: string, library: { root: string; registryHash: string }, expectedRevision: string) {
    const root = await this.projectRoot(projectRoot)
    return this.update(state => {
      const project = this.ensureProject(state, root)
      if ((project.library?.revision ?? "unset") !== expectedRevision) throw new Error("LIBRARY_CHANGED")
      project.library = { ...library, revision: randomUUID() }
      project.lastSelection = {}
      delete project.verifiedGrants
      for (const session of Object.values(project.sessions)) {
        session.packages = {}
        session.approvedMismatch = []
        delete session.verified
        delete session.loadHistory
        delete session.taskPackage
        delete session.taskLoadedSkills
        delete session.taskSession
        delete session.pendingHomeSelection
        session.selectionReady = false
        session.taskBoundary = randomUUID()
        this.touch(session)
      }
      return structuredClone(project.library)
    }, () => true, true)
  }

  async reconcileVerifiedRegistry(projectRoot: string, registry: any): Promise<void> {
    const root = await this.projectRoot(projectRoot)
    await this.update(state => {
      const project = state.projects[root]
      if (!project) return
      const loader = createVerifiedLoader({ root, registry })
      const empty = { grants: [], records: [], locks: [] }
      loader.restore({ ...empty, grants: project.verifiedGrants ?? [] })
      project.verifiedGrants = loader.inspect().grants.filter(grant => grant.scope === "project" && grant.project === root)
      for (const [sessionID, session] of Object.entries(project.sessions)) {
        if (!session.verified) continue
        // Reconciliation preserves a live cooperative task boundary, not restore.
        loader.restore(session.verified, { taskState: true })
        session.verified.grants = loader.inspect().grants.filter(grant => grant.project === root && grant.session === sessionID && grant.scope !== "project" && (grant.scope !== "once" || grant.task === session.taskBoundary))
      }
    })
  }

  async getLastSelection(projectRoot: string): Promise<Record<string, string[]>> {
    const root = await this.projectRoot(projectRoot)
    return structuredClone((await this.read()).projects[root]?.lastSelection ?? {})
  }

  async startSession(projectRoot: string, sessionID: string): Promise<SessionState> {
    const root = await this.projectRoot(projectRoot)
    return this.update((state) => {
      const session = this.ensureSession(this.ensureProject(state, root), sessionID)
      return structuredClone(session)
    })
  }

  /** Legacy metadata roots: inherit selection atomically, never authority/history.
   * Local-library callers use localTransaction with their captured revision. */
  async initializeRootSelection(projectRoot: string, sessionID: string): Promise<SessionState> {
    const root = await this.projectRoot(projectRoot)
    return this.update(state => {
      const project = this.ensureProject(state, root)
      const session = this.ensureSession(project, sessionID)
      if (session.selectionReady || session.childFallback || Object.keys(session.packages).length) return structuredClone(session)
      const home = project.sessions[HOME_SESSION]
      session.packages = structuredClone(home?.pendingHomeSelection ? home.packages : project.lastSelection)
      if (home?.pendingHomeSelection) delete home.pendingHomeSelection
      session.selectionReady = true
      session.approvedMismatch = []
      delete session.loadHistory
      delete session.verified
      delete session.taskPackage
      delete session.taskLoadedSkills
      delete session.taskSession
      this.touch(session)
      return structuredClone(session)
    })
  }

  async migrateLegacySession(projectRoot: string, sessionID: string): Promise<SessionState | undefined> {
    const root = await this.projectRoot(projectRoot)
    if (root === "/") return this.getSession(root, sessionID)
    return this.update((state) => {
      const legacy = state.projects["/"]?.sessions[sessionID]
      const project = this.ensureProject(state, root)
      const current = project.sessions[sessionID]
      const currentHasState = current && (
        current.selectionReady || current.childFallback || Object.keys(current.packages).length > 0
        || current.approvedMismatch.length > 0
        || current.taskPackage !== undefined
        || (current.loadHistory?.length ?? 0) > 0
      )
      if (!legacy || currentHasState) return current ? structuredClone(current) : undefined
      project.sessions[sessionID] = structuredClone(legacy)
      delete project.sessions[sessionID].taskPackage
      delete project.sessions[sessionID].taskLoadedSkills
      delete project.sessions[sessionID].verified
      project.sessions[sessionID].taskBoundary = randomUUID()
      if (Object.keys(project.lastSelection).length === 0) {
        project.lastSelection = structuredClone(legacy.packages)
      }
      return structuredClone(project.sessions[sessionID])
    })
  }

  async restoreSession(projectRoot: string, sessionID: string): Promise<SessionState> {
    const root = await this.projectRoot(projectRoot)
    return this.update((state) => {
      const project = this.ensureProject(state, root)
      const session = this.ensureSession(project, sessionID)
      session.packages = structuredClone(project.lastSelection)
      session.selectionReady = true
      session.approvedMismatch = []
      if (!session.taskSession) this.retireTaskFamily(project, sessionID)
      if (session.verified) {
        session.verified.locks = []
        session.verified.grants = session.verified.grants.filter(grant => grant.scope === "session" && grant.session === sessionID && grant.project === root)
      }
      delete session.taskPackage
      delete session.taskLoadedSkills
      this.touch(session)
      return structuredClone(session)
    })
  }

  /** Unproven child bridge: never copy parent state or project approval. Retry
   * preserves explicit child work; a parent event is not an authority grant. */
  async startChildSession(projectRoot: string, childID: string): Promise<SessionState> {
    const root = await this.projectRoot(projectRoot)
    return this.update(state => {
      const project = this.ensureProject(state, root)
      const existing = project.sessions[childID]
      if (existing?.childFallback) return structuredClone(existing)
      const child = emptySession()
      child.childFallback = true
      child.selectionReady = true
      project.sessions[childID] = child
      return structuredClone(child)
    })
  }

  async finishSelection(projectRoot: string, sessionID: string, restore: boolean): Promise<SessionState> {
    if (restore) return this.restoreSession(projectRoot, sessionID)
    const root = await this.projectRoot(projectRoot)
    return this.update(state => {
      const session = this.ensureSession(this.ensureProject(state, root), sessionID)
      session.packages = {}
      session.approvedMismatch = []
      session.selectionReady = true
      delete session.pendingHomeSelection
      delete session.taskSession
      delete session.taskPackage
      delete session.taskLoadedSkills
      session.taskBoundary = randomUUID()
      if (session.verified) { session.verified.locks = []; session.verified.grants = session.verified.grants.filter(g => g.scope === "session" && g.session === sessionID && g.project === root) }
      this.touch(session)
      return structuredClone(session)
    })
  }

  /** Home picker is an explicit selection action, not a session authority. */
  async adoptHomeSelection(projectRoot: string, homeID: string, sessionID: string): Promise<SessionState> {
    const root = await this.projectRoot(projectRoot)
    return this.update(state => {
      const project = this.ensureProject(state, root)
      const session = this.ensureSession(project, sessionID), home = project.sessions[homeID]
      if (!home?.pendingHomeSelection || session.selectionReady || session.childFallback || Object.keys(session.packages).length) return structuredClone(session)
      session.packages = structuredClone(home.packages)
      session.selectionReady = true
      session.approvedMismatch = []
      delete session.taskSession
      delete session.taskPackage
      delete session.taskLoadedSkills
      session.taskBoundary = randomUUID()
      session.verified = { grants: [], records: [], locks: [] }
      delete home.pendingHomeSelection
      return structuredClone(session)
    })
  }

  async inheritSession(projectRoot: string, parentID: string, childID: string, sharedTask = true): Promise<SessionState> {
    // Compatibility name only: neither sharedTask nor ancestry is a grant.
    if (parentID === childID) throw new Error("A session cannot inherit itself")
    return this.startChildSession(projectRoot, childID)
  }

  async setPackage(projectRoot: string, sessionID: string, packageName: string, skills: string[]): Promise<void> {
    const root = await this.projectRoot(projectRoot)
    await this.update((state) => {
      const project = this.ensureProject(state, root)
      const session = this.ensureSession(project, sessionID)
      session.packages[packageName] = [...new Set([...(session.packages[packageName] ?? []), ...skills])].sort()
      session.selectionReady = true
      if (sessionID === HOME_SESSION) session.pendingHomeSelection = true
      project.lastSelection = structuredClone(session.packages)
      this.touch(session)
    })
  }

  async addSkills(projectRoot: string, sessionID: string, packageName: string, skills: string[]): Promise<void> {
    const root = await this.projectRoot(projectRoot)
    await this.update((state) => {
      const project = this.ensureProject(state, root)
      const session = this.ensureSession(project, sessionID)
      if (!Object.hasOwn(session.packages, packageName)) throw new Error(`The ${packageName} package is not enabled`)
      session.packages[packageName] = [...new Set([...(session.packages[packageName] ?? []), ...skills])].sort()
      if (sessionID === HOME_SESSION) session.pendingHomeSelection = true
      project.lastSelection = structuredClone(session.packages)
      this.touch(session)
    })
  }

  async removeSkills(projectRoot: string, sessionID: string, packageName: string, skills: string[], definition: PackageDefinition): Promise<void> {
    const core = skills.find((skill) => definition.core.includes(skill))
    if (core) throw new Error(`${core} is a core skill and cannot be removed`)
    const root = await this.projectRoot(projectRoot)
    await this.update((state) => {
      const project = this.ensureProject(state, root)
      const session = this.ensureSession(project, sessionID)
      if (!Object.hasOwn(session.packages, packageName)) throw new Error(`The ${packageName} package is not enabled`)
      const removed = new Set(skills)
      session.packages[packageName] = (session.packages[packageName] ?? []).filter((skill) => !removed.has(skill))
      project.lastSelection = structuredClone(session.packages)
      this.touch(session)
    })
  }

  async clearSession(projectRoot: string, sessionID: string): Promise<void> {
    const root = await this.projectRoot(projectRoot)
    await this.update((state) => {
      const project = this.ensureProject(state, root)
      const session = this.ensureSession(project, sessionID)
      session.packages = {}
      session.approvedMismatch = []
      session.verified = { grants: (session.verified?.grants ?? []).filter(grant => grant.scope !== "once"), records: session.verified?.records ?? [], locks: [] }
      if (sessionID === HOME_SESSION) session.pendingHomeSelection = true
      if (!session.taskSession) this.retireTaskFamily(project, sessionID)
      delete session.taskPackage
      delete session.taskLoadedSkills
      this.touch(session)
    })
  }

  async disablePackage(projectRoot: string, sessionID: string, packageName: string): Promise<void> {
    const root = await this.projectRoot(projectRoot)
    await this.update((state) => {
      const project = this.ensureProject(state, root)
      const session = this.ensureSession(project, sessionID)
      delete session.packages[packageName]
      if (sessionID === HOME_SESSION) session.pendingHomeSelection = true
      session.approvedMismatch = session.approvedMismatch.filter((name) => name !== packageName)
      if (session.taskPackage === packageName) delete session.taskPackage
      if (!session.taskPackage) delete session.taskLoadedSkills
      project.lastSelection = structuredClone(session.packages)
      this.touch(session)
    })
  }

  async approveMismatch(projectRoot: string, sessionID: string, packageName: string): Promise<void> {
    const root = await this.projectRoot(projectRoot)
    await this.update((state) => {
      const session = this.ensureSession(this.ensureProject(state, root), sessionID)
      session.approvedMismatch = [...new Set([...session.approvedMismatch, packageName])].sort()
      this.touch(session)
    })
  }

  async resetTaskLock(projectRoot: string, sessionID: string, boundary?: string): Promise<void> {
    const root = await this.projectRoot(projectRoot)
    await this.update((state) => {
      const project = this.ensureProject(state, root)
      const session = this.ensureSession(project, sessionID)
      if (session.taskSession) return
      if (boundary && session.taskBoundary === boundary) return
      this.retireTaskFamily(project, sessionID, boundary)
    })
  }

  // Hold the cooperative persisted lock across core authorize/read/revalidate and
  // atomic publication. Failure returns without replacing the state file.
  async verifiedTransaction(projectRoot: string, sessionID: string, change: (session: SessionState, root: string, project: ProjectState) => any): Promise<any> {
    return this.transaction(projectRoot, sessionID, change, false)
  }

  /** Local callers must validate the captured revision inside the locked callback. */
  async localTransaction(projectRoot: string, sessionID: string, revision: string, change: (session: SessionState, root: string, project: ProjectState) => any): Promise<any> {
    return this.transaction(projectRoot, sessionID, (session, root, project) => {
      if (project.library?.revision !== revision) throw Object.assign(new Error("LIBRARY_CHANGED"), { localCode: "LIBRARY_CHANGED" })
      return change(session, root, project)
    }, true)
  }

  private async transaction(projectRoot: string, sessionID: string, change: (session: SessionState, root: string, project: ProjectState) => any, local: boolean): Promise<any> {
    const root = await this.projectRoot(projectRoot)
    return this.update(state => {
      const project = this.ensureProject(state, root)
      if (project.library && !local) throw new Error("LOCAL_LIBRARY_REQUIRES_REVISION")
      const session = this.ensureSession(project, sessionID)
      return change(session, root, project)
    }, result => result.ok === true, local)
  }

  async lockTask(projectRoot: string, sessionID: string, packageName: string): Promise<void> {
    const root = await this.projectRoot(projectRoot)
    await this.update((state) => {
      const session = this.ensureSession(this.ensureProject(state, root), sessionID)
      if (session.taskPackage && session.taskPackage !== packageName) {
        throw new Error(`This task already uses the ${session.taskPackage} package.\nStart a new task to use ${packageName}.`)
      }
      session.taskPackage = packageName
      this.touch(session)
    })
  }

  async recordPackageLoad(
    projectRoot: string,
    sessionID: string,
    packageName: string,
    skills: string[],
    workflow?: string,
    expectedSelection?: string[],
  ): Promise<void> {
    const root = await this.projectRoot(projectRoot)
    await this.update((state) => {
      const session = this.ensureSession(this.ensureProject(state, root), sessionID)
      if (!Object.hasOwn(session.packages, packageName)) throw new Error(`The ${packageName} package is not enabled`)
      if (expectedSelection && JSON.stringify([...session.packages[packageName]].sort()) !== JSON.stringify([...expectedSelection].sort())) {
        throw new Error(`The ${packageName} selection changed during loading; try again`)
      }
      if (session.taskPackage && session.taskPackage !== packageName) {
        throw new Error(`This task already uses the ${session.taskPackage} package.\nStart a new task to use ${packageName}.`)
      }
      session.taskPackage = packageName
      const record: SkillLoadRecord = {
        packageName,
        skills: [...new Set(skills)],
        ...(workflow ? { workflow } : {}),
        loadedAt: new Date().toISOString(),
      }
      session.loadHistory = [...(session.loadHistory ?? []), record].slice(-20)
      session.taskLoadedSkills = [...new Set([...(session.taskLoadedSkills ?? []), ...record.skills])]
      this.touch(session)
    })
  }
}
