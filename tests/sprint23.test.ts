import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, chmod } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { createRuntime } from "../src/runtime.ts"
import { hashBytes } from "../scripts/registry-v2.mjs"
import { StateStore } from "../src/state-store.ts"
import { createVerifiedLoader } from "../src/verified-loader.mjs"
import { SkillRouterServer } from "../plugins/skill-router-server.ts"
import picomatch from "picomatch"
import { migrate, transaction, serialize } from "../scripts/registry-v2-operations.mjs"
import { executeSkillsCommand } from "../src/skills-service.ts"
import * as tuiCore from "../plugins/tui-core.ts"

async function fixture(run: (fixture: any) => Promise<void>, permission = "allow") {
  const root = await mkdtemp(path.join(tmpdir(), "arms-sprint23-"))
  try {
    const registry: any = { schemaVersion: 2, packages: { demo: { core: ["example"], optional: ["extra"], detect: { files: [], extensions: [], dependencies: [] } }, other: { core: ["second"], optional: [], detect: { files: [], extensions: [], dependencies: [] } } }, skills: {} }
    for (const skill of ["example", "extra", "second"]) {
      await mkdir(path.join(root, skill))
      await writeFile(path.join(root, skill, "interface.txt"), `Synthetic ${skill}`)
      registry.skills[skill] = { owner: skill === "second" ? "other" : "demo", kind: skill === "extra" ? "optional" : "core", path: `${skill}/interface.txt`, contentHash: hashBytes(Buffer.from(`Synthetic ${skill}`)), maxTokens: 100, defaultPermission: permission, workflows: {}, references: {} }
    }
    const file = path.join(root, "state.json")
    const options = { directory: root, libraryRoot: root, stateFile: file, approvedRegistryHash: hashBytes(Buffer.from(JSON.stringify(registry))) }
    await writeFile(path.join(root, "registry.json"), JSON.stringify(registry))
    const runtime = await createRuntime(options)
    await runtime.store.setPackage(root, "s", "demo", ["extra"])
    await runtime.store.setPackage(root, "s", "other", [])
    await run({ root, registry, file, options, runtime })
  } finally { await rm(root, { recursive: true, force: true }) }
}

test("trusted UI approval ticket grants the displayed skill in the same task", async () => fixture(async ({ runtime }) => {
  const ticket = await runtime.prepareVerifiedGrant({ skill: "example" }, { sessionID: "s" })
  assert.equal(ticket.status.state, "Available")
  assert.equal((await runtime.commitVerifiedGrant(ticket, "session")).ok, true)
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).ok, true)
}, "ask"))

test("advisory mismatch cannot block repair/revoke/regrant through production UI", async () => fixture(async ({ root, runtime }) => {
  const action = (action: string) => tuiCore.runVerifiedAction({ runtime, action, skill: "example", sessionID: "s", scope: "session", choose: async () => true, toast: () => {} })
  assert.equal((await action("grant")).ok, true)
  await writeFile(path.join(root, "example/interface.txt"), "tampered")
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).error.code, "HASH_MISMATCH")
  await writeFile(path.join(root, "example/interface.txt"), "Synthetic example")
  assert.equal((await action("revoke")).ok, true)
  assert.equal((await action("grant"))?.ok, true)
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).ok, true)
}, "ask"))

test("outer registry and state I/O failures are path-free and tickets remain one-shot", async () => fixture(async ({ root, file, runtime, registry }) => {
  const ticket = await runtime.prepareVerifiedGrant({ skill: "example" }, { sessionID: "s" })
  await rm(path.join(root, "registry.json"))
  const before = await readFile(file, "utf8")
  const result = await runtime.commitVerifiedGrant(ticket, "once")
  assert.equal(result.error.code, "REGISTRY_IO_ERROR")
  assert.equal(JSON.stringify(result).includes(root), false)
  assert.equal(await readFile(file, "utf8"), before)
  assert.equal((await runtime.commitVerifiedGrant(ticket, "once")).error.code, "INVALID_GRANT")
  await writeFile(path.join(root, "registry.json"), JSON.stringify(registry))
  await rm(file)
  await mkdir(file)
  const failure = await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })
  assert.equal(failure.error.code, "STATE_IO_ERROR")
  assert.equal(JSON.stringify(failure).includes(root), false)
}, "ask"))

