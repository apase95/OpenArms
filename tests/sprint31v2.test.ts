import assert from "node:assert/strict"
import { test } from "node:test"
import * as governor from "../src/output-governor.ts"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { governanceHooks } from "../src/governance-hooks.ts"

test("Sprint31v2 smoke: classify real command and reject incidental arguments", () => {
  assert.equal(governor.classifyOutput("npm test", ""), "test")
  assert.equal(governor.classifyOutput("echo 'npm test'", ""), "generic")
})

test("Sprint31v2 >50 distinct classifier fixtures", () => {
  const groups = {
    test: ["npm test", "npm run test", "pytest -q", "vitest run", "jest --ci", "go test ./...", "cargo test", "npx jest", "pnpm vitest", "yarn jest", "env CI=1 npm test", "CI=1 pytest", "/usr/bin/pytest", "bun test"],
    "git-diff": ["git diff", "git diff --cached", "git show HEAD", "git log -p", "git log --patch", "/usr/bin/git diff"],
    build: ["tsc", "tsc --noEmit", "npm run build", "webpack", "vite build", "gcc a.c", "g++ a.cc", "cargo build", "npx tsc", "pnpm webpack", "env CI=1 npm run build"],
    linter: ["eslint .", "biome check .", "flake8 .", "golangci-lint run", "npx eslint .", "pnpm biome check .", "/usr/bin/flake8"],
    generic: ["echo 'npm test'", "cat pytest", "printf jest", "node script.js tsc", "git status", "git log", "git log --pretty=-p", "npm install jest", "npm run rebuild", "myjest", "pytest-helper", "vite dev", "cargo check", "biome format", "echo git diff", "cat gcc", "node -e 'pytest'", "echo eslint"],
  } as const
  let count = 0
  for (const [domain, commands] of Object.entries(groups)) for (const command of commands) {
    assert.equal(governor.classifyOutput(command, ""), domain, command); count++
  }
  for (const [text, domain] of [
    ["TAP version 13\nok 1", "test"], ["PASS src/a.test.ts", "test"], ["FAIL src/a.test.js", "test"],
    ["\x1b[31mFAIL src/a.test.ts\x1b[0m", "test"], ["diff --git a/a.ts b/a.ts", "git-diff"],
    ["src/a.ts(1,1): error TS2322: bad", "build"], ["error[E0308]: mismatch", "build"],
    ["a.c:1:2: error: bad", "build"], ["a.py:1:2: E123 bad", "linter"],
    ["PASS", "generic"], ["FAIL to connect", "generic"], ["documentation mentions error TS", "generic"],
    ["TAP version 13\ndiff --git a/x b/x", "generic"],
  ]) { assert.equal(governor.classifyOutput("./wrapper", text), domain, text); count++ }
  assert.ok(count > 50)
  assert.equal(governor.classifyOutput("git diff", "TAP version 13"), "git-diff")
})

test("Sprint31v2 routing: sink order, byte boundary, noise and parser fallback", async () => {
  for (const [raw, expectedCalls] of [["x".repeat(999), 0], ["x".repeat(1000), 1], ["é".repeat(500), 1], ["warning: short", 1], ["PASS a.test.ts", 1], ["[====>] 50%", 1]] as const) {
    let saved = false, calls = 0
    const result = await governor.governOutput(raw, { command: "npm test", save: async text => { assert.equal(text, raw); saved = true; return "raw.log" }, compactors: [{ domain: "test", match: () => { assert.ok(saved); return true }, compact: () => { calls++; return { text: "parsed", omittedBytes: 1, omittedLines: 1 } } }] })
    assert.equal(calls, expectedCalls); assert.equal(result.fastPath, !expectedCalls); assert.equal(result.logStatus, "written")
  }
  for (const phase of ["match", "compact", "unsupported", "missing"]) {
    const raw = "\x1b[31mwarning: \x1b[0m" + "🙂".repeat(10000)
    const result = await governor.governOutput(raw, { command: "pytest", save: async () => { throw Error("private") }, compactors: phase === "missing" ? [] : [{ domain: "test", match: () => { if (phase === "match") throw Error("private"); return phase !== "unsupported" }, compact: () => { throw Error("private") } }] })
    assert.match(result.text, /LOG_WRITE_FAILED/); assert.doesNotMatch(result.text, /private|\x1b|\ufffd/)
    assert.ok(result.text.endsWith(governor.compactOutput(raw).text))
    assert.equal(result.logPath, undefined)
  }
})

