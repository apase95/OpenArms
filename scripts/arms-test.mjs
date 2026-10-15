import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { constants, accessSync, realpathSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { allTests, changedFiles, createPlan, formatPlan, parseArgs, policy, root, syntaxInputs } from "./test-policy.mjs"
import { baselineReport, readObservations, recordRun, snapshot } from "./test-observation.mjs"
import { buildFingerprint, nonSmokeFingerprint, settings, smokeFingerprint } from "./smoke-inputs.mjs"
import { cachedSmoke, withLock } from "./smoke-cache.mjs"
import { runProcess } from "./test-process.mjs"
import { guardedRun } from "./test-failure.mjs"
import { formatSummary } from "../sandbox/process-output.mjs"
import { prepareSyntheticContext } from './synthetic-context.mjs'
import { automaticRetention } from '../sandbox/image-retention.mjs'
export { runProcess } from "./test-process.mjs"

export function commandFor(mode, files, plan, installed = false, synthetic = false) {
  if (mode === "syntax") return [process.execPath, ["scripts/test-syntax.mjs", ...syntaxInputs(files)]]
  if (["related", "full"].includes(mode)) return [process.execPath, ["--experimental-strip-types", "--test", "--test-reporter=tap", ...(mode === "full" ? allTests() : plan.related)]]
  if (mode === "smoke-static") return [process.execPath, ["sandbox/smoke-static.mjs"]]
  if (mode === "build") return [process.execPath, ["sandbox/manage.mjs", "build", ...(installed ? ["--installed"] : []), ...(synthetic ? ['--synthetic'] : []), "cli"]]
  return [process.execPath, ["sandbox/manage.mjs", mode, ...(installed ? ["--installed"] : []), ...(synthetic ? ['--synthetic'] : [])]]
}
function resultMetadata({ diagnostics, cleanupErrors, ...result }) { return result }
export function executionFingerprint(mode, command) {
  if (!["syntax", "related", "full"].includes(mode)) throw new Error(`Non-smoke fingerprint mode required: ${mode}`)
  return nonSmokeFingerprint(mode, command)
}
function executable(name) {
  return (process.env.PATH ?? "").split(path.delimiter).some((directory) => {
    try { accessSync(path.join(directory, name), constants.X_OK); return true } catch { return false }
  })
}
function capability(plan) {
  for (const entry of plan.decisions) {
    if (!["required", "recommended"].includes(entry.status) || !["smoke-runtime", "tui-smoke"].includes(entry.mode)) continue
    if (!executable("docker")) { entry.status = "blocked"; entry.reason = "DOCKER_MISSING: install Docker Engine + Compose v2" }
    else if (entry.mode === "tui-smoke" && (!executable("python3") || !["linux", "darwin"].includes(process.platform))) {
      entry.status = "blocked"; entry.reason = `PTY_UNAVAILABLE: use Linux/macOS; ${process.platform === "darwin" ? "brew install python" : "sudo apt-get install python3"}`
    }
  }
}
export function smokeVersions(mode, configuration) {
  const versions = { node: process.version, nodeImage: configuration.values.NODE_VERSION, opencode: configuration.values.OPENCODE_VERSION }
  const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8"))
  versions.pluginSDK = lock.packages["node_modules/@opencode-ai/plugin"].version
  if (mode !== "smoke-static") {
    const docker = JSON.parse(execFileSync("docker", ["version", "--format", "{{json .Server}}"], { encoding: "utf8", timeout: 15000 }))
    versions.docker = docker.Version
    versions.dockerDaemon = execFileSync("docker", ["info", "--format", "{{.ID}}"], { encoding: "utf8", timeout: 15000 }).trim()
  }
  if (mode === "tui-smoke") {
    try {
      versions.python = execFileSync("python3", ["-c", "import os,pty,sys; a,b=pty.openpty(); os.close(a); os.close(b); print(sys.version.split()[0])"], { encoding: "utf8", timeout: 10000 }).trim()
    } catch { throw new Error(`PTY_UNAVAILABLE: Python3 must support pty; ${process.platform === "darwin" ? "brew install python" : "sudo apt-get install python3"}`) }
    versions.platform = `${process.platform}/${process.arch}`
  }
  return versions
}
export function imageMatches(image, fingerprint, installed, synthetic = false) {
  let labels
  try { labels = JSON.parse(execFileSync("docker", ["image", "inspect", image, "--format", "{{json .Config.Labels}}"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 })) }
  catch (error) { if (/No such (?:image|object)/i.test(String(error.stderr))) return false; throw error }
  return labels?.["org.openarms.build-fingerprint"] === fingerprint && labels?.["org.openarms.library-mode"] === (synthetic ? 'synthetic' : installed ? "installed" : "repository")
}
async function mainTask(args, cancellation) {
  if (realpathSync(process.cwd()) !== realpathSync(root)) throw new Error("Run from the repository root")
  const options = parseArgs(args)
  if (options.mode === "report") { console.log(baselineReport(readObservations())); return 0 }
  const files = changedFiles(options)
  const plan = createPlan(files, options)
  if (options.mode === "baseline") {
    if (options.plan) {
      console.log("Scope | Status/class | Reason | Dependency | Cache\n" + `${options.command} | required | BASELINE_OBSERVATION | explicit legacy command | disabled`)
      return 0
    }
    const command = options.command === "npm-test" ? ["npm", ["run", "test:raw"]] : [process.execPath, ["sandbox/manage.mjs", options.command === "sandbox-test" ? "test" : options.command === "sandbox-smoke" ? "smoke" : "tui-smoke", ...(options.installed ? ["--installed"] : [])]]
    const state = snapshot(files, options.command)
    const previous = readObservations().filter((record) => record.source === "baseline" && record.task === options.task && record.mode === options.command)
    const startedAt = new Date().toISOString()
    const result = await runProcess(...command, policy.timeoutsMs.baseline, root, { mode: `baseline-${options.command}`, fingerprint: state.inputRevision, retention: policy.logRetention })
    recordRun({ ...state, ...resultMetadata(result), startedAt, completedAt: new Date().toISOString(), mode: options.command, command: options.command === "npm-test" ? "npm test (legacy raw suite)" : `sandbox ${options.command.replace("sandbox-", "")}`, changedFiles: files, source: "baseline", task: options.task, installed: options.installed, rerunCount: previous.length, duplicateCandidate: previous.some((record) => record.inputRevision === state.inputRevision && record.installed === options.installed) })
    console.log(formatSummary(`baseline-${options.command}`, result, "disabled"))
    return result.exitCode
  }
  capability(plan)
  if (options.plan) { console.log(formatPlan(plan)); return plan.decisions.some((entry) => entry.status === "blocked") ? 2 : 0 }
  if (plan.decisions.some((entry) => entry.status === "blocked")) { console.error(formatPlan(plan)); return 2 }
  const execute = async (mode, execution = {}) => {
    if (cancellation.signal) return { blocked: true, exitCode: cancellation.signal === "SIGINT" ? 130 : 143, signal: cancellation.signal, stage: mode, durationMs: 0 }
    const state = snapshot(files, mode)
    const startedAt = new Date().toISOString()
    const [command, commandArgs] = commandFor(mode, files, plan, options.installed, options.synthetic)
    const processOptions = { mode, stage: mode, retention: policy.logRetention, graceMs: policy.stageTimeoutsMs.grace, ...execution }
    const fingerprint = execution.fingerprint ?? executionFingerprint(mode, [command, ...commandArgs])
    const invoke = async () => {
      const result = await runProcess(command, commandArgs, policy.timeoutsMs[mode], root, { ...processOptions, fingerprint })
      result.processExitCode = result.exitCode
      if (result.logError) result.exitCode ||= 2
      return result
    }
    const result = execution.unguarded ? await invoke() : await guardedRun(mode, fingerprint, [command, ...commandArgs], invoke, { directory: root, force: options.force, reason: options.reason, timeoutMs: policy.timeoutsMs[mode] * 2, cancellation })
    recordRun({ ...state, ...resultMetadata(result), startedAt, completedAt: new Date().toISOString(), task: options.task, source: "runner", mode, command: ["node", ...commandArgs], changedFiles: files, plan, override: plan.override, installed: options.installed, force: Boolean(options.force), forceReason: options.reason, rebuild: Boolean(options.rebuild) })
    if (!execution.deferSummary) console.log(formatSummary(mode, result, ["syntax", "related", "full"].includes(mode) ? "disabled" : "miss"))
    return result
  }
  const completedBuilds = new Set()
  const smoke = async (mode) => {
    const configuration = settings()
    const versions = smokeVersions(mode, configuration)
    const fingerprint = smokeFingerprint(mode, { installed: options.installed, synthetic: options.synthetic, configuration, versions })
    const cacheBypass = Boolean(options.force || options.rebuild || process.env.CI)
    const result = await cachedSmoke(mode, fingerprint, () => guardedRun(mode, fingerprint, [process.execPath, ...commandFor(mode, files, plan, options.installed, options.synthetic)[1]], async () => {
      const environment = { ...process.env, ...configuration.values, ROUTER_LIBRARY: configuration.libraryRoot,
        OPENARMS_SERVER_STARTUP_MS: String(policy.stageTimeoutsMs.serverStartup), OPENARMS_REQUEST_TIMEOUT_MS: String(policy.stageTimeoutsMs.endpointRequest),
        OPENARMS_TUI_STARTUP_MS: String(policy.stageTimeoutsMs.tuiStartup), OPENARMS_TUI_INTERACTION_MS: String(policy.stageTimeoutsMs.tuiInteraction) }
      if (mode !== "smoke-static") {
         const buildKey = buildFingerprint({ installed: options.installed, synthetic: options.synthetic, configuration })
         const image = `openarms-sandbox:${options.synthetic ? 'synthetic' : options.installed ? "installed" : "repository"}-${buildKey}`
         Object.assign(environment, { OPENARMS_SANDBOX_IMAGE: image, OPENARMS_BUILD_FINGERPRINT: buildKey, OPENARMS_LIBRARY_MODE: options.synthetic ? 'synthetic' : options.installed ? "installed" : "repository" })
        const build = await withLock(`build-${buildKey}`, async () => {
           if (completedBuilds.has(buildKey) || (!options.rebuild && imageMatches(image, buildKey, options.installed, options.synthetic))) {
            console.log(`SKIP: build unchanged inputs, matching image ${buildKey.slice(0, 12)}`)
            return { exitCode: 0 }
          }
           const prepared = options.synthetic ? prepareSyntheticContext(root) : undefined
           try {
             if (prepared) environment.OPENARMS_BUILD_CONTEXT = prepared.context
              const built = await execute("build", { environment: { ...environment, OPENARMS_IMAGE_RETENTION: 'off' }, fingerprint: buildKey })
             if (!built.exitCode && (!imageMatches(image, buildKey, options.installed, options.synthetic) || buildFingerprint({ installed: options.installed, synthetic: options.synthetic, configuration: settings() }) !== buildKey)) return { ...built, exitCode: 2, inputChanged: true }
             return built
           } finally { prepared?.cleanup() }
        }, { cancellation })
          if (build.exitCode) return build
          automaticRetention({ environment })
         // Compose run uses the inspected image (--pull never), no --build flag.
         // A nonexistent context fails closed if Compose attempts an implicit build.
         if (options.synthetic) environment.OPENARMS_BUILD_CONTEXT ||= '/tmp/openarms-synthetic-image-only'
        completedBuilds.add(buildKey)
        environment.OPENARMS_SMOKE_PROJECT = `openarms-smoke-${randomUUID().slice(0, 12)}`
      }
        let result
        try { result = await execute(mode, { environment, fingerprint, unguarded: true, deferSummary: true }) }
        finally {
          if (environment.OPENARMS_SMOKE_PROJECT) {
             const cleanup = await runProcess(process.execPath, ["sandbox/manage.mjs", "stop", "--volumes", "--remove-orphans", ...(options.installed ? ["--installed"] : []), ...(options.synthetic ? ['--synthetic'] : [])], policy.stageTimeoutsMs.cleanup, root, { environment, mode: "cleanup", stage: `cleanup:${mode}`, fingerprint, retention: policy.logRetention })
            recordRun({ source: "cleanup", mode, ...resultMetadata(cleanup), task: options.task })
            if (cleanup.exitCode || cleanup.logError) {
              if (result) { result.cleanupErrors = [`CLEANUP_FAILED: exit=${cleanup.exitCode} stage=${cleanup.stage} log=${cleanup.logPath}`]; result.exitCode ||= cleanup.exitCode || 2 }
              else console.error(formatSummary("cleanup", cleanup, "disabled"))
            }
          }
        }
         const current = smokeFingerprint(mode, { installed: options.installed, synthetic: options.synthetic, configuration: settings(), versions })
        result.inputChanged = current !== fingerprint
        if (cancellation.signal) { result.signal ??= cancellation.signal; result.exitCode ||= cancellation.signal === "SIGINT" ? 130 : 143 }
        return result
    }, { directory: root, force: options.force, reason: options.reason, timeoutMs: policy.timeoutsMs[mode] * 2, cancellation }), { force: cacheBypass, versions, timeoutMs: policy.timeoutsMs[mode] * 2, cancellation })
    recordRun({ ...resultMetadata(result), source: "smoke-result", mode, fingerprint, task: options.task, durationMs: result.cached ? 0 : result.durationMs, override: plan.override, force: Boolean(options.force), forceReason: options.reason, rebuild: Boolean(options.rebuild), ciCacheBypass: Boolean(process.env.CI), installed: options.installed })
    if (result.cached) console.log(`SKIP: ${mode} unchanged inputs, previous pass ${fingerprint.slice(0, 12)}`)
    else console.log(formatSummary(mode, result, "miss"))
    return result.exitCode
  }
  for (const entry of plan.decisions) {
    if (cancellation.signal) return cancellation.signal === "SIGINT" ? 130 : 143
    if (!["required", "recommended"].includes(entry.status)) continue
    const code = ["smoke-static", "smoke-runtime", "tui-smoke"].includes(entry.mode) ? await smoke(entry.mode) : (await execute(entry.mode)).exitCode
    if (code) return code
  }
  if (plan.decisions.every((entry) => entry.status === "skipped")) console.log("SKIP: no code checks required")
  return 0
}
export async function main(args = process.argv.slice(2)) {
  const cancellation = {}
  const handlers = ["SIGINT", "SIGTERM"].map((signal) => [signal, () => { cancellation.signal ??= signal }])
  for (const [signal, handler] of handlers) process.on(signal, handler)
  try { const code = await mainTask(args, cancellation); return code || (cancellation.signal === "SIGINT" ? 130 : cancellation.signal === "SIGTERM" ? 143 : 0) }
  finally { for (const [signal, handler] of handlers) process.off(signal, handler) }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main() } catch (error) { console.error(`CONFIG_ERROR: ${error.message}`); process.exitCode = 2 }
}
