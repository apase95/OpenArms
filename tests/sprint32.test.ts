import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, rm, readFile, symlink, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { evaluateRotation } from "../src/session-rotation.ts"
import { HandoffStore, compactHandoff } from "../src/session-handoff.ts"
import { createRuntime } from "../src/runtime.ts"
import { createLocalRuntime } from "../src/local-library.ts"
import { initializeSession } from "../src/skills-service.ts"
import { SkillRouterServer } from "../plugins/skill-router-server.ts"
import { hashBytes } from "../scripts/registry-v2.mjs"
import { createUsageRuntime } from "../src/usage-runtime.ts"
import { defaultBudgetPolicy, mergeBudgetPolicy } from "../src/budget-policy.ts"
import { ShadowStore, evaluateBudget, executeBudget, replayBudget } from "../src/budget-executor.ts"
import { lifecycleCommand } from "../scripts/session-lifecycle.mjs"

const fields = { Objective: [{ text: "Finish the task", source: "task" }], "Next Step": [{ text: "Review verification", source: "runtime" }] }
test("Sprint32 happy path: deterministic boundary and durable explicit acknowledgement", async () => {
  const snapshot = { boundary: "task-completed", active: false, context: { value: 0.7, source: "measured" } }
  assert.deepEqual(evaluateRotation(snapshot), { decision: "suggest", reasons: ["CONTEXT_THRESHOLD"] })
  assert.deepEqual(evaluateRotation(snapshot), evaluateRotation(snapshot))
  const root = await mkdtemp(path.join(tmpdir(), "arms32-"))
  try {
    const store = new HandoffStore(root)
    const prepared = await store.prepare({ id: "h1", sourceSession: "s", createdAt: "2026-10-11T00:00:00.000Z", fields }, null)
    assert.equal(prepared.state, "prepared")
    assert.ok((await readFile(path.join(root, ".openarms/progress.md"), "utf8")).trimEnd().split("\n").length <= 30)
    await store.claim("h1", prepared.hash, "target")
    await store.acknowledge("h1", prepared.hash, "target")
    assert.equal((await store.archive("h1", prepared.hash, "target")).state, "archived")
  } finally { await rm(root, { recursive: true, force: true }) }
})
test("Sprint32 critical edge: active work, untrusted secrets, stale writes and symlink escape", async () => {
  assert.equal(evaluateRotation({ boundary: "task-completed", active: true, context: { value: 1, source: "measured" } }).decision, "none")
  assert.equal(evaluateRotation({ boundary: "task-completed", active: false, cacheReadTrend: { value: 10, source: "measured" } }).decision, "none")
  const compact = compactHandoff({ ...fields, Completed: [{ text: "Bearer fixture-secret", source: "task" }, { text: "raw private output", source: "tool" }] })
  assert.doesNotMatch(compact.body, /fixture-secret|raw private/)
  assert.match(compact.body, /Next Step/)
  const root = await mkdtemp(path.join(tmpdir(), "arms32-")), outside = await mkdtemp(path.join(tmpdir(), "arms32-out-"))
  try {
    await symlink(outside, path.join(root, ".openarms"))
    await assert.rejects(new HandoffStore(root).prepare({ id: "h", sourceSession: "s", createdAt: "2026-10-11T00:00:00.000Z", fields }, null), /UNSAFE_HANDOFF_PATH/)
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }) }
})

