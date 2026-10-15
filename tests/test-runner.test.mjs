import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { changedFiles, classify, createPlan, formatPlan, git, normalizeFile, parseArgs, policy, root } from "../scripts/test-policy.mjs"
import { commandFor, runProcess } from "../scripts/arms-test.mjs"
import { baselineReport } from "../scripts/test-observation.mjs"
import { check, detectBypass } from "../scripts/check-test-policy.mjs"

const plan = (files, args = []) => createPlan(files, parseArgs(args))
const scheduled = (result) => result.decisions.filter((decision) => ["required", "recommended"].includes(decision.status)).map((decision) => decision.mode)

test("pre-push runs full once and preserves selective integration and unknown blocking", () => {
  assert.deepEqual(scheduled(plan(["docs/example.md"], ["--pre-push"])), ["full"])
  assert.deepEqual(scheduled(plan(["plugins/server-core.ts"], ["--pre-push"])), ["syntax", "full"])
  assert.deepEqual(scheduled(plan(["plugins/skill-router-server.ts"], ["--pre-push"])), ["syntax", "full", "smoke-static", "smoke-runtime"])
  assert.ok(plan(["unknown.mjs"], ["--pre-push"]).decisions.every((r) => r.status === "blocked"))
  assert.throws(() => parseArgs(["full", "--pre-push"]))
})

