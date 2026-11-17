import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile, chmod } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { applySkillDenies, projectSkillHooks, projectSkills } from "../src/project-skills.ts"

async function workspace(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(tmpdir(), "openarms-project-skills-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test("project preferences default ON and persist OFF across stores, isolated per project", async t => {
  const root = await workspace(t), other = await workspace(t)
  const store = projectSkills(root)
  assert.deepEqual(await store.read(), [])
  assert.deepEqual(await readdir(root), [])
  await writeFile(path.join(root, ".gitignore"), "keep\n")
  await writeFile(path.join(root, "opencode.json"), '{"permission":{"skill":"deny"}}\n')
  await store.set("writing", false)
  await store.set("math-proof", false)
  assert.deepEqual(await projectSkills(root).read(), ["math-proof", "writing"])
  assert.deepEqual(await projectSkills(other).read(), [])
  assert.equal((await stat(path.join(root, ".openarms"))).mode & 0o077, 0)
  assert.equal((await stat(path.join(root, ".openarms/skills.json"))).mode & 0o777, 0o600)
  assert.deepEqual(await store.set("writing", true), ["math-proof"])
  assert.deepEqual(await readdir(path.join(root, ".openarms")), ["skills.json"])
  assert.equal(await readFile(path.join(root, ".gitignore"), "utf8"), "keep\n")
  assert.equal(await readFile(path.join(root, "opencode.json"), "utf8"), '{"permission":{"skill":"deny"}}\n')
})

test("invalid names cannot become wildcard permissions, and protected roots cannot be changed", async t => {
  const root = await workspace(t)
  for (const name of ["*", "a?", "a/b", "__proto__", "", "bad\nname"]) {
    await assert.rejects(() => projectSkills(root).set(name, false))
  }
  assert.deepEqual(await readdir(root), [])
  for (const target of ["/", homedir()]) await assert.rejects(() => projectSkills(target).set("writing", false))
  const alias = path.join(root, "home-alias")
  await symlink(homedir(), alias)
  await assert.rejects(() => projectSkills(alias).set("writing", false))
})

test("malformed preferences fail closed without overwrite; private storage and links are checked", async t => {
  const root = await workspace(t), target = await workspace(t)
  const folder = path.join(root, ".openarms")
  await symlink(target, folder)
  await assert.rejects(() => projectSkills(root).read(), /Unsafe/)
  await assert.rejects(() => projectSkills(root).set("writing", false), /Unsafe/)
  assert.deepEqual(await readdir(target), [])
  await rm(folder)
  await mkdir(folder, { mode: 0o700 })
  const file = path.join(folder, "skills.json")
  for (const data of ["bad", '{"version":2,"disabled":[]}', '{"version":1,"disabled":["*"]}', '{"version":1,"disabled":["writing","writing"]}']) {
    await writeFile(file, data, { mode: 0o600 })
    await assert.rejects(() => projectSkills(root).read())
    await assert.rejects(() => projectSkills(root).set("writing", true))
    assert.equal(await readFile(file, "utf8"), data)
  }
  await rm(file)
  const sentinel = path.join(target, "sentinel")
  await writeFile(sentinel, "untouched")
  await symlink(sentinel, file)
  await assert.rejects(() => projectSkills(root).read(), /Unsafe/)
  await assert.rejects(() => projectSkills(root).set("writing", false), /Unsafe/)
  assert.equal(await readFile(sentinel, "utf8"), "untouched")
  await rm(file)
  await chmod(folder, 0o755)
  await assert.rejects(() => projectSkills(root).set("writing", false), /Unsafe/)
})

