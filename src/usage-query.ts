import { type BudgetPolicy } from "./budget-policy.ts"
import { UsageStore, summarizeUsage, usageDay, warningPolicyID } from "./usage-store.ts"

export type UsageQuery = { scope: "today" | "session" | "project" | "model" | "task"; project: string; id?: string; now?: string }
export async function queryUsage(store: UsageStore, policy: BudgetPolicy, query: UsageQuery) {
  const base = { schemaVersion: 1 as const, policyVersion: policy.version, timezone: policy.timezone, scope: query.scope, id: query.id, report: undefined as ReturnType<typeof summarizeUsage> | undefined, warnings: [] as Awaited<ReturnType<UsageStore["read"]>>["warnings"], period: undefined as { from: string; to: string } | undefined }
  try {
    const state = await store.read(policy)
    const projectRecords = state.records.filter(r => r.project === query.project)
    if (!["today", "session", "project", "model", "task"].includes(query.scope)) return { ...base, status: "unknown" as const }
    if (!["today", "project"].includes(query.scope) && !query.id) return { ...base, status: "unknown" as const }
    const day = usageDay(query.now ?? new Date().toISOString(), policy.timezone)
    const records = projectRecords.filter(r => query.scope === "today" ? usageDay(r.timestamp, policy.timezone) === day : query.scope === "project" ? !query.id || r.project === query.id : r[query.scope] === query.id)
    if (!records.length) return { ...base, status: projectRecords.length && !["today", "project"].includes(query.scope) ? "unknown" as const : "empty" as const }
    const warnings = state.warnings.filter(w => w.policyVersion === warningPolicyID(policy) && w.project === query.project && (query.scope === "today" ? w.scope === "day" && w.scopeID === day : query.scope === "session" || query.scope === "task" ? w.scope === query.scope && w.scopeID === query.id : true))
    const times = records.map(r => r.timestamp).sort()
    return { ...base, status: "ok" as const, report: summarizeUsage(records), warnings, period: { from: times[0], to: times.at(-1)! } }
  } catch (e) {
    if ((e as Error).message !== "CORRUPT_USAGE") throw e
    return { ...base, status: "corrupt" as const }
  }
}
const labels: Record<string, string> = { costUSD: "Cost", freshInput: "Fresh input", output: "Output", reasoning: "Reasoning", cacheRead: "Cache read", cacheWrite: "Cache write", contextUtilization: "Context utilization", toolOutputBytes: "Tool output", rawToolOutputBytes: "Raw output", truncationCount: "Truncations", loadedSkillTokens: "Skill content" }
const scopes: Record<string, string> = { today: "Today", day: "Day", session: "Session", project: "Project", model: "Model", task: "Task" }
// Human-readable labels, not machine metric IDs.
const row = (name: string, value: string) => `${name.normalize("NFC")}${" ".repeat(Math.max(0, 26 - [...name.normalize("NFC")].length))} : ${value}`
const number = (value: number) => new Intl.NumberFormat("en-US", { maximumSignificantDigits: 15 }).format(value)
const amount = (metric: string, value: number) => metric === "contextUtilization" ? `${number(value * 100)}%` : `${number(value)}${metric === "costUSD" ? " USD" : metric.endsWith("Bytes") ? " bytes" : metric === "truncationCount" ? " times" : " tokens"}`
export function formatUsage(result: Awaited<ReturnType<typeof queryUsage>>) {
  const lines = [row("Scope", scopes[result.scope]), row("Policy", result.policyVersion), row("Timezone", result.timezone)]
  if (result.scope === "model" && result.id) lines.push(row("Model", result.id))
  if (result.scope === "session" && result.id === "__skill_router_home__") return [...lines, "No active session.", "This is not the project total; use /usage project."].join("\n")
  if (!result.report) return [...lines, result.status === "corrupt" ? "Corrupt data; no reliable total available." : result.status === "unknown" ? "No data found for this scope." : "No data yet for this scope."].join("\n")
  const time = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: result.timezone, dateStyle: "short", timeStyle: "short" }).format(new Date(value))
  if (result.period) lines.push(row("Start", time(result.period.from)), row("End", time(result.period.to)))
  for (const [metric, v] of Object.entries(result.report.metrics)) {
    const markers = [v.status === "partial" ? "partial" : "", v.estimated || v.status === "estimated" ? "estimated" : ""].filter(Boolean)
    lines.push(row(labels[metric], v.value === null || v.status === "missing" ? "No data" : amount(metric, v.value) + (markers.length ? ` (${markers.join("; ")})` : "")))
  }
  lines.push(row("Recorded messages", number(result.report.turns)), "Estimated: approximate; partial: some data is missing.")
  for (const c of result.report.contributors) lines.push(`Tool ${c.tool}`, row("  Raw output", c.rawBytes === null ? "No data" : amount("rawToolOutputBytes", c.rawBytes)), row("  Context output", c.contextBytes === null ? "No data" : amount("toolOutputBytes", c.contextBytes)))
  lines.push("Skill contribution: correlation only.", "Skill tokens are estimates when available.")
  for (const w of result.warnings) lines.push(`Warning · ${scopes[w.scope]} · ${labels[w.metric]}`, row("Used / limit", `${amount(w.metric, w.current)} / ${amount(w.metric, w.limit)}`), row("Crossed thresholds", `${w.crossed.join(", ")}%`))
  return lines.join("\n")
}
export async function executeUsageCommand(command: string, store: UsageStore, policy: BudgetPolicy, context: { project: string; session: string; now?: string }) {
  const parts = command.replace(/^\//, "").trim().split(/\s+/)
  if (parts[0] === "usage" && parts.length === 1) parts.push("today")
  if (parts[0] === "budget" && parts.length === 1) {
    const modes: Record<string, string> = { off: "Off", observe: "Observe", shadow: "Shadow", warn: "Warn" }
    const lines = ["Budget · report-only / does not block requests", row("Project ID", context.project), row("Policy", policy.version), row("Mode", modes[policy.mode]), row("Currency", policy.currency), row("Timezone", policy.timezone), "Source: local recorded host usage; not a provider balance or billing reconciliation.", policy.mode === "warn" ? "Warnings enabled; notifications never block requests." : "Observe/shadow/off: reporting only; no proactive notifications.", "Limits"]
    for (const [scope, metrics] of Object.entries(policy.scopes)) {
      if (!Object.keys(metrics).length) lines.push(row(scopes[scope], "No limit set"))
      for (const [metric, rule] of Object.entries(metrics)) lines.push(row(`${scopes[scope]} · ${labels[metric]}`, `${amount(metric, rule.limit)}${rule.hard ? " (legacy hard flag is diagnostic only; not enforced)" : ""}`))
    }
    for (const scope of ["today", "session"] as const) {
      lines.push(scope === "today" ? "Today (project)" : "Session")
      if (scope === "session" && context.session === "__skill_router_home__") { lines.push("No active session."); continue }
      const result = await queryUsage(store, policy, { ...context, scope, id: scope === "session" ? context.session : undefined })
      const limits = policy.scopes[scope === "today" ? "day" : "session"]
      if (result.status === "corrupt") lines.push("Corrupt data; no reliable total available.")
      for (const metric of new Set([...Object.keys(limits), "costUSD", "output", "contextUtilization"])) {
        const sample = result.report?.metrics[metric as keyof typeof result.report.metrics], limit = limits[metric as keyof typeof limits]?.limit
        const used = sample?.value === null || sample?.value === undefined ? "No data" : `${amount(metric, sample.value)} (${sample.status}${sample.estimated && sample.status !== "estimated" ? "; estimated" : ""})`
        const reliable = sample && sample.value !== null && ["measured", "estimated"].includes(sample.status)
        const balance = reliable && limit !== undefined ? `remaining ${amount(metric, Math.max(0, limit - sample.value!))} / ${number(sample.value! / limit * 100)}%${sample.estimated ? " (estimated, approximate)" : ""}` : "remaining unknown / progress unknown"
        lines.push(row(labels[metric], `${used} / ${limit === undefined ? "No limit set" : amount(metric, limit)} / ${balance}`))
      }
    }
    return lines.join("\n")
  }
  if (parts[0] !== "usage" || !["today", "session", "project", "model"].includes(parts[1]) || parts.length > 3) return "Usage: /usage today|session [id]|project|model <id>; /budget (read-only)"
  const scope = parts[1] as UsageQuery["scope"]
  return formatUsage(await queryUsage(store, policy, { ...context, scope, id: parts[2] ?? (scope === "session" ? context.session : scope === "project" ? context.project : undefined) }))
}
