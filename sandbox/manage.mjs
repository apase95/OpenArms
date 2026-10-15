import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { automaticRetention } from './image-retention.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const input = process.argv.slice(2)
const installed = input.includes("--installed")
const synthetic = input.includes('--synthetic')
if (synthetic && (installed || !process.env.OPENARMS_BUILD_CONTEXT || process.env.OPENARMS_LIBRARY_MODE !== 'synthetic')) throw Error('Synthetic mode requires runner-generated context and isolated image')
const args = input.filter((arg) => !['--installed', '--synthetic'].includes(arg))
const [action = "help", ...extra] = args
const commands = {
  build: ["build", ...extra],
  test: ["run", "--rm", "test", ...extra],
  start: ["run", "--rm", "cli", "opencode", "/workspace/project", ...extra],
  smoke: ["run", "--rm", "smoke", ...extra],
   "smoke-runtime": ["run", "--rm", ...(synthetic ? ['--pull', 'never'] : []), "smoke", ...extra],
  doctor: ["run", "--rm", "cli", "opencode", "debug", "paths"],
  shell: ["run", "--rm", "cli", "bash", ...extra],
  auth: ["run", "--rm", "cli", "opencode", "auth", ...extra],
  config: ["config", ...extra],
  stop: ["down", ...extra],
  reset: ["down", "--volumes"],
}
if (!Object.hasOwn(commands, action) && action !== "tui-smoke") {
  console.log("Usage: npm run sandbox -- <build|test|start|smoke|tui-smoke|doctor|shell|auth|config|stop|reset> [--installed] [args]")
  if (action !== "help") process.exitCode = 1
} else {
  const compose = ["compose", "--project-directory", path.join(root, "sandbox"), "-f", path.join(root, "sandbox/compose.yaml")]
  if (installed) compose.push("--project-name", "openarms-sandbox-installed", "-f", path.join(root, "sandbox/compose.installed.yaml"))
  if (process.env.OPENARMS_SMOKE_PROJECT) compose.push("--project-name", process.env.OPENARMS_SMOKE_PROJECT)
  const child = action === "tui-smoke"
    ? spawn("python3", [path.join(root, "sandbox/tui-smoke.py"), ...(installed ? ["--installed"] : []), ...(synthetic ? ['--synthetic'] : [])], { cwd: root, stdio: "inherit" })
    : spawn("docker", [...compose, ...commands[action]], { cwd: root, stdio: "inherit" })
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal))
  child.on("error", (error) => { console.error(error.message); process.exitCode = 1 })
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1)
    if (action === 'build' && process.exitCode === 0 && (!extra.length || extra.some(service => ['cli', 'smoke'].includes(service)))) {
      try { automaticRetention() } catch { process.exitCode = 2 }
    }
  })
}