test("simultaneous writers never silently overwrite; stale lock is left for review", async t => {
  const root = await workspace(t)
  const outcomes = await Promise.allSettled([projectSkills(root).set("one", false), projectSkills(root).set("two", false)])
  assert.ok(outcomes.some(result => result.status === "fulfilled"))
  const disabled = await projectSkills(root).read()
  for (let i = 0; i < outcomes.length; i++) if (outcomes[i].status === "fulfilled") assert.ok(disabled.includes(["one", "two"][i]))
  const lock = path.join(root, ".openarms/.skills.lock")
  await writeFile(lock, "review", { mode: 0o600 })
  await assert.rejects(() => projectSkills(root).set("third", false))
  assert.equal(await readFile(lock, "utf8"), "review")
  assert.deepEqual(await projectSkills(root).read(), disabled)
})

test("native config integration adds exact denies last, preserving user deny/ask and agent overrides", () => {
  const config: any = {
    provider: { untouched: true },
    permission: { bash: "ask", skill: { writing: "allow", "*": "ask", protected: "deny" } },
    agent: { custom: { permission: { skill: "allow", edit: "deny" } } },
  }
  const originalProvider = config.provider
  const originalPermission = structuredClone(config.permission)
  const sharedPermission = config.permission, sharedAgents = config.agent
  applySkillDenies(config, ["writing"])
  assert.deepEqual(sharedPermission, originalPermission)
  assert.deepEqual(sharedAgents.custom.permission, { skill: "allow", edit: "deny" })
  assert.deepEqual(config.permission, { bash: "ask", skill: { "*": "ask", protected: "deny", writing: "deny" } })
  assert.equal(Object.keys(config.permission.skill).at(-1), "writing")
  assert.deepEqual(config.agent.custom.permission, { edit: "deny", skill: { "*": "allow", writing: "deny" } })
  assert.equal(config.provider, originalProvider)
  for (const permission of ["deny", "ask", undefined]) {
    const other: any = { permission }
    applySkillDenies(other, ["writing"])
    if (permission) assert.equal(other.permission["*"], permission)
    assert.equal(other.permission.skill.writing, "deny")
  }
  const denied: any = { permission: { skill: { "*": "deny" } } }
  applySkillDenies(denied, [])
  assert.deepEqual(denied, { permission: { skill: { "*": "deny" } } })
  assert.throws(() => applySkillDenies({}, ["*"]), /Unsafe/)
})

test("server blocks OFF native calls immediately, even with cached permits; ON never grants permission", async t => {
  const root = await workspace(t), store = projectSkills(root), hooks = projectSkillHooks(store)
  const before = hooks["tool.execute.before"]!
  const input = { tool: "skill", sessionID: "test", callID: "test" }
  const args = { name: "writing" }, output = { args }
  await before(input, output)
  await store.set("writing", false)
  await assert.rejects(() => before(input, output), /SKILL_OFF/)
  assert.equal(output.args, args)
  await before({ ...input, tool: "bash" }, { args: {} })
  await before({ ...input, tool: "custom_tool" }, { args: {} })
  const config: any = { permission: { skill: { protected: "deny" } } }
  await hooks.config!(config)
  assert.equal(config.permission.skill.writing, "deny")
  await store.set("writing", true)
  await before(input, output)
  // Existing in-memory native config is not relaxed; host refresh is explicit.
  assert.equal(config.permission.skill.writing, "deny")
  const refreshed: any = { permission: { skill: { protected: "deny" } } }
  await hooks.config!(refreshed)
  assert.deepEqual(refreshed.permission.skill, { protected: "deny" })
})

test("unreadable/malformed policy stops skill calls but does not change unrelated tools or expose raw errors", async () => {
  const hooks = projectSkillHooks({ read: async () => { throw Error("secret filesystem details") }, set: async () => [] })
  await assert.rejects(() => hooks["tool.execute.before"]!({ tool: "skill", sessionID: "s", callID: "c" }, { args: { name: "writing" } }), error => {
    assert.match(String(error), /SKILL_POLICY_UNAVAILABLE/); assert.doesNotMatch(String(error), /secret/); return true
  })
  await hooks["tool.execute.before"]!({ tool: "read", sessionID: "s", callID: "c" }, { args: {} })
})
