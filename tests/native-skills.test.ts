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
  const client = {
    app: { skills: async (_input: any) => ({ data: [skill] as any }) },
    tui: { appendPrompt: async (input: any) => { draft += input.text; return { data: true as boolean } } },
  }
  const api = {
    client, state,
    ui: {
      DialogSelect: (props: any) => props,
      DialogAlert: (props: any) => props,
      toast: (input: any) => toasts.push(input),
      dialog: { replace: (render: any) => { dialog = render() }, clear: () => { dialog = undefined } },
    },
    keymap: { registerLayer: (layer: any) => { command = layer.commands[0]; return () => { unregistered++ } } },
    lifecycle: { onDispose: (callback: any) => { dispose = callback } },
  }
  installSkillBrowser(api as any)
  return { api, client, state, toasts, get dialog() { return dialog }, get command() { return command },
    get draft() { return draft }, dispose: () => dispose(), get unregistered() { return unregistered } }
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
  assert.match(f.toasts.at(-1).message, /Cannot append/)
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
  assert.match(f.toasts.at(-1).message, /Cannot append/)
  assert.equal(f.draft, "existing task\n")
})
