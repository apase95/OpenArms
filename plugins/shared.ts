import { mkdir, open, readFile, readdir, realpath, rename, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

export type PackageDefinition = {
  core: string[]
  optional: string[]
  detect: {
    always?: boolean
    files?: string[]
    extensions?: string[]
    dependencies?: string[]
  }
}

export type Registry = {
  version: 1
  packages: Record<string, PackageDefinition>
  skills: Record<string, string>
}

export type SkillsCommand =
  | { action: "use" | "add" | "remove"; packageName: string; skills: string[] }
  | { action: "list" | "disable"; packageName: string }
  | { action: "status" | "packages" | "inspect" | "help" | "clear" }

export type SessionState = {
  packages: Record<string, string[]>
  approvedMismatch: string[]
  taskPackage?: string
  taskLoadedSkills?: string[]
  loadHistory?: SkillLoadRecord[]
  updatedAt: string
}

export type SkillLoadRecord = {
  packageName: string
  skills: string[]
  workflow?: string
  loadedAt: string
}

export type ProjectState = {
  lastSelection: Record<string, string[]>
  sessions: Record<string, SessionState>
}

export type RouterState = {
  version: 1
  projects: Record<string, ProjectState>
}

const PACKAGE_ORDER = ["docs", "go", "nestjs", "nextjs", "python-ai", "ai-research", "shared-skills"]
const PACKAGE_LABELS: Record<string, string> = {
  docs: "Docs",
  go: "Go",
  nestjs: "NestJS",
  nextjs: "NextJS",
  "python-ai": "Python-AI",
  "ai-research": "AI-Research",
  "shared-skills": "Shared-Skills",
}

export function packageLabel(name: string): string {
  return PACKAGE_LABELS[name] ?? name
}

export function orderedPackageNames(registry: Registry): string[] {
  const rank = new Map(PACKAGE_ORDER.map((name, index) => [name, index]))
  return Object.keys(registry.packages).sort((left, right) =>
    (rank.get(left) ?? PACKAGE_ORDER.length) - (rank.get(right) ?? PACKAGE_ORDER.length)
      || left.localeCompare(right))
}

export function resolveProjectRoot(worktree: string | undefined, directory: string): string {
  return worktree && worktree !== "/" ? worktree : directory
}

const SKIP = new Set(["node_modules", "dist", "build", "coverage", ".git", ".cache", ".next"])

export async function loadRegistry(file: string): Promise<Registry> {
  const value = JSON.parse(await readFile(file, "utf8"))
  if (value?.version !== 1 || !value.packages || !value.skills) throw new Error("The skill registry is not valid.")
  return value
}

export function parseCommand(input: string): SkillsCommand {
  const [action = "", packageName, ...rest] = input.trim().split(/\s+/)
  if (action === "status" || action === "packages" || action === "inspect" || action === "help" || action === "clear") return { action }
  if (action === "list" || action === "disable") {
    if (!packageName) throw new Error("Package name is required")
    return { action, packageName }
  }
  if (action !== "use" && action !== "add" && action !== "remove") {
    throw new Error(`Unknown skills command: ${action || "empty"}`)
  }
  if (!packageName) throw new Error("Package name is required")
  const skills = rest.join(" ").split(/[\s,]+/).filter(Boolean)
  return { action, packageName, skills }
}

export function validateSelection(registry: Registry, packageName: string, skills: string[]): void {
  const definition = registry.packages[packageName]
  if (!definition) throw new Error(`Unknown package: ${packageName}`)
  const known = new Set([...definition.core, ...definition.optional])
  for (const skill of skills) {
    if (!known.has(skill)) throw new Error(`Unknown skill for ${packageName}: ${skill}`)
  }
}

export async function detectPackages(root: string, registry: Registry): Promise<Set<string>> {
  const found = new Set<string>()
  const remaining = new Set(Object.entries(registry.packages)
    .filter(([, definition]) => !definition.detect.always && (
      definition.detect.files?.length
      || definition.detect.extensions?.length
      || definition.detect.dependencies?.length
    ))
    .map(([name]) => name))

  async function visit(dir: string): Promise<void> {
    if (remaining.size === 0) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (remaining.size === 0) return
      if (entry.isSymbolicLink()) continue
      const target = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue
        await visit(target)
        continue
      }
      if (!entry.isFile()) continue

      for (const [name, definition] of Object.entries(registry.packages)) {
        if (definition.detect.files?.includes(entry.name) || definition.detect.extensions?.includes(path.extname(entry.name))) {
          found.add(name)
          remaining.delete(name)
        }
      }

      if (entry.name !== "package.json") continue
      let manifest: any
      try {
        manifest = JSON.parse(await readFile(target, "utf8"))
      } catch {
        continue
      }
      for (const [name, definition] of Object.entries(registry.packages)) {
        if (definition.detect.dependencies?.some((dependency) => manifest.dependencies?.[dependency] || manifest.devDependencies?.[dependency])) {
          found.add(name)
          remaining.delete(name)
        }
      }
    }
  }

  await visit(root)
  return found
}

const emptyState = (): RouterState => ({ version: 1, projects: {} })
const emptySession = (): SessionState => ({ packages: {}, approvedMismatch: [], updatedAt: new Date().toISOString() })

function sortedPackages(packages: Record<string, string[]>) {
  return Object.fromEntries(Object.keys(packages).sort().map((name) => [name, [...new Set(packages[name])].sort()]))
}