test("dialog registry unreadable/malformed and corrupt state fail safely without publication", async () => fixture(async ({ root, file, runtime, registry }) => {
  const registryFile = path.join(root, "registry.json")
  for (const kind of ["missing", "unreadable", "malformed"]) {
    const messages: any[] = []
    const before = await readFile(file, "utf8")
    const result = await tuiCore.runVerifiedAction({ runtime, action: "grant", skill: "example", sessionID: "s", scope: "once", toast: (...args: any[]) => messages.push(args), choose: async () => {
      if (kind === "missing") await rm(registryFile)
      else if (kind === "unreadable") { await rm(registryFile); await mkdir(registryFile) }
      else await writeFile(registryFile, "{broken private-content")
      return true
    } })
    assert.equal(result.error.code, kind === "malformed" ? "INVALID_REGISTRY" : "REGISTRY_IO_ERROR")
    assert.equal(await readFile(file, "utf8"), before)
    assert.equal(JSON.stringify([result, messages]).includes(root), false)
    assert.equal(JSON.stringify([result, messages]).includes("private-content"), false)
    await rm(registryFile, { recursive: true, force: true }); await writeFile(registryFile, JSON.stringify(registry))
  }
  if (process.getuid?.() !== 0) {
    await chmod(registryFile, 0)
    try { assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).error.code, "REGISTRY_IO_ERROR") }
    finally { await chmod(registryFile, 0o600) }
  }
  await writeFile(file, "{broken private-content")
  const status = await runtime.getVerifiedStatus({ skill: "example" }, { sessionID: "s" })
  assert.equal(status.reason, "STATE_IO_ERROR")
  assert.equal(await readFile(file, "utf8"), "{broken private-content")
}, "ask"))

test("unexpected UI callback exception never becomes a native-message toast", async () => fixture(async ({ root, runtime }) => {
  const messages: any[] = []
  const result = await tuiCore.runVerifiedAction({ runtime, action: "grant", skill: "example", sessionID: "s", scope: "once", choose: async () => { throw new Error(`${root}/private-content`) }, toast: (...args: any[]) => messages.push(args) })
  assert.equal(result.error.code, "RUNTIME_ERROR")
  assert.equal(JSON.stringify(messages).includes(root), false)
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).error.code, "APPROVAL_REQUIRED")
}, "ask"))

test("production TUI action contract: explicit confirmation grants, cancel and reset do not", async () => fixture(async ({ root, runtime, file }) => {
  assert.equal(typeof tuiCore.runVerifiedAction, "function")
  const messages: any[] = []
  const invoke = (confirm: () => Promise<boolean>) => tuiCore.runVerifiedAction({
    runtime, action: "grant", skill: "example", sessionID: "s", scope: "session",
    choose: confirm, toast: (...args: any[]) => messages.push(args),
  })
  const before = await readFile(file, "utf8")
  await invoke(async () => false)
  assert.equal(await readFile(file, "utf8"), before)
  await invoke(async () => { await runtime.store.resetTaskLock(root, "s", "dialog-reset"); return true })
  assert.match(messages.at(-1)[1], /TASK_CHANGED/)
  assert.equal((await runtime.getVerifiedStatus({ skill: "example" }, { sessionID: "s" })).reason, "APPROVAL_REQUIRED")
  await invoke(async () => true)
  assert.equal(messages.at(-1)[2], "success")
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).ok, true)
  assert.equal(JSON.stringify(messages).includes(root), false)
}, "ask"))

test("production confirmation callback contract defaults to cancel and requires boolean true", async () => {
  let dialog: any, dismiss: () => void
  const api = { ui: {
    dialog: { clear() {}, replace: (render: () => void, close: () => void) => { dismiss = close; render() } },
  } }
  for (const value of [false, "true", undefined, true]) {
    const pending = tuiCore.chooseVerifiedConfirmation(api, "grant example?", "Scope: once", "Grant", "Cancel", props => { dialog = props })
    assert.equal(dialog.no, "Cancel")
    assert.match(dialog.message, /Scope: once/)
    dialog.onConfirm(value)
    assert.equal(await pending, value === true)
  }
  const pending = tuiCore.chooseVerifiedConfirmation(api, "grant example?", "Scope: project", "Grant", "Cancel", props => { dialog = props })
  dismiss!()
  assert.equal(await pending, false)
})

test("verified UI status service renders core decisions, not selection as approval", async () => fixture(async ({ root, runtime }) => {
  const options = { args: "inspect", projectRoot: root, sessionID: "s", registry: runtime.registry, store: runtime.store, detected: new Set<string>(), confirmMismatch: async () => true, verifiedStatus: (skill: string) => runtime.getVerifiedStatus({ skill }, { sessionID: "s" }) }
  const before = await executeSkillsCommand(options)
  assert.match(before, /example\tAvailable \(APPROVAL_REQUIRED\)/)
  assert.equal(before.includes(root), false)
  const ticket = await runtime.prepareVerifiedGrant({ skill: "example" }, { sessionID: "s" })
  await runtime.commitVerifiedGrant(ticket, "session")
  assert.match(await executeSkillsCommand(options), /example\tEnabled \(AUTHORIZED\)/)
  await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })
  assert.match(await executeSkillsCommand(options), /example\tUsed \(AUTHORIZED\)/)
  await runtime.store.resetTaskLock(root, "s", "ui-next")
  assert.match(await executeSkillsCommand(options), /example\tLoaded \(AUTHORIZED\)/)
}, "ask"))

