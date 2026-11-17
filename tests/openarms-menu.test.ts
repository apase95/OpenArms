import assert from "node:assert/strict"
import { test } from "node:test"
import { setImmediate } from "node:timers/promises"
import { installOpenArmsMenu } from "../src/openarms-menu.ts"
import type { FeatureID, ProjectFeatures } from "../src/project-features.ts"

function fixture() {
  let dialog: any, onClose: (() => void) | undefined, draft = "existing draft\n", writes = 0
  const commands = new Map<string, any>(), cleanups: Array<() => void> = [], toasts: any[] = []
  const disabled = new Map<string, Set<FeatureID>>(), stores = new Map<string, ProjectFeatures>()
  const getStore = (root: string) => {
    if (!stores.has(root)) {
      const state = new Set<FeatureID>(); disabled.set(root, state)
      stores.set(root, {
        read: async () => [...state],
        set: async (id, enabled) => { writes++; if (enabled) state.delete(id); else state.add(id); return [...state] },
      })
    }
    return stores.get(root)!
  }
  const state = { path: { directory: "/project/sub", worktree: "/project" } }
  const route: { current: { name: string; params?: { sessionID?: string } } } = { current: { name: "session", params: { sessionID: "a" } } }
  const api = {
    state, route,
    client: {
      app: { skills: async () => ({ data: [{ name: "writing", location: "/library/writing/SKILL.md", content: "instructions" }] }) },
      tui: { appendPrompt: async (input: any) => { draft += input.text; return { data: true } } },
    },
    ui: {
      DialogSelect: (props: any) => props, DialogAlert: (props: any) => props,
      toast: (props: any) => toasts.push(props),
      dialog: {
        replace: (render: any, close?: () => void) => { onClose?.(); onClose = close; dialog = render() },
        clear: () => { const close = onClose; onClose = undefined; dialog = undefined; close?.() },
      },
    },
    keymap: { registerLayer: (layer: any) => {
      for (const command of layer.commands) commands.set(command.name, command)
      return () => { for (const command of layer.commands) commands.delete(command.name) }
    } },
    lifecycle: { signal: new AbortController().signal, onDispose: (callback: () => void) => { cleanups.push(callback) } },
  }
  installOpenArmsMenu(api as any, (render, footer) => ({ ...render() as any, footer }), {
    features: getStore, skills: () => ({ read: async () => [], set: async () => [] }),
    skillList: props => api.ui.DialogSelect(props),
  })
  return { api, commands, toasts, disabled, getStore, state, route,
    get dialog() { return dialog }, get draft() { return draft }, get writes() { return writes },
    open: () => commands.get("openarms.menu").run(),
    select: async (value: string) => { dialog.onSelect({ value }); await setImmediate() },
    dispose: () => { for (const cleanup of cleanups) cleanup() },
  }
}

test("only /arms-skills is registered and opens the full menu; feature actions are ON/OFF only", async () => {
  const f = fixture()
  assert.deepEqual([...f.commands.values()].map(command => command.slashName), ["arms-skills"])
  assert.equal(f.commands.has("openarms.skills"), false)
  f.open()
  assert.deepEqual(f.dialog.options.map((row: any) => row.title), ["Skills management", "Output compaction", "Features"])
  await f.select("features")
  assert.deepEqual(f.dialog.options.map((row: any) => row.title), ["Skills management", "Output compaction"])
  await f.select("output-compaction")
  assert.equal(f.dialog.title, "Output compaction · ON")
  assert.deepEqual(f.dialog.options.map((row: any) => row.title), ["ON", "OFF"])
  await f.select("off")
  assert.equal(f.dialog.title, "Output compaction · OFF")
  assert.ok(f.disabled.get("/project")!.has("output-compaction"))
  assert.equal(f.draft, "existing draft\n")
  f.dialog.footer.back(); assert.equal(f.dialog.title, "OpenArms features")
  f.dialog.footer.back(); assert.equal(f.dialog.title, "OpenArms")
  f.dialog.footer.done(); assert.equal(f.dialog, undefined)
})

test("the single entrypoint still reaches skill REQUEST and output status without secondary commands", async () => {
  const f = fixture()
  f.open(); await f.select("skills")
  f.dialog.onSelect({ value: 0 })
  assert.deepEqual(f.dialog.options.map((row: any) => row.title), ["ON", "OFF", "REQUEST"])
  await f.select("request")
  assert.match(f.draft, /existing draft[\s\S]*native skill tool to load "writing"/)
  assert.equal(f.dialog, undefined)
  f.open(); await f.select("output")
  assert.equal((f.dialog as any).title, "Output compaction · ON")
  assert.deepEqual([...f.commands.values()].map(command => command.slashName), ["arms-skills"])
})

