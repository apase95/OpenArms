import assert from "node:assert/strict"
import { spawn, execFileSync } from "node:child_process"
import { createServer } from "node:net"
import { BoundedOutput } from "./process-output.mjs"

console.log("STAGE: binary-version")
assert.equal(execFileSync("opencode", ["--version"], { encoding: "utf8", timeout: 15000, maxBuffer: 65536 }).trim(), process.env.EXPECTED_OPENCODE_VERSION || "1.18.35")
console.log("STAGE: effective-paths")
const paths = execFileSync("opencode", ["debug", "paths"], { encoding: "utf8", timeout: 45000, maxBuffer: 65536 })
for (const directory of [process.env.XDG_CONFIG_HOME, process.env.XDG_DATA_HOME, process.env.XDG_STATE_HOME, process.env.XDG_CACHE_HOME]) {
  assert.ok(paths.includes(directory), `OpenCode path is not isolated: ${directory}`)
}

const port = await new Promise((resolve, reject) => {
  const server = createServer()
  server.on("error", reject)
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port
    server.close(() => resolve(port))
  })
})
const startupMs = Number(process.env.OPENARMS_SERVER_STARTUP_MS || 60000)
const requestMs = Number(process.env.OPENARMS_REQUEST_TIMEOUT_MS || 120000)
assert.ok(Number.isInteger(startupMs) && startupMs > 0 && Number.isInteger(requestMs) && requestMs > 0, "Invalid runtime stage timeout")
const server = spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", String(port), "--print-logs", "--log-level", "DEBUG"], { stdio: ["ignore", "pipe", "pipe"] })
const output = new BoundedOutput()
server.stdout.on("data", (chunk) => { output.push(chunk, "stdout"); if (!process.stdout.write(chunk)) server.stdout.pause() })
server.stderr.on("data", (chunk) => { output.push(chunk, "stderr"); if (!process.stderr.write(chunk)) server.stderr.pause() })
process.stdout.on("drain", () => server.stdout.resume())
process.stderr.on("drain", () => server.stderr.resume())
let spawnError, interrupted
server.on("error", (error) => { spawnError = error; output.push(error.message, "stderr") })
const controller = new AbortController()
const handlers = ["SIGINT", "SIGTERM"].map((signal) => [signal, () => { interrupted ??= signal; controller.abort(new Error(`SIGNAL: ${signal}`)); server.kill(signal) }])
for (const [signal, handler] of handlers) process.on(signal, handler)
const base = `http://127.0.0.1:${port}`
const eventsController = new AbortController()
let eventsTask
const pluginErrors = []
const get = async (route) => {
  console.log(`STAGE: endpoint-request:${route}`)
  let response
  try { response = await fetch(`${base}${route}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(requestMs)]) }) }
  catch (error) { if (error.name === "TimeoutError") throw new Error(`TIMEOUT: endpoint-request:${route} limit=${requestMs}ms`, { cause: error }); throw error }
  assert.equal(response.status, 200, `Unexpected status at ${route}`)
  return response.json()
}
try {
  console.log("STAGE: server-startup")
  let healthy = false
  const deadline = performance.now() + startupMs
  while (performance.now() < deadline) {
    if (spawnError) throw spawnError
    if (controller.signal.aborted) throw controller.signal.reason
    if (server.exitCode !== null || server.signalCode !== null) throw new Error(`STARTUP_FAILED: OpenCode exited early: ${output.sample()}`)
    try {
      const response = await fetch(`${base}/global/health`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(Math.max(1, Math.floor(Math.min(1000, deadline - performance.now()))))]) })
      if (response.ok) { healthy = true; break }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  assert.ok(healthy, `TIMEOUT: server-startup limit=${startupMs}ms; OpenCode did not become healthy: ${output.sample()}`)
  // Subscribe before any instance/config initialization. Plugin failures are bus
  // events in this host version, not necessarily console messages.
  const events = await fetch(`${base}/global/event`, { signal: AbortSignal.any([controller.signal, eventsController.signal]) })
  assert.equal(events.status, 200, "Global event stream unavailable")
  eventsTask = (async () => {
    const reader = events.body.getReader(), decoder = new TextDecoder()
    let pending = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      pending = (pending + decoder.decode(value, { stream: true })).slice(-131072)
      let end
      while ((end = pending.indexOf("\n\n")) >= 0) {
        const frame = pending.slice(0, end); pending = pending.slice(end + 2)
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue
          try {
            const event = JSON.parse(line.slice(5)), payload = event.payload ?? event
            if (payload.type === "session.error" && pluginErrors.length < 16) {
              const diagnostic = JSON.stringify(payload).slice(0, 8192)
              pluginErrors.push(diagnostic)
              console.error(`HOST_EVENT: ${diagnostic}`)
            }
          } catch { /* Ignore non-JSON keepalive frames. */ }
        }
      }
    }
  })().catch(error => { if (!eventsController.signal.aborted) console.error(`EVENT_STREAM: ${error.message}`) })
  const config = await get("/config")
  assert.ok(config.plugin.includes("file:///opt/openarms/plugins/skill-router-server.ts"))
  assert.equal(config.permission.skill["*"], "deny")
  assert.equal(config.permission.read["*SKILL.md"], "deny")
  const tools = await get("/experimental/tool/ids")
    assert.ok(tools.includes("load_skill"), `Server plugin did not register load_skill; registered=${JSON.stringify(tools)}`)
   assert.ok(!tools.includes("load_verified_skill"), "Legacy verified loader must not be exposed")
  assert.ok(!tools.includes("load_skill_package"), "Legacy tool must be removed")
   console.log("PASS: runtime binary version, effective isolated paths/config, server health and sole local loader registration checks=5")
} catch (error) {
  console.error(output.sample())
  console.error(error.stack)
  process.exitCode = interrupted === "SIGINT" ? 130 : interrupted === "SIGTERM" ? 143 : 1
} finally {
  eventsController.abort()
  await eventsTask
  for (const [signal, handler] of handlers) process.off(signal, handler)
  server.kill("SIGTERM")
  if (!spawnError && server.pid && server.exitCode === null && server.signalCode === null) {
    const timeout = setTimeout(() => server.kill("SIGKILL"), 3000)
    await new Promise((resolve) => server.once("exit", resolve))
    clearTimeout(timeout)
  }
}
