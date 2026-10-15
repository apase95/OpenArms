/** Operator format and verified runtime contract. v1 content is never loaded. */
export type Permission = 'allow' | 'ask' | 'deny'
export type ContentHash = `sha256:${string}`
export interface VerifiedEntry { path: string; contentHash: ContentHash; maxTokens: number }
export interface VerifiedSkill extends VerifiedEntry {
  owner: string
  kind: 'core' | 'optional'
  defaultPermission: Permission
  workflows: Record<string, VerifiedEntry>
  references: Record<string, VerifiedEntry>
}
export interface VerifiedRegistry {
  schemaVersion: 2
  packages: Record<string, { core: string[]; optional: string[]; detect: { always?: boolean; files: string[]; extensions: string[]; dependencies: string[] } }>
  skills: Record<string, VerifiedSkill>
}

/** Standalone core/adapter request; never accepts a package name or a path. */
export type VerifiedLoadRequest = { skill: string } & (
  | { workflow?: never; reference?: never }
  | { workflow: string; reference?: never }
  | { reference: string; workflow?: never }
)
export interface VerifiedLoadContext {
  project: string
  session: string
  task: string
  enabledSkills?: string[]
}
export interface VerifiedGrant {
  owner: string
  skill: string
  scope: 'once' | 'session' | 'project'
  project: string
  session?: string
  task?: string
  revision: ContentHash
}
export type VerifiedBudgetCategory = 'core' | 'optional' | 'router' | 'workflow' | 'reference'
export interface VerifiedBudgetPolicy {
  estimatorVersion: 'utf8-bytes-v1'
  responseMaximum: number
  categories: Record<VerifiedBudgetCategory, { maximum: number | null; enforcement: 'hard' | 'report-only' }>
}
export interface VerifiedSource {
  id: string
  category: VerifiedBudgetCategory
  content: string
  hash: ContentHash
  estimatedTokens: number
  maximum: number
}
export type VerifiedLoadResult =
  | { ok: true; skill: string; state: 'Loaded'; used: true; estimatorVersion: 'utf8-bytes-v1'; sources: VerifiedSource[] }
  | { ok: false; state: 'Available' | 'Denied' | 'Unverified'; error: { code: string } }
