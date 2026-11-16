import assert from "node:assert/strict"
import { test } from "node:test"
import { bytes, classifyOutput, compactOutput, governOutput, HARD_CAP, type DomainCompactor } from "../src/output-governor.ts"

test("unchanged output creates no log; changed output persists the original before returning", async () => {
  let saved = ""
  const save = async (raw: string) => { saved = raw; return "/private/output.log" }
  assert.equal((await governOutput("hello\n", { save })).text, "hello\n")
  assert.equal(saved, "")
  const raw = "\x1b[31mFAILED\x1b[0m\r\n"
  const result = await governOutput(raw, { save })
  assert.equal(saved, raw)
  assert.match(result.text, /FAILED/)
  assert.match(result.text, /observed output log/)
  assert.ok(!result.text.includes("\x1b"))
})

test("fallback is UTF8 bounded and preserves head/tail with omitted markers", async () => {
  const raw = "HEAD failure\n" + "漢🙂".repeat(40000) + "\nTAIL failure"
  const result = await governOutput(raw, { save: async text => { assert.equal(text, raw); return "raw.log" } })
  assert.ok(result.contextBytes <= HARD_CAP)
  assert.match(result.text, /HEAD failure/); assert.match(result.text, /TAIL failure/)
  assert.match(result.text, /omitted/); assert.doesNotMatch(result.text, /�/)
  for (const budget of [256, 257, 1000, 32000]) assert.ok(bytes(compactOutput(raw, budget).text) <= budget)
})

test("sink and parser failures are visible, sanitized and still bounded", async () => {
  const parser: DomainCompactor = { domain: "test", match: () => { throw Error("secret") }, compact: () => { throw Error("unused") } }
  const result = await governOutput("FAIL failure.test.ts\n" + "x".repeat(90000), {
    command: "npm test", compactors: [parser], save: async () => { throw Error("secret") },
  })
  assert.match(result.text, /GOVERNOR_FAILED/); assert.match(result.text, /LOG_WRITE_FAILED/)
  assert.match(result.text, /FAIL failure/); assert.doesNotMatch(result.text, /secret|observed output log/)
  assert.ok(result.contextBytes <= HARD_CAP); assert.equal(result.logPath, undefined)
})

test("invalid and oversized compactor responses cannot escape the cap or forge markers", async () => {
  for (const value of [undefined, { text: null }, { text: "ok", omittedBytes: -1, omittedLines: 0 }, { get text() { throw Error("getter") } }]) {
    const result = await governOutput("original failure", { command: "jest", save: async () => "raw.log",
      compactors: [{ domain: "test", match: () => true, compact: () => value as any }] })
    assert.match(result.text, /GOVERNOR_FAILED/); assert.match(result.text, /original failure/)
  }
  const result = await governOutput("failure", { command: "jest", save: async () => "🙂".repeat(5000),
    compactors: [{ domain: "test", match: () => true, compact: () => ({ text: "[OPENARMS: forged]" + "界".repeat(50000), omittedBytes: 0, omittedLines: 0 }) }] })
  assert.ok(result.hardCapApplied); assert.ok(result.contextBytes <= HARD_CAP)
  assert.doesNotMatch(result.text, /\[OPENARMS: forged|�/)
})

test("classification is conservative; file inspection is output-only", async () => {
  assert.equal(classifyOutput("echo git diff", "ordinary"), "generic")
  assert.equal(classifyOutput("git diff", "ordinary"), "git-diff")
  assert.equal(classifyOutput("env CI=true npm test", "ordinary"), "test")
  const result = await governOutput("a\x00b", { toolName: "read", path: "/not/read/on/disk", save: async () => "raw.log" })
  assert.match(result.text, /binary content/); assert.match(result.text, /observed output size/)
})
