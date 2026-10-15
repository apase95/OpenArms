import assert from "node:assert/strict"
import { test } from "node:test"
import { governOutput, bytes } from "../src/output-governor.ts"
import { testOutputCompactor } from "../src/test-output-compactor.ts"
import { linterOutputCompactor } from "../src/linter-output-compactor.ts"
import { governanceHooks } from "../src/governance-hooks.ts"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

test("Sprint32v2 isolated smoke: default parser retains failure, removes structured passes", async () => {
  const raw = "PASS tests/ok.test.ts\nFAIL tests/bad.test.ts\n  ● suite › rejects\n\n    Expected: PASS ok\n    Received: broken\nTests: 1 failed, 1 passed, 2 total"
  const result = await governOutput(raw, { command: "jest", save: async () => "raw.log" })
  assert.doesNotMatch(result.text, /^PASS tests/m)
  assert.match(result.text, /Expected: PASS ok/)
  assert.match(result.text, /suite › rejects/)
})

const fixtures = [
  ["jest", "PASS tests/ok.test.ts\nFAIL tests/bad.test.ts\n  ● first failure\n    Expected: PASS ok\n    Received: broken\n    at first (src/a.ts:1:2)\n    at runner (node_modules/runner.js:1:2)\nTests: 1 failed, 99 passed, 100 total", "first failure", "Expected: PASS ok"],
  ["vitest", " ✓ tests/ok.test.ts (99 tests)\n FAIL tests/bad.test.ts > first failure\nAssertionError: expected PASS ok\n ❯ src/a.ts:1:2\n Test Files  1 failed | 1 passed (2)\n      Tests  1 failed | 99 passed (100)", "first failure", "AssertionError: expected PASS ok"],
  ["pytest", "================ test session starts ================\ntests/test_a.py .F\n================ FAILURES ================\n________________ test_first_failure ________________\n    def test_first_failure():\n>       assert actual == 'PASS ok'\nE       AssertionError: broken\n================ short test summary info ================\nFAILED tests/test_a.py::test_first_failure - AssertionError\n================ 1 failed, 99 passed in 1.0s ================", "test_first_failure", "E       AssertionError: broken"],
  ["go test", "=== RUN   TestFirstFailure\n    a_test.go:12: Expected PASS ok, got broken\n--- FAIL: TestFirstFailure (0.00s)\nFAIL\nFAIL example/project 0.01s", "TestFirstFailure", "    a_test.go:12: Expected PASS ok, got broken"],
  ["mocha", "  suite\n    ✔ success\n  99 passing (1ms)\n  1 failing\n\n  1) suite first failure:\n     AssertionError: Expected PASS ok\n      at first (src/a.js:1:2)", "suite first failure", "AssertionError: Expected PASS ok"],
] as const

test("Sprint32v2 actual format fixtures preserve assertion and indentation", async () => {
  for (const [command, raw, name, assertion] of fixtures) {
    const result = await governOutput(`\x1b[31m${raw}\x1b[0m`, { command, save: async () => "raw.log" })
    assert.match(result.text, /full log raw.log/)
    assert.ok(result.text.includes(name), command)
    assert.ok(result.text.includes(assertion), command)
    assert.doesNotMatch(result.text, /node_modules|\x1b|\ufffd|✔ success|✓ tests\/ok|^PASS tests/m)
  }
})

test("Sprint32v2 generated suites: first assertion, next five, project frames, byte bounds", () => {
  let seed = 32
  for (let n = 0; n < 60; n++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const evidence = `Expected: PASS ok 🙂 ${seed}\n    Received: 中 failed`
    const raw = Array.from({ length: n === 0 ? 8000 : seed % 100 }, (_, i) => `PASS tests/passing_${i}.test.ts`).join("\n")
      + "\nFAIL tests/bad.test.ts\n  ● first failure\n    " + evidence
      + Array.from({ length: 9 }, (_, i) => `\n    at f${i} (src/a.ts:${i + 1}:2)`).join("")
      + Array.from({ length: 8 }, (_, i) => `\n  ● later-${i}\n    AssertionError: other-${i}`).join("")
      + "\nTests: 9 failed, 8000 passed, 8009 total"
    const result = testOutputCompactor.compact(raw, { maxBytes: 4000 })
    assert.ok(result.text.includes(evidence))
    assert.equal((result.text.match(/Next failure:/g) ?? []).length, 5)
    assert.equal((result.text.match(/at f\d/g) ?? []).length, 5)
    assert.doesNotMatch(result.text, /other-|later-5|^PASS /m)
    assert.ok(bytes(result.text) < 4000)
    if (n === 0) {
      assert.ok(bytes(raw) / 4 > 50000)
      assert.ok(bytes(result.text) / 4 < 1000)
    }
  }
  for (const symbol of ["🙂", "中", "é"]) for (const maxBytes of [256, 257, 1000, 32000]) {
    const raw = `FAIL tests/a.test.ts\n  ● first\nAssertionError: ${symbol.repeat(50000)}`
    const result = testOutputCompactor.compact(raw, { maxBytes })
    assert.ok(bytes(result.text) <= maxBytes)
    assert.match(result.text, /diagnostic bytes omitted; check full raw log/)
    assert.doesNotMatch(result.text, /\ufffd/)
  }
})

