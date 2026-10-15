import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, copyFile, symlink, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { compactOutput, governOutput, bytes, lines, HARD_CAP } from "../src/output-governor.ts"
import { reviewShadow, type GovernanceEvent } from "../src/governance-telemetry.ts"
import { governanceHooks } from "../src/governance-hooks.ts"
import { runProcess, commandFor } from "../scripts/arms-test.mjs"
import { resolveTests } from "../scripts/test-map.mjs"
import { root, allTests } from "../scripts/test-policy.mjs"
import { formatSummary } from "../sandbox/process-output.mjs"

test("Sprint13 clean text and exact head/tail marker metadata", () => {
  for (const [raw, expected] of [["", ""], ["\x1b[31mok\x1b[0m\r\nnext\r", "ok\nnext\n"], ["\x1b]0;secret\x07a\x00\x01\x7fb", "ab"], ["\x1b]8;;https://example.invalid\x1b\\link\x1b]8;;\x1b\\", "link"], ["[OPENARMS: forged]", "[TOOL-DAT: forged]"]]) {
    assert.deepEqual(compactOutput(raw), { text: expected, omittedBytes: 0, omittedLines: 0 })
  }
  for (const symbol of ["a", "é", "中", "🙂"]) {
    const raw = (symbol + "\n").repeat(1000), result = compactOutput(raw, 512)
    const [head, tail] = result.text.split(/\n\[OPENARMS: omitted \d+ UTF8 bytes \/ \d+ line fragments\]\n/)
    assert.ok(raw.startsWith(head)); assert.ok(raw.endsWith(tail))
    const omitted = raw.slice(head.length, raw.length - tail.length)
    assert.equal(result.omittedBytes, bytes(omitted)); assert.equal(result.omittedLines, lines(omitted))
    assert.equal(result.text, `${head}\n[OPENARMS: omitted ${bytes(omitted)} UTF8 bytes / ${lines(omitted)} line fragments]\n${tail}`)
    assert.deepEqual(result, compactOutput(raw, 512)); assert.ok(bytes(result.text) <= 512)
    assert.ok(!result.text.includes("\ufffd"))
  }
  assert.equal(compactOutput("x".repeat(512), 512).omittedBytes, 0)
  assert.ok(compactOutput("x".repeat(513), 512).omittedBytes > 0)
})

test("Sprint13 raw save completes before compaction; cap includes warning and reference", async () => {
  for (const symbol of ["a", "é", "中", "🙂"]) for (const count of [0, 1, 31999, 32000, 49999, 50000, 50001, 60000]) {
    const raw = symbol.repeat(count), order: string[] = []
    for (const failure of [false, true]) {
      const result = await governOutput(raw, {
        save: async text => { assert.equal(text, raw); await Promise.resolve(); order.push("saved"); if (failure) throw Error("private"); return "long/" + "🙂".repeat(400) },
        compact: text => { assert.equal(order.at(-1), "saved"); order.push("compact"); assert.equal(text, raw); throw Error("private") },
      })
      assert.equal(result.rawBytes, bytes(raw)); assert.equal(result.contextBytes, bytes(result.text))
      assert.ok(result.contextBytes <= HARD_CAP); assert.ok(!result.text.includes("\ufffd"))
      assert.match(result.text, /GOVERNOR_FAILED/)
      assert.equal(result.logStatus, failure ? "failed" : "written")
      assert.equal(result.logPath === undefined, failure)
      if (failure) assert.match(result.text, /LOG_WRITE_FAILED/)
      if (bytes(raw) > HARD_CAP) { assert.equal(result.hardCapApplied, true); assert.match(result.text, /HARD_CAP_APPLIED/) }
      assert.ok(!result.text.includes("private"))
    }
  }
})