function cleanState(state: RouterState): RouterState {
  return {
    version: 1,
    projects: Object.fromEntries(Object.keys(state.projects).sort().map((root) => {
      const project = state.projects[root]
      return [root, {
        lastSelection: sortedPackages(project.lastSelection),
        sessions: Object.fromEntries(Object.keys(project.sessions).sort().map((id) => {
          const session = project.sessions[id]
          return [id, {
            ...session,
            packages: sortedPackages(session.packages),
            approvedMismatch: [...new Set(session.approvedMismatch)].sort(),
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
    try {
      const value = JSON.parse(await readFile(this.file, "utf8"))
      return value?.version === 1 && value.projects ? value : emptyState()
    } catch {
      return emptyState()
    }
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

  private async update<T>(change: (state: RouterState) => T | Promise<T>): Promise<T> {
    const unlock = await this.lock()
    const temporary = `${this.file}.tmp-${process.pid}-${Date.now()}`
    try {
      const state = await this.read()
      const result = await change(state)
      await writeFile(temporary, `${JSON.stringify(cleanState(state), null, 2)}\n`)
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
    return project.sessions[sessionID] ??= emptySession()
  }

  private touch(session: SessionState) {
    session.updatedAt = new Date().toISOString()
  }

  async reconcileRegistry(projectRoot: string, registry: Registry): Promise<void> {
    const root = await this.projectRoot(projectRoot)
    await this.update((state) => {
      const project = state.projects[root]
      if (!project) return
      const reconcile = (packages: Record<string, string[]>) => Object.fromEntries(
        Object.entries(packages).flatMap(([name, skills]) => {
          const definition = registry.packages[name]
          if (!definition) return []
          return [[name, skills.filter((skill) => definition.optional.includes(skill))]]
        }),
      )
      project.lastSelection = reconcile(project.lastSelection)
      for (const session of Object.values(project.sessions)) {
        session.packages = reconcile(session.packages)
        session.approvedMismatch = session.approvedMismatch.filter((name) => name in registry.packages)
        if (session.taskPackage && !(session.taskPackage in registry.packages)) {
          delete session.taskPackage
          delete session.taskLoadedSkills
        }
      }
    })
  }

  async getSession(projectRoot: string, sessionID: string): Promise<SessionState | undefined> {
    const root = await this.projectRoot(projectRoot)
    return structuredClone((await this.read()).projects[root]?.sessions[sessionID])
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

  async migrateLegacySession(projectRoot: string, sessionID: string): Promise<SessionState | undefined> {
    const root = await this.projectRoot(projectRoot)
    if (root === "/") return this.getSession(root, sessionID)
    return this.update((state) => {
      const legacy = state.projects["/"]?.sessions[sessionID]
      const project = this.ensureProject(state, root)
      const current = project.sessions[sessionID]
      const currentHasState = current && (
        Object.keys(current.packages).length > 0
        || current.approvedMismatch.length > 0
        || current.taskPackage !== undefined
        || (current.loadHistory?.length ?? 0) > 0
      )
      if (!legacy || currentHasState) return current ? structuredClone(current) : undefined
      project.sessions[sessionID] = structuredClone(legacy)
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
      this.touch(session)
      return structuredClone(session)
    })
  }

  async inheritSession(projectRoot: string, parentID: string, childID: string): Promise<SessionState> {
    const root = await this.projectRoot(projectRoot)
    return this.update((state) => {
      const project = this.ensureProject(state, root)
      const child = this.ensureSession(project, childID)
      const parent = project.sessions[parentID]
      if (parent) {
        child.packages = structuredClone(parent.packages)
        child.approvedMismatch = [...parent.approvedMismatch]
        this.touch(child)
      }
      return structuredClone(child)
    })
  }

  async setPackage(projectRoot: string, sessionID: string, packageName: string, skills: string[]): Promise<void> {
    const root = await this.projectRoot(projectRoot)
    await this.update((state) => {
      const project = this.ensureProject(state, root)
      const session = this.ensureSession(project, sessionID)
      session.packages[packageName] = [...new Set([...(session.packages[packageName] ?? []), ...skills])].sort()
      project.lastSelection = structuredClone(session.packages)
      this.touch(session)
    })
  }

  async addSkills(projectRoot: string, sessionID: string, packageName: string, skills: string[]): Promise<void> {
    const root = await this.projectRoot(projectRoot)
    await this.update((state) => {
      const project = this.ensureProject(state, root)
      const session = this.ensureSession(project, sessionID)
      session.packages[packageName] = [...new Set([...(session.packages[packageName] ?? []), ...skills])].sort()
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
      const removed = new Set(skills)
      session.packages[packageName] = (session.packages[packageName] ?? []).filter((skill) => !removed.has(skill))
      project.lastSelection = structuredClone(session.packages)
      this.touch(session)
    })
  }

  async clearSession(projectRoot: string, sessionID: string): Promise<void> {
    const root = await this.projectRoot(projectRoot)
    await this.update((state) => {
      const session = this.ensureSession(this.ensureProject(state, root), sessionID)
      session.packages = {}
      session.approvedMismatch = []
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

  async resetTaskLock(projectRoot: string, sessionID: string): Promise<void> {
    const root = await this.projectRoot(projectRoot)
    await this.update((state) => {
      const session = this.ensureSession(this.ensureProject(state, root), sessionID)
      delete session.taskPackage
      delete session.taskLoadedSkills
      this.touch(session)
    })
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
  ): Promise<void> {
    const root = await this.projectRoot(projectRoot)
    await this.update((state) => {
      const session = this.ensureSession(this.ensureProject(state, root), sessionID)
      const record: SkillLoadRecord = {
        packageName,
        skills: [...new Set(skills)],
        ...(workflow ? { workflow } : {}),
        loadedAt: new Date().toISOString(),
      }
      session.loadHistory = [...(session.loadHistory ?? []), record].slice(-20)
      session.taskLoadedSkills = record.skills
    })
  }
}
