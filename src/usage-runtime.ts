import { createHash } from "node:crypto"
import { readFile, mkdir, lstat, realpath, open, rename, rm } from "node:fs/promises"
import path from "node:path"
import { defaultBudgetPolicy, mergeBudgetPolicy } from "./budget-policy.ts"
import { UsageStore, type UsageRecord } from "./usage-store.ts"
import { executeUsageCommand } from "./usage-query.ts"
import { evaluateBudget, executeBudget, ShadowStore } from "./budget-executor.ts"
import { evaluateRotation, type RotationSnapshot } from "./session-rotation.ts"

export const usageProjectID = (project: string) => createHash("sha256").update(project).digest("hex")

export type BudgetEditAction = "day-cost" | "session-cost" | "warnings" | "remove-day-cost" | "remove-session-cost"
export function budgetEditPatch(action: BudgetEditAction, input: string) {
  if (action === "warnings") {
    const fields = input.split(",").map(s => s.trim())
    const warnings = [...new Set(fields.map(Number))].sort((a,b) => a-b)
    if (fields.some(s => !s) || warnings.some(n => !Number.isFinite(n) || n <= 0 || n > 100)) throw Error("INVALID_BUDGET_INPUT")
    return { mode: "warn", warnings }
  }
  if (!["day-cost", "session-cost", "remove-day-cost", "remove-session-cost"].includes(action)) throw Error("INVALID_BUDGET_INPUT")
  const removing = action.startsWith("remove-"), limit = Number(input.trim())
  if (!removing && (!input.trim() || !Number.isFinite(limit) || limit <= 0 || limit > 1_000_000)) throw Error("INVALID_BUDGET_INPUT")
  return { scopes: { [action.includes("day") ? "day" : "session"]: { costUSD: removing ? null : { limit, hard: false } } } }
}

async function policyBytes(file: string) {
  try {
    const info = await lstat(file)
    if (!info.isFile() || info.isSymbolicLink()) throw Error("UNSAFE_BUDGET_PATH")
    return await readFile(file, "utf8")
  } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return ""; throw e }
}

/** Confirmation captures both files; writer lock + reread prevents lost editor
 * updates. Unsupported config and unsafe storage fail visibly, never fallback. */
function budgetEditor(directory: string, projectRoot: string) {
  const folder = path.join(projectRoot, ".openarms"), file = path.join(folder, "budget-policy.json")
  const snapshot = async () => {
    const root = await realpath(projectRoot)
    try { if (!(await lstat(folder)).isDirectory() || await realpath(folder) !== path.join(root, ".openarms")) throw Error("UNSAFE_BUDGET_PATH") }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e }
    const global = await policyBytes(path.join(directory, "budget-policy.json")), local = await policyBytes(file)
    let base: any, patch: any
    try { base = global ? JSON.parse(global) : {}; patch = local ? JSON.parse(local) : {} }
    catch { throw Error("INVALID_BUDGET_POLICY") }
    const policy = mergeBudgetPolicy(defaultBudgetPolicy(), base, patch)
    return { policy, patch, base, fingerprint: usageProjectID(JSON.stringify([root, global, local])) }
  }
  const prepare = async (action: BudgetEditAction, input: string) => {
    const state = await snapshot(), edit = budgetEditPatch(action, input)
    const patch = { ...state.patch, ...edit, scopes: structuredClone(state.patch.scopes ?? {}) }
    if ("scopes" in edit) for (const [scope, metrics] of Object.entries(edit.scopes!)) patch.scopes[scope] = { ...(patch.scopes[scope] ?? {}), ...metrics }
    mergeBudgetPolicy(defaultBudgetPolicy(), state.base, patch)
    return { action, input, fingerprint: state.fingerprint, projectRoot }
  }
  const commit = async (ticket: Awaited<ReturnType<typeof prepare>>) => {
    if (ticket.projectRoot !== projectRoot) throw Error("POLICY_CHANGED")
    await snapshot()
    await mkdir(folder, { recursive: true, mode: 0o700 })
    const lock = path.join(folder, ".budget-editor-lock")
    try { await mkdir(lock, { mode: 0o700 }) } catch { throw Error("BUDGET_POLICY_BUSY") }
    const tmp = path.join(folder, `.budget-${process.pid}-${Date.now()}.tmp`)
    try {
      const state = await snapshot()
      if (state.fingerprint !== ticket.fingerprint) throw Error("POLICY_CHANGED")
      const edit = budgetEditPatch(ticket.action, ticket.input)
      const patch = { ...state.patch, ...edit, version: `budget-${Date.now()}-${createHash("sha256").update(JSON.stringify(edit)).digest("hex").slice(0,16)}`, scopes: structuredClone(state.patch.scopes ?? {}) }
      if ("scopes" in edit) for (const [scope, metrics] of Object.entries(edit.scopes!)) patch.scopes[scope] = { ...(patch.scopes[scope] ?? {}), ...metrics }
      mergeBudgetPolicy(defaultBudgetPolicy(), state.base, patch)
      const handle = await open(tmp, "wx", 0o600)
      try { await handle.writeFile(JSON.stringify(patch, null, 2) + "\n"); await handle.sync() } finally { await handle.close() }
      if ((await snapshot()).fingerprint !== ticket.fingerprint) throw Error("POLICY_CHANGED")
      await rename(tmp, file)
      const dir = await open(folder, "r"); try { await dir.sync() } finally { await dir.close() }
    } finally { await rm(tmp, { force: true }); await rm(lock, { recursive: true }) }
  }
  return { prepareBudgetEdit: prepare, commitBudgetEdit: commit }
}
/** Defensive completed-message adapter. No arrival-time ordering invented for
 * streaming snapshots: the host has not demonstrated a monotonic revision API.
 * Host input tokens are provisional fresh input until provider reconciliation. */
