import assert from "node:assert/strict"
import { test } from "node:test"
import { setImmediate } from "node:timers/promises"
import { excerpt, installSkillBrowser, listNativeSkills, parseSkills, skillRequest } from "../src/native-skills.ts"

const skill = { name: "writing", description: "Edit clearly", location: "/library/writing/SKILL.md", content: "Full instructions" }

test("catalog validates metadata, sorts entries and rejects ambiguous names", () => {
  assert.deepEqual(parseSkills([skill])[0], skill)
  assert.deepEqual(parseSkills([{ ...skill, name: "z" }, { ...skill, name: "a" }]).map(s => s.name), ["a", "z"])
  for (const input of [null, {}, "bad"]) assert.throws(() => parseSkills(input), /catalog/)
  for (const input of [null, {}, { ...skill, name: "" }, { ...skill, name: "bad\nname" }, { ...skill, content: undefined }, { ...skill, description: 3 }]) {
    assert.match(parseSkills([input])[0].error!, /metadata/)
  }
  const duplicates = parseSkills([skill, { ...skill, location: "/other" }])
  assert.ok(duplicates.every(s => s.error?.includes("Duplicate")))
  assert.throws(() => skillRequest(duplicates[0]), /Duplicate/)
  assert.match(skillRequest(skill), /native skill tool to load "writing"/)
  assert.ok(!excerpt("🙂".repeat(10000)).includes("�"))
})

test("native catalog uses scoped host API and does not fall back to a filesystem scanner", async () => {
  let parameters: unknown
  const client = { app: { skills: async (input: unknown) => { parameters = input; return { data: [skill] } } } } as any
  assert.equal((await listNativeSkills(client, "/workspace"))[0].name, "writing")
  assert.deepEqual(parameters, { directory: "/workspace" })
  await assert.rejects(() => listNativeSkills({} as any, "/workspace"), /upgrade/)
  await assert.rejects(() => listNativeSkills({ app: { skills: async () => ({ error: { message: "secret" } }) } } as any, "/workspace"), /unavailable/)
  assert.deepEqual(await listNativeSkills({ app: { skills: async () => ({ data: [] }) } } as any, "/workspace"), [])
})

function fixture() {
  let dialog: any, command: any, dispose = () => {}, draft = "existing task\n", unregistered = 0
  const toasts: any[] = []
  const state = { path: { directory: "/workspace" } }
  let appendCalls = 0
  const controller = new AbortController()
  const route: { current: { name: string; params?: { sessionID?: string } } } = {
    current: { name: "session", params: { sessionID: "session-a" } },
  }
  const client: { app: { skills: (...args: any[]) => Promise<any> }; tui: { appendPrompt: (...args: any[]) => Promise<any> } } = {
    app: { skills: async (_input: any) => ({ data: [skill] }) },
    tui: { appendPrompt: async (input: any) => { appendCalls++; draft += input.text; return { data: true } } },
  }
  const api = {
    client, state, route,
    ui: {
      DialogSelect: (props: any) => props,
      DialogAlert: (props: any) => props,
      toast: (input: any) => toasts.push(input),
      dialog: { replace: (render: any) => { dialog = render() }, clear: () => { dialog = undefined } },
    },
    keymap: { registerLayer: (layer: any) => { command = layer.commands[0]; return () => { unregistered++ } } },
    lifecycle: { signal: controller.signal, onDispose: (callback: any) => { dispose = callback } },
  }
  installSkillBrowser(api as any)
  return { api, client, state, toasts, get dialog() { return dialog }, get command() { return command },
    get draft() { return draft }, get appendCalls() { return appendCalls },
    dispose: () => { controller.abort(); dispose() }, get unregistered() { return unregistered } }
}

test("browser lists, inspects and appends a request without resetting or submitting the draft", async () => {
  const f = fixture()
  assert.equal(f.command.slashName, "skills")
  f.command.run(); await setImmediate()
  assert.equal(f.dialog.options[0].title, "writing")
  assert.doesNotMatch(JSON.stringify(f.dialog.options), /Full instructions|OFF|grant/)
  f.dialog.onSelect({ value: 0 })
  f.dialog.onSelect({ value: "inspect" })
  assert.match(f.dialog.message, /Full instructions/)
  f.dialog.onConfirm()
  f.dialog.onSelect({ value: "request" }); await setImmediate()
  assert.ok(f.draft.startsWith("existing task\n"))
  assert.match(f.draft, /native skill tool to load "writing"/)
  assert.doesNotMatch(f.draft, /Full instructions/)
  assert.equal(f.dialog, undefined)
  f.dispose(); assert.equal(f.unregistered, 1)
})