test("Sprint32 sanitizer corpus, bounded compaction and lifecycle stale/concurrent retries", async () => {
  const secrets = ["Bearer fixture-secret", "-----BEGIN RSA PRIVATE KEY-----", "API_KEY=fixture-secret", "password: fixture-secret", "/home/owner/.ssh/key", "Traceback (most recent call last):", "@@ -1,2 +1,2 @@", "```raw output", "ghp_fixturesecret"]
  for (const text of secrets) assert.equal(compactHandoff({ Objective: [{ text, source: "task" }] }).body.includes(text), false)
  const safe = compactHandoff({ ...fields, Completed: Array.from({ length: 80 }, (_, n) => ({ text: `Test ${n} passed`, source: "runtime" })), Decisions: [{ text: "Token estimate remains missing; password detector tested", source: "task" }] })
  assert.equal(safe.body.trimEnd().split("\n").length <= 30, true)
  assert.match(safe.body, /Token estimate remains missing/)
  assert.equal(safe.body, compactHandoff({ ...fields, Completed: Array.from({ length: 80 }, (_, n) => ({ text: `Test ${n} passed`, source: "runtime" })), Decisions: [{ text: "Token estimate remains missing; password detector tested", source: "task" }] }).body)
  const root = await mkdtemp(path.join(tmpdir(), "arms32-life-"))
  try {
    const a = new HandoffStore(root), b = new HandoffStore(root)
    const prepared = await a.prepare({ id: "h", sourceSession: "source", createdAt: "2026-10-11T00:00:00.000Z", fields }, null)
    assert.deepEqual(await lifecycleCommand(["inspect", root]), prepared)
    await assert.rejects(b.prepare({ id: "stale", sourceSession: "source", createdAt: "2026-10-11T01:00:00.000Z", fields }, null), /STALE_HANDOFF/)
    await assert.rejects(a.archive("h", prepared.hash, "t1"), /ACK_REQUIRED/)
    const claims = await Promise.allSettled([a.claim("h", prepared.hash, "t1"), b.claim("h", prepared.hash, "t2")])
    assert.equal(claims.filter(r => r.status === "fulfilled").length, 1)
    const claimed = await a.inspect()
    await assert.rejects(a.acknowledge("h", "0".repeat(64), claimed!.targetSession!), /STALE_HANDOFF/)
    await rm(path.join(root, ".openarms/progress.md"))
    await lifecycleCommand(["recover", root])
    assert.equal((await a.inspect())?.state, "claimed")
    await a.acknowledge("h", prepared.hash, claimed!.targetSession!)
    await a.archive("h", prepared.hash, claimed!.targetSession!)
    await a.archive("h", prepared.hash, claimed!.targetSession!)
    await a.prepare({ id: "h2", sourceSession: "source", createdAt: "2026-10-11T01:00:00.000Z", fields }, prepared.hash)
    assert.equal(JSON.parse(await readFile(path.join(root, ".openarms/handoff-archive", `h-${prepared.hash}.json`), "utf8")).metadata.state, "archived")
  } finally { await rm(root, { recursive: true, force: true }) }
})

async function hostFixture(run: (f: any) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), "arms32-host-"))
  const names = ["OPENARMS_LIBRARY_ROOT", "XDG_STATE_HOME", "OPENARMS_APPROVED_REGISTRY_HASH"]
  const previous = Object.fromEntries(names.map(n => [n, process.env[n]]))
  try {
    const registry: any = { schemaVersion: 2, packages: { demo: { core: ["example"], optional: ["extra"], detect: { files: [], extensions: [], dependencies: [] } } }, skills: {} }
    for (const skill of ["example", "extra"]) {
      await mkdir(path.join(root, skill)); await writeFile(path.join(root, skill, "interface.txt"), `Synthetic ${skill}`)
      registry.skills[skill] = { owner: "demo", kind: skill === "extra" ? "optional" : "core", path: `${skill}/interface.txt`, contentHash: hashBytes(Buffer.from(`Synthetic ${skill}`)), maxTokens: 100, defaultPermission: "ask", workflows: {}, references: {} }
    }
    await writeFile(path.join(root, "registry.json"), JSON.stringify(registry))
    process.env.OPENARMS_LIBRARY_ROOT = root; process.env.XDG_STATE_HOME = root; process.env.OPENARMS_APPROVED_REGISTRY_HASH = hashBytes(Buffer.from(JSON.stringify(registry)))
    const runtime = await createRuntime({ directory: root })
    const adapter: any = await SkillRouterServer({ directory: root, worktree: root } as any)
    await run({ root, registry, runtime, adapter })
  } finally {
    for (const n of names) if (previous[n] === undefined) delete process.env[n]; else process.env[n] = previous[n]
    await rm(root, { recursive: true, force: true })
  }
}

test("active local adapter child starts empty and requires its own selection; parent unchanged", async () => hostFixture(async ({ root, registry, adapter }) => {
  await mkdir(path.join(root, "skills"))
  for (const id of ["example", "extra"]) {
    await mkdir(path.join(root, "skills", id))
    await writeFile(path.join(root, "skills", id, "interface.txt"), `Synthetic ${id}`)
    registry.skills[id].path = `skills/${id}/interface.txt`
  }
  await writeFile(path.join(root, "registry.json"), JSON.stringify(registry))
  const runtime = await createLocalRuntime({ directory: root })
  const config = await runtime.configureLibrary(root, "unset", true)
  await runtime.selectPackage("parent", "demo", ["extra"], config.revision)
  await runtime.loadSkill("parent", "example")
  const parent = await runtime.store.getSession(root, "parent")
  await Promise.all(["c1", "c2"].map(id => adapter.event({ event: { type: "session.created", properties: { info: { id, parentID: "parent" } } } })))
  for (const id of ["c1", "c2"]) {
    const child = await runtime.store.getSession(root, id)
    assert.deepEqual(child.packages, {}); assert.equal(child.taskPackage, undefined); assert.equal(child.taskSession, undefined)
    assert.equal(JSON.parse(await adapter.tool.load_skill.execute({ skill: "extra" }, { sessionID: id })).error.code, "NOT_SELECTED")
    await runtime.selectPackage(id, "demo", ["extra"], config.revision)
    assert.equal(JSON.parse(await adapter.tool.load_skill.execute({ skill: "extra" }, { sessionID: id })).ok, true)
  }
  assert.equal(JSON.parse(await adapter.tool.load_skill.execute({ skill: "extra" }, { sessionID: "c1" })).ok, true)
  assert.deepEqual(await runtime.store.getSession(root, "parent"), parent)
}))

