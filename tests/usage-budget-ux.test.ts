import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createUsageRuntime, loadUsagePolicy, completedMessageUsage } from "../src/usage-runtime.ts"
import { defaultBudgetPolicy, mergeBudgetPolicy } from "../src/budget-policy.ts"
import { UsageStore } from "../src/usage-store.ts"
import { executeUsageCommand } from "../src/usage-query.ts"
import { watchUsagePrompt } from "../plugins/tui-core.ts"

test("slash host IDs survive completed-message ingestion, reload, model picker, dashboard and warnings", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms-host-model-"))
  try {
    const global = path.join(root, "global"), project = path.join(root, "project")
    await mkdir(global); await mkdir(project)
    await writeFile(path.join(global, "budget-policy.json"), JSON.stringify({ mode: "warn", scopes: { session: { costUSD: { limit: 10, hard: false } } } }))
    const runtime = createUsageRuntime(global, project), now = Date.now()
    const record = completedMessageUsage({ role: "assistant", id: "message-1", sessionID: "session-1", providerID: "host/provider", modelID: "anthropic/claude-sonnet-4", time: { created: now, completed: now + 1 }, cost: 8, tokens: { output: 42 } })!
    assert.equal(await runtime.capture(record), true)
    const reopened = createUsageRuntime(global, project)
    assert.deepEqual(await reopened.knownModels(), ["anthropic/claude-sonnet-4"])
    const stored = await reopened.store.read(await loadUsagePolicy(global, project))
    assert.equal(stored.records[0].provider, "host/provider")
    assert.match(await reopened.command("/usage model anthropic/claude-sonnet-4", "session-1"), /8/)
    assert.match(await reopened.command("/budget", "session-1"), /8 USD \(measured\).*10 USD.*2 USD.*80%/)
    const warnings = await reopened.claimWarnings("session-1")
    assert.equal(warnings.length, 1); assert.deepEqual(warnings[0].crossed, [50, 80])
    assert.deepEqual(await createUsageRuntime(global, project).claimWarnings("session-1"), [])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("invalid host IDs fail best-effort capture without relaxing internal IDs or poisoning storage", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms-invalid-model-"))
  try {
    const runtime = createUsageRuntime(root, root)
    const record = { schemaVersion: 1 as const, kind: "message" as const, id: "m", session: "s", timestamp: new Date().toISOString(), revision: 1, completed: true, provider: "provider", model: "model", metrics: { costUSD: 1 } }
    for (const field of ["provider", "model"] as const) {
      for (const value of ["", "x".repeat(161), "bad\nmodel", "bad\rmodel", "bad\tmodel", "bad\u0000model", "bad\u007fmodel", "bad\u0085model"]) {
        assert.equal(await runtime.capture({ ...record, [field]: value }), false, `${field}: ${JSON.stringify(value)}`)
      }
    }
    for (const field of ["id", "session", "task", "agent", "tool"] as const) assert.equal(await runtime.capture({ ...record, [field]: "internal/slash" }), false)
    await assert.rejects(runtime.store.upsert({ ...record, project: "internal/slash" }, defaultBudgetPolicy()), /CORRUPT_USAGE/)
    assert.deepEqual(await runtime.knownModels(), [])
    assert.equal(await runtime.capture(record), true)
    assert.deepEqual(await runtime.knownModels(), ["model"])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("usage typed-space trigger is guarded, cancel-safe and disposed; direct syntax survives", () => {
  let tick!: () => void, cleared = 0, opened = 0, dialog = false
  const prompt = { focused: true, current: { input: "/usage ", mode: "normal" } }
  const dispose = watchUsagePrompt(() => prompt, () => !dialog, () => { opened++; dialog = true }, {
    every: fn => { tick = fn; return { unref() {} } }, clear: () => { cleared++ },
  })
  tick(); tick(); assert.equal(opened, 1)
  dialog = false; tick(); assert.equal(opened, 1)
  prompt.current.input = "/usage model real-id"; tick(); assert.equal(opened, 1)
  prompt.current.input = "/usage "; tick(); assert.equal(opened, 2)
  dialog = false; prompt.current.mode = "shell"; tick(); assert.equal(opened, 2)
  dispose(); assert.equal(cleared, 1)
})

test("project editor validates, atomically merges, disables inherited limits and rejects stale confirmation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms-budget-edit-"))
  try {
    const global = path.join(root, "global"), project = path.join(root, "project")
    await mkdir(global); await mkdir(project)
    await writeFile(path.join(global, "budget-policy.json"), JSON.stringify({ scopes: { day: { costUSD: { limit: 10, hard: false }, output: { limit: 500, hard: false } } } }))
    const runtime = createUsageRuntime(global, project)
    const ticket = await runtime.prepareBudgetEdit("session-cost", "2.5")
    await runtime.commitBudgetEdit(ticket)
    assert.equal((await loadUsagePolicy(global, project)).scopes.session.costUSD?.limit, 2.5)
    const removal = await runtime.prepareBudgetEdit("remove-day-cost", "")
    await runtime.commitBudgetEdit(removal)
    const policy = await loadUsagePolicy(global, project)
    assert.equal(policy.scopes.day.costUSD, undefined)
    assert.equal(policy.scopes.day.output?.limit, 500)
    const warnings = await runtime.prepareBudgetEdit("warnings", "100, 50,80,50")
    await runtime.commitBudgetEdit(warnings)
    assert.deepEqual((await loadUsagePolicy(global, project)).warnings, [50,80,100])
    assert.equal((await loadUsagePolicy(global, project)).mode, "warn")
    await assert.rejects(runtime.commitBudgetEdit(warnings), /POLICY_CHANGED/)
    for (const value of ["", "0", "-1", "NaN", "Infinity", "1e100"]) await assert.rejects(runtime.prepareBudgetEdit("day-cost", value), /INVALID_BUDGET_INPUT/)
    for (const value of ["0,50", "101", "50,no", ""]) await assert.rejects(runtime.prepareBudgetEdit("warnings", value), /INVALID_BUDGET_INPUT/)
    await writeFile(path.join(project, ".openarms/budget-policy.json"), "{broken")
    await assert.rejects(runtime.prepareBudgetEdit("day-cost", "1"), /INVALID_BUDGET_POLICY/)
    assert.equal(await readFile(path.join(project, ".openarms/budget-policy.json"), "utf8"), "{broken")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("dashboard confidence/units and durable warning claims: exact, approximate, partial, Home and policy change", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms-budget-view-"))
  try {
    const store = new UsageStore(root)
    const policy = mergeBudgetPolicy(defaultBudgetPolicy(), { mode: "warn", scopes: { session: { costUSD: { limit: 10, hard: true }, contextUtilization: { limit: 0.8, hard: false } } } })
    const record = { schemaVersion: 1 as const, kind: "message" as const, id: "m", session: "s", project: "p", timestamp: new Date().toISOString(), revision: 1, completed: true, model: "real-model", metrics: { costUSD: 8, contextUtilization: 0.6 }, estimated: ["costUSD" as const] }
    await store.upsert(record, policy)
    const text = await executeUsageCommand("/budget", store, policy, { project: "p", session: "s" })
    assert.match(text, /report-only.*does not block requests/)
    assert.match(text, /8 USD.*10 USD.*2 USD.*80%.*estimated/)
    assert.match(text, /60%.*80%.*20%.*75%/)
    const claims = await Promise.all([store.claimWarnings(policy, "p", "s"), new UsageStore(root).claimWarnings(policy, "p", "s")])
    assert.equal(claims.flat().length, 2)
    assert.equal(claims.flat().find(w => w.metric === "costUSD")?.estimated, true)
    assert.deepEqual(await new UsageStore(root).claimWarnings(policy, "p", "s"), [])
    await store.upsert({ ...record, id: "partial", metrics: { output: 1 }, estimated: [] }, policy)
    const partial = await executeUsageCommand("/budget", store, policy, { project: "p", session: "s" })
    assert.match(partial, /partial.*remaining unknown/i)
    assert.deepEqual(await store.claimWarnings({ ...policy, version: "changed" }, "p", "s"), [])
    const home = await executeUsageCommand("/budget", store, policy, { project: "p", session: "__skill_router_home__" })
    assert.match(home, /No active session/); assert.match(home, /Today/)
    assert.doesNotMatch(home, /hard configured|Tip:|Consider a new session/)
    const empty = await executeUsageCommand("/budget", new UsageStore(path.join(root, "empty")), policy, { project: "p", session: "s" })
    assert.match(empty, /No data.*10 USD.*remaining unknown/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
