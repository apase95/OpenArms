import { mkdir, readFile, open, rename, rm } from "node:fs/promises"
import { randomUUID, createHash } from "node:crypto"
import path from "node:path"
import { budgetMetrics, validateBudgetPolicy, type BudgetPolicy } from "./budget-policy.ts"
import { validateCompaction, summarizeCompaction, type CompactionMeasurement } from "./governance-telemetry.ts"

export const usageMetrics = [...budgetMetrics, "rawToolOutputBytes", "truncationCount", "loadedSkillTokens"] as const
export type UsageMetric = typeof usageMetrics[number]
export type UsageRecord = {
  schemaVersion: 1; kind: "message" | "tool"; id: string; session: string; project: string
  timestamp: string; revision: number; completed: boolean
  task?: string; provider?: string; model?: string; agent?: string; tool?: string
  metrics: Partial<Record<UsageMetric, number>>; estimated?: UsageMetric[]
  compaction?: CompactionMeasurement
}
export type Warning = { schemaVersion: 1; policyVersion: string; scope: "day" | "session" | "task"; scopeID: string; project: string; metric: string; threshold: number; crossed: number[]; current: number; limit: number; action: "report-only" }
export const warningPolicyID = (policy: BudgetPolicy) => `policy-${createHash("sha256").update(JSON.stringify(policy)).digest("hex")}`
export type MetricValue = { value: number | null; status: "measured" | "estimated" | "missing" | "partial"; missing: number; estimated: boolean }
const invalid = () => { throw Error("CORRUPT_USAGE") }
const identifier = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(v)
// Host IDs are opaque values, not internal keys or filesystem paths. Allow
// printable ASCII (including namespaced slash IDs), never control characters.
const hostIdentifier = (v: unknown) => typeof v === "string" && /^[\x21-\x7e]{1,160}$/.test(v)
export function validateUsageRecord(v: unknown): asserts v is UsageRecord {
  if (!v || typeof v !== "object" || Array.isArray(v)) invalid()
  const r = v as UsageRecord
   if (Object.keys(r).some(k => !["schemaVersion", "kind", "id", "session", "project", "timestamp", "revision", "completed", "task", "provider", "model", "agent", "tool", "metrics", "estimated", "compaction"].includes(k))) invalid()
   if (r.compaction !== undefined && (r.kind !== "tool" || !validateCompaction(r.compaction) || r.compaction.rawBytes !== r.metrics?.rawToolOutputBytes || r.compaction.compactedBytes !== r.metrics?.toolOutputBytes)) invalid()
  if (r.schemaVersion !== 1 || !["message", "tool"].includes(r.kind) || ![r.id, r.session, r.project].every(identifier)) invalid()
  for (const k of ["task", "agent", "tool"] as const) if (r[k] !== undefined && !identifier(r[k])) invalid()
  for (const k of ["provider", "model"] as const) if (r[k] !== undefined && !hostIdentifier(r[k])) invalid()
  if (!Number.isSafeInteger(r.revision) || r.revision < 0 || typeof r.completed !== "boolean" || typeof r.timestamp !== "string" || !Number.isFinite(Date.parse(r.timestamp)) || new Date(r.timestamp).toISOString() !== r.timestamp) invalid()
  if (!r.metrics || typeof r.metrics !== "object" || Array.isArray(r.metrics)) invalid()
  for (const [k, value] of Object.entries(r.metrics)) if (!usageMetrics.includes(k as UsageMetric) || !Number.isFinite(value) || value < 0 || (k === "contextUtilization" && value > 1)) invalid()
  if (r.estimated !== undefined && (!Array.isArray(r.estimated) || r.estimated.some(k => !usageMetrics.includes(k) || r.metrics[k] === undefined))) invalid()
}
const key = (r: UsageRecord) => JSON.stringify([r.project, r.session, r.kind, r.id])
export function latestUsage(records: UsageRecord[]) {
  const latest = new Map<string, UsageRecord>()
  for (const r of records) {
    validateUsageRecord(r)
    const old = latest.get(key(r))
    if (!old || (r.revision > old.revision && (!old.completed || r.completed))) latest.set(key(r), structuredClone(r))
    else if (r.revision === old.revision && JSON.stringify(r) !== JSON.stringify(old)) throw Error("CONFLICTING_USAGE_REVISION")
  }
  return [...latest.values()].sort((a, b) => key(a).localeCompare(key(b)))
}
export function usageDay(timestamp: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp))
  return ["year", "month", "day"].map(k => parts.find(p => p.type === k)!.value).join("-")
}
export function summarizeUsage(records: UsageRecord[]) {
  const metrics = Object.fromEntries(usageMetrics.map(metric => {
    const toolMetric = ["toolOutputBytes", "rawToolOutputBytes", "truncationCount", "loadedSkillTokens"].includes(metric)
    const eligible = records.filter(r => r.kind === (toolMetric ? "tool" : "message"))
    const present = eligible.filter(r => r.metrics[metric] !== undefined)
    const missing = eligible.length - present.length
    const estimated = present.some(r => r.estimated?.includes(metric))
    const value = present.length ? (metric === "contextUtilization" ? Math.max(...present.map(r => r.metrics[metric]!)) : present.reduce((n, r) => n + r.metrics[metric]!, 0)) : null
    return [metric, { value, missing, estimated, status: !present.length ? "missing" : missing ? "partial" : estimated ? "estimated" : "measured" }]
  })) as Record<UsageMetric, MetricValue>
  const contributors = records.filter(r => r.kind === "tool").map(r => ({ tool: r.tool ?? "unknown", id: r.id, rawBytes: r.metrics.rawToolOutputBytes ?? null, contextBytes: r.metrics.toolOutputBytes ?? null }))
    .sort((a, b) => (b.contextBytes ?? -1) - (a.contextBytes ?? -1) || a.id.localeCompare(b.id))
  const tools = records.filter(r => r.kind === "tool")
  const compaction = summarizeCompaction(tools.flatMap(r => r.compaction ? [r.compaction] : []), tools.filter(r => !r.compaction).length)
  return { metrics, compaction, turns: records.filter(r => r.kind === "message").length, contributors, attribution: "correlation only" as const }
}
export function rebuildUsage(records: UsageRecord[], policy: BudgetPolicy) {
  validateBudgetPolicy(policy)
  const groups = new Map<string, { day: string; project: string; session: string; task?: string; provider?: string; model?: string; agent?: string; records: UsageRecord[] }>()
  for (const r of latestUsage(records)) {
    const dimensions = { day: usageDay(r.timestamp, policy.timezone), project: r.project, session: r.session, task: r.task, provider: r.provider, model: r.model, agent: r.agent }
    const id = JSON.stringify(dimensions)
    const group = groups.get(id) ?? { ...dimensions, records: [] }
    group.records.push(r); groups.set(id, group)
  }
  return { schemaVersion: 1 as const, timezone: policy.timezone, rows: [...groups.values()].map(({ records, ...dimensions }) => ({ ...dimensions, ...summarizeUsage(records) })) }
}
type Transaction = { schemaVersion: 1; record: UsageRecord; warnings: Warning[] }
const warningKey = (w: Warning, threshold: number) => JSON.stringify([w.policyVersion, w.project, w.scope, w.scopeID, w.metric, threshold])
function crossings(records: UsageRecord[], policy: BudgetPolicy, previous: Warning[]): Warning[] {
  if (policy.mode === "off") return []
  const seen = new Set(previous.flatMap(w => w.crossed.map(t => warningKey(w, t))))
  const result: Warning[] = []
  for (const scope of ["day", "session", "task"] as const) {
    const groups = new Map<string, UsageRecord[]>()
    for (const r of records) {
      const id = scope === "day" ? usageDay(r.timestamp, policy.timezone) : r[scope]
      if (!id) continue
      const k = JSON.stringify([r.project, id]); groups.set(k, [...(groups.get(k) ?? []), r])
    }
    for (const [k, group] of groups) {
      const [project, scopeID] = JSON.parse(k), summary = summarizeUsage(group)
      for (const metric of budgetMetrics) {
        const rule = policy.scopes[scope][metric], current = summary.metrics[metric].value
        if (!rule || current === null || summary.metrics[metric].status === "partial" || group.some(r => r.kind === "message" && !r.completed)) continue
        const base = { schemaVersion: 1 as const, policyVersion: warningPolicyID(policy), project, scope, scopeID, metric, current, limit: rule.limit, action: "report-only" as const }
        const crossed = policy.warnings.filter(t => current >= rule.limit * t / 100 && !seen.has(warningKey({ ...base, threshold: t, crossed: [] }, t)))
        if (crossed.length) result.push({ ...base, threshold: crossed.at(-1)!, crossed })
      }
    }
  }
  return result
}
/** Source transactions include their warning ledger: one atomic publication, no
 * source/ledger crash window. Locks are never stolen; abandoned locks require
 * operator recovery after confirming no writer is alive. Local filesystem only. */
