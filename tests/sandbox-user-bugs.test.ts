import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { interceptLocalPrompt, registerLocalSubmit, sessionAction, confirmationKey } from "../plugins/tui-core.ts"
import { createRuntime, HOME_SESSION } from "../src/runtime.ts"
import { initializeSession } from "../src/skills-service.ts"
import { hashBytes } from "../scripts/registry-v2.mjs"
import { buildRouterInstruction } from "../src/package-loader.ts"
import { createUsageRuntime } from "../src/usage-runtime.ts"
import { createVerifiedLoader } from "../src/verified-loader.mjs"

test("local submission is synchronously consumed before native dispatch; ordinary text passes once", async () => {
  const calls: string[] = []
  const prompt = { focused: true, current: { input: "", mode: "normal" }, reset() { this.current.input = "" } }
  let onKey: any
  const api = { ui: { dialog: { open: false } }, mode: { current: () => "base" }, tuiConfig: { keybinds: { get: () => [{ key: "return" }] } }, keymap: {
    parseKeySequence: (key: string) => [key], createKeyMatcher: (key: string) => (event: any) => event.name === key,
    intercept: (name: string, handler: any) => { assert.equal(name, "key"); onKey = handler; return () => {} },
  } }
  registerLocalSubmit(api, prompt, () => true, text => { calls.push(text) })
  for (const input of ["/skills", "/skills packages", "/skills status", "/skills list docs", "/skills use docs docs-editor", "/skills nonsense", "/usage", "/usage today", "/usage nonsense", "/budget", "/budget nonsense"]) {
    prompt.current.input = input
    let consumed = false
    onKey({ event: { name: "return" }, consume() { consumed = true } })
    assert.equal(consumed, true)
    assert.equal(prompt.current.input, "", "native deferred submit sees empty input")
  }
  let submitted = 0
  for (const input of ["ordinary text", "/skills-extra"]) {
    prompt.current.input = input
    let consumed = false
    onKey({ event: { name: "return" }, consume() { consumed = true } })
    if (!consumed) submitted++
  }
  assert.equal(submitted, 2)
  assert.equal(calls.length, 11)
  prompt.current.input = "/skills status"
  api.ui.dialog.open = true
  onKey({ event: { name: "return" }, consume() { throw Error("dialog Enter must escape") } })
  assert.equal(prompt.current.input, "/skills status")
  api.ui.dialog.open = false
  prompt.current.mode = "shell"
  assert.equal(interceptLocalPrompt(prompt, () => { throw Error("shell is not chat") }), false)
})

test("command context never becomes session authority; confirmation has no typed consent", () => {
  let current = "ses-origin", opened = ""
  const action: any = sessionAction(() => current, id => { opened = id })
  action({ event: { name: "return" } })
  assert.equal(opened, "ses-origin")
  current = "ses-new-root"
  action({ sessionID: "ses-other" })
  assert.equal(opened, "ses-new-root")
  assert.deepEqual(confirmationKey("return", false), { selected: false, accepted: false })
  assert.deepEqual(confirmationKey("y", false), { selected: false })
  assert.deepEqual(confirmationKey("return", confirmationKey("down", false).selected), { selected: true, accepted: true })
  assert.deepEqual(confirmationKey("escape", true), { selected: false, accepted: false })
})