test("turning every feature OFF never disables the single entrypoint or Features", async () => {
  const f = fixture()
  await f.getStore("/project").set("skills-management", false)
  await f.getStore("/project").set("output-compaction", false)
  f.open()
  await f.select("skills")
  assert.equal(f.dialog.title, "OpenArms")
  assert.match(f.toasts.at(-1).message, /FEATURE_OFF/)
  assert.deepEqual([...f.commands.values()].map(command => command.slashName), ["arms-skills"])
  f.open()
  assert.equal(f.dialog.title, "OpenArms")
  await f.select("output")
  assert.equal(f.dialog.title, "Output compaction · OFF")
  f.dialog.footer.back()
  await f.select("features"); await f.select("skills-management"); await f.select("on")
  assert.equal(f.dialog.title, "Skills management · ON")
  assert.equal(f.disabled.get("/project")!.has("output-compaction"), true)
  f.dialog.footer.back(); f.dialog.footer.back()
  await f.select("skills")
  assert.equal(f.dialog.title, "OpenArms skills")
  assert.deepEqual(f.dialog.options, [{ title: "writing", value: 0 }])
  f.dialog.footer.back()
  assert.equal(f.dialog.title, "OpenArms")
})

test("stale feature/root/footer callbacks do not save, close or navigate a replacement dialog", async () => {
  const f = fixture()
  f.open(); const root = f.dialog
  await f.select("features"); const list = f.dialog
  await f.select("output-compaction"); const actions = f.dialog
  actions.footer.back()
  root.onSelect({ value: "skills" }); list.onSelect({ value: "skills-management" }); actions.onSelect({ value: "off" })
  actions.footer.done(); await setImmediate()
  assert.equal(f.dialog.title, "OpenArms features")
  assert.equal(f.writes, 0)
  f.dispose()
  f.dialog.footer.done(); f.dialog.onSelect({ value: "skills-management" }); await setImmediate()
  assert.equal(f.writes, 0)
  assert.equal(f.commands.size, 0)
})

test("feature mutations reject changed session, directory or root; failed reads/writes never report success", async () => {
  for (const change of ["session", "directory", "root", "write"]) {
    const f = fixture()
    f.open(); await f.select("features"); await f.select("output-compaction")
    if (change === "session") f.route.current = { name: "session", params: { sessionID: "b" } }
    if (change === "directory") f.state.path.directory = "/other"
    if (change === "root") f.state.path.worktree = "/other"
    if (change === "write") f.getStore("/project").set = async () => { throw Error("secret storage details") }
    await f.select("off")
    assert.equal(f.writes, 0)
    assert.ok(!f.toasts.some(toast => toast.variant === "info"))
    assert.doesNotMatch(JSON.stringify(f.toasts), /secret/)
  }
  const f = fixture()
  f.getStore("/project").read = async () => { throw Error("secret read") }
  f.open(); await f.select("features"); await f.select("skills-management")
  assert.equal(f.dialog.title, "OpenArms features")
  assert.match(f.toasts.at(-1).message, /FEATURE_STATE_UNAVAILABLE/)
  assert.doesNotMatch(JSON.stringify(f.toasts), /secret/)
})

test("async reads/saves cannot reopen closed views; in-flight writes remain in the original project", async () => {
  for (const operation of ["read", "write"]) {
    const f = fixture()
    f.open(); await f.select("features")
    let resolve: any
    if (operation === "read") {
      f.getStore("/project").read = () => new Promise(r => { resolve = r })
      await f.select("output-compaction")
    } else {
      await f.select("output-compaction")
      f.getStore("/project").set = () => new Promise(r => { resolve = r })
      await f.select("off")
    }
    f.dialog.footer.done()
    f.state.path.worktree = "/other"; f.state.path.directory = "/other"
    f.open(); const replacement = f.dialog
    resolve(["output-compaction"]); await setImmediate()
    assert.equal(f.dialog, replacement)
    assert.ok(!f.toasts.some(toast => toast.variant === "info"))
  }
})

test("closing root while the skill browser loads cannot reopen the catalog afterwards", async () => {
  const f = fixture()
  let resolve: any
  f.getStore("/project").read = () => new Promise(r => { resolve = r })
  f.open(); await f.select("skills")
  f.dialog.footer.done()
  resolve([]); await setImmediate()
  assert.equal(f.dialog, undefined)
})