test("removed or malformed skills cannot be requested; host errors surface without raw details", async () => {
  const f = fixture()
  f.command.run(); await setImmediate()
  f.dialog.onSelect({ value: 0 })
  f.client.app.skills = async () => ({ data: [] })
  f.dialog.onSelect({ value: "request" }); await setImmediate()
  assert.equal(f.draft, "existing task\n")
  assert.match(f.toasts.at(-1).message, /SKILL_CHANGED/)
  f.client.app.skills = async () => { throw Error("credential body must not leak") }
  f.command.run(); await setImmediate()
  assert.match(f.toasts.at(-1).message, /Cannot load/)
  assert.doesNotMatch(JSON.stringify(f.toasts), /credential body/)
})

test("dispose or directory changes during discovery do not open stale UI", async () => {
  for (const action of ["dispose", "directory"] as const) {
    const f = fixture()
    let resolve: any
    f.client.app.skills = () => new Promise(r => { resolve = r })
    f.command.run()
    if (action === "dispose") f.dispose()
    else f.state.path.directory = "/other"
    resolve({ data: [skill] }); await setImmediate()
    assert.equal(f.dialog, undefined)
    assert.equal(f.draft, "existing task\n")
  }
})

test("false append result is an error, not a successful request", async () => {
  const f = fixture()
  f.command.run(); await setImmediate()
  f.dialog.onSelect({ value: 0 })
  f.client.tui.appendPrompt = async () => ({ data: false })
  f.dialog.onSelect({ value: "request" }); await setImmediate()
  assert.match(f.toasts.at(-1).message, /APPEND_UNCONFIRMED/)
  assert.equal(f.draft, "existing task\n")
})

test("preview preserves Markdown, blank lines and tabs while labels stay single-line", async () => {
  const f = fixture()
  const content = "# Heading\r\n\r\n```ts\r\n\tconst n = 1\r\n```\r\n\x1b[31mred\x1b[0m\x00"
  f.client.app.skills = async () => ({ data: [{ ...skill, description: "First\nsecond\tpart", content }] })
  f.command.run(); await setImmediate()
  assert.doesNotMatch(f.dialog.options[0].description, /[\n\t\r\x1b]/)
  f.dialog.onSelect({ value: 0 })
  f.dialog.onSelect({ value: "inspect" })
  assert.ok(f.dialog.message.includes("First\nsecond\tpart"))
  assert.ok(f.dialog.message.includes("# Heading\n\n```ts\n\tconst n = 1\n```\nred"))
  assert.doesNotMatch(f.dialog.message, /[\r\x1b\x00]/)
})

test("catalog failures have distinct safe codes for unsupported API, transport, rejection and invalid responses", async () => {
  const cases = [
    { code: "CATALOG_UNSUPPORTED", client: {} },
    { code: "CATALOG_CONNECTION_FAILED", client: { app: { skills: async () => { throw Error("secret transport body") } } } },
    { code: "CATALOG_REJECTED", client: { app: { skills: async () => ({ error: { message: "secret rejected body" } }) } } },
    ...[null, {}, { data: null }, { data: {} }].map(response => ({
      code: "CATALOG_INVALID_RESPONSE", client: { app: { skills: async () => response } },
    })),
  ]
  for (const { code, client } of cases) {
    await assert.rejects(() => listNativeSkills(client as any, "/workspace"), (error: any) => {
      assert.equal(error.code, code)
      assert.doesNotMatch(error.message, /secret/)
      return true
    })
  }
})

test("browser surfaces catalog categories without leaking exception or response bodies", async () => {
  for (const kind of ["unsupported", "connection", "rejected", "invalid"] as const) {
    const f = fixture()
    if (kind === "unsupported") delete (f.client.app as any).skills
    if (kind === "connection") f.client.app.skills = async () => { throw Error("secret exception body") }
    if (kind === "rejected") f.client.app.skills = async () => ({ error: { message: "secret response body" } })
    if (kind === "invalid") f.client.app.skills = async () => ({ data: "secret invalid body" })
    f.command.run(); await setImmediate()
    const code = { unsupported: "CATALOG_UNSUPPORTED", connection: "CATALOG_CONNECTION_FAILED", rejected: "CATALOG_REJECTED", invalid: "CATALOG_INVALID_RESPONSE" }[kind]
    assert.ok(f.toasts.at(-1).message.includes(code))
    assert.doesNotMatch(JSON.stringify(f.toasts), /secret/)
    assert.equal(f.dialog, undefined)
  }
})

