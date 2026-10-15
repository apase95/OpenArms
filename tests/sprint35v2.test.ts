import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, rm, mkdir, symlink, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { governanceHooks } from "../src/governance-hooks.ts"
import { governOutput, type DomainCompactor } from "../src/output-governor.ts"
import { aggregateTelemetry, validateTelemetry, type GovernanceEvent } from "../src/governance-telemetry.ts"

test("host authoritative short output is durably saved without rewriting content", async () => {
  const raw = "exact authoritative content"
  let saved = ""
  const result = await governOutput(raw, { authoritative: true, persistRaw: true, command: "", save: async text => { saved = text; return "raw.log" } })
  assert.equal(saved, raw)
  assert.equal(result.logStatus, "written")
  assert.equal(result.text, raw)
})

test("real hook preserves failure metadata, raw files and measured multi-domain routing", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "openarms-acceptance-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const hook = governanceHooks(directory)["tool.execute.after"]
  const cases = [
    { domain: "test", command: "npm test", raw: "PASS tests/ok.test.ts\n".repeat(2000) + "FAIL tests/bad.test.ts\nAssertionError: EXPECTED_FAILURE\nTests: 1 failed, 2000 passed\n", evidence: "EXPECTED_FAILURE" },
    { domain: "build", command: "g++", raw: "src/noise.cpp:1:1: warning: unused variable\n".repeat(1000) + "src/bad.cpp:2:3: error: BUILD_FAILURE\n", evidence: "BUILD_FAILURE" },
    { domain: "git-diff", command: "git diff", raw: "diff --git a/package-lock.json b/package-lock.json\n--- a/package-lock.json\n+++ b/package-lock.json\n@@ -1 +1,2000 @@\n-old\n" + "+generated\n".repeat(2000) + "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+SOURCE_EVIDENCE\n", evidence: "SOURCE_EVIDENCE" },
    { domain: "linter", command: "flake8", raw: "src/a.py:1:1: E999 LINT_FAILURE\n", evidence: "LINT_FAILURE" },
    { domain: "generic", command: "unknown", raw: "GENERIC_FAILURE\n", evidence: "GENERIC_FAILURE" },
  ]
  for (const fixture of cases) {
    const metadata = { exit: 7, status: "failed" }
    const output = { title: "failed command", output: fixture.raw, metadata }
    await hook({ tool: "bash", sessionID: "acceptance", callID: fixture.domain, args: { command: fixture.command } }, output)
    assert.equal(output.metadata, metadata)
    assert.deepEqual(metadata, { exit: 7, status: "failed" })
    assert.ok(output.output.includes(fixture.evidence), fixture.domain)
    assert.ok(Buffer.byteLength(output.output) <= 50000)
    const folder = path.join(directory, "governance")
    const files = await readdir(folder)
    const events = await Promise.all(files.filter(name => name.endsWith(".json")).map(async name => JSON.parse(await readFile(path.join(folder, name), "utf8"))))
    const event = events.find(event => event.callID === fixture.domain)
    assert.ok(validateTelemetry(event))
    assert.equal(event.domain, fixture.domain)
    assert.equal(event.rawBytes, Buffer.byteLength(fixture.raw))
    assert.equal(event.compactedBytes, Buffer.byteLength(output.output))
    assert.equal(event.logStatus, "written")
    const rawFolder = path.join(directory, ".openarms/logs")
    const logs = await Promise.all((await readdir(rawFolder)).filter(name => name.endsWith(".log")).map(name => readFile(path.join(rawFolder, name), "utf8")))
    assert.ok(logs.includes(fixture.raw))
    if (["test", "build", "git-diff"].includes(fixture.domain)) assert.ok(event.savingsRatio > 0.9)
    t.diagnostic(`${fixture.domain}: raw=${event.rawBytes} context=${event.compactedBytes} ratio=${event.savingsRatio}`)
  }
})

test("project raw sink is separate from state, private and rejects redirected directories", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "openarms-project-sink-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const project = path.join(root, "project"), state = path.join(root, "state"), outside = path.join(root, "outside")
  await mkdir(project); await mkdir(outside)
  const hook = governanceHooks(state, project)["tool.execute.after"]
  const raw = "raw\x00\x1b[31m failure\n" + "x".repeat(60000)
  const metadata = { exit: 7 }, output = { title: "failed", output: raw, metadata }
  await hook({ tool: "bash", sessionID: "s", callID: "ok", args: {} }, output)
  const folder = path.join(project, ".openarms/logs"), files = await readdir(folder)
  assert.equal(files.length, 1)
  assert.equal(await readFile(path.join(folder, files[0]), "utf8"), raw)
  assert.equal((await stat(path.join(folder, files[0]))).mode & 0o777, 0o600)
  assert.equal(output.metadata, metadata)
  assert.ok((await readdir(path.join(state, "governance"))).every(name => name.endsWith(".json")))
  await rm(folder, { recursive: true }); await symlink(outside, folder)
  const blocked = { title: "failed", output: raw, metadata }
  await hook({ tool: "bash", sessionID: "s", callID: "blocked", args: {} }, blocked)
  assert.match(blocked.output, /LOG_WRITE_FAILED/)
  assert.doesNotMatch(blocked.output, /full log/)
  assert.deepEqual(await readdir(outside), [])
  assert.equal(blocked.metadata, metadata)
})

