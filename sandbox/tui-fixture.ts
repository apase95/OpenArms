/** Disposable PTY fixture only. Loads generated test data, never real skills. */
import { createLocalRuntime } from "../src/local-library.ts"
import { HOME_SESSION } from "../src/state-store.ts"
export default {
  id: "openarms-pty-fixture",
  async tui(api: any) {
    const dispose = api.keymap.registerLayer({
      commands: [{ name: "openarms.test.new", title: "Create isolated restore test session", namespace: "palette", slashName: "arms-test-new",
        async run() {
          const result = await api.client.session.create({ title: "OpenArms isolated PTY restore" })
          if (!result.data?.id) throw Error("PTY_SESSION_CREATE_FAILED")
          api.route.navigate("session", { sessionID: result.data.id })
        },
      }, { name: "openarms.test.load", title: "Load synthetic PTY selection", namespace: "palette", slashName: "arms-test-load",
        async run() {
          const runtime = await createLocalRuntime({ directory: api.state.path.directory, worktree: api.state.path.worktree })
          if ((await runtime.getLibrary()).root !== "/tmp/openarms-pty-library") throw Error("SYNTHETIC_ROOT_REQUIRED")
          const result = await runtime.loadSkill(HOME_SESSION, "docs-editor")
          if (!result.ok || result.content !== "Synthetic PTY editor, not an enabled skill.") throw Error("SYNTHETIC_LOAD_FAILED")
          api.ui.toast({ title: "Synthetic loaded", message: "Generated fixture only; no provider request", variant: "success", duration: 5000 })
        },
      }], bindings: [],
    })
    api.lifecycle.onDispose(dispose)
  },
}
