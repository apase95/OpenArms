import { spawn } from "node:child_process"
import { randomUUID, createHash } from "node:crypto"
import { hostname } from "node:os"
import { mkdirSync, openSync, writeSync, fsyncSync, closeSync, readFileSync, writeFileSync, readdirSync, lstatSync, rmSync } from "node:fs"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { BoundedOutput } from "../sandbox/process-output.mjs"
import { noisePreset } from "../src/noise-preset.mjs"

export const retentionDefaults = { maxAgeMs: 7 * 86400000, maxFiles: 200, maxBytes: 256 * 1024 * 1024, minLifetimeMs: 60000 }
function active(file) {
  try {
    const owner = JSON.parse(readFileSync(`${file}.active`, "utf8"))
    if (owner.host !== hostname()) return true
    try { process.kill(owner.pid, 0); return true } catch (error) { if (error.code !== "ESRCH") return true }
    rmSync(`${file}.active`, { force: true }); return false
  } catch (error) { if (error.code === "ENOENT") return false; return true }
}
export function pruneLogs(directory, { now = Date.now(), protectedPaths = [], ...limits } = {}) {
  const policy = { ...retentionDefaults, ...limits }
  const folder = path.join(directory, ".openarms/logs")
  let names
  try { names = readdirSync(folder) } catch (error) { if (error.code === "ENOENT") return []; throw error }
  const protectedFiles = new Set(protectedPaths.map((file) => path.resolve(directory, file)))
  const files = []
  for (const name of names.filter((name) => name.endsWith(".log"))) {
    const file = path.join(folder, name)
    try {
      const stat = lstatSync(file)
      if (stat.isFile()) files.push({ file, size: stat.size, time: stat.mtimeMs, protected: protectedFiles.has(file) || active(file) })
    } catch (error) { if (error.code !== "ENOENT") throw error }
  }
  files.sort((a, b) => a.time - b.time || a.file.localeCompare(b.file))
  let count = files.length, bytes = files.reduce((sum, file) => sum + file.size, 0)
  const removed = []
  for (const file of files) {
    if (file.protected || now - file.time < policy.minLifetimeMs || active(file.file)) continue
    if (now - file.time <= policy.maxAgeMs && count <= policy.maxFiles && bytes <= policy.maxBytes) continue
    rmSync(file.file, { force: true }); count--; bytes -= file.size; removed.push(path.relative(directory, file.file))
  }
  return removed
}
export function runProcess(command, args, timeoutMs, cwd = process.cwd(), options = {}) {
  return new Promise((resolve) => {
    const started = performance.now()
    let stage = options.stage ?? options.mode ?? "process"
    let stdoutBytes = 0, stderrBytes = 0, timedOut = false, receivedSignal, spawnError, logError, logFd, graceTimer, terminatedAt, ownsMarker = false
    // Hash identity: stable trace correlation without exposing identifiers/secrets.
    const trace = createHash("sha256").update(JSON.stringify([options.sessionID ?? "local", options.toolCallID ?? "process"])).digest("hex").slice(0, 24)
    const mode = /^[a-z0-9-]{1,40}$/i.test(options.mode ?? "process") ? options.mode ?? "process" : "process"
    const logPath = options.logPath ?? `.openarms/logs/${mode}-${trace}-${randomUUID()}.log`
    const absoluteLog = path.resolve(cwd, logPath)
    const output = new BoundedOutput({ onStage: (value) => { stage = value } })
    try {
      mkdirSync(path.join(cwd, ".openarms/logs"), { recursive: true, mode: 0o700 })
      logFd = openSync(absoluteLog, "wx", 0o600)
      writeFileSync(`${absoluteLog}.active`, JSON.stringify({ pid: process.pid, host: hostname() }), { flag: "wx", mode: 0o600 })
      ownsMarker = true
    } catch (error) { logError = error.message }
    const grouped = process.platform !== "win32"
    const environment = options.environment ?? process.env
    const preset = options.noisePresets === true ? noisePreset(command, args, environment) : { executable: command, args, env: environment }
    const child = spawn(preset.executable, preset.args, { cwd, shell: false, detached: grouped, env: preset.env, stdio: ["ignore", "pipe", "pipe"] })
    const kill = (signal) => {
      if (!child.pid) return
      try { if (grouped) process.kill(-child.pid, signal); else child.kill(signal) } catch (error) { if (error.code !== "ESRCH") spawnError ??= error.message }
    }
    const groupAlive = () => {
      if (!grouped || !child.pid) return false
      try { process.kill(-child.pid, 0); return true } catch (error) { return error.code !== "ESRCH" }
    }
    const graceMs = options.graceMs ?? 3000
    const terminate = (signal) => {
      terminatedAt ??= performance.now()
      kill(signal)
      graceTimer ??= setTimeout(() => kill("SIGKILL"), graceMs)
    }
    const handlers = new Map(["SIGINT", "SIGTERM"].map((signal) => [signal, () => { receivedSignal ??= signal; terminate(signal) }]))
    for (const [signal, handler] of handlers) process.on(signal, handler)
    const timer = setTimeout(() => { timedOut = true; terminate("SIGTERM") }, timeoutMs)
    const consume = (chunk, stream) => {
      if (stream === "stdout") stdoutBytes += chunk.length; else stderrBytes += chunk.length
      if (logFd !== undefined && !logError) {
        try { let offset = 0; while (offset < chunk.length) offset += writeSync(logFd, chunk, offset, chunk.length - offset) }
        catch (error) { logError = error.message }
      }
      output.push(chunk, stream)
      options.onSample?.({ stage, retainedBytes: output.head.length + output.tail.length })
    }
    child.stdout.on("data", (chunk) => consume(chunk, "stdout"))
    child.stderr.on("data", (chunk) => consume(chunk, "stderr"))
    child.on("error", (error) => { spawnError = error.message })
    child.on("close", async (code, signal) => {
      clearTimeout(timer)
      // The leader may exit while grandchildren keep a socket and ignore SIGTERM.
      if (terminatedAt !== undefined && groupAlive()) {
        await delay(Math.max(0, graceMs - (performance.now() - terminatedAt)))
        kill("SIGKILL")
        await delay(50)
      }
      clearTimeout(graceTimer)
      for (const [name, handler] of handlers) process.off(name, handler)
      output.finish()
      try { if (logFd !== undefined) fsyncSync(logFd) } catch (error) { logError ??= error.message }
      try { if (logFd !== undefined) closeSync(logFd) } catch (error) { logError ??= error.message }
      try { if (ownsMarker) rmSync(`${absoluteLog}.active`, { force: true }) } catch (error) { logError ??= error.message }
      let retentionError
      try { pruneLogs(cwd, { ...options.retention, protectedPaths: [logPath] }) } catch (error) { retentionError = error.message }
      const exitCode = timedOut ? 124 : receivedSignal === "SIGINT" ? 130 : receivedSignal === "SIGTERM" ? 143 : code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1)
      const diagnostics = exitCode || logError ? output.diagnostics() : []
      if (spawnError) diagnostics.unshift(`SPAWN_ERROR: ${spawnError}`)
      if (timedOut) diagnostics.unshift(`TIMEOUT: stage=${stage} limit=${timeoutMs}ms; process group terminated`)
      resolve({ exitCode, signal: receivedSignal ?? signal, timedOut, spawnError, durationMs: Math.round(performance.now() - started), stdoutBytes, stderrBytes, logPath: logError ? undefined : logPath, logError, retentionError, stage, tests: output.tests, passed: output.passed, checks: output.checks, failedTest: output.failedTest, diagnostics: diagnostics.slice(0, 30), maxRetainedBytes: output.maxRetainedBytes })
    })
  })
}
