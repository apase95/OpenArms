import assert from "node:assert/strict"
import { spawn, execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync, utimesSync, existsSync, openSync, readSync, closeSync } from "node:fs"
import { tmpdir, hostname } from "node:os"
import { createServer } from "node:net"
import { pathToFileURL } from "node:url"
import path from "node:path"
import { afterEach, test } from "node:test"
import { BoundedOutput, formatSummary } from "../sandbox/process-output.mjs"
import { runProcess, pruneLogs } from "../scripts/test-process.mjs"
import { guardedRun, failureSignature } from "../scripts/test-failure.mjs"
import { root } from "../scripts/test-policy.mjs"

const directories = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
function temporary() { const directory = mkdtempSync(path.join(tmpdir(), "arms-process-")); directories.push(directory); return directory }
function put(directory, file, text) { mkdirSync(path.dirname(path.join(directory, file)), { recursive: true }); writeFileSync(path.join(directory, file), text) }
const node = (code, directory, options = {}, timeout = 5000) => runProcess(process.execPath, ["-e", code], timeout, directory, { mode: "fixture", ...options })

test("UTF-8 split boundaries and interleaved streams retain first compiler and last Docker error", () => {
  const output = new BoundedOutput()
  const text = Buffer.from("\x1b[31mError: lỗi biên dịch Việt\x1b[0m\n")
  for (const byte of text) output.push(Buffer.from([byte]), "stderr")
  output.push(Buffer.alloc(200000, 120), "stdout")
  output.push("\nERROR: failed to solve: final Docker error\n", "stderr")
  output.finish()
  assert.ok(output.maxRetainedBytes <= 65536)
  assert.match(output.diagnostics().join("\n"), /lỗi biên dịch Việt/)
  assert.match(output.diagnostics().join("\n"), /final Docker error/)
  assert.ok(!output.diagnostics().join("\n").includes("\x1b"))
})
test("TAP summary preserves failed test, counts and bounded failure diagnostics", () => {
  const output = new BoundedOutput()
  output.push("not ok 1 - protects important boundary\n  error: AssertionError: expected true\n# tests 9\n# pass 8\n")
  output.finish()
  const result = { exitCode: 1, durationMs: 12, tests: output.tests, failedTest: output.failedTest, diagnostics: output.diagnostics(), logPath: ".openarms/logs/unit.log", cleanupErrors: ["CLEANUP_FAILED: fixture cleanup failed"] }
  const summary = formatSummary("related", result)
  assert.match(summary, /test:protects important boundary/)
  assert.match(summary, /AssertionError/)
  assert.match(summary, /CLEANUP_FAILED/)
  assert.ok(summary.split("\n").length <= 32)
  assert.equal(formatSummary("full", { ...result, exitCode: 0, cleanupErrors: [] }).split("\n").length, 1)
  assert.match(formatSummary("full", { ...result, exitCode: 0, cleanupErrors: [] }), /tests=9.*cache=miss/)
})
test("unparseable output has explicit bounded head/tail fallback", () => {
  const output = new BoundedOutput({ headBytes: 1000, tailBytes: 1000 })
  output.push("first mystery\n" + "middle\n".repeat(1000) + "last mystery\n")
  output.finish()
  const lines = output.diagnostics()
   assert.equal(lines[0], "UNPARSEABLE_TEST_OUTPUT")
  assert.ok(lines.includes("first mystery")); assert.ok(lines.includes("last mystery"))
  assert.ok(lines.length <= 30)
})
test("raw stdout/stderr bytes are logged completely with exclusive owner-only files", async () => {
  const directory = temporary()
  const result = await node("process.stdout.write('raw stdout\\n');process.stderr.write('raw stderr\\n');process.exitCode=7", directory)
  assert.equal(result.exitCode, 7)
  const text = readFileSync(path.join(directory, result.logPath), "utf8")
  assert.ok(text.includes("raw stdout\n")); assert.ok(text.includes("raw stderr\n"))
  assert.equal(Buffer.byteLength(text), result.stdoutBytes + result.stderrBytes)
  assert.equal(statSync(path.join(directory, result.logPath)).mode & 0o777, 0o600)
  const second = await node("process.stdout.write('another')", directory)
  assert.notEqual(result.logPath, second.logPath)
})
test("log failure is explicit and retains bounded diagnostics instead of claiming a saved log", async () => {
  const directory = temporary()
  put(directory, "not-a-directory", "file")
  const result = await node("process.stderr.write('TypeError: actual fixture failure\\n');process.exitCode=5", directory, { logPath: "not-a-directory/output.log" })
  assert.equal(result.exitCode, 5); assert.ok(result.logError)
  const summary = formatSummary("fixture", result)
  assert.match(summary, /LOG_WRITE_FAILED/); assert.match(summary, /actual fixture failure/)
  assert.match(summary, /Full log: unavailable/)
})
test("raw log write precedes output parsing and summary sampling", async () => {
  const directory = temporary(), logPath = ".openarms/logs/raw-first.log"
  let committedBytes = 0
  const result = await node("process.stdout.write('committed before parsing\\n')", directory, { logPath, onSample: () => { committedBytes = statSync(path.join(directory, logPath)).size } })
  assert.equal(result.exitCode, 0)
  assert.equal(committedBytes, result.stdoutBytes)
  assert.equal(readFileSync(path.join(directory, logPath), "utf8"), "committed before parsing\n")
})
test("256 MiB single-line fixture keeps bounded memory and full head/tail log", async () => {
  const directory = temporary()
  const peaks = { a: 0, b: 0 }
  const code = `const {once}=require('node:events');(async()=>{const chunk=Buffer.alloc(1024*1024,120);process.stderr.write('TypeError: first compile failure\\n');for(const phase of ['a','b']){process.stdout.write('\\nSTAGE: stress-'+phase+'\\n');for(let i=0;i<128;i++){if(!process.stdout.write(chunk))await once(process.stdout,'drain')}}process.stdout.write('\\nERROR: failed to solve: final Docker error\\n');process.exitCode=1})()`
  const result = await node(code, directory, { onSample: ({ stage }) => { const phase = stage === "stress-a" ? "a" : "b"; peaks[phase] = Math.max(peaks[phase], process.memoryUsage().rss) } }, 30000)
  assert.equal(result.exitCode, 1)
  assert.ok(result.stdoutBytes >= 256 * 1024 * 1024)
  assert.ok(result.maxRetainedBytes <= 65536)
  assert.ok(peaks.b - peaks.a < 48 * 1024 * 1024, `RSS grew with the second 128 MiB: ${peaks.b - peaks.a}`)
  const log = path.join(directory, result.logPath)
  assert.equal(statSync(log).size, result.stdoutBytes + result.stderrBytes)
  const fd = openSync(log, "r"), tail = Buffer.alloc(128)
  readSync(fd, tail, 0, tail.length, statSync(log).size - tail.length); closeSync(fd)
  assert.match(tail.toString(), /final Docker error/)
  assert.match(result.diagnostics.join("\n"), /first compile failure/)
  assert.match(result.diagnostics.join("\n"), /final Docker error/)
})
test("timeout kills a grandchild that ignores SIGTERM and releases its port", async () => {
  const directory = temporary(), record = path.join(directory, "port.json")
  const child = `const net=require('node:net'),fs=require('node:fs');process.on('SIGTERM',()=>{});const server=net.createServer();server.listen(0,'127.0.0.1',()=>fs.writeFileSync(${JSON.stringify(record)},JSON.stringify({pid:process.pid,port:server.address().port})))`
  const parent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:'ignore'});console.log('STAGE: hung-startup');setInterval(()=>{},1000)`
  const result = await node(parent, directory, { graceMs: 100 }, 600)
  assert.equal(result.exitCode, 124); assert.equal(result.stage, "hung-startup")
  assert.match(formatSummary("fixture", result), /TIMEOUT/)
  const { port } = JSON.parse(readFileSync(record, "utf8"))
  const server = createServer()
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve) })
  await new Promise((resolve) => server.close(resolve))
  const next = await node("console.log('healthy next run')", directory)
  assert.equal(next.exitCode, 0)
})
test("forwarded SIGINT cleans up the child group and keeps exit 130", async () => {
  const directory = temporary()
  const module = pathToFileURL(path.join(root, "scripts/test-process.mjs")).href
  const code = `import {runProcess} from ${JSON.stringify(module)};import{writeFileSync}from'node:fs';const result=await runProcess(process.execPath,['-e',"console.log('ready');setInterval(()=>{},1000)"],5000,${JSON.stringify(directory)},{graceMs:100,onSample:()=>writeFileSync(${JSON.stringify(path.join(directory, "ready"))},'ready')});process.stdout.write(JSON.stringify(result));process.exitCode=result.exitCode;`
  const child = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "pipe"] })
  let text = ""
  child.stdout.on("data", (chunk) => { text += chunk })
  const exit = new Promise((resolve) => child.once("close", (code) => resolve(code)))
  for (let attempt = 0; attempt < 100 && !existsSync(path.join(directory, "ready")); attempt++) await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(existsSync(path.join(directory, "ready")))
  child.kill("SIGINT")
  assert.equal(await exit, 130)
  assert.equal(JSON.parse(text).signal, "SIGINT")
})
test("retention applies age/count/size while preserving active and current logs", () => {
  const directory = temporary(), now = Date.now()
  for (const [index, name] of ["old", "one", "two", "active", "current"].entries()) {
    put(directory, `.openarms/logs/${name}.log`, "1234567890")
    utimesSync(path.join(directory, `.openarms/logs/${name}.log`), new Date(now - 10000 + index * 100), new Date(now - 10000 + index * 100))
  }
  put(directory, ".openarms/logs/active.log.active", JSON.stringify({ pid: process.pid, host: hostname() }))
  const removed = pruneLogs(directory, { now, maxAgeMs: 9800, maxFiles: 2, maxBytes: 20, minLifetimeMs: 0, protectedPaths: [".openarms/logs/current.log"] })
  assert.equal(removed.length, 3)
  assert.ok(existsSync(path.join(directory, ".openarms/logs/active.log")))
  assert.ok(existsSync(path.join(directory, ".openarms/logs/current.log")))
})
test("retry guard blocks third identical failure, requires force reason and resets on changed inputs/errors", async () => {
  const directory = temporary(), command = ["node", "fixture.mjs"]
  let calls = 0
  const failure = async () => { calls++; return { exitCode: 1, stage: "compile", diagnostics: ["TypeError: same fixture failure"], logPath: ".openarms/logs/previous.log" } }
  for (let attempt = 0; attempt < 2; attempt++) await guardedRun("full", "revision-a", command, failure, { directory })
  assert.equal((await guardedRun("full", "revision-a", command, failure, { directory })).blocked, true)
  assert.equal(calls, 2)
  assert.equal((await guardedRun("full", "revision-a", command, failure, { directory, force: true })).blocked, true)
  await guardedRun("full", "revision-a", command, failure, { directory, force: true, reason: "diagnosed external fixture" })
  assert.equal(calls, 3)
  await guardedRun("full", "revision-b", command, failure, { directory })
  assert.equal(calls, 4)
  const changedError = await guardedRun("full", "revision-b", command, async () => ({ exitCode: 1, stage: "compile", diagnostics: ["RangeError: different failure"] }), { directory })
  assert.equal(changedError.failureCount, 1)
  await guardedRun("full", "revision-b", command, async () => ({ exitCode: 0 }), { directory })
  assert.equal((await guardedRun("full", "revision-b", command, failure, { directory })).failureCount, 1)
})
test("signature normalizes volatile paths/time but distinguishes actual assertion errors", () => {
  const directory = temporary()
  const result = { exitCode: 1, stage: "compile", diagnostics: [`TypeError: ${directory}/source.ts at 2026-10-07T10:00:00Z port=8000 12ms`] }
  assert.equal(failureSignature("full", ["node"], result, directory), failureSignature("full", ["node"], { ...result, diagnostics: [`TypeError: ${directory}/source.ts at 2026-10-07T11:00:00Z port=9000 25ms`] }, directory))
  assert.notEqual(failureSignature("full", ["node"], result, directory), failureSignature("full", ["node"], { ...result, diagnostics: ["AssertionError: expected 4, actual 3"] }, directory))
  const docker = { exitCode: 1, stage: "server-startup", diagnostics: ["Error: openarms-smoke-aabbccdd-a12-smoke-run-12345678 could not start"] }
  assert.equal(failureSignature("smoke-runtime", ["node"], docker, directory), failureSignature("smoke-runtime", ["node"], { ...docker, diagnostics: ["Error: openarms-smoke-11223344-b34-smoke-run-abcdef12 could not start"] }, directory))
})
test("concurrent failure invocations atomically count two runs and block the third", async () => {
  const directory = temporary(), module = pathToFileURL(path.join(root, "scripts/test-failure.mjs")).href
  const code = `import {guardedRun}from ${JSON.stringify(module)};import{appendFileSync}from'node:fs';await guardedRun('full','same-revision',['node','same-command'],async()=>{appendFileSync(${JSON.stringify(path.join(directory, "starts"))},'start\\n');await new Promise(r=>setTimeout(r,50));return{exitCode:1,stage:'fixture',diagnostics:['TypeError: same failure']}},{directory:${JSON.stringify(directory)}});`
  await Promise.all([1, 2, 3].map(() => promisify(execFile)(process.execPath, ["--input-type=module", "-e", code])))
  assert.equal(readFileSync(path.join(directory, "starts"), "utf8"), "start\nstart\n")
})