test("domain telemetry validates numeric measurements and aggregates weighted savings", () => {
  const legacy: GovernanceEvent = { version: 1, tool: "bash", sessionID: "s", callID: "c", rawBytes: 100, contextBytes: 20, estimatedTokens: 5, truncation: "compact", omittedBytes: 80, omittedLines: 1, logStatus: "written", mode: "shadow", rule: "NONE", decision: "ALLOW" }
  const event = { ...legacy, domain: "test" as const, compactedBytes: 20, savingsRatio: 0.8 }
  assert.equal(validateTelemetry(event), true)
  const report = aggregateTelemetry([event, event, { ...legacy, callID: "old" }])
  assert.equal(report.domains.test.calls, 1)
  assert.equal(report.compaction.estimatedTokensSaved, 20)
  assert.equal(report.compaction.unknownCalls, 1)
  for (const patch of [{ domain: "secret command" }, { compactedBytes: -1 }, { savingsRatio: NaN }, { savingsRatio: 0.9 }, { rawBytes: Infinity }, { command: "secret" }]) assert.equal(validateTelemetry({ ...event, ...patch }), false)
  assert.equal(validateTelemetry({ ...event, rawBytes: 0, contextBytes: 0, compactedBytes: 0, savingsRatio: 0 }), true)
  const expanded = { ...event, rawBytes: 10, compactedBytes: 20, savingsRatio: -1 }
  assert.equal(validateTelemetry(expanded), true)
  assert.equal(aggregateTelemetry([expanded]).compaction.estimatedTokensSaved, 0)
  assert.equal(validateTelemetry({ ...event, get decision() { throw Error("secret") } }), false)
  assert.equal(validateTelemetry({ ...event, compactedBytes: 30, savingsRatio: 0.7 }), false)
  const overflow = { ...event, rawBytes: Number.MAX_SAFE_INTEGER, compactedBytes: 20, savingsRatio: (Number.MAX_SAFE_INTEGER - 20) / Number.MAX_SAFE_INTEGER }
  assert.equal(aggregateTelemetry([overflow, { ...overflow, callID: "second" }]).compaction.estimatedTokensSaved, null)
  for (const domain of ["test", "git-diff", "build", "linter", "generic"] as const) {
    const measured = { ...event, domain }
    assert.equal(validateTelemetry(measured), true)
    assert.equal(aggregateTelemetry([measured]).domains[domain].estimatedTokensSaved, 20)
  }
  const mixed = aggregateTelemetry([event, { ...expanded, callID: "expansion" }])
  assert.equal(mixed.compaction.estimatedTokensSaved, 17.5)
  assert.equal(mixed.compaction.savingsRatio, 70 / 110)
})

test("legacy malformed compaction cannot escape final safety boundary", async () => {
  for (const invalid of [undefined, { text: null }, { get text() { throw Error("getter") } }, { text: "safe", omittedBytes: NaN, omittedLines: -1 }]) {
    const result = await governOutput("original failure", { save: async () => "raw.log", compact: () => invalid as any })
    assert.ok(result.text.includes("GOVERNOR_FAILED"))
    assert.ok(result.text.includes("original failure"))
    assert.ok(Number.isSafeInteger(result.omittedBytes))
  }
})

test("oversized callbacks and match throws preserve cap and raw-before-parser order", async () => {
  let saved = false
  const parser: DomainCompactor = { domain: "test", match: () => { assert.ok(saved); throw Error("match") }, compact: () => { throw Error("not reached") } }
  const result = await governOutput("FAIL suite.test.ts\nAssertionError: failure", { command: "npm test", compactors: [parser], save: async () => { saved = true; return "raw.log" } })
  assert.ok(result.text.includes("GOVERNOR_FAILED"))
  const huge = await governOutput("failure", { compact: () => ({ text: "界".repeat(50000), omittedBytes: 0, omittedLines: 0 }), save: async () => "界".repeat(10000) })
  assert.ok(huge.contextBytes <= 50000)
  assert.ok(!huge.text.includes("�"))
})

test("authoritative oversize never returns skill fragments; failed sink is explicit", async () => {
  const result = await governOutput("SECRET_SKILL_FRAGMENT".repeat(5000), { authoritative: true, save: async () => { throw Error("disk") } })
  assert.equal(result.logStatus, "failed")
  assert.equal(result.logPath, undefined)
  assert.ok(result.text.includes("LOG_WRITE_FAILED"))
  assert.ok(result.text.includes("SKILL_OUTPUT_TOO_LARGE"))
  assert.ok(!result.text.includes("SECRET_SKILL_FRAGMENT"))
  assert.ok(result.contextBytes <= 50000)
})
