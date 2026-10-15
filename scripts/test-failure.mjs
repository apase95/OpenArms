import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs"
import path from "node:path"
import { withLock } from "./smoke-cache.mjs"
import { clean, clip } from "../sandbox/process-output.mjs"

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
export function normalizeError(text, directory) {
  return clean(text).split(directory).join("<workspace>")
    .replace(/\.openarms\/logs\/[^\s]+/g, "<log>")
    .replace(/\/tmp\/(?:arms-|openarms-|skill-router-)[^/\s]+/g, "<fixture>")
    .replace(/\b\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)?\b/g, "<time>")
    .replace(/\b[\d.]+\s*ms\b/g, "<duration>")
    .replace(/\b(?:pid|port)[=: ]+\d+\b/gi, "<runtime-id>")
    .replace(/\b127\.0\.0\.1:\d+\b/g, "127.0.0.1:<port>")
    .replace(/\bopenarms-smoke-[a-f0-9]{8}-[a-f0-9]{3}\b/g, "<smoke-project>")
    .replace(/(-run-)[a-f0-9]{8,64}\b/g, "$1<run-id>")
    .replace(/\bopenarms-sandbox-tui-check-\d+\b/g, "<tui-container>")
    .replace(/^\s*not ok\s+\d+\s*-/, "not ok -").trim()
}
export function failureSignature(mode, command, result, directory) {
  return hash({ mode, command, exitCode: result.exitCode, signal: result.signal ?? null, stage: result.failedTest ?? result.stage,
    errors: (result.diagnostics ?? []).filter((line) => !/duration_ms|^# (?:tests|pass|fail|suites)|^\[bounded/.test(line)).map((line) => normalizeError(line, directory)), cleanup: (result.cleanupErrors ?? []).map((line) => normalizeError(line, directory)) })
}
export async function guardedRun(mode, fingerprint, command, execute, { directory, force = false, reason, timeoutMs = 1200000, cancellation } = {}) {
  const normalizedCommand = [path.basename(command[0]), ...command.slice(1).map((part) => normalizeError(part, directory))]
  const key = hash({ mode, command: normalizedCommand })
  const folder = path.join(directory, ".openarms/test-failures")
  const file = path.join(folder, `${mode}-${key}.json`)
  return withLock(`failure-${mode}-${key}`, async () => {
    let previous
    try { previous = JSON.parse(readFileSync(file, "utf8")) } catch (error) { if (error.code !== "ENOENT") throw new Error(`FAILURE_STATE_INVALID: ${file}; ${error.message}`) }
    if (previous?.fingerprint === fingerprint && previous.count >= 2 && (!force || !reason?.trim())) return {
      blocked: true, exitCode: 2, stage: "retry-guard", durationMs: 0, logPath: previous.logPath,
      diagnostics: [`${force ? "RETRY_OVERRIDE_REASON_REQUIRED" : "RETRY_BLOCKED"}: two identical completed failures on unchanged inputs (${previous.signature.slice(0, 12)}).`,
        "Inspect the full log and change a relevant input, or use --force --reason \"<diagnosis / intentional rerun reason>\"."],
    }
    const result = await execute()
    if (result.blocked) return result
    if (!result.exitCode && !result.signal && !result.timedOut && !result.logError && !result.cleanupErrors?.length) {
      rmSync(file, { force: true }); return result
    }
    const signature = failureSignature(mode, normalizedCommand, result, directory)
    const count = previous?.fingerprint === fingerprint && previous.signature === signature ? previous.count + 1 : 1
    const state = { schemaVersion: 1, mode, fingerprint, signature, count, logPath: result.logPath, exitCode: result.exitCode, signal: result.signal, stage: clip(result.failedTest ?? result.stage ?? mode, 160), updatedAt: new Date().toISOString() }
    mkdirSync(folder, { recursive: true, mode: 0o700 })
    const temporary = `${file}.${randomUUID()}.tmp`
    try { writeFileSync(temporary, JSON.stringify(state) + "\n", { flag: "wx", mode: 0o600 }); renameSync(temporary, file) }
    finally { rmSync(temporary, { force: true }) }
    return { ...result, failureSignature: signature, failureCount: count }
  }, { directory, timeoutMs, cancellation })
}