export function completedMessageUsage(info: any): Omit<UsageRecord, "project"> | undefined {
  if (info?.role !== "assistant" || !Number.isSafeInteger(info?.time?.completed) || !Number.isSafeInteger(info?.time?.created)) return
  const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0
  const metrics: UsageRecord["metrics"] = {}
  const values = { costUSD: info.cost, freshInput: info.tokens?.input, output: info.tokens?.output, reasoning: info.tokens?.reasoning, cacheRead: info.tokens?.cache?.read, cacheWrite: info.tokens?.cache?.write }
  for (const [k, v] of Object.entries(values)) if (finite(v)) metrics[k as keyof typeof metrics] = v
  const timestamp = new Date(info.time.created)
  if (!Number.isFinite(timestamp.getTime())) return
  return { schemaVersion: 1, kind: "message", id: info.id, session: info.sessionID, timestamp: timestamp.toISOString(), revision: info.time.completed, completed: true,
    provider: info.providerID, model: info.modelID, agent: info.agent, metrics, ...(metrics.freshInput === undefined ? {} : { estimated: ["freshInput"] }) }
}
/** Config is separate from loader response budgets. Only ENOENT means absent. */
export async function loadUsagePolicy(directory: string, projectRoot: string, sessionOverride?: unknown) {
  const read = async (file: string) => {
    try { return JSON.parse(await readFile(file, "utf8")) }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return {}; throw Error("INVALID_BUDGET_POLICY") }
  }
  return mergeBudgetPolicy(defaultBudgetPolicy(), await read(path.join(directory, "budget-policy.json")), await read(path.join(projectRoot, ".openarms", "budget-policy.json")), ...(sessionOverride === undefined ? [] : [sessionOverride]))
}
export function createUsageRuntime(directory: string, projectRoot: string) {
  const store = new UsageStore(path.join(directory, "usage")), project = usageProjectID(projectRoot)
  const shadow = new ShadowStore(path.join(directory, "shadow"))
  const evaluate = async () => {
    try { const policy = await loadUsagePolicy(directory, projectRoot); const state = await store.read(policy); return await executeBudget(policy, evaluateBudget(policy, state.records), shadow) }
    catch { return { action: "allow" as const, audit: "unavailable" as const } }
  }
  return {
    store, project, shadow, evaluate,
    ...budgetEditor(directory, projectRoot),
    knownModels: async () => [...new Set((await store.read(await loadUsagePolicy(directory, projectRoot))).records.filter(r => r.project === project && r.model).map(r => r.model!))].sort(),
    claimWarnings: async (session: string) => store.claimWarnings(await loadUsagePolicy(directory, projectRoot), project, session),
    taskCompleted: async (session: string, snapshot: RotationSnapshot, options: Parameters<typeof evaluateRotation>[1] = {}) => {
      const result = evaluateRotation(snapshot, options)
      if (result.decision !== "none") {
        try {
          const policy = await loadUsagePolicy(directory, projectRoot)
          // Only a sourced context sample currently has a numeric live-compatible
          // audit metric; do not invent values for relatedness-only decisions.
          if (snapshot.context && result.reasons.includes("CONTEXT_THRESHOLD")) await executeBudget(policy, [{ schemaVersion: 1, policyVersion: policy.version, project, scope: "session", scopeID: session, metric: "contextUtilization", threshold: (options.contextThreshold ?? 0.6) * 100, current: snapshot.context.value, limit: options.contextThreshold ?? 0.6, decision: "would_rotate", reasons: result.reasons }], shadow)
        } catch { /* Advisory action never changes task/session success. */ }
      }
      return result
    },
    command: async (command: string, session: string) => {
      try { return await executeUsageCommand(command, store, await loadUsagePolicy(directory, projectRoot), { project, session }) }
      catch (e) { return (e as Error).message === "INVALID_BUDGET_POLICY" ? "INVALID_BUDGET_POLICY: repair configuration; no fallback policy applied." : "USAGE_UNAVAILABLE: storage unavailable; requests remain allowed." }
    },
    capture: async (record: Omit<UsageRecord, "project">) => {
      // Telemetry is best effort and never changes request success. Failure is
      // surfaced to read-only views through missing data, not raw exception text.
       try { await store.upsert({ ...record, project }, await loadUsagePolicy(directory, projectRoot)); await evaluate(); return true }
      catch { return false }
    },
  }
}
