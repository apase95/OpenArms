/** Disposable PTY fixture only. Loads generated test data, never real skills. */
import { createLocalRuntime } from "../src/local-library.ts"
import { HOME_SESSION } from "../src/state-store.ts"
import { readFile, readdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"
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
      }, { name: "openarms.test.domains", title: "Run real host domain acceptance", namespace: "palette", slashName: "arms-test-domains",
        async run() {
          try {
            const session = await api.client.session.create({ title: "OpenArms PTY domain acceptance" })
            if (!session.data?.id) throw Error("DOMAIN_SESSION_CREATE_FAILED")
            const results = []
            const runtime = await createLocalRuntime({ directory: api.state.path.directory, worktree: api.state.path.worktree })
            for (const [command, evidence, exit, domain] of [["npm test", "PTY_ASSERTION_FAILURE", 7, "test"], ["git diff", "PTY_SOURCE_EVIDENCE", 0, "git-diff"], ["g++ -Wall -fsyntax-only acceptance.cpp", "PTY_BUILD_FAILURE", 1, "build"]] as const) {
              const response = await api.client.session.prompt({ sessionID: session.data.id, agent: "build", model: { providerID: "openarms-fixture", modelID: "fixture" }, parts: [{ type: "text", text: `acceptance: ${command}` }] })
              if (response.error) throw Error(`HOST_SHELL_ERROR: ${JSON.stringify(response.error).slice(0, 2000)}`)
              const history = await api.client.session.messages({ sessionID: session.data.id })
              const part = history.data?.flatMap((message: any) => message.parts).filter((part: any) => part.type === "tool" && part.tool === "bash" && part.state?.input?.command === command).at(-1)
              const state = part?.state
              if (!state || state.status !== "completed") throw Error(`HOST_TOOL_SHAPE: ${JSON.stringify(history.data).slice(-2000)}`)
              if (state.metadata?.exit !== exit) throw Error(`HOST_EXIT_CHANGED: ${state.metadata?.exit} expected ${exit}`)
              const text = state.output
              if (!text.includes(evidence) || Buffer.byteLength(text) > 50000) throw Error("HOST_DIAGNOSTIC_OR_CAP_FAILED")
              const file = text.match(/\[OPENARMS: full log (.*)\]/)?.[1]
              if (!file?.startsWith("/workspace/project/.openarms/logs/")) throw Error("PROJECT_RAW_REFERENCE_MISSING")
              const raw = await readFile(file, "utf8")
              if (!raw.includes(evidence) || ((await stat(file)).mode & 0o777) !== 0o600) throw Error("RAW_EVIDENCE_OR_MODE_FAILED")
              const ratio = 1 - Buffer.byteLength(text) / Buffer.byteLength(raw)
              if (ratio < 0.9) throw Error(`HOST_SAVINGS_FAILED: ${command} ratio=${ratio}; raw=${raw.slice(0, 1000)}; context=${text.slice(0, 1000)}`)
              const folder = path.join(path.dirname(runtime.stateFile), "governance")
              const events = await Promise.all((await readdir(folder)).filter(name => name.endsWith(".json")).map(async name => JSON.parse(await readFile(path.join(folder, name), "utf8"))))
              const event = events.find(event => event.callID === part.callID && event.sessionID === session.data.id)
              if (event?.domain !== domain || event.rawBytes !== Buffer.byteLength(raw) || event.compactedBytes !== Buffer.byteLength(text)) throw Error(`HOST_TELEMETRY_FAILED: ${JSON.stringify(event)}`)
              results.push({ command, domain, exit, rawBytes: Buffer.byteLength(raw), contextBytes: Buffer.byteLength(text), ratio })
            }
            await writeFile("/tmp/openarms-domain-result.json", JSON.stringify({ ok: true, results }))
            api.ui.toast({ title: "Domain workflow passed", message: "Real host shell hooks, raw logs and failure exits", variant: "success", duration: 10000 })
          } catch (error) {
            await writeFile("/tmp/openarms-domain-result.json", JSON.stringify({ ok: false, error: String(error) }))
            api.ui.toast({ title: "Domain workflow failed", message: String(error), variant: "error", duration: 10000 })
          }
        },
      }], bindings: [],
    })
    api.lifecycle.onDispose(dispose)
  },
}
