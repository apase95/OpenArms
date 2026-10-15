export const telemetryDomains = ["test", "git-diff", "build", "linter", "generic"] as const
export type CompactionMeasurement = { domain: typeof telemetryDomains[number]; rawBytes: number; compactedBytes: number; savingsRatio: number }
export function validateCompaction(value: unknown): value is CompactionMeasurement {
  try {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  if (Reflect.ownKeys(value).some(k => typeof k !== "string" || !["domain", "rawBytes", "compactedBytes", "savingsRatio"].includes(k) || !("value" in Object.getOwnPropertyDescriptor(value, k)!))) return false
  const v = value as CompactionMeasurement
  return Object.keys(v).every(k => ["domain", "rawBytes", "compactedBytes", "savingsRatio"].includes(k))
    && telemetryDomains.includes(v.domain) && Number.isSafeInteger(v.rawBytes) && v.rawBytes >= 0
    && Number.isSafeInteger(v.compactedBytes) && v.compactedBytes >= 0 && Number.isFinite(v.savingsRatio)
    && v.savingsRatio === (v.rawBytes ? (v.rawBytes - v.compactedBytes) / v.rawBytes : 0)
  } catch { return false }
}
export function summarizeCompaction(values: CompactionMeasurement[], unknownCalls = 0) {
  const raw = values.reduce((n, v) => n + BigInt(v.rawBytes), 0n)
  const compacted = values.reduce((n, v) => n + BigInt(v.compactedBytes), 0n)
  const safe = raw <= BigInt(Number.MAX_SAFE_INTEGER) && compacted <= BigInt(Number.MAX_SAFE_INTEGER)
  const rawBytes = safe ? Number(raw) : null, compactedBytes = safe ? Number(compacted) : null
  return { calls: values.length, unknownCalls, rawBytes, compactedBytes,
    savingsRatio: safe ? (rawBytes ? (rawBytes - compactedBytes!) / rawBytes : 0) : null,
    estimatedTokensSaved: safe ? Math.max(0, (rawBytes! - compactedBytes!) / 4) : null }
}
export type GovernanceEvent = {
  version: 1; tool: string; sessionID: string; callID: string; messageID?: string
  rawBytes: number; contextBytes: number; estimatedTokens: number
  truncation: "none" | "compact" | "hard-cap"; omittedBytes: number; omittedLines: number
  logStatus: "not-needed" | "written" | "failed"
  mode: "off" | "shadow" | "active"; rule: string; decision: string
  pathID?: string
  domain?: CompactionMeasurement["domain"]; compactedBytes?: number; savingsRatio?: number
}
const fields = new Set(["version", "tool", "sessionID", "callID", "messageID", "rawBytes", "contextBytes", "estimatedTokens", "truncation", "omittedBytes", "omittedLines", "logStatus", "mode", "rule", "decision", "pathID", "domain", "compactedBytes", "savingsRatio"])
export function validateTelemetry(value: unknown): value is GovernanceEvent {
  try {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  if (Reflect.ownKeys(value).some(k => typeof k !== "string" || !fields.has(k) || !("value" in Object.getOwnPropertyDescriptor(value, k)!))) return false
  const event = value as Record<string, unknown>
  if (Object.keys(event).some(key => !fields.has(key)) || event.version !== 1) return false
  for (const key of ["tool", "sessionID", "callID", "rule", "decision"]) if (typeof event[key] !== "string" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(event[key] as string)) return false
  for (const key of ["messageID", "pathID"]) if (event[key] !== undefined && (typeof event[key] !== "string" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(event[key] as string))) return false
  for (const key of ["rawBytes", "contextBytes", "estimatedTokens", "omittedBytes", "omittedLines"]) if (!Number.isSafeInteger(event[key]) || (event[key] as number) < 0) return false
  if (["domain", "compactedBytes", "savingsRatio"].some(k => Object.hasOwn(event, k)) && !validateCompaction({ domain: event.domain, rawBytes: event.rawBytes, compactedBytes: event.compactedBytes, savingsRatio: event.savingsRatio })) return false
  if (event.compactedBytes !== undefined && event.compactedBytes !== event.contextBytes) return false
  return ["none", "compact", "hard-cap"].includes(event.truncation as string) && ["not-needed", "written", "failed"].includes(event.logStatus as string) && ["off", "shadow", "active"].includes(event.mode as string)
  } catch { return false }
}
export function createTelemetry(sink: (event: GovernanceEvent) => Promise<void>) {
  const seen = new Set<string>()
  return async (event: GovernanceEvent) => {
    if (!validateTelemetry(event)) return false
    const key = JSON.stringify([event.sessionID, event.callID])
    if (seen.has(key)) return true
    seen.add(key)
    try { await sink(event); return true } catch { seen.delete(key); return false }
  }
}
export function aggregateTelemetry(events: GovernanceEvent[]) {
  const unique = new Map(events.filter(validateTelemetry).map(event => [JSON.stringify([event.sessionID, event.callID]), event]))
  const values = [...unique.values()]
  const rawBytes = values.reduce((sum, event) => sum + event.rawBytes, 0)
  const contextBytes = values.reduce((sum, event) => sum + event.contextBytes, 0)
  const measured = values.filter(event => event.domain !== undefined) as (GovernanceEvent & CompactionMeasurement)[]
  const compaction = summarizeCompaction(measured, values.length - measured.length)
  const domains = Object.fromEntries(telemetryDomains.map(domain => [domain, summarizeCompaction(measured.filter(e => e.domain === domain))])) as Record<CompactionMeasurement["domain"], ReturnType<typeof summarizeCompaction>>
  return { calls: values.length, rawBytes, contextBytes, savingsRatio: rawBytes ? (rawBytes - contextBytes) / rawBytes : 0, compaction, domains,
    hardCaps: values.filter(event => event.truncation === "hard-cap").length,
    reviewSet: values.filter(event => event.decision.startsWith("SHADOW_")) }
}