test("metadata roots automatically select after server creation without copying session authority", async () => hostFixture(async ({ root, registry, runtime, adapter }) => {
  await runtime.store.setPackage(root, "origin", "demo", ["extra"])
  await runtime.grantVerifiedSkill({ skill: "example" }, { sessionID: "origin" }, "session")
  await runtime.grantVerifiedSkill({ skill: "extra" }, { sessionID: "origin" }, "project")
  await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "origin" })
  await runtime.grantVerifiedSkill({ skill: "example" }, { sessionID: "origin" }, "once")
  await runtime.store.approveMismatch(root, "origin", "demo")
  const parent = await runtime.store.getSession(root, "origin")
  for (const yes of [false, true]) {
    const id = yes ? "yes" : "no"
    await adapter.event({ event: { type: "session.created", properties: { info: { id } } } })
    const restored = await initializeSession({ projectRoot: root, sessionID: id, store: runtime.store })
    assert.deepEqual(restored.packages, { demo: ["extra"] })
    assert.equal(restored.taskPackage, undefined); assert.equal(restored.taskLoadedSkills, undefined); assert.deepEqual(restored.approvedMismatch, [])
    if (yes) {
      assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: id })).error.code, "APPROVAL_REQUIRED")
      assert.equal((await runtime.loadVerifiedSkill({ skill: "extra" }, { sessionID: id })).ok, true)
    }
  }
  assert.deepEqual(await runtime.store.getSession(root, "origin"), parent)
  registry.skills.extra.defaultPermission = "deny"
  await writeFile(path.join(root, "registry.json"), JSON.stringify(registry))
  const changed = await createRuntime({ directory: root, approvedRegistryHash: hashBytes(Buffer.from(JSON.stringify(registry))) })
  assert.equal((await changed.loadVerifiedSkill({ skill: "extra" }, { sessionID: "yes" })).error.code, "DENIED")
}))

test("Sprint32 shadow integration: chat parameters and tool still run as off, durable dedup and offline replay", async () => hostFixture(async ({ root, runtime, adapter }) => {
  const usage = createUsageRuntime(path.dirname(runtime.stateFile), root)
  const policy = mergeBudgetPolicy(defaultBudgetPolicy(), { mode: "shadow", scopes: { session: { toolOutputBytes: { limit: 1, hard: true } } } })
  await mkdir(path.join(root, ".openarms")); await writeFile(path.join(root, ".openarms/budget-policy.json"), JSON.stringify(policy))
  const parameters = { temperature: 0.25, options: { fixture: true } }, original = structuredClone(parameters)
  await adapter["chat.params"]({ sessionID: "s" }, parameters)
  assert.deepEqual(parameters, original)
  const output = { title: "fixture", output: "ok", metadata: {} }
  await adapter["tool.execute.after"]({ tool: "fixture", sessionID: "s", callID: "c", args: {} }, output)
  assert.equal(output.output, "ok")
  const events = await usage.shadow.read()
  assert.deepEqual([...new Set(events.map(e => e.decision))].sort(), ["would_ask", "would_block", "would_warn"])
  await adapter["chat.params"]({ sessionID: "s" }, parameters)
  await new ShadowStore(usage.shadow.directory).record(events)
  assert.deepEqual(await usage.shadow.read(), events)
  assert.equal((await usage.taskCompleted("s", { boundary: "task-completed", active: false, context: { value: 0.7, source: "measured" } })).decision, "suggest")
  assert.equal((await usage.shadow.read()).some(e => e.decision === "would_rotate"), true)
  const records = (await usage.store.read(policy)).records
  assert.equal(replayBudget(records, [policy, { ...policy, version: "new-policy", scopes: { day: {}, session: {}, task: {} } }])[1].events.length, 0)
  await writeFile(path.join(root, ".openarms/budget-policy.json"), JSON.stringify({ ...policy, mode: "off" }))
  await adapter["chat.params"]({ sessionID: "s" }, parameters)
  const offOutput = { title: "fixture", output: "ok", metadata: {} }
  await adapter["tool.execute.after"]({ tool: "fixture", sessionID: "s", callID: "c2", args: {} }, offOutput)
  assert.deepEqual(output, offOutput); assert.deepEqual(parameters, original)
  const bad = new ShadowStore(path.join(root, "bad-shadow")); await mkdir(bad.directory); await writeFile(path.join(bad.directory, "audit.json"), "broken")
  assert.equal((await executeBudget(policy, evaluateBudget(policy, records), bad)).action, "allow")
}))
