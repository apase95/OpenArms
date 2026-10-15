// Invoked only by the runner's disposable PTY project, never the user's container.
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
const config = path.join(process.env.XDG_CONFIG_HOME, "opencode")
// Generated ordinary test data only; never configure or read the installed library.
for (const root of ["/tmp/openarms-pty-library", "/tmp/openarms-pty-other"]) {
  await mkdir(path.join(root, "skills"), { recursive: true })
  await writeFile(path.join(root, "skills/example.md"), "Synthetic PTY example, not an enabled skill.")
  await writeFile(path.join(root, "skills/editor.md"), "Synthetic PTY editor, not an enabled skill.")
  await writeFile(path.join(root, "registry.json"), JSON.stringify({ version: 1,
    packages: { docs: { core: ["example"], optional: ["docs-editor"], detect: {} } },
    skills: { example: "skills/example.md", "docs-editor": "skills/editor.md" },
  }))
}
await mkdir(config, { recursive: true })
await writeFile(path.join(config, "tui.json"), JSON.stringify({ plugin: [
  "file:///opt/openarms/plugins/skill-router-tui.tsx",
  "file:///opt/openarms/sandbox/tui-fixture.ts",
] }))
process.argv = [process.argv[0], "/opt/openarms/sandbox/entrypoint.mjs", "opencode", "/workspace/project"]
await import("./entrypoint.mjs")
