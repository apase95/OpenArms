import { createHash, randomUUID } from "node:crypto"
import { link, lstat, mkdir, open, readdir, stat, unlink } from "node:fs/promises"
import path from "node:path"
import { bytes, governOutput } from "./output-governor.ts"
import { createTelemetry } from "./governance-telemetry.ts"
import { evaluateFile } from "./tool-policy.ts"
import { createUsageRuntime } from "./usage-runtime.ts"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
// The host runtime image has no scripts/test-process.mjs. Same exclusive/flush/owner-only
// sink contract, but no process spawn or shell dependency in this adapter.
export function governanceHooks(directory: string, projectRoot = directory) {
  const usage = createUsageRuntime(directory, projectRoot)
  const save = async (raw: string, identity: string, extension: string) => {
    const folder = extension === "log" ? path.join(projectRoot, ".openarms", "logs") : path.join(directory, "governance")
    if (extension === "log") {
      // Reject pre-existing symlink/non-directory redirects, including the parent.
      // This is a local owner-controlled project, not a hostile shared filesystem.
      for (const target of [path.join(projectRoot, ".openarms"), folder]) {
        await mkdir(target, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error })
        const info = await lstat(target)
        if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o022)) throw Error("Unsafe project log directory")
      }
    }
    await mkdir(folder, { recursive: true, mode: 0o700 })
    let file = path.join(folder, `${hash(identity).slice(0, 24)}-${randomUUID()}.${extension}`)
    const handle = await open(file, "wx", 0o600)
    try { await handle.writeFile(raw, "utf8"); await handle.sync() }
    catch (error) { await handle.close(); await unlink(file).catch(() => {}); throw error }
    finally { await handle.close().catch(() => {}) }
    // Publish telemetry atomically and without overwriting a previous call record.
    if (extension === "json") {
      const stable = path.join(folder, `${hash(identity)}.json`)
      try { await link(file, stable) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error }
      finally { await unlink(file) }
      file = stable
    }
    // Retain seven days / 200 files / 256 MiB. Never remove this newly flushed log.
    try {
      const files = await Promise.all((await readdir(folder)).filter(name => /\.(log|json)$/.test(name)).map(async name => {
        const target = path.join(folder, name), info = await stat(target)
        return { target, size: info.size, time: info.mtimeMs }
      }))
      files.sort((a, b) => a.time - b.time)
      let count = files.length, total = files.reduce((sum, entry) => sum + entry.size, 0)
      for (const entry of files) {
        if (entry.target === file || Date.now() - entry.time < 60000) continue
        if (Date.now() - entry.time <= 604800000 && count <= 200 && total <= 268435456) continue
        await unlink(entry.target); count--; total -= entry.size
      }
    } catch { /* Retention is best effort; flushed data is still available. */ }
    return file
  }
  const emit = createTelemetry(async event => { await save(JSON.stringify(event), JSON.stringify([event.sessionID, event.callID]), "json") })
  return {
    "tool.execute.after": async (input: { tool: string; sessionID: string; callID: string; args: any }, output: { title: string; output: string; metadata: any }) => {
      const raw = output.output
      // Command is used only for local classification, never persisted in telemetry/log names.
      const command = typeof input.args?.redactedCommand === "string" ? input.args.redactedCommand
        : input.tool === "bash" && typeof input.args?.command === "string" ? input.args.command : ""
      const requested = input.tool === "read" && typeof input.args?.filePath === "string" ? input.args.filePath : undefined
      const governed = await governOutput(raw, { persistRaw: true, command, toolName: input.tool, path: requested, save: text => save(text, JSON.stringify([input.sessionID, input.callID]), "log"), authoritative: input.tool === "load_skill" || input.tool === "load_verified_skill" || input.tool === "load_skill_package" })
      output.output = governed.text
      // Observed host output, including wrappers/ranges: never infer full-file size/lines.
      const lines = raw ? raw.split(/\r\n|\r|\n/).length - (/[\r\n]$/.test(raw) ? 1 : 0) : 0
      const policy = requested ? evaluateFile({ path: requested, size: bytes(raw), lines }, { mode: "shadow" }) : undefined
      await emit({ version: 1, tool: input.tool, sessionID: input.sessionID, callID: input.callID,
        rawBytes: governed.rawBytes, contextBytes: governed.contextBytes, estimatedTokens: Math.ceil(governed.contextBytes / 4),
        domain: governed.domain, compactedBytes: governed.contextBytes, savingsRatio: governed.rawBytes ? (governed.rawBytes - governed.contextBytes) / governed.rawBytes : 0,
        truncation: governed.hardCapApplied ? "hard-cap" : governed.omittedBytes ? "compact" : "none",
        omittedBytes: governed.omittedBytes, omittedLines: governed.omittedLines, logStatus: governed.logStatus as "not-needed" | "written" | "failed",
        mode: "shadow", rule: policy?.rule ?? "NONE", decision: policy?.decision ?? "ALLOW",
        ...(policy ? { pathID: hash(policy.normalizedPath) } : {}) })
      await usage.capture({ schemaVersion: 1, kind: "tool", id: input.callID, session: input.sessionID,
        timestamp: new Date().toISOString(), revision: 0, completed: true, tool: input.tool,
        compaction: { domain: governed.domain, rawBytes: governed.rawBytes, compactedBytes: governed.contextBytes, savingsRatio: governed.rawBytes ? (governed.rawBytes - governed.contextBytes) / governed.rawBytes : 0 },
        metrics: { toolOutputBytes: governed.contextBytes, rawToolOutputBytes: governed.rawBytes,
          truncationCount: governed.hardCapApplied || governed.omittedBytes ? 1 : 0 },
      })
    },
  }
}
