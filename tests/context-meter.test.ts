import test from "node:test"
import assert from "node:assert/strict"
import { contextSnapshot, contextBand, contextChanged } from "../src/usage-runtime.ts"
import { createUsageRuntime, completedMessageUsage } from "../src/usage-runtime.ts"
import { registerContextKey } from "../plugins/tui-core.ts"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const record = (id: string, timestamp: string, input: number, session = "s"): any => ({ id, timestamp, session, project: "p", kind: "message", completed: true, provider: "provider", model: "model", metrics: { freshInput: input, output: 1000, cacheRead: 2000, cacheWrite: 3000, costUSD: 0.2 } })
test("latest occupancy is not cumulative billing; cache counted once, sessions isolated", () => {
  const rows = [record("a", "2026-10-16T00:00:00Z", 90000), record("b", "2026-10-16T00:01:00Z", 98000), record("c", "2026-10-16T00:02:00Z", 1, "other")]
  const state = contextSnapshot(rows, "p", "s", { provider: "provider", model: "model", limit: 200000 })
  assert.equal(state.tokens, 104000)
  assert.equal(state.utilization, 0.52)
  assert.equal(state.costUSD, 0.4)
  assert.equal(contextBand(state.utilization), 2)
  assert.equal(contextChanged(state, { ...state, utilization: 0.525 }), false)
  assert.equal(contextChanged({ ...state, utilization: 0.749 }, { ...state, utilization: 0.75 }), true)
})
test("missing/malformed telemetry remains unknown, fallback limit and model changes are safe", () => {
  const rows = [record("a", "2026-10-16T00:00:00Z", 200000)]
  assert.equal(contextSnapshot(rows, "p", "s").utilization, 1)
  assert.equal(contextSnapshot(rows, "p", "s").limit, 128000)
  assert.equal(contextSnapshot(rows, "p", "s", { model: "new", provider: "provider", limit: NaN }).tokens, null)
  rows[0].metrics.output = NaN
  assert.equal(contextSnapshot(rows, "p", "s").tokens, null)
  assert.equal(contextSnapshot([], "p", "s").costUSD, null)
  assert.deepEqual([0, .25, .5, .75, .9, 1].map(contextBand), [0, 1, 2, 3, 4, 4])
})
test("server numeric model metadata bridges runtime instances; completed events deduplicate", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms-context-"))
  try {
    const server = createUsageRuntime(root, root), tui = createUsageRuntime(root, root)
    await server.setContextModel("s", { id: "model", providerID: "provider", limit: { context: 200000 } })
    const info = { role: "assistant", id: "m", sessionID: "s", modelID: "model", providerID: "provider", time: { created: 1000, completed: 2000 }, cost: .2, tokens: { input: 98000, output: 1000, reasoning: 500, cache: { read: 2000, write: 3000 } } }
    await server.capture(completedMessageUsage(info)!)
    await server.capture(completedMessageUsage(info)!)
    assert.equal((await tui.context("s")).tokens, 104000)
    assert.equal((await tui.context("s")).costUSD, .2)
    assert.equal((await tui.context("other")).tokens, null)
    await server.setContextModel("s", { id: "new", providerID: "provider", limit: { context: -1 } })
    const changed = await tui.context("s")
    assert.equal(changed.tokens, null); assert.equal(changed.costUSD, .2); assert.equal(changed.fallback, true)
    assert.equal(completedMessageUsage({ ...info, time: { created: 1000 } }), undefined)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test("Ctrl+Space wiring consumes only an eligible prompt and unregisters", async () => {
  let handler: any, eligible = true, opened = 0, consumed = 0, disposed = 0
  const api = { keymap: { createKeyMatcher: (key: string) => { assert.equal(key, "ctrl+space"); return (event: any) => event.match }, intercept: (_: string, fn: any) => { handler = fn; return () => disposed++ } }, ui: { dialog: { open: false } }, mode: { current: () => "base" } }
  const off = registerContextKey(api, () => eligible, () => opened++)
  const context = { event: { match: true }, consume: () => consumed++ }
  handler(context); assert.equal(opened, 1); assert.equal(consumed, 1)
  eligible = false; handler(context); eligible = true; api.ui.dialog.open = true; handler(context)
  assert.equal(opened, 1); off(); assert.equal(disposed, 1)
  const source = await readFile(new URL("../plugins/skill-router-tui.tsx", import.meta.url), "utf8")
  assert.match(source, /right: <ContextMeterWidget/)
  assert.match(source, /onMouseUp=\{open\}/)
  assert.match(source, /clearInterval\(timer\); unsubscribe\(\); key\(\)/)
})
