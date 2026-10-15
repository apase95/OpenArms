import assert from "node:assert/strict"
import { execFile, execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import { promisify } from "node:util"
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, utimesSync, statSync, symlinkSync, existsSync, chmodSync, truncateSync } from "node:fs"
import { tmpdir, hostname } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, test } from "node:test"
import { root, policy, createPlan, parseArgs } from "../scripts/test-policy.mjs"
import { smokePolicy, smokeFingerprint, buildFingerprint, digestTree, settings, dockerIgnore, canonical } from "../scripts/smoke-inputs.mjs"
import { cachedSmoke, readStamp, withLock } from "../scripts/smoke-cache.mjs"
import { guardedRun } from "../scripts/test-failure.mjs"
import { acceptanceReport } from "../scripts/phase0-report.mjs"
import { validateStatic } from "../sandbox/smoke-static.mjs"

const directories = []
// CLI fixtures mock image validation, not Docker's retention inventory.
process.env.OPENARMS_IMAGE_RETENTION = 'off'
test("runtime install cache boundary excludes changing image identity", () => {
  const source = readFileSync(path.join(root, "sandbox/Dockerfile"), "utf8")
  const runtime = source.slice(source.indexOf("FROM dependencies AS runtime"))
  const install = runtime.indexOf("RUN apt-get update")
  const lastRun = runtime.lastIndexOf("\nRUN ")
  assert.ok(install >= 0)
  for (const name of ["OPENARMS_BUILD_FINGERPRINT", "OPENARMS_LIBRARY_MODE"]) {
    assert.ok(runtime.indexOf(`ARG ${name}=`) > lastRun, `${name} must not enter RUN cache environments`)
  }
  assert.ok(runtime.indexOf("COPY src/") > install, "source changes must not invalidate installation")
  assert.match(runtime, /LABEL org\.openarms\.build-fingerprint=\$OPENARMS_BUILD_FINGERPRINT\s*\\\n\s*org\.openarms\.library-mode=\$OPENARMS_LIBRARY_MODE/)
})
test("runtime install cache boundary retains legitimate version and manifest invalidation", () => {
  const source = readFileSync(path.join(root, "sandbox/Dockerfile"), "utf8")
  assert.match(source, /COPY package\.json package-lock\.json \.\/\s*\nRUN npm ci/)
  const runtime = source.slice(source.indexOf("FROM dependencies AS runtime"))
  assert.ok(runtime.indexOf("ARG OPENCODE_VERSION=") < runtime.indexOf("RUN apt-get update"))
  assert.match(runtime, /npm install --global "opencode-ai@\$\{OPENCODE_VERSION\}"/)
  assert.match(runtime, /test "\$\(opencode --version\)" = "\$\{OPENCODE_VERSION\}"/)
})
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
function temporary() { const directory = mkdtempSync(path.join(tmpdir(), "arms-smoke-")); directories.push(directory); return directory }
function put(directory, file, text) { mkdirSync(path.dirname(path.join(directory, file)), { recursive: true }); writeFileSync(path.join(directory, file), text) }
function fixture() {
  const directory = temporary()
  const files = new Set([...Object.keys(policy.files).filter((file) => /\.(?:ts|tsx|mjs|json|yaml)$/.test(file)), ...smokePolicy.commonInputs, ...Object.values(smokePolicy.modes).flatMap((mode) => mode.inputs), ".dockerignore", "LICENSE"])
  for (const file of files) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true })
    copyFileSync(path.join(root, file), path.join(directory, file))
  }
  put(directory, "sandbox/fixtures/docs-project/README.md", "Docs fixture")
  put(directory, "sandbox/fixtures/empty-project/.gitkeep", "")
  put(directory, "tests/fixture.test.mjs", "export {}")
  put(directory, "skills/fixture.txt", "opaque fixture bytes")
  return directory
}
function fingerprint(directory, mode, extra = {}) {
  return smokeFingerprint(mode, { directory, configuration: settings(directory, {}), versions: { node: "v24.12.0", opencode: "1.18.35", pluginSDK: "1.18.34" }, ...extra })
}
function buildKey(directory, extra = {}) { return buildFingerprint({ directory, configuration: settings(directory, {}), ...extra }) }
function log(directory) { put(directory, ".openarms/logs/fixture.log", "complete fixture log"); return ".openarms/logs/fixture.log" }

