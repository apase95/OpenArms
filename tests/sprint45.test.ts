import { test } from "node:test"
import assert from "node:assert/strict"
import { pairedUsageReport } from "../src/sprint45.ts"
import type { UsageRecord } from "../src/usage-store.ts"

const record = (session: string, freshInput: number): UsageRecord => ({ schemaVersion: 1, kind: "message", id: "m", session, project: "p", task: "t", timestamp: "2026-10-16T00:00:00.000Z", revision: 0, completed: true, provider: "fixture", model: "fixture", metrics: { freshInput, cacheRead: 0, costUSD: 0 } })
const pair = { task: "t", project: "p", baseline: "before", progressive: "after", provenance: "synthetic" as const, success: true, evidence: "authored fixture", controls: "same prompt/model/cache protocol" }
test("paired report computes observed reduction without accepting synthetic evidence", () => {
  const result = pairedUsageReport([record("before", 100), record("after", 30)], [pair])
  assert.equal(result.pairs[0].metrics.freshInput.reductionPercent, 70)
  assert.equal(result.accepted, false)
  assert.equal(result.realSuccessfulPairs, 0)
})
test("estimated metrics cannot establish acceptance and reused sessions are rejected", () => {
  const after = record("after", 30); after.estimated = ["freshInput"]
  const result = pairedUsageReport([record("before", 100), after], [{ ...pair, provenance: "real" }])
  assert.equal(result.pairs[0].metrics.freshInput.reductionPercent, null)
  assert.equal(result.realSuccessfulPairs, 0)
  assert.throws(() => pairedUsageReport([], [pair, pair]), /REUSED_COMPARISON/)
})
test("paired report rejects matching mixed-model sets with different allocations", () => {
  const rows = ["before", "after"].flatMap(session => ["a", "b", "c"].map((id, index) => ({
    ...record(session, 10), id,
    model: index < (session === "before" ? 2 : 1) ? "model-a" : "model-b",
  })))
  assert.throws(() => pairedUsageReport(rows, [{ ...pair, provenance: "real" }]), /MODEL_MISMATCH/)
})
