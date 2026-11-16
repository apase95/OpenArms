import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, mkdir, readdir, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { outputLogStore } from "../src/output-logs.ts"

async function workspace(t: any) {
  const root = await mkdtemp(path.join(tmpdir(), "openarms-logs-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test("private exclusive output logs preserve exact observed bytes; concurrent saves do not overwrite", async t => {
  const root = await workspace(t), store = outputLogStore(root)
  const files = await Promise.all(Array.from({ length: 8 }, (_, i) => store.save(`raw\x00\x1b[31m${i}`)))
  assert.equal(new Set(files).size, 8)
  for (let i = 0; i < files.length; i++) {
    assert.equal(await readFile(files[i], "utf8"), `raw\x00\x1b[31m${i}`)
    if (process.platform !== "win32") assert.equal((await stat(files[i])).mode & 0o777, 0o600)
  }
  if (process.platform !== "win32") assert.equal((await stat(path.join(root, ".openarms/logs"))).mode & 0o777, 0o700)
})

test("retention removes only old owned-format artifacts, not legacy logs or other files", async t => {
  const root = await workspace(t), store = outputLogStore(root)
  const old = await store.save("old")
  const date = new Date(Date.now() - 8 * 86400000)
  await utimes(old, date, date)
  const legacy = path.join(path.dirname(old), "legacy-output.log")
  await writeFile(legacy, "legacy data"); await utimes(legacy, date, date)
  const current = await store.save("current")
  assert.equal(await readFile(current, "utf8"), "current")
  assert.equal(await readFile(legacy, "utf8"), "legacy data")
  await assert.rejects(() => stat(old), { code: "ENOENT" })
})

test("retention count bounds eligible files and keeps recent artifacts", async t => {
  const root = await workspace(t), store = outputLogStore(root)
  const first = await store.save("seed"), folder = path.dirname(first)
  const old = new Date(Date.now() - 120000)
  for (let i = 0; i < 105; i++) {
    const file = path.join(folder, `output-00000000-0000-0000-0000-${String(i).padStart(12, "0")}.log`)
    await writeFile(file, "old"); await utimes(file, old, old)
  }
  const latest = await store.save("latest")
  assert.equal((await readdir(folder)).length, 100)
  assert.equal(await readFile(first, "utf8"), "seed")
  assert.equal(await readFile(latest, "utf8"), "latest")
})

test("redirected log directories are rejected without touching the target", { skip: process.platform === "win32" }, async t => {
  const root = await workspace(t), outside = await workspace(t)
  await mkdir(path.join(root, ".openarms"), { mode: 0o700 })
  await symlink(outside, path.join(root, ".openarms/logs"))
  await assert.rejects(() => outputLogStore(root).save("private content"))
  assert.deepEqual(await readdir(outside), [])
})