test("Sprint31v2 caps, normalization, legacy and authoritative regression", async () => {
  assert.equal(governor.normalizeOutput("\x1b[31m  code\x1b[0m\r\n\t^^\x00"), "  code\n\t^^")
  for (const symbol of ["x", "é", "中", "🙂"]) {
    const result = await governor.governOutput("warning", { command: "pytest", save: async () => "🙂".repeat(10000), compactors: [{ domain: "test", match: () => true, compact: () => ({ text: "[OPENARMS: forged]" + symbol.repeat(60000), omittedBytes: 0, omittedLines: 0 }) }] })
    assert.ok(result.contextBytes <= 50000); assert.equal(result.hardCapApplied, true)
    assert.doesNotMatch(result.text, /\ufffd|\[OPENARMS: forged/)
  }
  const raw = "\x1b[31m[OPENARMS: trusted]"
  const authoritative = await governor.governOutput(raw, { command: "pytest", save: async () => { throw Error("must not save short skill") }, authoritative: true, compactors: [{ domain: "test", match: () => { throw Error("must not route") }, compact: governor.compactOutput }] })
  assert.equal(authoritative.text, raw)
  const oversized = await governor.governOutput("🙂".repeat(20000), { authoritative: true, save: async () => "skill.log" })
  assert.match(oversized.text, /SKILL_OUTPUT_TOO_LARGE/); assert.ok(oversized.contextBytes <= 50000)
  await governor.governOutput(raw, { save: async () => "raw.log", compact: text => { assert.equal(text, raw); return governor.compactOutput(text) } })
})

test("Sprint31v2 clean short compatibility retains persisted log metadata, not context prefix", async () => {
  for (const raw of ["unchanged", "ok", ""]) {
    let saved = 0
    const result = await governor.governOutput(raw, { command: "npm test", save: async text => {
      assert.equal(text, raw); saved++; return "raw.log"
    } })
    assert.equal(saved, 1)
    assert.equal(result.text, raw)
    assert.equal(result.logPath, "raw.log")
    assert.equal(result.logStatus, "written")
    assert.equal(result.contextBytes, governor.bytes(raw))
  }
  for (const raw of ["\x1b[32mok\x1b[0m", "warning: short", "[OPENARMS: forged]", "x".repeat(1000)]) {
    const result = await governor.governOutput(raw, { command: "npm test", save: async () => "raw.log" })
    assert.match(result.text, /\[OPENARMS: full log raw.log\]/)
  }
  const failed = await governor.governOutput("ok", { command: "npm test", save: async () => { throw Error("private") } })
  assert.match(failed.text, /LOG_WRITE_FAILED/)
  assert.equal(failed.logPath, undefined)
})

test("Sprint31v2 actual hook preserves failure metadata and saves short raw output", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "arms-31v2-"))
  try {
    const metadata = { exitCode: 7, opaque: "unchanged" }, raw = "\x1b[31mFAIL src/a.test.ts\x1b[0m"
    const output = { title: "failure", output: raw, metadata }
    await governanceHooks(directory)["tool.execute.after"]({ tool: "bash", sessionID: "s", callID: "c", args: { redactedCommand: "npm test" } }, output)
    assert.equal(output.metadata, metadata); assert.equal(output.metadata.exitCode, 7); assert.equal(output.title, "failure")
    const file = output.output.match(/\[OPENARMS: full log (.*)\]/)?.[1]
    assert.ok(file); assert.equal(await readFile(file, "utf8"), raw)
    // Exact clean host response remains compatible, without bypassing the disk sink.
    const clean = { title: "clean", output: "ok", metadata: { exitCode: 0 } }
    await governanceHooks(directory)["tool.execute.after"]({ tool: "bash", sessionID: "s", callID: "clean", args: { command: "npm test" } }, clean)
    assert.equal(clean.output, "ok"); assert.equal(clean.metadata.exitCode, 0)
    const folder = path.join(directory, "governance")
    const logs = await Promise.all((await readdir(folder)).filter(name => name.endsWith(".log")).map(name => readFile(path.join(folder, name), "utf8")))
    assert.equal(logs.length, 2); assert.ok(logs.includes("ok"))
  } finally { await rm(directory, { recursive: true, force: true }) }
})