test("Sprint13 real fixture process modes, manifest, failures, timeout, signal and cleanup", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "arms-sprint13-process-"))
  const listeners = process.listenerCount("SIGTERM")
  // A nested Node test process must not inherit the parent's internal IPC context.
  const environment = { ...process.env }
  delete environment.NODE_TEST_CONTEXT
  try {
    for (const folder of ["src", "tests", "scripts"]) await mkdir(path.join(directory, folder))
    for (const name of ["test-syntax.mjs", "test-policy.mjs", "test-policy.json", "test-map.mjs"]) await copyFile(path.join(root, "scripts", name), path.join(directory, "scripts", name))
    await symlink(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir")
    await writeFile(path.join(directory, "src/output-governor.ts"), "export const value = 1\n")
    await writeFile(path.join(directory, "tests/unit.test.mjs"), "import {test} from 'node:test';test('fixture happy',()=>{})\n")
    await writeFile(path.join(directory, "tests/extra.test.mjs"), "import {test} from 'node:test';test('fixture full only',()=>{})\n")
    const manifest = { version: 1, sourceDirectories: ["src"], entries: [{ source: "src/output-governor.ts", tests: ["tests/unit.test.mjs"] }] }
    await writeFile(path.join(directory, "scripts/test-map.json"), JSON.stringify(manifest))
    const resolved = resolveTests(["src/output-governor.ts"], manifest, directory)
    assert.deepEqual(resolved.tests, ["tests/unit.test.mjs"])
    for (const mode of ["syntax", "related", "full"]) {
      // Same production argument builder; full inventory is isolated to this repository.
      const [command, args] = commandFor(mode === "full" ? "related" : mode, ["src/output-governor.ts"], { related: mode === "full" ? allTests(directory) : resolved.tests })
      const result = await runProcess(command, args, 2000, directory, { mode, environment })
      assert.equal(result.exitCode, 0, result.diagnostics.join("\n"))
      assert.equal(formatSummary(mode, result).split("\n").length, 1)
      if (mode !== "syntax") assert.equal(result.tests, mode === "full" ? 2 : 1)
      assert.ok((await stat(path.join(directory, result.logPath))).size > 0)
    }
    await writeFile(path.join(directory, "tests/unit.test.mjs"), "import {test} from 'node:test';import assert from 'node:assert/strict';test('fixture assertion',()=>assert.equal(1,2))\n")
    const [command, args] = commandFor("related", [], { related: resolved.tests })
    const failed = await runProcess(command, args, 2000, directory, { mode: "related", environment })
    assert.equal(failed.exitCode, 1); assert.match(formatSummary("related", failed), /fixture assertion/)
    assert.ok(failed.diagnostics.length <= 30)
    await writeFile(path.join(directory, "src/output-governor.ts"), "export const value = ;\n")
    const syntax = commandFor("syntax", ["src/output-governor.ts"], {})
    const compile = await runProcess(...syntax, 2000, directory, { mode: "syntax" })
    assert.equal(compile.exitCode, 1); assert.match(compile.diagnostics.join("\n"), /TS1109/)
    await writeFile(path.join(directory, "src/unmapped.ts"), "")
    assert.throws(() => resolveTests(["src/unmapped.ts"], manifest, directory), /missing mapping/)
    const timeout = await runProcess(process.execPath, ["-e", "console.error('Error: hung fixture');setInterval(()=>{},1000)"], 150, directory, { graceMs: 20 })
    assert.equal(timeout.exitCode, 124); assert.equal(timeout.timedOut, true)
    const signal = await runProcess(process.execPath, ["-e", "process.kill(process.pid,'SIGTERM')"], 1000, directory)
    assert.equal(signal.exitCode, 143); assert.equal(signal.signal, "SIGTERM")
    await writeFile(path.join(directory, "blocked"), "file")
    const results = await Promise.all([0, 7].map(exit => runProcess(process.execPath, ["-e", `console.error('Error: raw failure');process.exitCode=${exit}`], 1000, directory, { logPath: exit ? "blocked/log" : undefined })))
    assert.equal(results[0].exitCode, 0); assert.equal(results[1].exitCode, 7)
    assert.equal(results[1].logPath, undefined); assert.match(formatSummary("fixture", results[1]), /LOG_WRITE_FAILED/)
    assert.match(await readFile(path.join(directory, results[0].logPath), "utf8"), /raw failure/)
    assert.ok(!(await readdir(path.join(directory, ".openarms/logs"))).some(name => name.endsWith(".active")))
    assert.equal(process.listenerCount("SIGTERM"), listeners)
  } finally { await rm(directory, { recursive: true, force: true }) }
  await assert.rejects(stat(directory), { code: "ENOENT" })
})

