/** Advisory only. The caller must explicitly attest task completion, never infer
 * it from message completion, idle events, or a lack of recent tool calls. */
export type RotationSignal = { value: number; source: "measured" | "estimated" | "owner" }
export type RotationSnapshot = {
  boundary: string; active: boolean; context?: RotationSignal; sessionBudget?: RotationSignal
  cacheReadTrend?: RotationSignal; toolBytes?: RotationSignal; relatedness?: RotationSignal
}
export function evaluateRotation(snapshot: RotationSnapshot, options: { contextThreshold?: number; toolBytesThreshold?: number } = {}) {
  const contextThreshold = options.contextThreshold ?? 0.6, toolBytesThreshold = options.toolBytesThreshold ?? 1048576
  if (!Number.isFinite(contextThreshold) || contextThreshold <= 0 || contextThreshold > 1 || !Number.isFinite(toolBytesThreshold) || toolBytesThreshold <= 0) throw Error("INVALID_ROTATION_POLICY")
  const none = { decision: "none" as const, reasons: [] as string[] }
  if (snapshot.boundary !== "task-completed" || snapshot.active !== false) return none
  const valid = (signal: RotationSignal | undefined, max = Infinity) => signal && ["measured", "estimated", "owner"].includes(signal.source) && Number.isFinite(signal.value) && signal.value >= 0 && signal.value <= max
  const reasons: string[] = []
  if (valid(snapshot.context, 1) && snapshot.context!.value >= contextThreshold) reasons.push("CONTEXT_THRESHOLD")
  if (valid(snapshot.sessionBudget) && snapshot.sessionBudget!.value >= 1) reasons.push("SESSION_BUDGET")
  if (valid(snapshot.toolBytes) && snapshot.toolBytes!.value >= toolBytesThreshold) reasons.push("TOOL_BYTES")
  if (valid(snapshot.relatedness, 1) && snapshot.relatedness!.value < 0.25) reasons.push("UNRELATED_TASK")
  // Cache trend can explain an existing suggestion, never trigger by itself.
  if (reasons.length && valid(snapshot.cacheReadTrend) && snapshot.cacheReadTrend!.value > 1) reasons.push("CACHE_TREND_DIAGNOSTIC")
  return { decision: reasons.includes("SESSION_BUDGET") || reasons.filter(r => r !== "CACHE_TREND_DIAGNOSTIC").length > 1 ? "ask" as const : reasons.length ? "suggest" as const : "none" as const, reasons }
}
