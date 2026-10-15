import { isRecord, isStringArray } from "./registry.ts"
import type { RouterState } from "./types.ts"

const selection = (value: unknown): boolean =>
  isRecord(value) && Object.values(value).every(isStringArray)

export function validateState(value: unknown): asserts value is RouterState {
  const invalid = () => { throw new Error("The skill state is not valid; repair or restore the state file before continuing.") }
  if (!isRecord(value) || ![1, 2].includes(value.version) || !isRecord(value.projects)) return invalid()
  for (const project of Object.values(value.projects)) {
    if (!isRecord(project) || !selection(project.lastSelection) || !isRecord(project.sessions)) return invalid()
    if (project.library !== undefined && (!isRecord(project.library)
      || !["root", "revision", "registryHash"].every(key => typeof project.library[key] === "string" && project.library[key]))) return invalid()
    if (project.verifiedGrants !== undefined && (!Array.isArray(project.verifiedGrants) || project.verifiedGrants.length > 200
      || project.verifiedGrants.some((grant: any) => !isRecord(grant) || grant.scope !== "project" || typeof grant.skill !== "string" || typeof grant.owner !== "string" || typeof grant.project !== "string" || !/^sha256:[a-f0-9]{64}$/.test(grant.revision)))) return invalid()
    for (const session of Object.values(project.sessions)) {
      if (!isRecord(session) || !selection(session.packages) || !isStringArray(session.approvedMismatch)
        || typeof session.updatedAt !== "string") return invalid()
      if ((session.selectionReady !== undefined && typeof session.selectionReady !== "boolean") || (session.childFallback !== undefined && typeof session.childFallback !== "boolean")) return invalid()
      if (session.pendingHomeSelection !== undefined && typeof session.pendingHomeSelection !== "boolean") return invalid()
      if (session.taskPackage !== undefined && typeof session.taskPackage !== "string") return invalid()
      if (session.taskSession !== undefined && (typeof session.taskSession !== "string" || !session.taskSession || !Object.hasOwn(project.sessions, session.taskSession) || project.sessions[session.taskSession].taskSession !== undefined)) return invalid()
      if (session.taskBoundary !== undefined && (typeof session.taskBoundary !== "string" || !session.taskBoundary)) return invalid()
      if (session.verified !== undefined) {
        const snapshot = session.verified
        if (!isRecord(snapshot) || !["grants", "records", "locks"].every(key => Array.isArray(snapshot[key]))
          || snapshot.grants.length > 200 || snapshot.records.length > 20 || snapshot.locks.length > 1) return invalid()
        for (const grant of snapshot.grants) {
          if (!isRecord(grant) || typeof grant.skill !== "string" || typeof grant.owner !== "string"
            || !["once", "session", "project"].includes(grant.scope) || typeof grant.project !== "string"
            || !/^sha256:[a-f0-9]{64}$/.test(grant.revision)
            || (grant.scope !== "project" && typeof grant.session !== "string")
            || (grant.scope === "once" && typeof grant.task !== "string")) return invalid()
        }
        for (const lock of snapshot.locks) {
          if (!isRecord(lock) || !["project", "session", "task", "owner", "revision"].every(key => typeof lock[key] === "string")
            || !isStringArray(lock.usedSkills) || lock.usedSkills.length > 200) return invalid()
        }
        for (const record of snapshot.records) {
          if (!isRecord(record) || !["project", "session", "task", "skill", "revision"].every(key => typeof record[key] === "string")
            || !Array.isArray(record.sources) || record.sources.some((source: any) => !isRecord(source) || typeof source.id !== "string" || !/^sha256:[a-f0-9]{64}$/.test(source.hash))) return invalid()
        }
      }
      if (session.taskLoadedSkills !== undefined && !isStringArray(session.taskLoadedSkills)) return invalid()
      if (session.loadHistory !== undefined) {
        if (!Array.isArray(session.loadHistory)) return invalid()
        for (const record of session.loadHistory) {
          if (!isRecord(record) || typeof record.packageName !== "string" || !isStringArray(record.skills)
            || typeof record.loadedAt !== "string"
            || (record.workflow !== undefined && typeof record.workflow !== "string")) return invalid()
        }
      }
    }
  }
}