test("offline assertions validate templates, paths, compose and source tool contract", () => {
  const directory = fixture()
  assert.equal(validateStatic(directory, {}).checks, 8)
  put(directory, "sandbox/config/tui.json", "{broken")
  assert.throws(() => validateStatic(directory, {}))
})
test("CLI static failure exits before Docker probe, build or OpenCode startup", () => {
  const directory = fixture()
  symlinkSync(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir")
  execFileSync("git", ["init", "--quiet", directory])
  execFileSync("git", ["add", "."], { cwd: directory })
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture"], { cwd: directory })
  const marker = path.join(directory, "docker-called")
  put(directory, "bin/docker", `#!/bin/sh\ntouch "${marker}"\nexit 99\n`)
  const bin = path.join(directory, "bin/docker")
  // The fixture executable only records an accidental invocation.
  chmodSync(bin, 0o755)
  put(directory, "sandbox/config/tui.json", "{broken")
  assert.throws(() => execFileSync(process.execPath, ["scripts/arms-test.mjs", "smoke-runtime", "--file", "sandbox/config/tui.json"], {
    cwd: directory, encoding: "utf8", env: { ...process.env, PATH: `${path.join(directory, "bin")}${path.delimiter}${process.env.PATH}`, CI: "" },
  }), (error) => error.status === 1 && /STATIC_SMOKE_FAILED/.test(error.stdout + error.stderr))
  assert.equal(existsSync(marker), false)
})
test("CLI cleanup failure preserves the smoke error and third retry blocks before startup", () => {
  const directory = fixture()
  symlinkSync(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir")
  execFileSync("git", ["init", "--quiet", directory])
  execFileSync("git", ["add", "."], { cwd: directory })
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture"], { cwd: directory })
  const starts = path.join(directory, "starts")
  put(directory, "bin/docker", `#!${process.execPath}\nimport{appendFileSync}from'node:fs';const a=process.argv.slice(2);if(a[0]==='version')console.log(JSON.stringify({Version:'fixture'}));else if(a[0]==='info')console.log('fixture-daemon');else if(a[0]==='image'){const key=a[2].split('repository-')[1];console.log(JSON.stringify({'org.openarms.build-fingerprint':key,'org.openarms.library-mode':'repository'}))}else if(a.includes('run')){appendFileSync(${JSON.stringify(starts)},'start\\n');console.log('STAGE: server-startup');console.error('TypeError: deterministic smoke fixture error');process.exitCode=7}else if(a.includes('down')){console.error('ERROR: fixture cleanup failed');process.exitCode=9}else process.exitCode=99;`)
  chmodSync(path.join(directory, "bin/docker"), 0o755)
  const invoke = (extra = []) => {
    try { execFileSync(process.execPath, ["scripts/arms-test.mjs", "smoke-runtime", "--file", "sandbox/smoke-runtime.mjs", "--task", "retry-fixture", ...extra], { cwd: directory, encoding: "utf8", env: { ...process.env, PATH: `${path.join(directory, "bin")}${path.delimiter}${process.env.PATH}`, CI: "" } }); assert.fail("fixture should fail") }
    catch (error) { return error }
  }
  for (const attempt of [1, 2]) {
    const result = invoke()
    assert.equal(result.status, 7)
    assert.match(result.stdout, /deterministic smoke fixture error/)
    assert.match(result.stdout, /CLEANUP_FAILED: exit=9/)
  }
  const report = () => acceptanceReport(readFileSync(path.join(directory, ".openarms/test-runs.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line)))
  const beforeBlocked = report()
  const blocked = invoke()
  assert.equal(blocked.status, 2)
  assert.match(blocked.stdout, /RETRY_BLOCKED/)
  assert.equal(readFileSync(starts, "utf8"), "start\nstart\n")
  assert.equal(report(), beforeBlocked)
  const forced = invoke(["--force", "--reason", "diagnosed fixture cleanup"])
  assert.equal(forced.status, 7)
  assert.equal(readFileSync(starts, "utf8"), "start\nstart\nstart\n")
})
test("every integration rule adds static exactly once and server/core does not add TUI", () => {
  const selected = (files) => createPlan(files, parseArgs([])).decisions.filter((entry) => ["required", "recommended"].includes(entry.status)).map((entry) => entry.mode)
  for (const file of ["plugins/skill-router-server.ts", "src/runtime.ts", "src/package-loader.ts", "sandbox/config/opencode.json", "sandbox/smoke-runtime.mjs"]) {
    const modes = selected([file])
    assert.ok(modes.includes("smoke-runtime"), file)
    assert.equal(modes.filter((mode) => mode === "smoke-static").length, 1)
    assert.ok(!modes.includes("tui-smoke"), file)
  }
  for (const file of ["plugins/skill-router-tui.tsx", "plugins/tui-core.ts", "src/skills-service.ts", "sandbox/config/tui.json", "sandbox/tui-smoke.py"]) {
    const modes = selected([file])
    assert.ok(modes.includes("tui-smoke"), file)
    assert.ok(!modes.includes("smoke-runtime"), file)
  }
  for (const file of ["src/commands.ts", "src/state-store.ts", "registry.json", "docs/testing.md", "skills/fixture.txt"]) assert.ok(!selected([file]).includes("tui-smoke"))
  for (const file of ["sandbox/new-adapter.mjs", "plugins/new-plugin.ts"]) assert.ok(createPlan([file], parseArgs([])).decisions.every((entry) => entry.status === "blocked"))
})
test("CLI orchestration builds once, stamps pass, reuses, forces and invalidates; CI distrusts stamps", () => {
  const directory = fixture()
  symlinkSync(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir")
  execFileSync("git", ["init", "--quiet", directory])
  execFileSync("git", ["add", "."], { cwd: directory })
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture"], { cwd: directory })
  put(directory, "bin/docker", `#!${process.execPath}
import{appendFileSync,existsSync,writeFileSync}from'node:fs';
const a=process.argv.slice(2), image=${JSON.stringify(path.join(directory, "image"))}, events=${JSON.stringify(path.join(directory, "events"))};
if(a[0]==='version')console.log(JSON.stringify({Version:'fixture'}));
else if(a[0]==='info')console.log('fixture-daemon');
else if(a[0]==='image'){if(!existsSync(image)){console.error('No such image');process.exitCode=1}else console.log(JSON.stringify({'org.openarms.build-fingerprint':process.env.OPENARMS_BUILD_FINGERPRINT||a[2].split('repository-')[1],'org.openarms.library-mode':'repository'}))}
else if(a.includes('build')){writeFileSync(image,'built');appendFileSync(events,'build\\n')}
else if(a.includes('run')){appendFileSync(events,'runtime\\n');console.log('SMOKE_OK: 1 checks')}
else if(a.includes('down'))appendFileSync(events,'cleanup\\n');
else process.exitCode=99;
`)
  chmodSync(path.join(directory, "bin/docker"), 0o755)
  const invoke = (extra = [], ci = "") => execFileSync(process.execPath, ["scripts/arms-test.mjs", "smoke-runtime", "--file", "sandbox/smoke-runtime.mjs", ...extra], {
    cwd: directory, encoding: "utf8", env: { ...process.env, PATH: `${path.join(directory, "bin")}${path.delimiter}${process.env.PATH}`, CI: ci },
  })
  assert.match(invoke(), /PASS: smoke-runtime/)
  assert.equal(readFileSync(path.join(directory, "events"), "utf8"), "build\nruntime\ncleanup\n")
  assert.match(invoke(), /SKIP: smoke-runtime unchanged inputs/)
  put(directory, "docs/edit.md", "docs-only change")
  assert.match(invoke(), /SKIP: smoke-runtime unchanged inputs/)
  const mappedPolicy = JSON.parse(readFileSync(path.join(directory, "scripts/test-policy.json"), "utf8"))
  mappedPolicy.files["docs/edit.md"] = "docs"
  put(directory, "scripts/test-policy.json", JSON.stringify(mappedPolicy))
  assert.match(invoke(), /SKIP: smoke-runtime unchanged inputs/)
  invoke(["--force"])
  put(directory, "src/runtime.ts", readFileSync(path.join(directory, "src/runtime.ts"), "utf8") + "\n// invalidate server dependency")
  assert.match(invoke(), /PASS: smoke-runtime/)
  assert.match(invoke([], "true"), /PASS: smoke-runtime/)
  const events = readFileSync(path.join(directory, "events"), "utf8").trim().split("\n")
  assert.equal(events.filter((e) => e === "runtime").length, 4)
  assert.equal(events.filter((e) => e === "cleanup").length, 4)
})
test("strict force/rebuild options preserve legacy smoke alias and prerequisites", () => {
  assert.equal(parseArgs(["--force", "tui-smoke"]).force, true)
  assert.equal(parseArgs(["smoke"]).mode, "smoke-runtime")
  const plan = createPlan([], parseArgs(["smoke", "--rebuild"]))
  assert.equal(plan.rebuild, true)
  assert.equal(plan.decisions.find((entry) => entry.mode === "smoke-static").reason, "STATIC_PREREQUISITE")
  assert.equal(plan.decisions.find((entry) => entry.mode === "smoke-runtime").cache, "bypassed-explicitly")
  assert.equal(parseArgs(["full", "--force", "--reason", "diagnosed fixture failure"]).force, true)
  for (const args of [["--reason", "missing force"], ["related", "--rebuild"], ["smoke-static", "--rebuild"], ["tui-smoke", "--force", "--force"]]) assert.throws(() => parseArgs(args))
})
test("fingerprints ignore workspace/timestamps/docs but invalidate dependencies", () => {
  const first = fixture(), second = fixture()
  assert.equal(fingerprint(first, "smoke-runtime"), fingerprint(second, "smoke-runtime"))
  assert.equal(buildKey(first), buildKey(second))
  const before = fingerprint(first, "smoke-runtime"), image = buildKey(first)
  utimesSync(path.join(first, "src/runtime.ts"), new Date(1), new Date(2))
  put(first, "docs/change.md", "documentation")
  assert.equal(fingerprint(first, "smoke-runtime"), before)
  assert.equal(buildKey(first), image)
  put(first, "src/runtime.ts", readFileSync(path.join(first, "src/runtime.ts"), "utf8") + "\n// dependency change")
  assert.notEqual(fingerprint(first, "smoke-runtime"), before)
  assert.notEqual(buildKey(first), image)
})
test("TUI dependencies invalidate only TUI; runtime dependencies invalidate both", () => {
  const directory = fixture()
  const server = fingerprint(directory, "smoke-runtime"), tui = fingerprint(directory, "tui-smoke"), staticKey = fingerprint(directory, "smoke-static")
  put(directory, "plugins/skill-router-tui.tsx", readFileSync(path.join(directory, "plugins/skill-router-tui.tsx"), "utf8") + "\n// render edit")
  assert.equal(fingerprint(directory, "smoke-runtime"), server)
  assert.equal(fingerprint(directory, "smoke-static"), staticKey)
  assert.notEqual(fingerprint(directory, "tui-smoke"), tui)
  put(directory, "src/state-schema.ts", readFileSync(path.join(directory, "src/state-schema.ts"), "utf8") + "\n// shared schema edit")
  assert.notEqual(fingerprint(directory, "smoke-runtime"), server)
})
test("smoke keys ignore classification-only policy edits but preserve execution settings", () => {
  const directory = fixture()
  const modes = ["smoke-static", "smoke-runtime", "tui-smoke"]
  const before = modes.map((mode) => fingerprint(directory, mode))
  const file = "scripts/test-policy.json", original = JSON.parse(readFileSync(path.join(directory, file), "utf8"))
  const classification = structuredClone(original)
  classification.files["docs/new.md"] = "docs"
  classification.patterns.push({ pattern: "^graphify-out/new.json$", class: "docs" })
  classification.classes.docs.reason = "UPDATED_DOCS_REASON"
  classification.version++
  put(directory, file, JSON.stringify(classification))
  assert.deepEqual(modes.map((mode) => fingerprint(directory, mode)), before)
  for (const mutate of [
    (p) => { p.timeoutsMs["smoke-runtime"]++ },
    (p) => { p.timeoutsMs.build++ },
    (p) => { p.stageTimeoutsMs.cleanup++ },
    (p) => { p.stageTimeoutsMs.grace++ },
    (p) => { p.logRetention.maxFiles++ },
    (p) => { p.futureExecutionSetting = true },
  ]) {
    const changed = structuredClone(original)
    mutate(changed); put(directory, file, JSON.stringify(changed))
    for (const [index, mode] of modes.entries()) assert.notEqual(fingerprint(directory, mode), before[index])
  }
})
test("allowlisted environment and tool versions affect keys without raw secrets", () => {
  const directory = fixture()
  const before = fingerprint(directory, "smoke-runtime")
  put(directory, "sandbox/.env", "TERM=xterm-256color\nNOT_ALLOWED_SECRET=private\n")
  assert.equal(fingerprint(directory, "smoke-runtime"), before)
  put(directory, "sandbox/.env", "OPENCODE_VERSION=1.18.36\nNOT_ALLOWED_SECRET=different\n")
  assert.notEqual(fingerprint(directory, "smoke-runtime"), before)
  assert.notEqual(fingerprint(directory, "smoke-runtime", { versions: { node: "v25.0.0" } }), fingerprint(directory, "smoke-runtime"))
})
test("installed library bytes invalidate stamps; mode and path-independent identity differ", () => {
  const directory = fixture(), library = temporary(), moved = temporary()
  for (const target of [library, moved]) { put(target, "registry.json", "{}"); put(target, "skills/fixture.txt", "installed bytes") }
  const config = settings(directory, {})
  const first = fingerprint(directory, "smoke-runtime", { installed: true, configuration: { ...config, libraryRoot: library } })
  assert.equal(first, fingerprint(directory, "smoke-runtime", { installed: true, configuration: { ...config, libraryRoot: moved } }))
  assert.notEqual(first, fingerprint(directory, "smoke-runtime"))
  put(library, "skills/fixture.txt", "changed installed bytes")
  assert.notEqual(first, fingerprint(directory, "smoke-runtime", { installed: true, configuration: { ...config, libraryRoot: library } }))
  assert.notEqual(buildKey(directory), buildKey(directory, { installed: true }))
})
test("build fingerprint honors COPY, dockerignore, deletion and build args", () => {
  const directory = fixture(), initial = buildKey(directory)
  put(directory, "sandbox/.env", "TERM=xterm\n")
  put(directory, "sandbox/local/auth.json", "not a build input")
  assert.equal(buildKey(directory), initial)
  put(directory, "tests/fixture.test.mjs", "changed copied input")
  assert.notEqual(buildKey(directory), initial)
  const configuration = settings(directory, {})
  assert.notEqual(buildKey(directory), buildKey(directory, { configuration: { ...configuration, values: { ...configuration.values, NODE_VERSION: "24.15.0" } } }))
  rmSync(path.join(directory, "tests/fixture.test.mjs"))
  assert.notEqual(buildKey(directory), initial)
  const allowed = dockerIgnore(readFileSync(path.join(directory, ".dockerignore"), "utf8"))
  assert.equal(allowed("sandbox/.env.example"), true)
  assert.equal(allowed("sandbox/fixtures/docs-project/README.md"), true)
  assert.equal(allowed("sandbox/local/auth.json"), false)
})
test("three repeated and concurrent invocations execute once; force reruns", async () => {
  const directory = temporary(), logPath = log(directory)
  let calls = 0
  const execute = async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 30)); return { exitCode: 0, durationMs: 30, logPath } }
  const results = await Promise.all(Array.from({ length: 4 }, () => cachedSmoke("smoke-runtime", "same-input", execute, { directory })))
  assert.equal(calls, 1)
  assert.equal(results.filter((result) => result.cached).length, 3)
  await cachedSmoke("smoke-runtime", "same-input", execute, { directory, force: true })
  assert.equal(calls, 2)
  assert.equal(statSync(path.join(directory, ".openarms/test-results/smoke-runtime/same-input.json")).mode & 0o777, 0o600)
})
test("failed, timed out, signalled, changed-input and log-failed results never cache", async () => {
  const directory = temporary(), logPath = log(directory)
  for (const extra of [{ exitCode: 1 }, { timedOut: true }, { signal: "SIGTERM" }, { inputChanged: true }, { logError: "disk full" }]) {
    let calls = 0
    const execute = async () => { calls++; return { exitCode: 0, ...extra, logPath } }
    await cachedSmoke("tui-smoke", "failed-key", execute, { directory })
    await cachedSmoke("tui-smoke", "failed-key", execute, { directory })
    assert.equal(calls, 2)
    assert.equal(readStamp("tui-smoke", "failed-key", directory), null)
  }
})
test("deleted log, corrupt stamp and changed fingerprint cannot reuse pass", async () => {
  const directory = temporary(), logPath = log(directory)
  await cachedSmoke("smoke-static", "pass-key", async () => ({ exitCode: 0, logPath }), { directory })
  assert.ok(readStamp("smoke-static", "pass-key", directory))
  assert.equal(readStamp("smoke-static", "another-key", directory), null)
  rmSync(path.join(directory, logPath))
  assert.equal(readStamp("smoke-static", "pass-key", directory), null)
  put(directory, ".openarms/test-results/smoke-static/pass-key.json", "{partial")
  assert.equal(readStamp("smoke-static", "pass-key", directory), null)
})
test("a failed forced rerun invalidates the prior pass instead of resurrecting it", async () => {
  const directory = temporary(), logPath = log(directory)
  await cachedSmoke("smoke-runtime", "prior-pass", async () => ({ exitCode: 0, logPath }), { directory })
  await cachedSmoke("smoke-runtime", "prior-pass", async () => ({ exitCode: 1, logPath }), { directory, force: true })
  assert.equal(readStamp("smoke-runtime", "prior-pass", directory), null)
})
test("separate Node processes coordinate one owner for a fingerprint", async () => {
  const directory = temporary(), logPath = log(directory)
  const module = pathToFileURL(path.join(root, "scripts/smoke-cache.mjs")).href
  const code = `import { cachedSmoke } from ${JSON.stringify(module)}; import { appendFileSync } from 'node:fs'; await cachedSmoke('smoke-runtime','process-key',async()=>{appendFileSync(${JSON.stringify(path.join(directory, "starts"))},'start\\n');await new Promise(r=>setTimeout(r,150));return {exitCode:0,logPath:${JSON.stringify(logPath)}}},{directory:${JSON.stringify(directory)}});`
  await Promise.all([1, 2, 3].map(() => promisify(execFile)(process.execPath, ["--input-type=module", "-e", code])))
  assert.equal(readFileSync(path.join(directory, "starts"), "utf8"), "start\n")
})
test("a dead cache owner is recovered without reusing an in-progress result", async () => {
  const directory = temporary()
  put(directory, ".openarms/test-locks/dead-owner/owner.json", JSON.stringify({ pid: 2147483647, host: hostname(), token: "old" }))
  assert.equal(await withLock("dead-owner", async () => "new-owner", { directory, timeoutMs: 1000 }), "new-owner")
  assert.equal(existsSync(path.join(directory, ".openarms/test-locks/dead-owner")), false)
})
test("cancelled lock callers never execute, stamp a pass or record an artificial failure", async () => {
  const directory = temporary(), cancellation = { signal: "SIGTERM" }
  const execute = () => assert.fail("cancelled callback must not run")
  for (const result of [
    await withLock("build-input", execute, { directory, cancellation }),
    await cachedSmoke("smoke-runtime", "cancelled-input", execute, { directory, cancellation }),
    await guardedRun("full", "cancelled-input", ["node", "fixture"], execute, { directory, cancellation }),
    await guardedRun("full", "nested-input", ["node", "nested"],
      () => withLock("build-input", execute, { directory, cancellation }), { directory }),
  ]) {
    assert.equal(result.blocked, true)
    assert.equal(result.exitCode, 143)
    assert.equal(result.signal, "SIGTERM")
  }
  assert.equal(readStamp("smoke-runtime", "cancelled-input", directory), null)
  assert.equal(existsSync(path.join(directory, ".openarms/test-failures")), false)
})
test("SIGINT/SIGTERM stop a real runner lock waiter and preserve the separate owner", async () => {
  const directory = fixture()
  symlinkSync(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir")
  execFileSync("git", ["init", "--quiet", directory])
  execFileSync("git", ["add", "."], { cwd: directory })
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture"], { cwd: directory })
  const command = [path.basename(process.execPath), "--experimental-strip-types", "--test", "--test-reporter=tap", "tests/fixture.test.mjs"]
  const key = createHash("sha256").update(JSON.stringify({ mode: "full", command })).digest("hex")
  const lockName = `failure-full-${key}`
  const ownerFile = path.join(directory, ".openarms/test-locks", lockName, "owner.json")
  const module = pathToFileURL(path.join(directory, "scripts/smoke-cache.mjs")).href
  const ownerCode = `import{withLock}from ${JSON.stringify(module)};await withLock(${JSON.stringify(lockName)},async()=>{process.send('owned');await new Promise(r=>process.once('message',r))},{directory:${JSON.stringify(directory)}});process.disconnect();`
  const owner = spawn(process.execPath, ["--input-type=module", "-e", ownerCode], { cwd: directory, stdio: ["ignore", "ignore", "ignore", "ipc"] })
  const ownerExit = once(owner, "close")
  try {
    await once(owner, "message")
    const originalOwner = readFileSync(ownerFile, "utf8")
    for (const signal of ["SIGINT", "SIGTERM"]) {
      const code = `import{main}from './scripts/arms-test.mjs';const run=main(['full','--file','tests/fixture.test.mjs']);process.send('waiting');process.exitCode=await run;process.disconnect();`
      const waiter = spawn(process.execPath, ["--input-type=module", "-e", code], { cwd: directory, stdio: ["ignore", "ignore", "ignore", "ipc"] })
      const waiterExit = once(waiter, "close")
      const deadline = setTimeout(() => waiter.kill("SIGKILL"), 5000)
      try {
        await once(waiter, "message")
        const started = Date.now()
        waiter.kill(signal)
        assert.equal((await waiterExit)[0], signal === "SIGINT" ? 130 : 143)
        assert.ok(Date.now() - started < 2000, "cancelled waiter did not exit promptly")
        assert.equal(readFileSync(ownerFile, "utf8"), originalOwner)
        assert.equal(existsSync(path.join(directory, ".openarms/test-failures")), false)
      } finally { clearTimeout(deadline); if (waiter.exitCode === null) waiter.kill("SIGKILL") }
    }
    owner.send("release")
    assert.equal((await ownerExit)[0], 0)
    assert.equal(existsSync(ownerFile), false)
  } finally { if (owner.exitCode === null) { owner.kill("SIGKILL"); await ownerExit } }
})
test("basic byte digest is order-stable and invalidates file deletion", () => {
  const directory = temporary()
  put(directory, "a", "one"); put(directory, "b", "two")
  assert.equal(digestTree(directory, ["a", "b"], { a: 1, b: 2 }), digestTree(directory, ["b", "a"], { b: 2, a: 1 }))
  const before = digestTree(directory, ["a", "b"], {})
  rmSync(path.join(directory, "a"))
  assert.notEqual(digestTree(directory, ["a", "b"], {}), before)
})
test("chunked digest preserves byte framing, executable bits and safe symlinks", () => {
  const directory = temporary()
  put(directory, "tree/source", "lỗi Unicode"); chmodSync(path.join(directory, "tree/source"), 0o755)
  symlinkSync("tree/source", path.join(directory, "alias"))
  const source = Buffer.from("lỗi Unicode"), target = Buffer.from("tree/source")
  const expected = createHash("sha256").update(canonical({ check: true }))
  for (const [file, type, bytes] of [["alias", "symlink", target], ["missing", "missing", Buffer.alloc(0)], ["tree", "directory", Buffer.alloc(0)], ["tree/source", "file:73", source]]) {
    expected.update(canonical([file, type, bytes.length])).update(bytes)
  }
  assert.equal(digestTree(directory, ["tree", "alias", "missing"], { check: true }), expected.digest("hex"))
  symlinkSync("cycle", path.join(directory, "cycle"))
  assert.throws(() => digestTree(directory, ["cycle"], {}), /Unsafe\/cyclic/)
  symlinkSync("../outside", path.join(directory, "escape"))
  assert.throws(() => digestTree(directory, ["escape"], {}), /Unsafe\/cyclic/)
})
test("fingerprinting 128 MiB does not retain input bytes in memory", () => {
  const directory = temporary()
  for (const name of ["a", "b"]) { put(directory, name, ""); truncateSync(path.join(directory, name), 64 * 1024 * 1024) }
  const module = pathToFileURL(path.join(root, "scripts/smoke-inputs.mjs")).href
  const code = `import{digestTree}from ${JSON.stringify(module)};const before=process.resourceUsage().maxRSS;const hash=digestTree(${JSON.stringify(directory)},['a','b'],{});console.log(JSON.stringify({hash,growth:(process.resourceUsage().maxRSS-before)*1024}));`
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 10000 }))
  assert.match(result.hash, /^[a-f0-9]{64}$/)
  assert.ok(result.growth < 48 * 1024 * 1024, `Fingerprint RSS grew with input bytes: ${result.growth}`)
})