test("trusted UI approval cannot cross reset or accept a forged ticket", async () => fixture(async ({ root, runtime, file }) => {
  const ticket = await runtime.prepareVerifiedGrant({ skill: "example" }, { sessionID: "s" })
  await runtime.store.resetTaskLock(root, "s", "new-ui-task")
  const before = await readFile(file, "utf8")
  assert.equal((await runtime.commitVerifiedGrant(ticket, "project")).error.code, "TASK_CHANGED")
  assert.equal((await runtime.commitVerifiedGrant({ ...ticket }, "session")).error.code, "INVALID_GRANT")
  assert.equal(await readFile(file, "utf8"), before)
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).error.code, "APPROVAL_REQUIRED")
}, "ask"))

test("trusted UI revoke removes only chosen scope and cannot cross reset", async () => fixture(async ({ root, runtime, file }) => {
  await runtime.grantVerifiedSkill({ skill: "example" }, { sessionID: "s" }, "session")
  await runtime.grantVerifiedSkill({ skill: "example" }, { sessionID: "s" }, "project")
  const revoke = await runtime.prepareVerifiedGrant({ skill: "example" }, { sessionID: "s" })
  assert.equal((await runtime.commitVerifiedRevoke(revoke, "session")).ok, true)
  assert.equal((await runtime.getVerifiedStatus({ skill: "example" }, { sessionID: "s" })).reason, "AUTHORIZED")
  const stale = await runtime.prepareVerifiedGrant({ skill: "example" }, { sessionID: "s" })
  await runtime.store.resetTaskLock(root, "s", "revoke-next-task")
  const before = await readFile(file, "utf8")
  assert.equal((await runtime.commitVerifiedRevoke(stale, "project")).error.code, "TASK_CHANGED")
  assert.equal(await readFile(file, "utf8"), before)
  const current = await runtime.prepareVerifiedGrant({ skill: "example" }, { sessionID: "s" })
  assert.equal((await runtime.commitVerifiedRevoke(current, "project")).ok, true)
  assert.equal((await runtime.getVerifiedStatus({ skill: "example" }, { sessionID: "s" })).reason, "APPROVAL_REQUIRED")
}, "ask"))

test("failed hash projects safely across runtime instances without changing grant/history state", async () => fixture(async ({ root, runtime, options, file }) => {
  await runtime.grantVerifiedSkill({ skill: "example" }, { sessionID: "s" }, "once")
  const ui = await createRuntime(options)
  const before = await readFile(file, "utf8")
  await writeFile(path.join(root, "example/interface.txt"), "tampered")
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).error.code, "HASH_MISMATCH")
  assert.equal(await readFile(file, "utf8"), before)
  assert.deepEqual(await ui.getVerifiedStatus({ skill: "example" }, { sessionID: "s" }), { state: "Unverified", decision: "deny", reason: "HASH_MISMATCH" })
  await writeFile(path.join(root, "example/interface.txt"), "Synthetic example")
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).ok, true)
  assert.equal((await ui.getVerifiedStatus({ skill: "example" }, { sessionID: "s" })).reason, "APPROVAL_REQUIRED")
  await runtime.store.resetTaskLock(root, "s", "integrity-next-task")
  assert.equal((await ui.getVerifiedStatus({ skill: "example" }, { sessionID: "s" })).state, "Available")
}, "ask"))