test("session change during initial catalog fetch does not open stale UI", async () => {
  const f = fixture()
  let resolve: any
  f.client.app.skills = () => new Promise(r => { resolve = r })
  f.command.run()
  f.api.route.current = { name: "session", params: { sessionID: "session-b" } }
  resolve({ data: [skill] }); await setImmediate()
  assert.equal(f.dialog, undefined)
  assert.match(f.toasts.at(-1).message, /DRAFT_TARGET_CHANGED/)
  assert.equal(f.appendCalls, 0)
})

test("session changes after opening the browser reject old selection and preview callbacks", async () => {
  for (const stage of ["list", "actions", "preview"] as const) {
    const f = fixture()
    f.command.run(); await setImmediate()
    if (stage !== "list") f.dialog.onSelect({ value: 0 })
    if (stage === "preview") f.dialog.onSelect({ value: "inspect" })
    const oldDialog = f.dialog
    f.api.route.current = { name: "session", params: { sessionID: "session-b" } }
    if (stage === "preview") oldDialog.onConfirm()
    else oldDialog.onSelect({ value: stage === "list" ? 0 : "request" })
    await setImmediate()
    assert.equal(f.dialog, oldDialog)
    assert.match(f.toasts.at(-1).message, /DRAFT_TARGET_CHANGED/)
    assert.equal(f.appendCalls, 0)
    assert.equal(f.draft, "existing task\n")
  }
})

test("session, home and directory changes during request revalidation prevent append", async () => {
  for (const change of ["session", "home", "directory", "dispose"] as const) {
    const f = fixture()
    f.command.run(); await setImmediate()
    f.dialog.onSelect({ value: 0 })
    let resolve: any
    f.client.app.skills = () => new Promise(r => { resolve = r })
    f.dialog.onSelect({ value: "request" })
    if (change === "session") f.api.route.current = { name: "session", params: { sessionID: "session-b" } }
    if (change === "home") f.api.route.current = { name: "home" }
    if (change === "directory") f.state.path.directory = "/other"
    if (change === "dispose") f.dispose()
    resolve({ data: [skill] }); await setImmediate()
    assert.equal(f.appendCalls, 0)
    assert.equal(f.draft, "existing task\n")
    if (change !== "dispose") assert.match(f.toasts.at(-1).message, /DRAFT_TARGET_CHANGED/)
  }
})

test("home is a valid bound draft target; unrelated routes cannot start the browser", async () => {
  const home = fixture()
  home.api.route.current = { name: "home" }
  home.command.run(); await setImmediate()
  home.dialog.onSelect({ value: 0 })
  home.dialog.onSelect({ value: "request" }); await setImmediate()
  assert.equal(home.appendCalls, 1)
  for (const current of [{ name: "settings" }, { name: "session" }]) {
    const f = fixture()
    f.api.route.current = current
    f.command.run(); await setImmediate()
    assert.equal(f.dialog, undefined)
    assert.match(f.toasts.at(-1).message, /DRAFT_TARGET_UNAVAILABLE/)
  }
})

test("route change during an in-flight append is reported as uncertain, with no success, UI clearing or retry", async () => {
  const f = fixture()
  f.command.run(); await setImmediate()
  f.dialog.onSelect({ value: 0 })
  let resolve: any, calls = 0
  f.client.tui.appendPrompt = (input: any, options: any) => {
    calls++
    assert.equal(input.directory, "/workspace")
    assert.equal(options.signal, f.api.lifecycle.signal)
    return new Promise(r => { resolve = r })
  }
  f.dialog.onSelect({ value: "request" }); await setImmediate()
  const oldDialog = f.dialog
  f.api.route.current = { name: "session", params: { sessionID: "session-b" } }
  resolve({ data: true }); await setImmediate()
  assert.equal(calls, 1)
  assert.equal(f.dialog, oldDialog)
  assert.match(f.toasts.at(-1).message, /APPEND_UNCONFIRMED/)
  assert.ok(!f.toasts.some(toast => toast.title === "Skill request appended"))
})

test("catalog failures during request revalidation retain safe error categories", async () => {
  const f = fixture()
  f.command.run(); await setImmediate()
  f.dialog.onSelect({ value: 0 })
  f.client.app.skills = async () => { throw Error("secret revalidation error") }
  f.dialog.onSelect({ value: "request" }); await setImmediate()
  assert.equal(f.appendCalls, 0)
  assert.match(f.toasts.at(-1).message, /CATALOG_CONNECTION_FAILED/)
  assert.doesNotMatch(JSON.stringify(f.toasts), /secret/)
})