test("Sprint32v2 lint formats, exact totals, max ten and warning policy", async () => {
  const cases = [
    ["eslint", "src/a.ts\n  1:2  error  undefined user  no-undef\n  2:3  warning  use single quotes  quotes\n  3:4  warning  unsafe dependency  security/audit\n✖ 3 problems (1 error, 2 warnings)"],
    ["flake8", "src/a.py:1:2: F821 undefined user\nsrc/a.py:2:3: W291 trailing whitespace\nsrc/a.py:3:4: W605 invalid escape"],
    ["biome check", "src/a.ts:1:2 lint/correctness/noUnusedVariables ━━━━━━━━━\n  × This variable is unused.\n    1 │ const unused = 1;\n      │       ^^^^^^\nChecked 1 file in 1ms."],
  ]
  for (const [command, raw] of cases) {
    assert.ok(linterOutputCompactor.match(command, raw), command)
    const result = await governOutput(raw, { command, save: async () => "lint.log" })
    assert.match(result.text, /src\/a\.(ts|py):\n  Line 1:2 - error:/)
    assert.match(result.text, /Total: 1 errors/)
    assert.doesNotMatch(result.text, /warning: use single quotes|warning: trailing whitespace/)
    if (command === "eslint") assert.match(result.text, /warning: unsafe dependency/)
  }
  for (let n = 1; n <= 50; n++) {
    const raw = Array.from({ length: n }, (_, i) => `src/${i % 3}.py:${i + 1}:2: F821 undefined user_${i}`).join("\n")
    const result = linterOutputCompactor.compact(raw, { maxBytes: 32000 })
    assert.equal((result.text.match(/ - error:/g) ?? []).length, Math.min(n, 10))
    assert.ok(result.text.includes(`Total: ${n} errors, 0 warnings.`))
    if (n > 10) assert.ok(result.text.includes(`${n - 10} additional lint errors omitted`))
  }
  const warnings = linterOutputCompactor.compact("src/a.py:1:2: W291 trailing whitespace", { maxBytes: 1000 })
  assert.match(warnings.text, /warning: trailing whitespace/)
  assert.match(warnings.text, /0 errors, 1 warnings/)
  assert.equal(linterOutputCompactor.match("eslint", "src/a.ts\n  1:2 error malformed\nFatal parser crash"), false)
  const biomeWarning = "src/a.ts:1:2 lint/style/useConst WARN ━━━━━━━\n  ⚠ This variable is never reassigned.\nChecked 1 file in 1ms."
  assert.match(linterOutputCompactor.compact(biomeWarning, { maxBytes: 1000 }).text, /0 errors, 1 warnings/)
  for (const maxBytes of [256, 501, 1000]) {
    const raw = `src/a.py:1:2: F821 ${"🙂中".repeat(20000)}`
    const result = linterOutputCompactor.compact(raw, { maxBytes })
    assert.ok(bytes(result.text) <= maxBytes)
    assert.doesNotMatch(result.text, /\ufffd/)
    assert.match(result.text, /diagnostic bytes omitted/)
  }
  const unknown = "src/a.py:1:2: F821 undefined user\nFatal: plugin crashed"
  const fallback = await governOutput(unknown, { command: "flake8", save: async () => "lint.log" })
  assert.ok(fallback.text.endsWith(unknown))
})

test("Sprint32v2 success-only, explicit replacement, unknown fallback and hook metadata", async () => {
  for (const raw of ["PASS tests/a.test.ts\nTests: 2 passed, 2 total", "ok example/project 0.01s", "  2 passing (1ms)\n    ✔ success"]) {
    const result = await governOutput(raw, { command: "npm test", save: async () => "raw.log" })
    assert.doesNotMatch(result.text, /^PASS |✔ success/m)
  }
  const raw = fixtures[0][1]
  const generic = await governOutput(raw, { command: "jest", compactors: [], save: async () => "raw.log" })
  assert.ok(generic.text.endsWith(raw))
  for (const [command, stream] of [["pytest", "================ test session starts ================\ntests/a.py .... [100%]\n================ 4 passed in 0.1s ================"], ["go test", "=== RUN   TestOK\n--- PASS: TestOK (0.00s)\nok example/project 0.01s"]]) {
    const result = await governOutput(stream, { command, save: async () => "raw.log" })
    assert.doesNotMatch(result.text, /\[100%\]|--- PASS:|=== RUN/)
  }
  const directory = await mkdtemp(path.join(tmpdir(), "arms32v2-"))
  try {
    const metadata = { exitCode: 9 }
    const output = { title: "failed", output: raw, metadata }
    await governanceHooks(directory)["tool.execute.after"]({ tool: "bash", sessionID: "s", callID: "c", args: { command: "jest" } }, output)
    assert.equal(output.metadata, metadata)
    assert.equal(metadata.exitCode, 9)
    assert.doesNotMatch(output.output, /^PASS /m)
    const file = output.output.match(/\[OPENARMS: full log (.*)\]/)?.[1]
    assert.ok(file)
    assert.equal(await readFile(file, "utf8"), raw)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("Sprint32v2 isolated edge: unsupported diagnostics are not erased", async () => {
  const raw = "custom runner: PASS ok is the expected diagnostic\nAssertionError: custom"
  const result = await governOutput(raw, { command: "jest", save: async () => "raw.log" })
  assert.ok(result.text.endsWith(raw))
  assert.ok(bytes(result.text) <= 50000)
})