test("legacy migrated synthetic registry retains verified security; active SDK inventory is local", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms-sprint24-adapter-"))
  const names = ["OPENARMS_LIBRARY_ROOT", "XDG_STATE_HOME", "OPENARMS_APPROVED_REGISTRY_HASH"]
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]))
  try {
    await mkdir(path.join(root, "graphify"))
    const contents = { graphify: "Synthetic graphify interface\r\n", build: "Synthetic workflow", detail: "Synthetic reference π" }
    for (const [id, content] of Object.entries(contents)) await writeFile(path.join(root, "graphify", `${id}.txt`), content)
    const v1 = { version: 1, packages: { demo: { core: ["graphify"], optional: [], detect: { always: true } } }, skills: { graphify: "graphify/graphify.txt" } }
    const registryFile = path.join(root, "registry.json")
    await writeFile(registryFile, serialize(v1))
    const migrated = transaction(registryFile, source => ({ output: migrate(source, root, { graphify: { defaultPermission: "ask", maxTokens: 100 } }) }), { write: true, backup: true }).output
    assert.deepEqual(JSON.parse(await readFile(`${registryFile}.bak`, "utf8")), v1)
    assert.deepEqual(migrate(migrated, root, {}), migrated)
    for (const [group, id] of [["workflows", "build"], ["references", "detail"]]) migrated.skills.graphify[group][id] = { path: `graphify/${id}.txt`, contentHash: hashBytes(Buffer.from(contents[id])), maxTokens: 100 }
    await writeFile(registryFile, serialize(migrated))
    process.env.OPENARMS_LIBRARY_ROOT = root
    process.env.XDG_STATE_HOME = root
    process.env.OPENARMS_APPROVED_REGISTRY_HASH = hashBytes(Buffer.from(JSON.stringify(migrated)))
    const runtime = await createRuntime({ directory: root })
    await runtime.store.setPackage(root, "s", "demo", [])
    const adapter: any = await SkillRouterServer({ directory: root, worktree: root } as any)
    assert.deepEqual(Object.keys(adapter.tool), ["openarms_usage", "load_skill"])
    const beforeUsage = await readFile(runtime.stateFile, "utf8")
    const budget = await adapter.tool.openarms_usage.execute({ command: "budget" }, { sessionID: "s" })
    assert.match(budget, /^Budget · report-only \/ does not block requests\n/)
    assert.match(budget, /Mode\s+: Observe/)
    assert.match(budget, /Timezone\s+: UTC/)
    assert.match(budget, /Today \(project\)/)
    assert.match(budget, /No data \/ No limit set \/ remaining unknown \/ progress unknown/)
    assert.match(budget, /not a provider balance or billing reconciliation/)
    assert.equal(await readFile(runtime.stateFile, "utf8"), beforeUsage, "read-only budget cannot grant skills or change loader state")
    // Exercise the retained legacy API explicitly, not the active local adapter.
    const load = (request: any) => runtime.loadVerifiedSkill(request, { sessionID: "s" })
    for (const request of [{ skill: "graphify" }, { skill: "graphify", workflow: "build" }, { skill: "graphify", reference: "detail" }]) {
      await runtime.grantVerifiedSkill({ skill: "graphify" }, { sessionID: "s" }, "once")
      const response = await load(request)
      assert.equal(response.ok, true)
      assert.deepEqual(response.sources.map(source => source.id), ["graphify", ...("workflow" in request ? ["build"] : "reference" in request ? ["detail"] : [])])
      for (const source of response.sources) { assert.equal(source.content, contents[source.id]); assert.equal(source.hash, hashBytes(Buffer.from(source.content))) }
      assert.equal(JSON.stringify(response).includes(root), false)
    }
    await runtime.grantVerifiedSkill({ skill: "graphify" }, { sessionID: "s" }, "once")
    const before = await readFile(runtime.stateFile, "utf8")
    await writeFile(path.join(root, "graphify/graphify.txt"), "tampered")
    assert.equal((await load({ skill: "graphify" })).error.code, "HASH_MISMATCH")
    assert.equal(await readFile(runtime.stateFile, "utf8"), before)
    await writeFile(path.join(root, "graphify/graphify.txt"), contents.graphify)
    await rm(path.join(root, "graphify/detail.txt"))
    await writeFile(path.join(root, "sibling.txt"), contents.detail)
    await symlink(path.join(root, "sibling.txt"), path.join(root, "graphify/detail.txt"))
    assert.equal((await load({ skill: "graphify", reference: "detail" })).error.code, "UNSAFE_PATH")
    assert.equal(await readFile(runtime.stateFile, "utf8"), before)
    migrated.skills.graphify.maxTokens++
    await writeFile(registryFile, serialize(migrated))
    assert.equal((await load({ skill: "graphify" })).error.code, "CONCURRENT_REGISTRY_CHANGE")
    process.env.OPENARMS_APPROVED_REGISTRY_HASH = hashBytes(Buffer.from(JSON.stringify(migrated)))
    const restarted = await createRuntime({ directory: root })
    const failure = await restarted.loadVerifiedSkill({ skill: "graphify" }, { sessionID: "s" })
    assert.equal(failure.error.code, "APPROVAL_REQUIRED")
    assert.equal(JSON.stringify(failure).includes(root), false)
    const beforeOuter = await readFile(runtime.stateFile, "utf8")
    await rm(registryFile)
    const outer = await load({ skill: "graphify" })
    assert.deepEqual(outer, { ok: false, state: "Unverified", error: { code: "REGISTRY_IO_ERROR" } })
    assert.equal(await readFile(runtime.stateFile, "utf8"), beforeOuter)
    await writeFile(registryFile, serialize(migrated))
    const stateBeforeInvalidRegistry = await readFile(runtime.stateFile, "utf8")
    migrated.skills.graphify.references.detail.path = "sibling/detail.txt"
    await writeFile(registryFile, serialize(migrated))
    await assert.rejects(createRuntime({ directory: root }), /skill-root/)
    assert.equal(await readFile(runtime.stateFile, "utf8"), stateBeforeInvalidRegistry)
  } finally {
    for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]
    await rm(root, { recursive: true, force: true })
  }
})

