import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { BoundedOutput, formatSummary } from "../sandbox/process-output.mjs"
import { runProcess } from "../scripts/test-process.mjs"
import { validateMap, resolveTests, mapPath } from "../scripts/test-map.mjs"
import { governorExamples } from "../src/output-governor.ts"

test("Sprint11 happy path: TAP passed/total is rendered on one line", () => {
  const output = new BoundedOutput()
  output.push("# tests 3\n# pass 3\n")
  output.finish()
  const summary = formatSummary("related", { exitCode: 0, tests: output.tests, passed: output.passed })
  assert.match(summary, /3\/3 pass/)
  assert.equal(summary.split("\n").length, 1)
})
test("Sprint11 shared contract examples preserve failure and truncation metadata", () => {
  assert.equal(governorExamples.pass.exitCode, 0)
  assert.equal(governorExamples.fail.exitCode, 7)
  assert.equal(governorExamples.truncated.exitCode, 1)
  assert.ok(governorExamples.truncated.truncated)
  for (const example of Object.values(governorExamples)) assert.equal(Buffer.byteLength(example.contextText), example.contextBytes)
})
test("Sprint11 separated failures survive passing output with bounded deduplicated names", () => {
  const output = new BoundedOutput({ headBytes: 128, tailBytes: 128 })
  output.push("TypeError: first compiler error\n")
  for (const name of ["first test", "later test", "failed suite", "later test"]) {
    output.push(`not ok 1 - ${name}\n`)
    output.push("ok 2 - passing noise\n".repeat(100))
  }
  output.finish()
  const lines = output.diagnostics()
  assert.match(lines.join("\n"), /first compiler error/)
  for (const name of ["first test", "later test", "failed suite"]) assert.equal(lines.filter((line) => line === `not ok 1 - ${name}`).length, 1)
  assert.ok(lines.length <= 30)
  for (let i = 0; i < 100; i++) output.push(`not ok ${i} - failure ${i}\n`)
  assert.ok(output.failureNames.size <= 16)
  assert.ok(output.diagnostics().length <= 30)
})
test("Sprint11 source drift rejects configured and child symlinks without traversal", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "arms-map-links-"))
  try {
    mkdirSync(path.join(directory, "src")); mkdirSync(path.join(directory, "outside"))
    writeFileSync(path.join(directory, "outside/escaped.ts"), "")
    const manifest = { version: 1, sourceDirectories: ["src"], entries: [] }
    assert.deepEqual(validateMap(manifest, directory), [])
    symlinkSync("outside", path.join(directory, "linked"))
    for (const folder of ["linked", "linked/nested"]) {
      const errors = validateMap({ ...manifest, sourceDirectories: [folder] }, directory).join("\n")
      assert.match(errors, /symlink path: linked/)
      assert.doesNotMatch(errors, /missing mapping/)
    }
    symlinkSync("../outside", path.join(directory, "src/child"))
    symlinkSync("../outside/escaped.ts", path.join(directory, "src/file.ts"))
    const errors = validateMap(manifest, directory).join("\n")
    assert.match(errors, /symlink path: src\/child/)
    assert.match(errors, /symlink path: src\/file.ts/)
    assert.match(errors, /remove the symlink/)
    assert.doesNotMatch(errors, /escaped.ts/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
test("Sprint11 manifest independently validates current source inventory", () => {
  assert.deepEqual(validateMap(), [])
  assert.deepEqual(resolveTests(["docs/README.md"]).tests, [])
  assert.deepEqual(resolveTests(["tests/sprint11.test.mjs"]).tests, ["tests/sprint11.test.mjs"])
  assert.ok(resolveTests(["src/output-governor.ts"]).full)
})
test("Sprint11 drift reports all missing/deleted/duplicate/casing paths and mapping repairs pass", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "arms-map-"))
  try {
    mkdirSync(path.join(directory, "src")); mkdirSync(path.join(directory, "tests"))
    writeFileSync(path.join(directory, "src/new.ts"), "")
    writeFileSync(path.join(directory, "tests/new.test.ts"), "")
    const manifest = { version: 1, sourceDirectories: ["src"], entries: [] }
    assert.deepEqual(resolveTests(["src\\new.ts"], manifest, directory).tests, ["tests/new.test.ts"])
    rmSync(path.join(directory, "tests/new.test.ts"))
    assert.match(validateMap(manifest, directory).join("\n"), /missing mapping: src\/new.ts/)
    assert.throws(() => resolveTests(["src/new.ts"], manifest, directory))
    writeFileSync(path.join(directory, "tests/valid.test.ts"), "")
    manifest.entries.push({ source: "src/new.ts", tests: ["tests/valid.test.ts"] })
    assert.deepEqual(validateMap(manifest, directory), [])
    manifest.entries.push({ source: "src/new.ts", tests: ["tests/deleted.test.ts"] }, { source: "src/New.ts", tests: ["tests/valid.test.ts"] })
    const errors = validateMap(manifest, directory).join("\n")
    assert.match(errors, /duplicate source/); assert.match(errors, /deleted/); assert.match(errors, /src\/New.ts/); assert.match(errors, /fix scripts\/test-map.json/)
    for (const file of ["/absolute", "../escape", "src/../escape", "C:\\escape"]) assert.throws(() => mapPath(file))
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
test("Sprint11 critical edge: failed log never advertises a preserved path", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "arms-sprint11-"))
  try {
    const result = await runProcess(process.execPath, ["-e", "console.error('TypeError: first failure');process.exitCode=7"], 1000, directory, { logPath: "missing/output.log" })
    assert.equal(result.exitCode, 7)
    assert.ok(result.logError)
    assert.equal(result.logPath, undefined)
    assert.match(formatSummary("related", result), /first failure/)
    const output = new BoundedOutput()
    output.push("unknown reporter\n")
    output.finish()
    assert.equal(output.diagnostics()[0], "UNPARSEABLE_TEST_OUTPUT")
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
