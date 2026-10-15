import { constants } from "node:fs"
import { copyFile, cp, mkdir, readdir } from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"

const config = path.join(process.env.XDG_CONFIG_HOME, "opencode")
await mkdir(config, { recursive: true })
for (const name of ["opencode.json", "tui.json"]) {
  try {
    await copyFile(`/opt/openarms/sandbox/config/${name}`, path.join(config, name), constants.COPYFILE_EXCL)
  } catch (error) {
    if (error.code !== "EEXIST") throw error
  }
}

const fixture = process.env.SANDBOX_FIXTURE || "docs-project"
if (!["docs-project", "empty-project"].includes(fixture)) throw new Error(`Unknown sandbox fixture: ${fixture}`)
const project = "/workspace/project"
if ((await readdir(project)).length === 0) {
  await cp(`/opt/openarms/sandbox/fixtures/${fixture}`, project, { recursive: true })
}

const [command = "opencode", ...args] = process.argv.slice(2)
const child = spawn(command, args, { stdio: "inherit" })
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal))
child.on("error", (error) => { console.error(error.message); process.exitCode = 1 })
child.on("exit", (code, signal) => { process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1) })