test("persisted happy path; failed hash keeps once grant and exact state bytes", async () => fixture(async ({ root, file, runtime }) => {
  assert.equal((await runtime.grantVerifiedSkill({ skill: "example" }, { sessionID: "s" }, "once")).ok, true)
  const before = await readFile(file, "utf8")
  await writeFile(path.join(root, "example/interface.txt"), "tamper")
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).error.code, "HASH_MISMATCH")
  assert.equal(await readFile(file, "utf8"), before)
  await writeFile(path.join(root, "example/interface.txt"), "Synthetic example")
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).ok, true)
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).error.code, "APPROVAL_REQUIRED")
  const session = await runtime.store.getSession(root, "s")
  assert.equal(session.verified.records.length, 1)
  assert.deepEqual(session.verified.locks[0].usedSkills, ["example"])
  assert.equal(JSON.parse(await readFile(file, "utf8")).version, 2)
}, "ask"))

for (const first of ["s", "child"]) test(`isolated task authority: ${first} loads first`, async () => fixture(async ({ root, options, runtime }) => {
  await runtime.store.inheritSession(root, "s", "child")
  await runtime.store.setPackage(root, "child", "demo", [])
  await runtime.store.setPackage(root, "child", "other", [])
  const other = await createRuntime(options)
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: first })).ok, true)
  await other.store.resetTaskLock(root, "child", "child-prompt")
  const second = first === "s" ? "child" : "s"
  assert.equal((await other.loadVerifiedSkill({ skill: "second" }, { sessionID: second })).ok, true)
  await other.store.restoreSession(root, "independent")
  assert.equal((await other.loadVerifiedSkill({ skill: "second" }, { sessionID: "independent" })).ok, true)
  await runtime.store.resetTaskLock(root, "s", "parent-new")
  await runtime.store.resetTaskLock(root, "child", "child-new")
  assert.equal((await other.loadVerifiedSkill({ skill: "second" }, { sessionID: "child" })).ok, true)
}))

test("out-of-order ancestry cannot rebind descendants or inherit evidence", async () => fixture(async ({ root, runtime, options }) => {
  await runtime.store.inheritSession(root, "s", "grandchild")
  await runtime.store.setPackage(root, "grandchild", "demo", ["extra"])
  await runtime.grantVerifiedSkill({ skill: "extra" }, { sessionID: "grandchild" }, "once")
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "grandchild" })).ok, true)
  const before = await runtime.store.getSession(root, "grandchild")
  await runtime.store.restoreSession(root, "parent")
  await runtime.store.inheritSession(root, "parent", "s")
  const restarted = await createRuntime(options)
  const child = await restarted.store.getSession(root, "grandchild")
  assert.equal(child.taskSession, undefined)
  assert.notEqual(child.taskBoundary, (await restarted.store.getSession(root, "parent")).taskBoundary)
  assert.deepEqual(child.verified.records, before.verified.records)
  assert.equal(child.verified.grants.length, 1)
  assert.deepEqual(child.taskLoadedSkills, ["example"])
  assert.equal((await restarted.loadVerifiedSkill({ skill: "second" }, { sessionID: "grandchild" })).error.code, "DISABLED")
  assert.equal((await restarted.loadVerifiedSkill({ skill: "extra" }, { sessionID: "grandchild" })).ok, true)
  await restarted.store.resetTaskLock(root, "parent", "next-parent-task")
  assert.equal((await restarted.loadVerifiedSkill({ skill: "second" }, { sessionID: "grandchild" })).error.code, "DISABLED")
}))

