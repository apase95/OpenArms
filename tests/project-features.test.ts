import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { FEATURES, featureEnabled, projectFeatures } from "../src/project-features.ts"
import { projectSkills } from "../src/project-skills.ts"
import { SkillRouterServer } from "../plugins/skill-router-server.ts"

async function workspace(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(tmpdir(), "openarms-features-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test("only actual features are switchable, default ON without writes; settings persist and are project-isolated", async t => {
  const root = await workspace(t), other = await workspace(t), flags = projectFeatures(root)
  assert.deepEqual(FEATURES.map(feature => feature.id), ["skills-management", "output-compaction"])
  assert.deepEqual(await flags.read(), [])
  assert.equal(await featureEnabled(flags, "skills-management"), true)
  assert.equal(await featureEnabled(flags, "output-compaction"), true)
  assert.deepEqual(await readdir(root), [])
  await projectSkills(root).set("writing", false)
  const originalSkills = await readFile(path.join(root, ".openarms/skills.json"), "utf8")
  await flags.set("skills-management", false)
  await flags.set("output-compaction", false)
  assert.deepEqual(await projectFeatures(root).read(), ["output-compaction", "skills-management"])
  assert.deepEqual(await projectFeatures(other).read(), [])
  assert.equal((await stat(path.join(root, ".openarms/features.json"))).mode & 0o777, 0o600)
  await flags.set("output-compaction", true)
  assert.equal(await featureEnabled(flags, "skills-management"), false)
  assert.equal(await featureEnabled(flags, "output-compaction"), true)
  assert.equal(await readFile(path.join(root, ".openarms/skills.json"), "utf8"), originalSkills)
  assert.deepEqual((await readdir(path.join(root, ".openarms"))).sort(), ["features.json", "skills.json"])
})

test("feature store rejects unknown keys/self-disable and corrupt state; lock/symlink protections remain", async t => {
  const root = await workspace(t), flags = projectFeatures(root)
  for (const id of ["features", "*", "unknown", "../skills"]) await assert.rejects(() => flags.set(id as any, false))
  assert.deepEqual(await readdir(root), [])
  await flags.set("output-compaction", false)
  const file = path.join(root, ".openarms/features.json")
  const lock = path.join(root, ".openarms/.features.lock")
  await writeFile(lock, "review", { mode: 0o600 })
  await assert.rejects(() => flags.set("output-compaction", true))
  assert.equal(await readFile(lock, "utf8"), "review")
  await rm(lock)
  for (const raw of ["bad", '{"version":2,"disabled":[]}', '{"version":1,"disabled":["features"]}', '{"version":1,"disabled":["output-compaction","output-compaction"]}']) {
    await writeFile(file, raw)
    await assert.rejects(() => flags.read())
    await assert.rejects(() => flags.set("output-compaction", true))
    assert.equal(await readFile(file, "utf8"), raw)
  }
  const sentinel = path.join(root, "sentinel")
  await writeFile(sentinel, "unchanged")
  await rm(file); await symlink(sentinel, file)
  await assert.rejects(() => flags.set("output-compaction", false))
  assert.equal(await readFile(sentinel, "utf8"), "unchanged")
  await assert.rejects(() => projectFeatures(homedir()).set("output-compaction", false))
})

test("feature OFF bypasses skill preferences and native config injection; ON restores saved opt-outs without grants", async t => {
  const root = await workspace(t), flags = projectFeatures(root)
  await projectSkills(root).set("writing", false)
  const hooks = await SkillRouterServer({ directory: path.join(root, "subdir"), worktree: root } as any)
  const input = { tool: "skill", sessionID: "s", callID: "c" }, output = { args: { name: "writing" } }
  await assert.rejects(() => hooks["tool.execute.before"]!(input, output), /SKILL_OFF/)
  const cached: any = { permission: { skill: { protected: "deny" } } }
  await hooks.config!(cached)
  assert.equal(cached.permission.skill.writing, "deny")
  await flags.set("skills-management", false)
  await hooks["tool.execute.before"]!(input, output)
  const fresh: any = { permission: { skill: { protected: "deny" } } }
  await hooks.config!(fresh)
  assert.deepEqual(fresh.permission.skill, { protected: "deny" })
  assert.equal(cached.permission.skill.writing, "deny") // Refresh is explicit, not an implicit grant.
  await flags.set("skills-management", true)
  await assert.rejects(() => hooks["tool.execute.before"]!(input, output), /SKILL_OFF/)
  assert.deepEqual(await projectSkills(root).read(), ["writing"])
})

test("output feature OFF is a complete passthrough with no new artifacts; live toggles are independent", async t => {
  const root = await workspace(t), flags = projectFeatures(root)
  const hooks = await SkillRouterServer({ directory: root, worktree: root } as any)
  const input = { tool: "bash", args: { command: "echo output" }, sessionID: "s", callID: "c" }
  const raw = "\x1b[31m" + "evidence\n".repeat(14000)
  const metadata = { exit: 7, failure: true }
  await flags.set("output-compaction", false)
  const off = { title: "original", output: raw, metadata }
  await hooks["tool.execute.after"]!(input, off)
  assert.equal(off.output, raw); assert.equal(off.title, "original"); assert.equal(off.metadata, metadata)
  assert.deepEqual(await readdir(path.join(root, ".openarms")), ["features.json"])
  await flags.set("output-compaction", true)
  const on = { title: "original", output: raw, metadata }
  await hooks["tool.execute.after"]!(input, on)
  assert.match(on.output, /observed output log/)
  const logs = await readdir(path.join(root, ".openarms/logs"))
  assert.equal(logs.length, 1)
  assert.equal(await readFile(path.join(root, ".openarms/logs", logs[0]), "utf8"), raw)
  await flags.set("output-compaction", false)
  await hooks["tool.execute.after"]!(input, off)
  assert.deepEqual(await readdir(path.join(root, ".openarms/logs")), logs)
  assert.equal(await featureEnabled(flags, "skills-management"), true)
})

test("unknown feature state leaves output untouched but fails closed for native skill calls", async t => {
  const root = await workspace(t), flags = projectFeatures(root)
  await flags.set("output-compaction", false)
  await writeFile(path.join(root, ".openarms/features.json"), "corrupt")
  const hooks = await SkillRouterServer({ directory: root, worktree: root } as any)
  const output = { title: "original", output: "\x1b[31m" + "evidence\n".repeat(10000), metadata: { exit: 3 } }
  const copy = structuredClone(output)
  await hooks["tool.execute.after"]!({ tool: "bash", args: {} }, output)
  assert.deepEqual(output, copy)
  await assert.rejects(() => hooks["tool.execute.before"]!({ tool: "skill", sessionID: "s", callID: "c" }, { args: { name: "writing" } }), /SKILL_POLICY_UNAVAILABLE/)
  await hooks["tool.execute.before"]!({ tool: "bash", sessionID: "s", callID: "c" }, { args: {} })
  assert.deepEqual(await readdir(path.join(root, ".openarms")), ["features.json"])
})