// Manual review envelope, kept outside runtime telemetry. No content or commands.
export type ShadowObservation = {
  event: GovernanceEvent; day: string; task: string; policyVersion: string; cohort: string
  evidence: "real" | "fixture"; userAction: "continued" | "needed-read" | "used-range" | "unknown"
  falsePositive?: boolean
}
// Runner records have no policy/cohort: observer must join these labels from its
// fixed-cohort ledger, not stamp the entire historical JSONL export.
export function reviewShadow(observations: ShadowObservation[], runs: { source: string; mode: string; task: string; blocked?: boolean; startedAt?: string; policyVersion?: string; cohort?: string }[], policyVersion: string, cohort: string) {
  const unique = new Map<string, ShadowObservation>()
  let excluded = 0
  for (const observation of observations) {
    if (observation.evidence === "fixture") { excluded++; continue }
    if (observation.evidence !== "real" || observation.policyVersion !== policyVersion || observation.cohort !== cohort) throw Error("Mismatched evidence/policy/cohort; start a new cohort")
    const day = new Date(`${observation.day}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(observation.day) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== observation.day) throw Error("Invalid active day")
    if (!validateTelemetry(observation.event) || observation.event.mode !== "shadow" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(observation.task)
      || !["continued", "needed-read", "used-range", "unknown"].includes(observation.userAction)
      || (observation.falsePositive !== undefined && typeof observation.falsePositive !== "boolean")) throw Error("Invalid shadow observation")
    const key = JSON.stringify([observation.event.sessionID, observation.event.callID])
    if (unique.has(key) && JSON.stringify(unique.get(key)) !== JSON.stringify(observation)) throw Error("Conflicting call review; resolve duplicate before analysis")
    unique.set(key, observation)
  }
  const values = [...unique.values()], events = values.map(value => value.event)
  const rules: Record<string, { wouldDeny: number; wouldAsk: number; reviewed: number; falsePositives: number; actions: Record<string, number> }> = Object.create(null)
  for (const { event, falsePositive, userAction } of values) {
    if (!event.decision.startsWith("SHADOW_")) continue
    const row = rules[event.rule] ??= { wouldDeny: 0, wouldAsk: 0, reviewed: 0, falsePositives: 0, actions: Object.create(null) }
    if (event.decision === "SHADOW_DENY") row.wouldDeny++
    if (event.decision === "SHADOW_ASK") row.wouldAsk++
    if (falsePositive !== undefined) row.reviewed++
    if (falsePositive === true) row.falsePositives++
    row.actions[userAction] = (row.actions[userAction] ?? 0) + 1
  }
  const fullRunsPerTask: Record<string, number> = Object.create(null)
  for (const { task } of values) fullRunsPerTask[task] ??= 0
  const taskDays = new Set(values.map(value => JSON.stringify([value.task, value.day])))
  for (const run of runs) {
    if (run.source !== "runner" || run.mode !== "full" || run.blocked) continue
    if (!run.policyVersion || !run.cohort || typeof run.startedAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(run.startedAt)
      || !Number.isFinite(Date.parse(run.startedAt)) || new Date(run.startedAt).toISOString() !== run.startedAt) throw Error("Invalid run inclusion metadata")
    if (run.policyVersion === policyVersion && run.cohort === cohort && taskDays.has(JSON.stringify([run.task, run.startedAt.slice(0, 10)]))) fullRunsPerTask[run.task]++
  }
  // ponytail: manual evidence labels are not attestation; owner review stays mandatory.
  return { ...aggregateTelemetry(events), policyVersion, cohort, excluded,
    activeDays: new Set(values.map(value => value.day)).size, tasks: Object.keys(fullRunsPerTask).length,
    logFailures: events.filter(event => event.logStatus === "failed").length,
    rules, fullRunsPerTask, status: "PENDING_ACCEPTANCE" as const }
}