export class UsageStore {
  readonly directory: string
  constructor(directory: string) { this.directory = directory }
  private async locked<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const lock = path.join(this.directory, ".writer-lock")
    let acquired = false
    for (let i = 0; i < 100; i++) {
      try { await mkdir(lock, { mode: 0o700 }); acquired = true; break }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; await new Promise(resolve => setTimeout(resolve, 5)) }
    }
    if (!acquired) throw Error("USAGE_STORE_BUSY")
    try { return await fn() } finally { await rm(lock, { recursive: true }) }
  }
  private async source() {
    let raw: string
    try { raw = await readFile(path.join(this.directory, "source.jsonl"), "utf8") }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return { raw: "", records: [] as UsageRecord[], warnings: [] as Warning[] }; throw e }
    const records: UsageRecord[] = [], warnings: Warning[] = []
    try {
      for (const line of raw.split("\n").filter(Boolean)) {
        const tx: Transaction = JSON.parse(line)
        if (tx.schemaVersion !== 1 || Object.keys(tx).some(k => !["schemaVersion", "record", "warnings"].includes(k)) || !Array.isArray(tx.warnings)) invalid()
        validateUsageRecord(tx.record); records.push(tx.record)
        for (const w of tx.warnings) {
          if (w.schemaVersion !== 1 || !identifier(w.policyVersion) || !identifier(w.project) || !["day", "session", "task"].includes(w.scope) || !identifier(w.scopeID) || !budgetMetrics.includes(w.metric as any) || w.action !== "report-only" || !Number.isFinite(w.current) || w.current < 0 || !Number.isFinite(w.limit) || w.limit <= 0 || !Array.isArray(w.crossed) || !w.crossed.length || w.crossed.some((t, i) => !Number.isFinite(t) || t <= 0 || t > 100 || (i > 0 && t <= w.crossed[i - 1])) || w.threshold !== w.crossed.at(-1) || Object.keys(w).some(k => !["schemaVersion", "policyVersion", "scope", "scopeID", "project", "metric", "threshold", "crossed", "current", "limit", "action"].includes(k))) invalid()
          warnings.push(w)
        }
      }
      return { raw, records: latestUsage(records), warnings }
    } catch { return invalid() }
  }
  private async atomic(name: string, data: string) {
    const tmp = path.join(this.directory, `.${randomUUID()}.tmp`), target = path.join(this.directory, name)
    const handle = await open(tmp, "wx", 0o600)
    try { await handle.writeFile(data); await handle.sync(); await handle.close(); await rename(tmp, target); const dir = await open(this.directory, "r"); try { await dir.sync() } finally { await dir.close() } }
    finally { await handle.close().catch(() => {}); await rm(tmp, { force: true }) }
  }
  async upsert(record: UsageRecord, policy: BudgetPolicy) {
    validateUsageRecord(record); validateBudgetPolicy(policy)
    return this.locked(async () => {
      const old = await this.source()
      const existing = old.records.find(r => key(r) === key(record))
      // Tool retries have no host timestamp/revision: preserve the first observed
      // time, while still rejecting conflicting measurements of the same call.
      const incoming = record.kind === "tool" && existing && record.revision === existing.revision ? { ...record, timestamp: existing.timestamp } : record
      const records = latestUsage([...old.records, incoming])
      if (JSON.stringify(records) === JSON.stringify(old.records)) return
      const warnings = crossings(records, policy, old.warnings)
      await this.atomic("source.jsonl", old.raw + JSON.stringify({ schemaVersion: 1, record: incoming, warnings }) + "\n")
      await this.atomic("aggregate.json", JSON.stringify(rebuildUsage(records, policy)))
    })
  }
  async read(policy: BudgetPolicy) {
    validateBudgetPolicy(policy)
    const source = await this.source()
    try {
      const cache = JSON.parse(await readFile(path.join(this.directory, "aggregate.json"), "utf8"))
      if (cache.schemaVersion !== 1 || typeof cache.timezone !== "string" || !Array.isArray(cache.rows)) invalid()
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") invalid() }
    // Derived cache is not authoritative: rebuild also repairs interrupted cache writes.
    return { records: source.records, warnings: source.warnings, aggregate: rebuildUsage(source.records, policy) }
  }
  /** At-most-once local delivery: persist claims before toast. A crash after claim
   * may lose the toast, but cannot replay it on restart. Dashboard remains available. */
  async claimWarnings(policy: BudgetPolicy, project: string, session: string, now = new Date().toISOString()) {
    validateBudgetPolicy(policy)
    if (policy.mode !== "warn") return []
    return this.locked(async () => {
      const source = await this.source(), day = usageDay(now, policy.timezone)
      let delivered: string[] = []
      try {
        delivered = JSON.parse(await readFile(path.join(this.directory, "delivered.json"), "utf8"))
        if (!Array.isArray(delivered) || delivered.some(id => typeof id !== "string")) invalid()
      } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e }
      const seen = new Set(delivered), claimed: (Warning & { estimated: boolean })[] = []
      for (const warning of source.warnings) {
        if (warning.policyVersion !== warningPolicyID(policy) || warning.project !== project || !(warning.scope === "day" ? warning.scopeID === day : warning.scope === "session" && warning.scopeID === session && session !== "__skill_router_home__")) continue
        const group = source.records.filter(r => r.project === project && (warning.scope === "day" ? usageDay(r.timestamp, policy.timezone) === day : r.session === session))
        const sample = summarizeUsage(group).metrics[warning.metric as UsageMetric]
        const rule = policy.scopes[warning.scope][warning.metric as keyof typeof policy.scopes.day]
        if (!rule || sample.value === null || sample.status === "partial" || sample.status === "missing" || group.some(r => r.kind === "message" && !r.completed) || sample.value < rule.limit * warning.threshold / 100) continue
        const crossed = warning.crossed.filter(t => !seen.has(warningKey(warning, t)))
        if (!crossed.length) continue
        crossed.forEach(t => seen.add(warningKey(warning, t)))
        claimed.push({ ...warning, crossed, threshold: crossed.at(-1)!, current: sample.value, estimated: sample.estimated })
      }
      if (claimed.length) await this.atomic("delivered.json", JSON.stringify([...seen]))
      return claimed
    })
  }
  async rebuild(policy: BudgetPolicy) {
    validateBudgetPolicy(policy)
    return this.locked(async () => { const source = await this.source(), aggregate = rebuildUsage(source.records, policy); await this.atomic("aggregate.json", JSON.stringify(aggregate)); return aggregate })
  }
}