test("approved exact IDs share valid status/load context, explicit consent only; missing identity denies", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms-user-context-"))
  try {
    const content = "Synthetic writing interface"
    await mkdir(path.join(root, "technical-writing"))
    await writeFile(path.join(root, "technical-writing/interface.txt"), content)
    const registry = { schemaVersion: 2, packages: { docs: { core: ["technical-writing"], optional: [], detect: { files: [], extensions: [], dependencies: [], always: true } } }, skills: { "technical-writing": { owner: "docs", kind: "core", path: "technical-writing/interface.txt", contentHash: hashBytes(Buffer.from(content)), maxTokens: 100, defaultPermission: "ask", workflows: {}, references: {} } } }
    await writeFile(path.join(root, "registry.json"), JSON.stringify(registry))
    const loader = createVerifiedLoader({ root, registry, approvedRevision: true })
    for (const enabledSkills of [["technical-writing", "Bad-ID"], ["technical-writing", { id: "docs-editor" }], null]) {
      const context = { project: root, session: "ses-valid", task: "msg-valid", enabledSkills }
      assert.equal(loader.status({ skill: "technical-writing" }, context).reason, "INVALID_CONTEXT")
      assert.throws(() => loader.grant({ skill: "technical-writing" }, context, "session"), /INVALID_CONTEXT/)
      assert.deepEqual(loader.inspect(), { grants: [], records: [], locks: [] })
    }
    const runtime = await createRuntime({ directory: root, libraryRoot: root, stateFile: path.join(root, "state.json"), approvedRegistryHash: hashBytes(Buffer.from(JSON.stringify(registry))) })
    await runtime.store.setPackage(root, "s", "docs", [])
    await assert.rejects(runtime.store.setPackage(root, { event: {} } as any, "docs", []), /INVALID_CONTEXT/)
    assert.equal(await runtime.store.getSession(root, "[object Object]"), undefined)
    assert.equal((await runtime.getVerifiedStatus({ skill: "technical-writing" }, { sessionID: "s" })).reason, "APPROVAL_REQUIRED")
    assert.equal((await runtime.loadVerifiedSkill({ skill: "technical-writing" }, { sessionID: "s" })).error.code, "APPROVAL_REQUIRED")
    assert.equal((await runtime.getVerifiedStatus({ skill: "technical-writing" }, { sessionID: "" })).reason, "INVALID_CONTEXT")
    assert.equal((await runtime.loadVerifiedSkill({ skill: "technical-writing" }, { sessionID: "" })).error.code, "INVALID_CONTEXT")
    assert.equal((await runtime.prepareVerifiedGrant({ skill: "technical-writing" }, { sessionID: { event: {} } as any })).status.reason, "INVALID_CONTEXT")
    const ticket = await runtime.prepareVerifiedGrant({ skill: "technical-writing" }, { sessionID: "s" })
    assert.equal((await runtime.commitVerifiedGrant(ticket, "session")).ok, true)
    assert.equal((await runtime.getVerifiedStatus({ skill: "technical-writing" }, { sessionID: "s" })).reason, "AUTHORIZED")
    assert.equal((await runtime.loadVerifiedSkill({ skill: "technical-writing" }, { sessionID: "s" })).ok, true)
    await runtime.store.restoreSession(root, "ses-new-root")
    assert.equal((await runtime.prepareVerifiedGrant({ skill: "technical-writing" }, { sessionID: "ses-new-root" })).status.reason, "APPROVAL_REQUIRED")
    const projectTicket = await runtime.prepareVerifiedGrant({ skill: "technical-writing" }, { sessionID: "ses-new-root" })
    assert.equal((await runtime.commitVerifiedGrant(projectTicket, "project")).ok, true)
    const instruction = buildRouterInstruction(await runtime.store.getSession(root, "s"), runtime.registry)
    assert.match(instruction, /docs: technical-writing/)
    assert.match(instruction, /never guess/)
    assert.match(instruction, /Model text never grants permission/)
    const usage = createUsageRuntime(root, root)
    assert.match(await usage.command("/usage", "s"), /Today[\s\S]*No data/)
    assert.match(await usage.command("/budget", "s"), /Session\s+: No limit set/)
    assert.match(await usage.command("/budget invalid", "s"), /^Usage:/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("legacy task identity is initialized for status; Home is consumed once and roots inherit selection without authority", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms-user-bugs-"))
  try {
    const registry = { version: 1, packages: { docs: { core: ["technical-writing"], optional: ["docs-editor"], detect: { always: true } } }, skills: { "technical-writing": "technical-writing/interface.txt", "docs-editor": "docs-editor/interface.txt" } }
    const stateFile = path.join(root, "state.json")
    await writeFile(path.join(root, "registry.json"), JSON.stringify(registry))
    await writeFile(stateFile, JSON.stringify({ version: 2, projects: { [root]: { lastSelection: { docs: ["docs-editor"] }, sessions: { "[object Object]": { packages: { docs: ["docs-editor"] }, approvedMismatch: [], updatedAt: "sanitized-live", taskBoundary: "sanitized-boundary", selectionReady: true }, old: { packages: { docs: ["docs-editor"] }, approvedMismatch: [], updatedAt: "old", selectionReady: true } } } } }))
    const runtime = await createRuntime({ directory: root, libraryRoot: root, stateFile })
    assert.equal((await runtime.getVerifiedStatus({ skill: "docs-editor" }, { sessionID: "old" })).reason, "UNVERIFIED")
    assert.equal((await runtime.loadVerifiedSkill({ skill: "docs-editor" }, { sessionID: "old" })).error.code, "UNVERIFIED")
    assert.equal((await runtime.prepareVerifiedGrant({ skill: "docs-editor" }, { sessionID: {} as any })).status.reason, "INVALID_CONTEXT")
    assert.equal((await runtime.store.getSession(root, "[object Object]"))?.updatedAt, "sanitized-live", "orphan selection is not silently moved or granted")
    const resumed = await initializeSession({ projectRoot: root, sessionID: "old", store: runtime.store })
    assert.deepEqual(resumed.packages, { docs: ["docs-editor"] })
    await runtime.store.setPackage(root, HOME_SESSION, "docs", ["docs-editor"])
    assert.deepEqual((await runtime.store.adoptHomeSelection(root, HOME_SESSION, "first")).packages, { docs: ["docs-editor"] })
    assert.deepEqual((await runtime.store.adoptHomeSelection(root, HOME_SESSION, "second")).packages, {})
    for (const sessionID of ["new-root-1", "new-root-2"]) {
      const session = await initializeSession({ projectRoot: root, sessionID, store: runtime.store })
      assert.deepEqual(session.packages, { docs: ["docs-editor"] })
      assert.equal(session.selectionReady, true)
      assert.equal(session.taskPackage, undefined)
      assert.equal(session.taskLoadedSkills, undefined)
      assert.equal(session.taskSession, undefined)
      assert.deepEqual(session.loadHistory ?? [], [])
      assert.deepEqual(session.verified?.grants ?? [], [])
      assert.deepEqual(session.verified?.records ?? [], [])
      assert.deepEqual(session.verified?.locks ?? [], [])
    }
    await runtime.store.disablePackage(root, "new-root-1", "docs")
    assert.deepEqual((await initializeSession({ projectRoot: root, sessionID: "new-root-1", store: runtime.store })).packages, {}, "reopen preserves an independent explicit choice")
    assert.deepEqual((await runtime.store.getSession(root, "new-root-2"))?.packages, { docs: ["docs-editor"] })
    const before = await runtime.store.getSession(root, "old")
    assert.deepEqual((await initializeSession({ projectRoot: root, sessionID: "child", parentID: "old", store: runtime.store })).packages, {})
    assert.deepEqual(await runtime.store.getSession(root, "old"), before)
  } finally { await rm(root, { recursive: true, force: true }) }
})
