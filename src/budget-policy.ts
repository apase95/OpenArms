/** Budget policy is independent of loader response budgets. No host actions here. */
export const budgetMetrics = ["costUSD", "freshInput", "output", "reasoning", "cacheRead", "cacheWrite", "contextUtilization", "toolOutputBytes"] as const
export type BudgetMetric = typeof budgetMetrics[number]
export type BudgetLimit = { limit: number; hard: boolean }
export type BudgetPolicy = {
  schemaVersion: 1
  version: string
  currency: "USD"
  timezone: string
  mode: "off" | "observe" | "shadow" | "warn" | "ask" | "enforce"
  warnings: number[]
  scopes: Record<"day" | "session" | "task", Partial<Record<BudgetMetric, BudgetLimit>>>
}
const scopes = ["day", "session", "task"] as const
function fail(): never { throw new Error("INVALID_BUDGET_POLICY") }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail()
  return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail()
}
export function defaultBudgetPolicy(): BudgetPolicy {
  return { schemaVersion: 1, version: "budget-v1", currency: "USD", timezone: "UTC", mode: "observe", warnings: [50, 80, 100], scopes: { day: {}, session: {}, task: {} } }
}
/** Reject rather than downgrade unsupported actions. Capability claims cannot be
 * supplied by configuration: ask/enforce await independently verified host APIs. */
export function validateBudgetPolicy(value: unknown): asserts value is BudgetPolicy {
  const p = object(value)
  keys(p, ["schemaVersion", "version", "currency", "timezone", "mode", "warnings", "scopes"])
  if (p.schemaVersion !== 1 || typeof p.version !== "string" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(p.version) || p.currency !== "USD") fail()
  if (!["off", "observe", "shadow", "warn"].includes(p.mode as string)) fail()
  if (typeof p.timezone !== "string" || !p.timezone || p.timezone.length > 100) fail()
  try { new Intl.DateTimeFormat("en", { timeZone: p.timezone as string }).format(0) } catch { fail() }
  if (!Array.isArray(p.warnings) || !p.warnings.length || p.warnings.some((n, i, a) => typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > 100 || (i > 0 && n <= a[i - 1]))) fail()
  const limits = object(p.scopes)
  keys(limits, scopes)
  for (const scope of scopes) {
    const metrics = object(limits[scope])
    keys(metrics, budgetMetrics)
    for (const [metric, raw] of Object.entries(metrics)) {
      const rule = object(raw)
      keys(rule, ["limit", "hard"])
      if (typeof rule.limit !== "number" || !Number.isFinite(rule.limit) || rule.limit <= 0 || typeof rule.hard !== "boolean") fail()
      if (metric === "contextUtilization" && rule.limit > 1) fail()
      // Diagnostic cache reads may never serve as a hard budget.
      if (metric === "cacheRead" && rule.hard) fail()
    }
  }
}
/** Explicit precedence: base/global < project < session. Arrays replace;
 * scopes and metric maps merge; a limit rule replaces as a whole. */
export function mergeBudgetPolicy(base: unknown, ...overrides: unknown[]): BudgetPolicy {
  validateBudgetPolicy(base)
  let result: BudgetPolicy = structuredClone(base)
  for (const override of overrides) {
    const patch = object(override)
    keys(patch, ["schemaVersion", "version", "currency", "timezone", "mode", "warnings", "scopes"])
    const merged = { ...result, ...patch, scopes: structuredClone(result.scopes) }
    if (patch.scopes !== undefined) {
      const scopePatch = object(patch.scopes)
      keys(scopePatch, scopes)
      for (const scope of scopes) if (Object.hasOwn(scopePatch, scope)) {
        const metrics = object(scopePatch[scope])
        keys(metrics, budgetMetrics)
        for (const [metric, rule] of Object.entries(metrics)) {
          // Project null is an explicit tombstone, not "fall back to global".
          if (rule === null) delete merged.scopes[scope][metric as BudgetMetric]
          else merged.scopes[scope][metric as BudgetMetric] = rule as BudgetLimit
        }
      }
    }
    validateBudgetPolicy(merged)
    result = structuredClone(merged)
  }
  return result
}
