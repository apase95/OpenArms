import assert from "node:assert/strict"
import { test } from "node:test"
import { defaultBudgetPolicy, mergeBudgetPolicy } from "../src/budget-policy.ts"

test("policy merges global/project/session without mutation", () => {
  const global = defaultBudgetPolicy()
  const project = { scopes: { session: { costUSD: { limit: 10, hard: false } } }, timezone: "Asia/Ho_Chi_Minh" }
  const result = mergeBudgetPolicy(global, project, { scopes: { session: { output: { limit: 100, hard: false } } } })
  assert.equal(result.mode, "observe")
  assert.equal(result.scopes.session.costUSD?.limit, 10)
  assert.equal(result.scopes.session.output?.limit, 100)
  assert.deepEqual(global.scopes.session, {})
})

test("policy rejects unsafe complete policies and patches", () => {
  for (const patch of [
    { mode: "enforce" }, { mode: "ask" }, { currency: "EUR" }, { timezone: "bad" },
    { warnings: [80, 50] }, { warnings: [50, 50] }, { warnings: [101] },
    { scopes: { day: { costUSD: { limit: -1, hard: false } } } },
    { scopes: { task: { cacheRead: { limit: 1, hard: true } } } },
    { scopes: { day: { costUSD: { limit: Infinity, hard: false } } } },
    { capabilities: { hardCancel: true }, mode: "enforce" },
    { unknown: true }, { scopes: { unknown: {} } }, { warnings: [] },
  ]) assert.throws(() => mergeBudgetPolicy(defaultBudgetPolicy(), patch), /INVALID_BUDGET_POLICY/)
  const invalid = { ...defaultBudgetPolicy(), currency: "EUR" }
  assert.throws(() => mergeBudgetPolicy(invalid, { currency: "USD" }), /INVALID_BUDGET_POLICY/)
  assert.equal(mergeBudgetPolicy(defaultBudgetPolicy(), { mode: "warn" }).mode, "warn")
  assert.equal(mergeBudgetPolicy(defaultBudgetPolicy(), { mode: "shadow" }).mode, "shadow")
})
