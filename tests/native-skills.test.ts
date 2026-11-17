import assert from "node:assert/strict"
import { test } from "node:test"
import { setImmediate } from "node:timers/promises"
import { installSkillBrowser, listNativeSkills, parseSkills, skillRequest } from "../src/native-skills.ts"

const skill = { name: "writing", description: "Edit clearly", location: "/library/writing/SKILL.md", content: "Full instructions" }

function fixture() {
  let dialog: any, command: any, dispose = () => {}, draft = "existing task\n", appendCalls = 0, unregisters = 0
  let onClose: (() => void) | undefined
  const toasts: any[] = [], disabled = new Set<string>(), roots: string[] = []
  const controller = new AbortController()
  const state = { path: { directory: "/workspace/subdir", worktree: "/workspace" } }
  const route: { current: { name: string; params?: { sessionID?: string } } } = { current: { name: "session", params: { sessionID: "session-a" } } }
  const store = {
    read: async () => [...disabled],
    set: async (name: string, enabled: boolean) => { if (enabled) disabled.delete(name); else disabled.add(name); return [...disabled] },
  }
  const client = {
    app: { skills: async (_input: any): Promise<any> => ({ data: [skill] }) },
    tui: { appendPrompt: async (input: any, _options?: any): Promise<any> => { appendCalls++; draft += input.text; return { data: true } } },
  }
  const api = {
    client, state, route,
    ui: {
      DialogSelect: (props: any) => props, DialogAlert: (props: any) => props,
      toast: (input: any) => toasts.push(input),
      dialog: {
        replace: (render: any, close?: () => void) => { onClose?.(); onClose = close; dialog = render() },
        clear: () => { const close = onClose; onClose = undefined; dialog = undefined; close?.() },
      },
    },
    keymap: { registerLayer: (layer: any) => { command = layer.commands[0]; return () => { unregisters++ } } },
    lifecycle: { signal: controller.signal, onDispose: (callback: any) => { dispose = callback } },
  }
  installSkillBrowser(api as any, (render, footer) => ({ ...render() as any, footer }), root => { roots.push(root); return store })
  return { api, client, store, disabled, roots, toasts, state, route,
    get dialog() { return dialog }, get command() { return command }, get draft() { return draft },
    get appendCalls() { return appendCalls }, get unregisters() { return unregisters },
    dispose: () => { controller.abort(); dispose() },
    open: async () => { command.run(); await setImmediate() },
  }
}

test("catalog validates, alphabetizes and rejects ambiguous names; requests never inject bodies", () => {
  assert.deepEqual(parseSkills([skill])[0], skill)
  assert.deepEqual(parseSkills([{ ...skill, name: "z" }, { ...skill, name: "a" }]).map(s => s.name), ["a", "z"])
  for (const input of [null, {}, "bad"]) assert.throws(() => parseSkills(input), /catalog/)
  for (const input of [null, {}, { ...skill, name: "" }, { ...skill, name: "bad\nname" }, { ...skill, content: undefined }, { ...skill, description: 3 }]) {
    assert.match(parseSkills([input])[0].error!, /metadata/)
  }
  assert.ok(parseSkills([skill, skill]).every(s => s.error?.includes("Duplicate")))
  assert.throws(() => skillRequest({ ...skill, error: "invalid" }), /invalid/)
  assert.match(skillRequest(skill), /native skill tool to load "writing"/)
  assert.doesNotMatch(skillRequest(skill), /Full instructions/)
})

test("catalog errors are safe and distinct, with no filesystem discovery fallback", async () => {
  let scoped: unknown
  await listNativeSkills({ app: { skills: async (input: unknown) => { scoped = input; return { data: [] } } } } as any, "/workspace")
  assert.deepEqual(scoped, { directory: "/workspace" })
  const cases = [
    [{}, "CATALOG_UNSUPPORTED"],
    [{ app: { skills: async () => { throw Error("secret") } } }, "CATALOG_CONNECTION_FAILED"],
    [{ app: { skills: async () => ({ error: { message: "secret" } }) } }, "CATALOG_REJECTED"],
    ...[null, {}, { data: null }, { data: {} }].map(value => [{ app: { skills: async () => value } }, "CATALOG_INVALID_RESPONSE"]),
  ] as const
  for (const [client, code] of cases) {
    await assert.rejects(() => listNativeSkills(client as any, "/workspace"), (error: any) => {
      assert.equal(error.code, code); assert.doesNotMatch(error.message, /secret/); return true
    })
  }
})

