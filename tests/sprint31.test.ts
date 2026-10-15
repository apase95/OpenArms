import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { defaultBudgetPolicy, mergeBudgetPolicy } from "../src/budget-policy.ts"
import { UsageStore, rebuildUsage } from "../src/usage-store.ts"
import { queryUsage, formatUsage, executeUsageCommand } from "../src/usage-query.ts"
import { governanceHooks } from "../src/governance-hooks.ts"
import { createUsageRuntime, completedMessageUsage, loadUsagePolicy, usageProjectID } from "../src/usage-runtime.ts"

const message = (revision = 1, cost = 1, completed = true) => ({ schemaVersion: 1 as const, kind: "message" as const,
  id: "m", session: "s", project: "p", timestamp: "2026-10-11T23:30:00.000Z", revision, completed,
  provider: "provider", model: "model", agent: "agent", task: "task", metrics: { costUSD: cost, freshInput: 10, output: 5 } })

test("usage layout smoke: readable totals and critical uncertainty/privacy edge", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms-layout-"))
  try {
    const policy = mergeBudgetPolicy(defaultBudgetPolicy(), { scopes: { session: { costUSD: { limit: 1, hard: false } } } })
    const store = new UsageStore(root)
    await store.upsert({ ...message(), estimated: ["freshInput"] }, policy)
    await store.upsert({ ...message(), id: "second", metrics: { output: 0 } }, policy)
    const result = await queryUsage(store, policy, { scope: "session", id: "s", project: "p" })
    const before = structuredClone(result), text = formatUsage(result)
    assert.match(text, /Cost\s+: 1 USD \(partial\)/)
    assert.match(text, /Fresh input\s+: 10 tokens \(partial; estimated\)/)
    assert.match(text, /Output\s+: 5 tokens/)
    assert.match(text, /Reasoning\s+: No data/)
    assert.match(text, /Warning/)
    assert.match(text, /50, 80, 100%/)
    assert.deepEqual(result, before)
    assert.equal(new Set(text.split("\n").filter(l => l.includes(" : ")).map(l => [...l.normalize("NFC")].indexOf(":"))).size, 1)
    assert.doesNotMatch(text, /missing=0|estimated=false|costUSD|2026-10-11T/)
    const budget = await executeUsageCommand("/budget", store, policy, { project: "p", session: "s" })
    assert.match(budget, /Session · Cost\s+: 1 USD/)
    assert.match(budget, /report-only.*does not block requests/)
    assert.doesNotMatch(budget, /"session":|"limit":/)
    const home = await executeUsageCommand("/budget", store, defaultBudgetPolicy(), { project: "p", session: "__skill_router_home__" })
    assert.match(home, /No limit set/)
    assert.match(home, /No active session/)
    assert.doesNotMatch(home, /__skill_router_home__|Cost\s+: 0/)
    for (const status of ["empty", "unknown", "corrupt"] as const) {
      const unavailable = formatUsage({ ...result, status, report: undefined })
      assert.match(unavailable, /No data|Corrupt data/)
      assert.doesNotMatch(unavailable, /Cost\s+: 0/)
    }
    const measured = formatUsage({ ...result, report: { ...result.report!, metrics: { ...result.report!.metrics, costUSD: { value: 0, status: "measured", missing: 0, estimated: false }, freshInput: { value: 10, status: "estimated", missing: 0, estimated: true } } } })
    assert.match(measured, /Cost\s+: 0 USD\n/)
    assert.match(measured, /10 tokens \(estimated\)/)
    assert.doesNotMatch(text + budget + home + measured, /[À-ỹ]/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("Sprint31 latest snapshots, replay, timezone and shared query happy path", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms31-"))
  try {
    const policy = mergeBudgetPolicy(defaultBudgetPolicy(), { timezone: "Asia/Ho_Chi_Minh" })
    const store = new UsageStore(root)
    await store.upsert(message(), policy)
    await store.upsert(message(2, 2, true), policy)
    await store.upsert(message(1, 100), policy)
    const state = await store.read(policy)
    assert.deepEqual(state.aggregate, rebuildUsage(state.records, policy))
    assert.equal(state.aggregate.rows[0].day, "2026-10-12")
    const result = await queryUsage(store, policy, { scope: "session", id: "s", project: "p" })
    assert.equal(result.status, "ok")
    assert.equal(result.report?.metrics.costUSD.value, 2)
    assert.equal(result.report?.metrics.reasoning.status, "missing")
    assert.match(formatUsage(result), /correlation only/)
    assert.equal(await executeUsageCommand("usage session", store, policy, { project: "p", session: "s" }), formatUsage(result))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("Sprint31 production tool hook, completed host snapshot adapter and read-only command share privacy-safe state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms31-host-"))
  try {
    const hooks = governanceHooks(root, "fixture-project")
    const input = { tool: "read", sessionID: "s", callID: "call", args: { filePath: "/private/secret" } }
    await hooks["tool.execute.after"](input, { title: "secret", output: "SECRET_DO_NOT_PERSIST", metadata: {} })
    await hooks["tool.execute.after"](input, { title: "secret", output: "SECRET_DO_NOT_PERSIST", metadata: {} })
    const runtime = createUsageRuntime(root, "fixture-project")
    const record = completedMessageUsage({ role: "assistant", id: "host-message", sessionID: "s", time: { created: 1000, completed: 2000 }, tokens: { input: 20, output: 5, cache: { read: 9 } }, content: "SECRET_DO_NOT_PERSIST" })!
    assert.equal(await runtime.capture(record), true)
    assert.equal(completedMessageUsage({ role: "assistant", time: { created: 1000 } }), undefined)
    const policy = defaultBudgetPolicy(), state = await runtime.store.read(policy)
    assert.equal(state.records.length, 2)
    const result = await queryUsage(runtime.store, policy, { scope: "session", id: "s", project: usageProjectID("fixture-project") })
    assert.equal(result.report?.metrics.freshInput.status, "estimated")
    const text = await runtime.command("/usage session", "s")
    assert.equal(text, formatUsage(result))
    assert.match(await runtime.command("/budget", "s"), /Observe/)
    assert.doesNotMatch(await readFile(path.join(root, "usage", "source.jsonl"), "utf8"), /SECRET_DO_NOT_PERSIST|private|content|title/)
    await writeFile(path.join(root, "budget-policy.json"), '{"mode":"enforce"}')
    await assert.rejects(loadUsagePolicy(root, root), /INVALID_BUDGET_POLICY/)
    assert.match(await runtime.command("budget", "s"), /INVALID_BUDGET_POLICY/)
    assert.equal(await runtime.capture(record), false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("Sprint31 empty, unknown, corrupt cache recovery, missing metrics and independent warning scopes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms31-query-"))
  try {
    const policy = mergeBudgetPolicy(defaultBudgetPolicy(), { scopes: { day: { costUSD: { limit: 10, hard: false } }, session: { costUSD: { limit: 10, hard: false } }, task: { costUSD: { limit: 10, hard: false } } } })
    const store = new UsageStore(root)
    assert.equal((await queryUsage(store, policy, { scope: "today", project: "p" })).status, "empty")
    await store.upsert(message(1, 5), policy)
    await store.upsert(message(2, 8, true), policy)
    let state = await store.read(policy)
    assert.equal(state.warnings.length, 6)
    assert.equal((await queryUsage(store, policy, { scope: "session", id: "absent", project: "p" })).status, "unknown")
    await assert.rejects(store.upsert({ ...message(3), metrics: { costUSD: -1 } }, policy), /CORRUPT_USAGE/)
    await assert.rejects(store.upsert({ ...message(3), rawPrompt: "secret" } as any, policy), /CORRUPT_USAGE/)
    await writeFile(path.join(root, "aggregate.json"), "{broken")
    assert.equal((await queryUsage(store, policy, { scope: "session", id: "s", project: "p" })).status, "corrupt")
    await store.rebuild(policy)
    state = await store.read(policy)
    assert.equal(state.warnings.length, 6)
    assert.deepEqual(state.aggregate, rebuildUsage(state.records, policy))
    await store.upsert(message(3, 12, true), { ...policy, mode: "off" })
    assert.equal((await store.read(policy)).warnings.length, 6)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("Sprint31 critical edge: concurrent durable crossings, corrections, unsafe policy and corrupt source", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms31-"))
  try {
    const policy = mergeBudgetPolicy(defaultBudgetPolicy(), { scopes: { session: { costUSD: { limit: 10, hard: false } } } })
    const a = new UsageStore(root), b = new UsageStore(root)
    await Promise.all([a.upsert(message(1, 12, true), policy), b.upsert(message(1, 12, true), policy)])
    let state = await b.read(policy)
    assert.equal(state.warnings.length, 1)
    assert.deepEqual(state.warnings[0].crossed, [50, 80, 100])
    await a.upsert(message(2, 1, true), policy)
    await b.upsert(message(3, 12, true), policy)
    state = await new UsageStore(root).read(policy)
    assert.equal(state.warnings.length, 1)
    for (const patch of [{ mode: "enforce" }, { currency: "EUR" }, { timezone: "bad" }, { warnings: [80, 50] }, { scopes: { day: { costUSD: { limit: -1, hard: false } } } }]) assert.throws(() => mergeBudgetPolicy(defaultBudgetPolicy(), patch), /INVALID_BUDGET_POLICY/)
    assert.throws(() => mergeBudgetPolicy(defaultBudgetPolicy(), { scopes: { task: { cacheRead: { limit: 1, hard: true } } } }), /INVALID_BUDGET_POLICY/)
    await writeFile(path.join(root, "source.jsonl"), "{broken\n")
    assert.equal((await queryUsage(a, policy, { scope: "session", id: "s", project: "p" })).status, "corrupt")
  } finally { await rm(root, { recursive: true, force: true }) }
})