for (const reset of ["restoreSession", "clearSession", "resetTaskLock"] as const) test(`${reset} leaves isolated child evidence unchanged`, async () => fixture(async ({ root, runtime, options }) => {
  await runtime.store.inheritSession(root, "s", "grandchild")
  await runtime.store.setPackage(root, "grandchild", "demo", ["extra"])
  await runtime.store.setPackage(root, "grandchild", "other", [])
  await runtime.grantVerifiedSkill({ skill: "example" }, { sessionID: "grandchild" }, "session")
  await runtime.grantVerifiedSkill({ skill: "second" }, { sessionID: "s" }, "session")
  await runtime.grantVerifiedSkill({ skill: "extra" }, { sessionID: "s" }, "project")
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "grandchild" })).ok, true)
  await runtime.grantVerifiedSkill({ skill: "extra" }, { sessionID: "grandchild" }, "once")
  const before = await runtime.store.getSession(root, "grandchild")
  const rootBefore = await runtime.store.getSession(root, "s")
  await runtime.store[reset](root, "s")
  const boundary = (await runtime.store.getSession(root, "s")).taskBoundary
  assert.notEqual(boundary, before.taskBoundary)
  for (const id of ["s"]) {
    const retired = await runtime.store.getSession(root, id)
    assert.equal(retired.taskBoundary, boundary)
    assert.equal(retired.taskPackage, undefined)
    assert.equal(retired.taskLoadedSkills, undefined)
    assert.deepEqual(retired.verified.locks, [])
    assert.equal(retired.verified.grants.some(grant => grant.scope === "once"), false)
    assert.equal(retired.verified.grants.some(grant => grant.scope === "session"), true)
  }
  assert.deepEqual((await runtime.store.getSession(root, "s")).packages, reset === "clearSession" ? {} : rootBefore.packages)
  assert.deepEqual((await runtime.store.getSession(root, "grandchild")).packages, before.packages)
  await runtime.store.restoreSession(root, "parent")
  await runtime.store.inheritSession(root, "parent", "s")
  const restarted = await createRuntime(options)
  const child = await restarted.store.getSession(root, "grandchild")
  assert.equal(child.taskSession, undefined)
  assert.deepEqual(child.verified.records, before.verified.records)
  assert.deepEqual(child.taskLoadedSkills, before.taskLoadedSkills)
  assert.deepEqual(child.verified.locks, before.verified.locks)
  await restarted.store.resetTaskLock(root, "grandchild")
  await restarted.grantVerifiedSkill({ skill: "second" }, { sessionID: "grandchild" }, "session")
  assert.equal((await restarted.loadVerifiedSkill({ skill: "second" }, { sessionID: "grandchild" })).ok, true)
  assert.equal((await restarted.store.getSession(root, "parent")).taskPackage, undefined)
  await restarted.store.resetTaskLock(root, "grandchild")
  assert.equal((await restarted.loadVerifiedSkill({ skill: "extra" }, { sessionID: "grandchild" })).error.code, "APPROVAL_REQUIRED", "parent project grant cannot cross into child")
  assert.equal((await restarted.loadVerifiedSkill({ skill: "example" }, { sessionID: "grandchild" })).ok, true, "session grant survives retirement")
}, "ask"))

test("ancestry cannot rebind live child locks or change parent", async () => fixture(async ({ root, file, runtime }) => {
  await runtime.store.inheritSession(root, "s", "grandchild")
  await runtime.store.setPackage(root, "grandchild", "demo", [])
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "grandchild" })).ok, true)
  await runtime.store.restoreSession(root, "parent")
  await runtime.store.setPackage(root, "parent", "other", [])
  assert.equal((await runtime.loadVerifiedSkill({ skill: "second" }, { sessionID: "parent" })).ok, true)
  const parent = await runtime.store.getSession(root, "parent")
  await runtime.store.inheritSession(root, "parent", "s")
  assert.deepEqual(await runtime.store.getSession(root, "parent"), parent)
  const after = await readFile(file, "utf8")
  await assert.rejects(runtime.store.inheritSession(root, "s", "s"), /itself/)
  assert.equal(await readFile(file, "utf8"), after)
}))