test("strict arguments reject unknown, conflicting and incomplete input", () => {
  for (const args of [["--wat"], ["full", "smoke"], ["--file"], ["--file", "x", "--base", "HEAD"], ["related", "--installed"], ["--base", "-invalid"], ["--task", "has space"], ["baseline"], ["--command", "npm-test"], ["report", "--plan"], ["--plan", "--plan"]]) assert.throws(() => parseArgs(args))
  assert.deepEqual(parseArgs(["related", "--file", "src/project.ts", "--file", "tests/core.test.ts"]).files, ["src/project.ts", "tests/core.test.ts"])
})
test("paths normalize and cannot escape the repository", () => {
  assert.equal(normalizeFile("./src\\project.ts"), "src/project.ts")
  assert.equal(normalizeFile(path.join(root, "src/project.ts")), "src/project.ts")
  for (const file of ["../escape", "/tmp/escape", "C:\\escape", "src/x\n.ts"]) assert.throws(() => normalizeFile(file))
})
test("docs, registry, server, TUI, sandbox and unknown decisions are explicit", () => {
  assert.deepEqual(scheduled(plan(["README.md", "docs/ARCHITECTURE.md"])), [])
  for (const file of [".opencode/sprint11-fix.md", ".opencode/sprint11-review.md"]) {
    assert.equal(classify(file).kind, "docs")
    assert.deepEqual(scheduled(plan([file])), [])
  }
  assert.ok(plan([".opencode/unknown.md"]).decisions.every((decision) => decision.status === "blocked"))
  assert.deepEqual(scheduled(plan([".graphifyignore", "graphify-out/graph.json", "graphify-out/graph.html", "graphify-out/GRAPH_TREE.html", "graphify-out/GRAPH_REPORT.md"])), [])
  assert.ok(plan(["graphify-out/new.mjs"]).decisions.every((decision) => decision.status === "blocked"))
  assert.deepEqual(scheduled(plan(["registry.json"])), ["syntax", "full"])
  assert.deepEqual(scheduled(plan(["plugins/server-core.ts"])), ["syntax", "related"])
  assert.deepEqual(scheduled(plan(["plugins/skill-router-server.ts"])), ["syntax", "related", "smoke-static", "smoke-runtime"])
  assert.deepEqual(scheduled(plan(["plugins/skill-router-tui.tsx"])), ["syntax", "related", "smoke-static", "tui-smoke"])
  assert.deepEqual(scheduled(plan(["sandbox/compose.yaml"])), ["syntax", "related", "smoke-static", "smoke-runtime", "tui-smoke"])
  assert.deepEqual(scheduled(plan(["src/commands.ts"])), ["syntax", "full"])
  assert.deepEqual(scheduled(plan(["src/runtime.ts"])), ["syntax", "full", "smoke-static", "smoke-runtime"])
  assert.ok(plan(["src/new.ts"]).decisions.every((decision) => decision.status === "blocked"))
  assert.ok(plan(["sandbox/new.mjs"]).decisions.every((decision) => decision.status === "blocked"))
  assert.equal(plan(["src/new.ts"], ["related"]).decisions.find((decision) => decision.mode === "related").status, "blocked")
  assert.equal(plan(["src/new.ts"], ["full"]).override, true)
})
test("all configured rules have valid tests, reason codes and class decisions", () => {
  for (const [file, kind] of Object.entries(policy.files)) {
    const decision = classify(file)
    assert.equal(decision.kind, kind)
    assert.ok(decision.reason)
    for (const name of decision.tests) {
      assert.ok(/\.test\.(ts|mjs)$/.test(name))
      assert.ok(existsSync(path.join(root, name)), `Missing mapped test: ${name}`)
    }
  }
  // Metadata-only file listing; no skill contents are accessed.
  for (const file of git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean)) {
    assert.notEqual(classify(file).kind, "needs-review", `Unmapped repository file: ${file}`)
  }
})
test("related tests are stable, deduplicated and include changed tests themselves", () => {
  const result = plan(["src/state-store.ts", "registry.json", "tests/test-runner.test.mjs", "tests/server.test.ts"])
  assert.deepEqual(result.related, ["tests/core.test.ts", "tests/sandbox-user-bugs.test.ts", "tests/server.test.ts", "tests/sprint32.test.ts", "tests/test-runner.test.mjs"])
  const related = plan(["src/state-store.ts", "registry.json"], ["related"])
  assert.deepEqual(scheduled(related), ["related"])
  assert.deepEqual(related.related, ["tests/core.test.ts", "tests/sandbox-user-bugs.test.ts", "tests/server.test.ts", "tests/sprint32.test.ts"])
})
test("explicit paths precede Git; Git detects staged, unstaged, untracked and deletion", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "arms-diff-"))
  try {
    execFileSync("git", ["init", "--quiet", directory])
    mkdirSync(path.join(directory, "src"))
    writeFileSync(path.join(directory, "src/old.ts"), "old")
    writeFileSync(path.join(directory, "src/edit.ts"), "original")
    execFileSync("git", ["add", "."], { cwd: directory })
    execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture"], { cwd: directory })
    rmSync(path.join(directory, "src/old.ts"))
    writeFileSync(path.join(directory, "src/edit.ts"), "staged")
    execFileSync("git", ["add", "src/edit.ts"], { cwd: directory })
    writeFileSync(path.join(directory, "src/edit.ts"), "unstaged")
    writeFileSync(path.join(directory, "src/new.ts"), "new")
    assert.deepEqual(changedFiles(parseArgs([]), directory), ["src/edit.ts", "src/new.ts", "src/old.ts"])
    assert.deepEqual(changedFiles(parseArgs(["--file", "./src/new.ts", "--file", "src/new.ts"]), directory), ["src/new.ts"])
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
test("dry-run output is deterministic and verify schedules each smoke once", () => {
  const result = plan(["src/runtime.ts", "sandbox/compose.yaml", "plugins/skill-router-tui.tsx"])
  assert.equal(formatPlan(result), formatPlan(plan(["src/runtime.ts", "sandbox/compose.yaml", "plugins/skill-router-tui.tsx"])))
  assert.equal(scheduled(result).filter((mode) => mode === "smoke-runtime").length, 1)
  assert.equal(scheduled(result).filter((mode) => mode === "tui-smoke").length, 1)
  assert.match(formatPlan(result), /COVERED_BY_FULL/)
  assert.match(formatPlan(result), /pass-only-sha256/)
})
test("CLI plan does not execute Docker and T0 validates TSX without loading adapters", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "arms-plan-"))
  try {
    const marker = path.join(directory, "docker-called")
    writeFileSync(path.join(directory, "docker"), `#!/bin/sh\ntouch "${marker}"\nexit 99\n`, { mode: 0o755 })
    writeFileSync(path.join(directory, "python3"), "#!/bin/sh\nexit 99\n", { mode: 0o755 })
    const output = execFileSync(process.execPath, ["scripts/arms-test.mjs", "verify", "--plan", "--file", "sandbox/Dockerfile"], { cwd: root, env: { ...process.env, PATH: directory }, encoding: "utf8" })
    assert.match(output, /T3\/smoke/)
    assert.equal(existsSync(marker), false)
    const syntax = execFileSync(process.execPath, ["scripts/test-syntax.mjs", "plugins/skill-router-tui.tsx"], { cwd: root, encoding: "utf8" })
    assert.match(syntax, /1 files checked/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
test("related command uses an argument array and full includes MJS runner tests", () => {
  const result = plan(["tests/server.test.ts"], ["related"])
  assert.deepEqual(commandFor("related", [], result)[1], ["--experimental-strip-types", "--test", "--test-reporter=tap", "tests/server.test.ts"])
  assert.ok(commandFor("full", [], result)[1].includes("tests/test-runner.test.mjs"))
})
test("process executor preserves exit code, bytes and timeout without Docker", async () => {
  const failure = await runProcess(process.execPath, ["-e", "process.stdout.write('ok');process.stderr.write('bad');process.exitCode=7"], 2000)
  assert.equal(failure.exitCode, 7)
  assert.equal(failure.stdoutBytes, 2)
  assert.equal(failure.stderrBytes, 3)
  const hung = await runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], 100)
  assert.equal(hung.exitCode, 124)
  assert.equal(hung.timedOut, true)
  const signal = await runProcess(process.execPath, ["-e", "process.kill(process.pid,'SIGTERM')"], 2000)
  assert.equal(signal.exitCode, 143)
})
test("baseline aggregates durations, task cost, duplicate candidates and observation status", () => {
  const entry = { source: "baseline", task: "task-1", mode: "npm-test", durationMs: 100, stdoutBytes: 20, stderrBytes: 10, installed: false, inputRevision: "first", startedAt: "2026-10-07T00:00:00Z" }
  const report = baselineReport([entry, { ...entry, durationMs: 200 }, { ...entry, inputRevision: "changed", durationMs: 300 }, { ...entry, source: "runner" }])
  assert.match(report, /PENDING_OBSERVATION/)
  assert.match(report, /npm-test \| 3 \| 200 \| 300 \| 600 \| 90/)
  assert.match(report, /1\/3 \(33.3%\)/)
  assert.match(report, /input change: 1/)
  assert.match(baselineReport([]), /no data/)
})
test("report-only bypass detection distinguishes runner calls from legacy automation", () => {
  assert.deepEqual(check(["package.json"]), [])
  assert.deepEqual(detectBypass("npm run test:full\nnode scripts/arms-test.mjs verify\n# npm test"), [])
  assert.deepEqual(detectBypass("npm test\nnpm run sandbox -- smoke\ndocker compose run smoke\nnode --test tests/core.test.ts\npython3 sandbox/tui-smoke.py"), [1, 2, 3, 4, 5])
})
