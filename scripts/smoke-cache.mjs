import { randomUUID } from "node:crypto"
import { hostname } from "node:os"
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, existsSync, statSync } from "node:fs"
import { setTimeout as delay } from "node:timers/promises"
import path from "node:path"
import { root } from "./test-policy.mjs"

export function readStamp(mode, fingerprint, directory = root) {
  const file = path.join(directory, ".openarms/test-results", mode, `${fingerprint}.json`)
  try {
    const stamp = JSON.parse(readFileSync(file, "utf8"))
    if (stamp.schemaVersion !== 1 || stamp.mode !== mode || stamp.fingerprint !== fingerprint || stamp.exitCode !== 0 || stamp.signal || stamp.timedOut || stamp.inputChanged || !stamp.completedAt || !stamp.logPath) return null
    const log = path.resolve(directory, stamp.logPath)
    if (!log.startsWith(path.join(directory, ".openarms/logs") + path.sep) || !existsSync(log)) return null
    return stamp
  } catch (error) { if (["ENOENT"].includes(error.code) || error instanceof SyntaxError) return null; throw error }
}
export function writeStamp(stamp, directory = root) {
  if (stamp.exitCode !== 0 || stamp.signal || stamp.timedOut || stamp.inputChanged || stamp.logError || !stamp.logPath) return false
  const folder = path.join(directory, ".openarms/test-results", stamp.mode)
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const target = path.join(folder, `${stamp.fingerprint}.json`)
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, ...stamp }) + "\n", { flag: "wx", mode: 0o600 })
    renameSync(temporary, target)
  } finally { rmSync(temporary, { force: true }) }
  return true
}
function ownerDead(lock) {
  let owner
  try { owner = JSON.parse(readFileSync(path.join(lock, "owner.json"), "utf8")) } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return existsSync(lock) && Date.now() - statSync(lock).mtimeMs > 5000
    throw error
  }
  if (owner.host !== hostname()) return false
  try { process.kill(owner.pid, 0); return false } catch (error) { return error.code === "ESRCH" }
}
export async function withLock(name, callback, { directory = root, timeoutMs = 1200000, cancellation = {} } = {}) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error("Unsafe cache lock name")
  const folder = path.join(directory, ".openarms/test-locks")
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const lock = path.join(folder, name)
  const token = randomUUID()
  const started = Date.now(), deadline = started + timeoutMs
  while (true) {
    if (cancellation.signal) return { blocked: true, exitCode: cancellation.signal === "SIGINT" ? 130 : 143, signal: cancellation.signal, stage: "lock-wait", durationMs: Date.now() - started, diagnostics: [`CANCELLED: waiting for ${name}; active owner's lock preserved`] }
    try {
      mkdirSync(lock, { mode: 0o700 })
      writeFileSync(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid, host: hostname(), token }), { flag: "wx", mode: 0o600 })
      break
    } catch (error) {
      if (error.code !== "EEXIST") throw error
      if (ownerDead(lock)) {
        const recovery = `${lock}.recovery`
        try {
          mkdirSync(recovery, { mode: 0o700 })
          try { if (existsSync(lock) && ownerDead(lock)) rmSync(lock, { recursive: true, force: true }) }
          finally { rmSync(recovery, { recursive: true, force: true }) }
        } catch (recoveryError) { if (recoveryError.code !== "EEXIST") throw recoveryError }
      }
      if (Date.now() >= deadline) throw new Error(`CACHE_LOCK_TIMEOUT: ${name}; inspect the active owner before retrying`)
      await delay(50)
    }
  }
  try { return await callback() }
  finally {
    try { if (JSON.parse(readFileSync(path.join(lock, "owner.json"), "utf8")).token === token) rmSync(lock, { recursive: true, force: true }) }
    catch (error) { if (error.code !== "ENOENT") throw error }
  }
}
export async function cachedSmoke(mode, fingerprint, execute, { directory = root, force = false, versions = {}, timeoutMs, cancellation } = {}) {
  return withLock(`${mode}-${fingerprint}`, async () => {
    const previous = force ? null : readStamp(mode, fingerprint, directory)
    if (previous) return { ...previous, cached: true }
    // A forced failure must invalidate an older pass for the same key.
    rmSync(path.join(directory, ".openarms/test-results", mode, `${fingerprint}.json`), { force: true })
    const started = Date.now()
    const startedAt = new Date().toISOString()
    const result = await execute()
    const stamp = { ...result, processDurationMs: result.durationMs, durationMs: Date.now() - started, mode, fingerprint, versions, startedAt, completedAt: new Date().toISOString(), cached: false }
    writeStamp(stamp, directory)
    return stamp
  }, { directory, timeoutMs, cancellation })
}