test("browser shows only sorted names, no descriptions/content/packages; exactly ON OFF REQUEST", async () => {
  const f = fixture()
  f.client.app.skills = async () => ({ data: [{ ...skill, name: "z" }, { ...skill, name: "a" }] })
  await f.open()
  assert.equal(f.command.slashName, "arms-skills")
  assert.equal(f.command.name, "openarms.skills")
  assert.deepEqual(f.dialog.options, [{ title: "a", value: 0 }, { title: "z", value: 1 }])
  f.dialog.onSelect({ value: 0 })
  assert.equal(f.dialog.title, "a · ON")
  assert.equal(f.dialog.skipFilter, true)
  assert.deepEqual(f.dialog.options.map((s: any) => s.title), ["ON", "OFF", "REQUEST"])
  assert.doesNotMatch(JSON.stringify(f.dialog), /Full instructions|Edit clearly|Inspect|Preview/)
  assert.deepEqual(f.roots, ["/workspace"])
})

test("all browser dialogs expose Back and Done; actions Back returns to names and root Back closes", async () => {
  const f = fixture()
  await f.open()
  const list = f.dialog
  assert.deepEqual(Object.keys(list.footer).sort(), ["back", "done"])
  list.onSelect({ value: 0 })
  const actions = f.dialog
  actions.footer.back()
  assert.equal(f.dialog.title, "OpenArms skills")
  assert.deepEqual(f.dialog.options, [{ title: "writing", value: 0 }])
  // A callback from a replaced view must not close/navigate the new one.
  actions.footer.done()
  assert.equal(f.dialog.title, "OpenArms skills")
  f.dialog.footer.back()
  assert.equal(f.dialog, undefined)
  list.onSelect({ value: 0 })
  assert.equal(f.dialog, undefined)
  await f.open(); (f.dialog as any).footer.done()
  assert.equal(f.dialog, undefined)
  assert.equal(f.draft, "existing task\n")
  assert.equal(f.disabled.size, 0)

  for (const button of ["back", "done"]) {
    const empty = fixture()
    empty.client.app.skills = async () => ({ data: [] })
    await empty.open()
    assert.match(empty.dialog.message, /No skills/)
    empty.dialog.footer[button]()
    assert.equal(empty.dialog, undefined)
  }
})

test("Done preserves saved preferences; Back/Done cannot reopen after dispose", async () => {
  const f = fixture()
  await f.open(); f.dialog.onSelect({ value: 0 })
  f.dialog.onSelect({ value: "off" }); await setImmediate()
  const actions = f.dialog
  actions.footer.done()
  assert.equal(f.dialog, undefined)
  assert.ok(f.disabled.has("writing"))
  actions.onSelect({ value: "on" }); await setImmediate()
  assert.ok(f.disabled.has("writing"))
  await f.open()
  const list: any = f.dialog
  f.dispose()
  list.footer.done(); list.footer.back()
  assert.equal(f.dialog, list)
})

test("navigation during request revalidation stops append; in-flight writes do not reopen after Done/Escape", async () => {
  const request = fixture()
  await request.open(); request.dialog.onSelect({ value: 0 })
  let resolveCatalog: any
  request.client.app.skills = () => new Promise(r => { resolveCatalog = r })
  request.dialog.onSelect({ value: "request" })
  request.dialog.footer.back()
  resolveCatalog({ data: [skill] }); await setImmediate()
  assert.equal(request.appendCalls, 0)
  assert.equal(request.dialog.title, "OpenArms skills")

  for (const kind of ["done", "escape"]) {
    const f = fixture()
    await f.open(); f.dialog.onSelect({ value: 0 })
    let resolve: any
    f.store.set = () => new Promise(r => { resolve = r })
    f.dialog.onSelect({ value: "off" }); await setImmediate()
    if (kind === "done") f.dialog.footer.done()
    else f.api.ui.dialog.clear()
    resolve(["writing"]); await setImmediate()
    assert.equal(f.dialog, undefined)
    assert.ok(!f.toasts.some(t => t.variant === "info"))
  }
})

