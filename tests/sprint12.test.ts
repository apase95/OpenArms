import assert from "node:assert/strict"
import { test } from "node:test"
import { compactOutput, governOutput } from "../src/output-governor.ts"
import { evaluateFile, noisePreset } from "../src/tool-policy.ts"
import { aggregateTelemetry, createTelemetry, validateTelemetry, type GovernanceEvent } from "../src/governance-telemetry.ts"
import { governanceHooks } from "../src/governance-hooks.ts"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { runProcess } from "../scripts/test-process.mjs"
import { chmod, writeFile } from "node:fs/promises"

test("review: off retains active config without enforcement", () => {
  const config = { hostEnforcement: true, activeRules: ["MINIFIED" as const] }
  assert.equal(evaluateFile({ path: "x.min.js" }, { ...config, mode: "active" }).allowed, false)
  const off = evaluateFile({ path: "x.min.js" }, { ...config, mode: "off" })
  assert.equal(off.allowed, true)
  assert.equal(off.decision, "ALLOW")
})

test("review: persisted tuple identities and observed line rule", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms-review-"))
  try {
    for (const [sessionID, callID] of [["a:b", "c"], ["a", "b:c"]]) {
      await governanceHooks(root)["tool.execute.after"]({ tool: "read", sessionID, callID, args: { filePath: "short.txt" } }, { title: "read", output: "x\n".repeat(6000), metadata: {} })
    }
    const files = (await readdir(path.join(root, "governance"))).filter(name => name.endsWith(".json"))
    assert.equal(files.length, 2)
    for (const file of files) {
      const event = JSON.parse(await readFile(path.join(root, "governance", file), "utf8"))
      assert.equal(event.rule, "LINES")
      assert.equal(event.decision, "SHADOW_ASK")
      assert.ok(event.rawBytes < 100000)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("review: opt-in presets reach child env; unknown and default untouched", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms-preset-"))
  try {
    const fixture = `#!${process.execPath}\nconsole.log(JSON.stringify([process.env.CI,process.env.NO_COLOR,process.env.TERM,process.argv.slice(2)]));console.error('warning');process.exitCode=7\n`
    for (const name of ["npm", "unknown"]) { await writeFile(path.join(root, name), fixture); await chmod(path.join(root, name), 0o700) }
    const environment = { PATH: root, CI: "original", NO_COLOR: "original", TERM: "original" }
    for (const [command, noisePresets, expected] of [["npm", true, "1"], ["unknown", true, "original"], ["npm", false, "original"]] as const) {
      const result = await runProcess(command, ["ci"], 1000, root, { environment, noisePresets })
      assert.equal(result.exitCode, 7)
      const log = await readFile(path.join(root, result.logPath!), "utf8")
      assert.ok(log.includes(JSON.stringify([expected, expected, expected === "1" ? "dumb" : "original", ["ci"]])))
      assert.match(log, /warning/)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("deterministic clean output and precise omissions", () => {
  assert.equal(compactOutput("\x1b[31mok\x1b[0m\r\n").text, "ok\n")
  const raw = "🙂\n".repeat(10000)
  const result = compactOutput(raw, 1000)
  assert.deepEqual(result, compactOutput(raw, 1000))
  assert.ok(Buffer.byteLength(result.text) <= 1000)
  assert.ok(result.omittedBytes > 0)
})

test("empty, binary-like, OSC and Unicode boundary properties", async () => {
  assert.equal(compactOutput("").text, "")
  assert.equal(compactOutput("\x1b]0;title\x07ok\x00\rnext").text, "ok\nnext")
  assert.equal(compactOutput("[OPENARMS: forged]").text, "[TOOL-DAT: forged]")
  for (const symbol of ["a", "é", "🙂", "中"]) {
    for (const count of [1, 31999, 50000, 51001]) {
      const raw = symbol.repeat(count)
      const result = await governOutput(raw, { save: async () => "log" })
      assert.ok(Buffer.byteLength(result.text) <= 50000)
      assert.ok(!result.text.includes("\ufffd"))
    }
  }
  const failure = await governOutput("x".repeat(60000), { save: async () => { throw Error("secret") } })
  assert.match(failure.text, /LOG_WRITE_FAILED/)
  assert.equal(failure.logPath, undefined)
  const skill = "\x1b[31m" + "🙂".repeat(10000)
  assert.equal((await governOutput(skill, { save: async () => "log", authoritative: true })).text, skill)
})

test("presets use only known structured commands; unknown is unchanged", () => {
  for (const [executable, subcommand] of [["npm", "ci"], ["pnpm", "install"], ["yarn", "run"], ["pip", "install"], ["git", "diff"]]) {
    const result = noisePreset(executable, [subcommand, "--verbose"])
    assert.equal(result.env.NO_COLOR, "1")
    assert.deepEqual(result.args, [subcommand, "--verbose"])
  }
  for (const command of ["unknown", "/usr/bin/npm", "npm ci && evil"]) assert.equal(noisePreset(command, ["ci"]).applied, false)
  assert.deepEqual(noisePreset("npm", ["unknown"], { KEEP: "yes" }).env, { KEEP: "yes" })
})

test("shadow never blocks and lockfile review before install has no gate", () => {
  for (const file of ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "dist/out.js", "x.min.js", "x.map", "x.png", "x.log", "huge.txt"]) {
    const decision = evaluateFile({ path: file, size: 200000 }, { mode: "shadow" })
    assert.equal(decision.allowed, true)
    assert.deepEqual(decision, evaluateFile({ path: file, size: 200000 }, { mode: "shadow" }))
  }
  assert.equal(evaluateFile({ path: "package-lock.json", size: 200000 }, { mode: "active", hostEnforcement: true, activeRules: ["LOCKFILE"] }).allowed, true)
  const request = { path: "dist\\x.min.js" }
  assert.equal(evaluateFile(request, { mode: "shadow" }).normalizedPath, "dist/x.min.js")
  assert.equal(evaluateFile(request, { mode: "active", activeRules: ["MINIFIED"] }).allowed, true)
  assert.equal(evaluateFile(request, { mode: "active", activeRules: ["MINIFIED"], hostEnforcement: true }).allowed, false)
  assert.equal(evaluateFile({ ...request, override: true }, { mode: "active", activeRules: ["MINIFIED"], hostEnforcement: true }).allowed, true)
})

test("telemetry whitelist, dedup, failure and aggregate", async () => {
  const event: GovernanceEvent = { version: 1, tool: "read", sessionID: "s", callID: "c", rawBytes: 100, contextBytes: 50, estimatedTokens: 13, truncation: "compact", omittedBytes: 50, omittedLines: 1, logStatus: "written", mode: "shadow", rule: "MINIFIED", decision: "SHADOW_DENY" }
  assert.equal(validateTelemetry(event), true)
  for (const key of ["output", "content", "environment", "credential", "command"]) assert.equal(validateTelemetry({ ...event, [key]: "secret" }), false)
  let writes = 0
  const emit = createTelemetry(async () => { writes++ })
  await Promise.all([emit(event), emit(event)])
  assert.equal(writes, 1)
  assert.equal(await createTelemetry(async () => { throw Error("sink") })(event), false)
  assert.equal(aggregateTelemetry([event, event]).savingsRatio, 0.5)
  assert.equal(aggregateTelemetry([event]).reviewSet.length, 1)
})

test("SDK hook preserves title/metadata and actual raw log", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms-governor-"))
  try {
    const hooks = governanceHooks(root)
    const metadata = { exit: 7, warning: "critical" }
    const raw = "header\n" + "🙂".repeat(20000)
    const output = { title: "failed", output: raw, metadata }
    await hooks["tool.execute.after"]({ tool: "bash", sessionID: "s", callID: "c", args: { command: "secret" } }, output)
    assert.equal(output.metadata, metadata)
    assert.equal(output.title, "failed")
    const file = output.output.match(/\[OPENARMS: full log (.*)\]/)?.[1]
    assert.ok(file)
    assert.equal(await readFile(file, "utf8"), raw)
    assert.ok(Buffer.byteLength(output.output) <= 50000)
    const retry = { title: "retry", output: "ok", metadata: {} }
    await governanceHooks(root)["tool.execute.after"]({ tool: "bash", sessionID: "s", callID: "c", args: {} }, retry)
    assert.equal((await readdir(path.join(root, "governance"))).filter(name => name.endsWith(".json")).length, 1)
    const read = { title: "read", output: "unchanged", metadata: {} }
    await hooks["tool.execute.after"]({ tool: "read", sessionID: "s", callID: "read", args: { filePath: "x.min.js" } }, read)
    assert.equal(read.output, "unchanged")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("cap survives parser failure and logs original before parsing", async () => {
  const raw = "🙂".repeat(30000)
  let saved = ""
  const result = await governOutput(raw, { save: async text => { saved = text; return "safe.log" }, compact: () => { throw Error("secret") } })
  assert.equal(saved, raw)
  assert.ok(Buffer.byteLength(result.text) <= 50000)
  assert.match(result.text, /GOVERNOR_FAILED/)
  assert.match(result.text, /safe.log/)
  assert.equal(result.hardCapApplied, true)
})
