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

export type SkillLoadRecord = {
  packageName: string
  skills: string[]
  workflow?: string
  loadedAt: string
}

export type SessionState = {
  pendingHomeSelection?: boolean
  selectionReady?: boolean
  childFallback?: boolean
  taskSession?: string
  taskBoundary?: string
  verified?: { grants: any[]; records: any[]; locks: any[] }
  packages: Record<string, string[]>
  approvedMismatch: string[]
  taskPackage?: string
  taskLoadedSkills?: string[]
  loadHistory?: SkillLoadRecord[]
  updatedAt: string
}

export type ProjectState = {
  library?: { root: string; revision: string; registryHash: string }
  verifiedGrants?: any[]
  lastSelection: Record<string, string[]>
  sessions: Record<string, SessionState>
}

export type RouterState = {
  version: 1 | 2
  projects: Record<string, ProjectState>
}