test("Done while append is in flight cannot clear another host dialog when the result arrives", async () => {
  const f = fixture()
  await f.open(); f.dialog.onSelect({ value: 0 })
  let resolve: any
  f.client.tui.appendPrompt = () => new Promise(r => { resolve = r })
  f.dialog.onSelect({ value: "request" }); await setImmediate()
  f.dialog.footer.done()
  f.api.ui.dialog.replace(() => ({ title: "Unrelated" }))
  resolve({ data: true }); await setImmediate()
  assert.equal(f.dialog.title, "Unrelated")
  assert.ok(!f.toasts.some(t => t.title === "Skill request appended"))
})

test("OFF persists per project, disables REQUEST; ON removes only the OpenArms restriction", async () => {
  const f = fixture()
  await f.open(); f.dialog.onSelect({ value: 0 })
  f.dialog.onSelect({ value: "off" }); await setImmediate()
  assert.ok(f.disabled.has("writing"))
  assert.equal(f.dialog.title, "writing · OFF")
  assert.deepEqual(f.dialog.options.map((option: any) => option.title), ["ON", "OFF", "REQUEST"]) // Host hides disabled rows.
  f.dialog.onSelect({ value: "request" }); await setImmediate()
  assert.equal(f.appendCalls, 0)
  assert.match(f.toasts.at(-1).message, /SKILL_OFF/)
  f.dialog.onSelect({ value: "on" }); await setImmediate()
  assert.equal(f.disabled.size, 0)
  assert.equal(f.dialog.title, "writing · ON")
  assert.match(f.toasts.at(-1).message, /Restart.*existing host denies/)
  assert.equal(f.draft, "existing task\n")
})

test("request appends without reset/submit and rechecks preferences changed by another client", async () => {
  const f = fixture()
  await f.open(); f.dialog.onSelect({ value: 0 })
  f.disabled.add("writing")
  f.dialog.onSelect({ value: "request" }); await setImmediate()
  assert.equal(f.appendCalls, 0)
  f.disabled.clear()
  f.dialog.onSelect({ value: "request" }); await setImmediate()
  assert.ok(f.draft.startsWith("existing task\n"))
  assert.match(f.draft, /native skill tool to load "writing"/)
  assert.equal(f.appendCalls, 1)
  assert.equal(f.dialog, undefined)
  f.dispose(); assert.equal(f.unregisters, 1)
})

test("unreadable policy fails closed for list/request; failed writes do not show success", async () => {
  for (const action of ["list", "request", "off"]) {
    const f = fixture()
    if (action !== "list") { await f.open(); f.dialog.onSelect({ value: 0 }) }
    if (action === "off") f.store.set = async () => { throw Error("secret storage detail") }
    else f.store.read = async () => { throw Error("secret policy detail") }
    if (action === "list") await f.open()
    else { f.dialog.onSelect({ value: action }); await setImmediate() }
    assert.equal(f.appendCalls, 0)
    assert.match(f.toasts.at(-1).message, /POLICY_(?:READ|WRITE)_FAILED/)
    assert.doesNotMatch(JSON.stringify(f.toasts), /secret/)
    assert.ok(!f.toasts.some(t => t.variant === "info"))
  }
})

test("stale list/action callbacks and disposed browser cannot append or toggle", async () => {
  for (const stage of ["list", "request", "off", "on"]) {
    for (const change of ["session", "directory", "worktree", "dispose"]) {
      const f = fixture()
      await f.open()
      if (stage !== "list") f.dialog.onSelect({ value: 0 })
      const old = f.dialog
      if (change === "session") f.route.current = { name: "session", params: { sessionID: "session-b" } }
      if (change === "directory") f.state.path.directory = "/other"
      if (change === "worktree") f.state.path.worktree = "/other"
      if (change === "dispose") f.dispose()
      old.onSelect({ value: stage === "list" ? 0 : stage }); await setImmediate()
      assert.equal(f.dialog, old)
      assert.equal(f.appendCalls, 0)
      assert.equal(f.disabled.size, 0)
    }
  }
})

test("route/dispose changes during discovery and policy read do not open stale UI", async () => {
  for (const stage of ["catalog", "policy"]) {
    const f = fixture()
    let resolve: any
    if (stage === "catalog") f.client.app.skills = () => new Promise(r => { resolve = r })
    else f.store.read = () => new Promise(r => { resolve = r })
    f.command.run(); await setImmediate()
    f.route.current = { name: "session", params: { sessionID: "session-b" } }
    resolve(stage === "catalog" ? { data: [skill] } : []); await setImmediate()
    assert.equal(f.dialog, undefined)
  }
})