for (const operation of ["load", "grant"]) test(`migrated missing boundary rejects scheduled ${operation} across reset`, async () => fixture(async ({ root, file, runtime }) => {
  await writeFile(file, JSON.stringify({ version: 1, projects: { [root]: { lastSelection: {}, sessions: { s: { packages: { demo: ["extra"], other: [] }, approvedMismatch: [], updatedAt: "old" } } } } }))
  const transaction = runtime.store.verifiedTransaction.bind(runtime.store)
  let arrived!: () => void, release!: () => void
  const waiting = new Promise<void>(resolve => { arrived = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  runtime.store.verifiedTransaction = async (...args) => { arrived(); await gate; return transaction(...args) }
  const pending = operation === "load" ? runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" }) : runtime.grantVerifiedSkill({ skill: "example" }, { sessionID: "s" }, "once")
  await waiting
  await runtime.store.resetTaskLock(root, "s", "new-migrated-task")
  const before = await readFile(file, "utf8")
  release()
  assert.equal((await pending).error.code, "TASK_CHANGED")
  assert.equal(await readFile(file, "utf8"), before)
  runtime.store.verifiedTransaction = transaction
  assert.equal((await runtime.loadVerifiedSkill({ skill: "second" }, { sessionID: "s" })).ok, true)
}))

test("restart session/project scopes; restore resets used/lock and once, revision invalidates grants", async () => fixture(async ({ root, registry, options, runtime }) => {
  await runtime.grantVerifiedSkill({ skill: "example" }, { sessionID: "s" }, "session")
  await runtime.grantVerifiedSkill({ skill: "extra" }, { sessionID: "s" }, "project")
  const restarted = await createRuntime(options)
  assert.equal((await restarted.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).ok, true)
  await restarted.store.restoreSession(root, "new")
  assert.equal((await restarted.loadVerifiedSkill({ skill: "example" }, { sessionID: "new" })).error.code, "APPROVAL_REQUIRED")
  assert.equal((await restarted.loadVerifiedSkill({ skill: "extra" }, { sessionID: "new" })).ok, true)
  const restored = await restarted.store.restoreSession(root, "s")
  assert.equal(restored.taskPackage, undefined)
  assert.deepEqual(restored.verified.locks, [])
  registry.skills.example.maxTokens++
  await writeFile(path.join(root, "registry.json"), JSON.stringify(registry))
  const next = await createRuntime({ ...options, approvedRegistryHash: hashBytes(Buffer.from(JSON.stringify(registry))) })
  assert.deepEqual((await next.store.getSession(root, "s")).verified.grants, [], "registry reconciliation must persist stale grant removal")
  assert.equal((await next.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).error.code, "APPROVAL_REQUIRED")
}, "ask"))

test("multi-skill same package; competing package denied before missing file; duplicate prompt does not unlock", async () => fixture(async ({ root, runtime }) => {
  await runtime.store.resetTaskLock(root, "s", "message-one")
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).ok, true)
  assert.equal((await runtime.loadVerifiedSkill({ skill: "extra" }, { sessionID: "s" })).ok, true)
  await rm(path.join(root, "second/interface.txt"))
  await runtime.store.resetTaskLock(root, "s", "message-one")
  assert.equal((await runtime.loadVerifiedSkill({ skill: "second" }, { sessionID: "s" })).error.code, "TASK_CONFLICT")
  await runtime.store.resetTaskLock(root, "s", "message-two")
  assert.equal((await runtime.loadVerifiedSkill({ skill: "second" }, { sessionID: "s" })).error.code, "FILE_MISSING")
  const session = await runtime.store.getSession(root, "s")
  assert.deepEqual(session.verified.locks, [])
  assert.equal(session.verified.records.length, 2)
}))

test("separate runtime instances and real processes serialize competing package commits", async () => fixture(async ({ root, options, runtime }) => {
  const other = await createRuntime(options)
  const results = await Promise.all([runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" }), other.loadVerifiedSkill({ skill: "second" }, { sessionID: "s" })])
  assert.equal(results.filter(result => result.ok).length, 1)
  await runtime.store.resetTaskLock(root, "s", "process-race")
  const module = new URL("../src/runtime.ts", import.meta.url).href
  const execute = promisify(execFile)
  const environment = { ...process.env }; delete environment.NODE_TEST_CONTEXT
  const processes = await Promise.all(["example", "second"].map(skill => execute(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `import {createRuntime} from ${JSON.stringify(module)};const r=await createRuntime(${JSON.stringify(options)});console.log(JSON.stringify(await r.loadVerifiedSkill({skill:${JSON.stringify(skill)}},{sessionID:'s'})))`], { env: environment, timeout: 1500 })))
  assert.equal(processes.map(result => JSON.parse(result.stdout)).filter(result => result.ok).length, 1)
}))

test("old request crossing a new prompt boundary cannot publish or consume once approval", async () => fixture(async ({ root, file, runtime }) => {
  await runtime.store.resetTaskLock(root, "s", "old-prompt")
  await runtime.grantVerifiedSkill({ skill: "example" }, { sessionID: "s" }, "once")
  // Scheduling gate only: delegate to the real persisted transaction without
  // replacing authorization, filesystem I/O, hashing, or publication behavior.
  const transaction = runtime.store.verifiedTransaction.bind(runtime.store)
  let arrived!: () => void, release!: () => void
  const waiting = new Promise<void>(resolve => { arrived = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  runtime.store.verifiedTransaction = async (...args) => {
    arrived(); await gate
    return transaction(...args)
  }
  const old = runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })
  await waiting
  await runtime.store.resetTaskLock(root, "s", "new-prompt")
  const before = await readFile(file, "utf8")
  release()
  assert.equal((await old).error.code, "TASK_CHANGED")
  assert.equal(await readFile(file, "utf8"), before)
  runtime.store.verifiedTransaction = transaction
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).error.code, "APPROVAL_REQUIRED")
  await runtime.grantVerifiedSkill({ skill: "second" }, { sessionID: "s" }, "once")
  assert.equal((await runtime.loadVerifiedSkill({ skill: "second" }, { sessionID: "s" })).ok, true)
  await runtime.store.resetTaskLock(root, "s", "new-prompt")
  assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).error.code, "APPROVAL_REQUIRED")
  assert.equal((await runtime.store.getSession(root, "s")).verified.locks[0].owner, "other")
}, "ask"))

