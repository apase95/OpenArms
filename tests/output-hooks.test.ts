import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { outputHooks } from "../src/output-hooks.ts"
import { SkillRouterServer } from "../plugins/skill-router-server.ts"

test("server registers output and project skill restrictions only; no injection or lifecycle hooks", async () => {
  const hooks = await SkillRouterServer({ directory: "/unused", worktree: "/" } as any)
  assert.deepEqual(Object.keys(hooks).sort(), ["config", "tool.execute.after", "tool.execute.before"])
})

test("hook preserves failure metadata/title and only writes a raw log for transformed output", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "openarms-hook-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, ".gitignore"), "original\n")
  const hook = outputHooks(root)["tool.execute.after"]
  const metadata = { exitCode: 7, status: "failed" }
  const unchanged = { title: "original", output: "hello\n", metadata }
  await hook({ tool: "bash", args: { command: "echo hello" } }, unchanged)
  assert.deepEqual(await readdir(root), [".gitignore"])
  const raw = "PASS tests/ok.test.ts\n".repeat(2000) + "FAIL tests/bad.test.ts\nAssertionError: EXPECTED_FAILURE\nTests: 1 failed, 2000 passed\n"
  const output = { title: "original", output: raw, metadata }
  await hook({ tool: "bash", args: { command: "npm test" } }, output)
  assert.equal(output.metadata, metadata); assert.equal(output.title, "original")
  assert.deepEqual(metadata, { exitCode: 7, status: "failed" })
  assert.match(output.output, /EXPECTED_FAILURE/)
  const files = await readdir(path.join(root, ".openarms/logs"))
  assert.equal(files.length, 1)
  assert.equal(await readFile(path.join(root, ".openarms/logs", files[0]), "utf8"), raw)
  assert.equal(await readFile(path.join(root, ".gitignore"), "utf8"), "original\n")
  assert.deepEqual(await readdir(path.join(root, ".openarms")), ["logs"])
})

test("native skill and custom tool output bypass all transforms and persistence", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "openarms-skill-bypass-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const hook = outputHooks(root)["tool.execute.after"]
  for (const tool of ["skill", "custom_tool"]) {
    const raw = "\x00" + "instructions\n".repeat(20000)
    const output = { title: "native", output: raw, metadata: {} }
    await hook({ tool, args: {} }, output)
    assert.equal(output.output, raw)
  }
  assert.deepEqual(await readdir(root), [])
})

test("unavailable artifact storage is visible without modifying the failed tool metadata", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "openarms-log-failure-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, ".openarms"), { mode: 0o700 })
  await writeFile(path.join(root, ".openarms/logs"), "not a directory")
  const output = { title: "error", output: "x".repeat(90000), metadata: { exit: 17 } }
  await outputHooks(root)["tool.execute.after"]({ tool: "bash", args: {} }, output)
  assert.match(output.output, /LOG_WRITE_FAILED/)
  assert.equal(output.metadata.exit, 17)
  assert.ok(Buffer.byteLength(output.output) <= 50000)
})