test("revalidation rejects removed/changed/malformed skills before mutation or append", async () => {
  for (const value of [[], [{ ...skill, location: "/changed" }], [{ ...skill, content: undefined }]]) {
    for (const action of ["request", "off"]) {
      const f = fixture()
      await f.open(); f.dialog.onSelect({ value: 0 })
      f.client.app.skills = async () => ({ data: value })
      f.dialog.onSelect({ value: action }); await setImmediate()
      assert.equal(f.appendCalls, 0); assert.equal(f.disabled.size, 0)
      assert.match(f.toasts.at(-1).message, /SKILL_CHANGED/)
    }
  }
})

test("revalidation in flight cannot mutate after target changes", async () => {
  for (const action of ["request", "off"]) {
    const f = fixture()
    await f.open(); f.dialog.onSelect({ value: 0 })
    let resolve: any
    f.client.app.skills = () => new Promise(r => { resolve = r })
    f.dialog.onSelect({ value: action })
    f.route.current = { name: "home" }
    resolve({ data: [skill] }); await setImmediate()
    assert.equal(f.appendCalls, 0); assert.equal(f.disabled.size, 0)
  }
})

test("an in-flight preference save stays bound to the original project and does not clear new UI", async () => {
  const f = fixture()
  await f.open(); f.dialog.onSelect({ value: 0 })
  const old = f.dialog
  let resolve: any
  f.store.set = () => new Promise(r => { resolve = r })
  f.dialog.onSelect({ value: "off" }); await setImmediate()
  f.state.path.worktree = "/other"
  resolve(["writing"]); await setImmediate()
  assert.equal(f.dialog, old)
  assert.ok(!f.toasts.some(t => t.variant === "info"))
  assert.deepEqual(f.roots, ["/workspace"])
})

test("in-flight append is uncertain on route changes or false/error results; never retries", async () => {
  for (const kind of ["route", "false", "error", "throw"]) {
    const f = fixture()
    await f.open(); f.dialog.onSelect({ value: 0 })
    const old = f.dialog
    let resolve: any, calls = 0
    f.client.tui.appendPrompt = (input: any, options: any) => {
      calls++; assert.equal(input.directory, "/workspace/subdir"); assert.equal(options.signal, f.api.lifecycle.signal)
      if (kind === "throw") throw Error("secret append body")
      return new Promise(r => { resolve = r })
    }
    f.dialog.onSelect({ value: "request" }); await setImmediate()
    if (kind === "route") f.route.current = { name: "home" }
    if (kind !== "throw") resolve(kind === "false" ? { data: false } : kind === "error" ? { error: {} } : { data: true })
    await setImmediate()
    assert.equal(calls, 1); assert.equal(f.dialog, old)
    assert.match(f.toasts.at(-1).message, /APPEND_UNCONFIRMED/)
    assert.doesNotMatch(JSON.stringify(f.toasts), /secret/)
  }
})

test("home is a valid request target; unrelated routes cannot start the browser", async () => {
  const f = fixture()
  f.route.current = { name: "home" }
  await f.open(); f.dialog.onSelect({ value: 0 }); f.dialog.onSelect({ value: "request" }); await setImmediate()
  assert.equal(f.appendCalls, 1)
  for (const route of [{ name: "settings" }, { name: "session" }]) {
    const other = fixture(); other.route.current = route; await other.open()
    assert.equal(other.dialog, undefined)
    assert.match(other.toasts.at(-1).message, /DRAFT_TARGET_UNAVAILABLE/)
  }
})

test("invalid catalog rows retain all three rows but cannot execute any action", async () => {
  const f = fixture()
  f.client.app.skills = async () => ({ data: [{ ...skill, content: undefined }] })
  await f.open(); f.dialog.onSelect({ value: 0 })
  assert.match(f.dialog.title, /ERROR/)
  assert.deepEqual(f.dialog.options.map((option: any) => option.title), ["ON", "OFF", "REQUEST"])
  for (const action of ["on", "off", "request"]) { f.dialog.onSelect({ value: action }); await setImmediate() }
  assert.equal(f.disabled.size, 0)
  assert.equal(f.appendCalls, 0)
})
