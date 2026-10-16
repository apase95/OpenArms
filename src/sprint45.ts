import { latestUsage, summarizeUsage, type UsageRecord } from "./usage-store.ts"

/** Explicit operator attestations, not inferred provider/task success. No I/O. */
export type UsageComparison = {
  task: string; project: string; baseline: string; progressive: string
  provenance: "real" | "synthetic"; success: boolean
  evidence: string; controls: string
}
const metrics = ["freshInput", "cacheRead", "costUSD"] as const
/** Consume UsageStore.read(...).records; never mix sessions or sum revisions.
 * Acceptance is an evidence eligibility gate, not proof of model quality or billing.
 */
export function pairedUsageReport(records: UsageRecord[], comparisons: UsageComparison[]) {
  if (records.length > 100_000 || comparisons.length > 1_000) throw Error("REPORT_LIMIT")
  const latest = latestUsage(records), used = new Set<string>(), tasks = new Set<string>()
  const pairs = comparisons.map(pair => {
    if (![pair.task, pair.project, pair.baseline, pair.progressive, pair.evidence, pair.controls].every(v => typeof v === "string" && v.trim().length > 0 && v.length <= 2000)
      || !["real", "synthetic"].includes(pair.provenance) || typeof pair.success !== "boolean") throw Error("INVALID_COMPARISON")
    const taskKey = JSON.stringify([pair.project, pair.task])
    if (tasks.has(taskKey)) throw Error("REUSED_COMPARISON")
    tasks.add(taskKey)
    const sessions = [pair.baseline, pair.progressive].map(session => {
      const key = JSON.stringify([pair.project, session])
      if (used.has(key)) throw Error("REUSED_COMPARISON")
      used.add(key)
      const rows = latest.filter(r => r.project === pair.project && r.session === session)
      if (rows.some(r => r.task !== pair.task)) throw Error("MIXED_TASK_SESSION")
      return rows
    })
    const messages = sessions.map(rows => rows.filter(r => r.kind === "message"))
    const complete = messages.every(rows => rows.length > 0 && rows.every(r => r.completed && r.provider && r.model))
    const identities = new Set(messages.flat().map(r => JSON.stringify([r.provider, r.model])))
    if (identities.size > 1) throw Error("MODEL_MISMATCH")
    const summaries = sessions.map(summarizeUsage)
    const values = Object.fromEntries(metrics.map(metric => {
      const baseline = summaries[0].metrics[metric], progressive = summaries[1].metrics[metric]
      const measured = complete && baseline.status === "measured" && progressive.status === "measured"
      return [metric, { baseline, progressive, reductionPercent: measured && baseline.value! > 0 ? 100 * (baseline.value! - progressive.value!) / baseline.value! : null }]
    })) as Record<typeof metrics[number], { baseline: ReturnType<typeof summarizeUsage>["metrics"]["freshInput"]; progressive: ReturnType<typeof summarizeUsage>["metrics"]["freshInput"]; reductionPercent: number | null }>
    const eligible = pair.provenance === "real" && pair.success && complete && metrics.every(metric => values[metric].baseline.status === "measured" && values[metric].progressive.status === "measured")
    return { ...pair, complete, eligible, metrics: values }
  })
  const realSuccessfulPairs = pairs.filter(pair => pair.eligible).length
  return { schemaVersion: 1, attribution: "operator-attested paired observation; not causal or billing proof", pairs, realSuccessfulPairs,
    accepted: realSuccessfulPairs >= 50 && pairs.filter(pair => pair.eligible).every(pair => (pair.metrics.freshInput.reductionPercent ?? -Infinity) >= 60),
    minimumRealPairs: 50 }
}
