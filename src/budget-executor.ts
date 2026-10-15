import { mkdir, open, readFile, rename, rm } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { budgetMetrics, validateBudgetPolicy, type BudgetPolicy } from "./budget-policy.ts"
import { summarizeUsage, usageDay, type UsageRecord } from "./usage-store.ts"

export type ShadowEvent = { schemaVersion: 1; policyVersion: string; project: string; scope: "day" | "session" | "task"; scopeID: string; metric: string; threshold: number; current: number; limit: number; decision: "would_warn" | "would_ask" | "would_block" | "would_rotate"; reasons: string[] }
const identity = (event: ShadowEvent) => JSON.stringify([event.policyVersion, event.project, event.scope, event.scopeID, event.metric, event.threshold, event.decision])
const safeID = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(v)
export function validateShadowEvent(event: ShadowEvent) {
  if (!event || Object.keys(event).sort().join(",") !== "current,decision,limit,metric,policyVersion,project,reasons,schemaVersion,scope,scopeID,threshold" || event.schemaVersion !== 1 || ![event.policyVersion, event.project, event.scopeID].every(safeID) || !["day", "session", "task"].includes(event.scope) || !budgetMetrics.includes(event.metric as any) || !["would_warn", "would_ask", "would_block", "would_rotate"].includes(event.decision) || ![event.threshold, event.current, event.limit].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0) || event.limit <= 0 || !Array.isArray(event.reasons) || event.reasons.some(r => !["BUDGET_WARNING", "BUDGET_LIMIT", "CONTEXT_THRESHOLD", "SESSION_BUDGET", "TOOL_BYTES", "UNRELATED_TASK", "CACHE_TREND_DIAGNOSTIC"].includes(r))) throw Error("INVALID_SHADOW_EVENT")
}
/** Evaluation predicts impact, not authorization. Missing measurements omitted;
 * diagnostic cache reads never predict blocking. No prompt/output in events. */
export function evaluateBudget(policy: BudgetPolicy, records: UsageRecord[]): ShadowEvent[] {
  validateBudgetPolicy(policy)
  if (policy.mode === "off") return []
  const events: ShadowEvent[] = []
  for (const scope of ["day", "session", "task"] as const) {
    const groups = new Map<string, UsageRecord[]>()
    for (const record of records) {
      const scopeID = scope === "day" ? usageDay(record.timestamp, policy.timezone) : record[scope]
      if (!scopeID) continue
      const key = JSON.stringify([record.project, scopeID])
      groups.set(key, [...(groups.get(key) ?? []), record])
    }
    for (const [key, group] of groups) {
      const [project, scopeID] = JSON.parse(key), metrics = summarizeUsage(group).metrics
      for (const metric of budgetMetrics) {
        const rule = policy.scopes[scope][metric], sample = metrics[metric]
        if (!rule || sample.value === null) continue
        const base = { schemaVersion: 1 as const, policyVersion: policy.version, project, scope, scopeID, metric, current: sample.value, limit: rule.limit }
        for (const threshold of policy.warnings.filter(t => sample.value! >= rule.limit * t / 100)) {
          events.push({ ...base, threshold, decision: "would_warn", reasons: ["BUDGET_WARNING"] })
          if (threshold >= 80 && metric !== "cacheRead") events.push({ ...base, threshold, decision: "would_ask", reasons: ["BUDGET_WARNING"] })
        }
        if (rule.hard && metric !== "cacheRead" && sample.status === "measured" && sample.value >= rule.limit) events.push({ ...base, threshold: 100, decision: "would_block", reasons: ["BUDGET_LIMIT"] })
      }
    }
  }
  return events
}
/** Offline version comparison, no durable writes or host calls. */
export function replayBudget(records: UsageRecord[], policies: BudgetPolicy[]) {
  return policies.map(policy => ({ policyVersion: policy.version, events: evaluateBudget(policy, records) }))
}
export class ShadowStore {
  readonly directory: string
  constructor(directory: string) { this.directory = directory }
  async read(): Promise<ShadowEvent[]> {
    try {
      const events = JSON.parse(await readFile(path.join(this.directory, "audit.json"), "utf8"))
      if (!Array.isArray(events)) throw Error("INVALID_SHADOW_EVENT")
      events.forEach(validateShadowEvent)
      return events
    } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw Error("CORRUPT_SHADOW_AUDIT") }
  }
  async record(events: ShadowEvent[]) {
    events.forEach(validateShadowEvent)
    if (!events.length) return
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const lock = path.join(this.directory, ".writer-lock")
    let acquired = false
    for (let i = 0; i < 100; i++) {
      try { await mkdir(lock, { mode: 0o700 }); acquired = true; break }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw Error("SHADOW_IO"); await new Promise(resolve => setTimeout(resolve, 5)) }
    }
    if (!acquired) throw Error("SHADOW_BUSY")
    const temporary = path.join(this.directory, `.${randomUUID()}.tmp`)
    try {
      const old = await this.read(), seen = new Set(old.map(identity)), added: ShadowEvent[] = []
      for (const event of events) if (!seen.has(identity(event))) { seen.add(identity(event)); added.push(event) }
      if (!added.length) return
      const handle = await open(temporary, "wx", 0o600)
      try { await handle.writeFile(JSON.stringify([...old, ...added])); await handle.sync() } finally { await handle.close() }
      await rename(temporary, path.join(this.directory, "audit.json"))
      const dir = await open(this.directory, "r"); try { await dir.sync() } finally { await dir.close() }
    } finally { await rm(temporary, { force: true }); await rm(lock, { recursive: true }) }
  }
}
/** Action layer deliberately has no dialog/cancel/session callbacks. Audit I/O
 * failures are observable but can never deny a request or change tool output. */
export async function executeBudget(policy: BudgetPolicy, events: ShadowEvent[], store: ShadowStore) {
  validateBudgetPolicy(policy)
  if (policy.mode === "off") return { action: "allow" as const, audit: "off" as const }
  try { await store.record(events); return { action: "allow" as const, audit: "recorded" as const } }
  catch { return { action: "allow" as const, audit: "unavailable" as const } }
}