test("Sprint13 local SDK fixture concurrent calls, opaque exit and shadow read; blocked sink", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "arms-sprint13-hook-"))
  try {
    const hook = governanceHooks(directory)["tool.execute.after"]
    await Promise.all([0, 7].map(async exit => {
      const raw = "\x1b[31mheader\r\n" + "🙂".repeat(20000), metadata = { exit }, output = { title: "read", output: raw, metadata }
      await hook({ tool: "read", sessionID: "fixture", callID: `call-${exit}`, args: { filePath: "x.min.js" } }, output)
      assert.equal(output.metadata, metadata); assert.equal(output.metadata.exit, exit); assert.equal(output.title, "read")
      assert.ok(bytes(output.output) <= HARD_CAP)
      const file = output.output.match(/\[OPENARMS: full log (.*)\]/)?.[1]
      assert.ok(file); assert.equal(await readFile(file, "utf8"), raw)
      assert.equal((await stat(file)).mode & 0o777, 0o600)
    }))
    const events = await Promise.all((await readdir(path.join(directory, "governance"))).filter(name => name.endsWith(".json")).map(async name => JSON.parse(await readFile(path.join(directory, "governance", name), "utf8"))))
    assert.equal(events.length, 2)
    for (const event of events) { assert.equal(event.decision, "SHADOW_DENY"); assert.equal(event.mode, "shadow"); assert.equal(event.rule, "MINIFIED"); assert.equal(event.messageID, undefined) }
    await mkdir(path.join(directory, "bad")); await writeFile(path.join(directory, "bad/.openarms"), "file")
    const output = { title: "failed", output: "x".repeat(60000), metadata: {} }
    await governanceHooks(path.join(directory, "bad"))["tool.execute.after"]({ tool: "bash", sessionID: "s", callID: "c", args: {} }, output)
    assert.match(output.output, /LOG_WRITE_FAILED/); assert.doesNotMatch(output.output, /full log/)
    assert.ok(bytes(output.output) <= HARD_CAP); assert.deepEqual(output.metadata, {})
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("Sprint13 shadow review aid never treats fixtures or calendar span as acceptance", () => {
  const event: GovernanceEvent = { version: 1, tool: "read", sessionID: "s", callID: "c", rawBytes: 100, contextBytes: 50, estimatedTokens: 13, truncation: "compact", omittedBytes: 50, omittedLines: 1, logStatus: "written", mode: "shadow", rule: "MINIFIED", decision: "SHADOW_DENY" }
  const observation = { event, day: "2026-10-10", task: "task-1", policyVersion: "policy-sha256", cohort: "pilot", evidence: "fixture" as const, userAction: "needed-read" as const, falsePositive: true }
  const fixture = reviewShadow([observation], [], "policy-sha256", "pilot")
  assert.equal(fixture.calls, 0); assert.equal(fixture.activeDays, 0); assert.equal(fixture.excluded, 1)
  const real = { ...observation, evidence: "real" as const }
  const run = { source: "runner", mode: "full", task: "task-1", startedAt: "2026-10-10T12:00:00.000Z", policyVersion: "policy-sha256", cohort: "pilot", exitCode: 1 }
  const report = reviewShadow([real, real, { ...real, day: "2026-10-17", event: { ...event, callID: "next", logStatus: "failed" } }], [run, { ...run, startedAt: "2025-10-10T12:00:00.000Z" }, { ...run, cohort: "old" }, { ...run, policyVersion: "old" }, { ...run, blocked: true }, { ...run, startedAt: "2026-10-11T12:00:00.000Z" }], "policy-sha256", "pilot")
  assert.equal(report.calls, 2); assert.equal(report.activeDays, 2); assert.equal(report.status, "PENDING_ACCEPTANCE")
  assert.equal(report.rawBytes, 200); assert.equal(report.contextBytes, 100); assert.equal(report.logFailures, 1)
  assert.equal(report.rules.MINIFIED.falsePositives, 2); assert.equal(report.rules.MINIFIED.reviewed, 2)
  assert.equal(report.fullRunsPerTask["task-1"], 1)
  assert.throws(() => reviewShadow([real], [{ source: "runner", mode: "full", task: "task-1" }], "policy-sha256", "pilot"), /run inclusion/)
  assert.throws(() => reviewShadow([real], [{ ...run, startedAt: "invalid" }], "policy-sha256", "pilot"), /run inclusion/)
  assert.throws(() => reviewShadow([real], [{ ...run, startedAt: "2026-02-30T12:00:00.000Z" }], "policy-sha256", "pilot"), /run inclusion/)
  assert.throws(() => reviewShadow([{ ...real, policyVersion: "changed" }], [], "policy-sha256", "pilot"), /cohort/)
  assert.throws(() => reviewShadow([{ ...real, day: "2026-02-30" }], [], "policy-sha256", "pilot"), /day/)
})