test("migration preserves valid selection only, corruption is preserved; bounded history", async () => fixture(async ({ root, file, registry, runtime }) => {
  await writeFile(file, JSON.stringify({ version: 1, projects: { [root]: { lastSelection: { demo: ["extra", "obsolete"] }, sessions: { old: { packages: { demo: ["extra", "obsolete"] }, approvedMismatch: [], updatedAt: "old", taskPackage: "demo", taskLoadedSkills: ["example"] } } } } }))
  await runtime.store.reconcileRegistry(root, runtime.registry)
  const old = await runtime.store.getSession(root, "old")
  assert.deepEqual(old.packages, { demo: ["extra"] })
  assert.equal(old.taskPackage, undefined)
  await runtime.store.restoreSession(root, "s")
  for (let n = 0; n < 22; n++) assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).ok, true)
  assert.equal((await runtime.store.getSession(root, "s")).verified.records.length, 20)
  for (const content of ["{broken", '{"version":2,"projects":{"p":{"lastSelection":{},"sessions":{"s":{"packages":{},"approvedMismatch":[],"updatedAt":"x","verified":{"grants":[{}],"records":[],"locks":[]}}}}}}']) {
    await writeFile(file, content)
    await assert.rejects(runtime.store.startSession(root, "bad"), /not valid/)
    assert.equal(await readFile(file, "utf8"), content)
  }
  const loader = createVerifiedLoader({ root, registry, approvedRevision: true })
  loader.grant({ skill: "example" }, { project: root, session: "s", task: "t" }, "session")
  const saved = loader.inspect(); saved.grants[0].owner = "other"
  loader.restore(saved)
  assert.deepEqual(loader.inspect().grants, [])
}))

test("legacy v1/unapproved v2 deny; active local SDK strict request and host config remain independent", async () => fixture(async ({ root, options, runtime }) => {
  const unapproved = await createRuntime({ ...options, approvedRegistryHash: "sha256:" + "0".repeat(64) })
  assert.equal((await unapproved.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).error.code, "UNVERIFIED")
  await writeFile(path.join(root, "registry.json"), JSON.stringify(runtime.registry))
  const legacy = await createRuntime(options)
  assert.equal((await legacy.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).error.code, "UNVERIFIED")
  const previous = { root: process.env.OPENARMS_LIBRARY_ROOT, state: process.env.XDG_STATE_HOME }
  try {
    process.env.OPENARMS_LIBRARY_ROOT = root; process.env.XDG_STATE_HOME = root
    const adapter: any = await SkillRouterServer({ directory: root, worktree: root } as any)
    assert.deepEqual(Object.keys(adapter.tool), ["openarms_usage", "load_skill"])
    const response = JSON.parse(await adapter.tool.load_skill.execute({ skill: "example", extra: "denied" }, { sessionID: "s" }))
    assert.equal(response.error.code, "INVALID_REQUEST")
    const config = JSON.parse(await readFile(new URL("../sandbox/config/opencode.json", import.meta.url), "utf8"))
    // Fixture models only ordered host glob decisions, not a live OpenCode engine.
    const decide = (rules: any, value: string) => Object.entries(rules).reduce((decision, [pattern, action]) => picomatch.isMatch(value, pattern, { dot: true, matchBase: !pattern.includes("/") }) ? action : decision, "ask")
    assert.equal(decide(config.permission.read, "/opt/openarms/external.txt"), "allow")
    assert.equal(decide(config.permission.external_directory, "/opt/openarms/external.txt"), "allow")
    assert.equal(decide(config.permission.read, "/opt/openarms/unregistered/SKILL.md"), "deny")
    assert.equal(decide(config.permission.skill, "unregistered"), "deny")
    assert.equal(decide(config.permission.bash, "cat /opt/openarms/example/SKILL.md"), "deny")
    assert.equal((await legacy.loadVerifiedSkill({ skill: "unregistered" }, { sessionID: "s" })).error.code, "UNKNOWN_SKILL")
  } finally {
    if (previous.root === undefined) delete process.env.OPENARMS_LIBRARY_ROOT; else process.env.OPENARMS_LIBRARY_ROOT = previous.root
    if (previous.state === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous.state
  }
}))
