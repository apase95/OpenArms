import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, test } from "node:test"
import { parseCommand } from "../src/commands.ts"
import { hashBytes } from "../scripts/registry-v2.mjs"
import { detectPackages } from "../src/project.ts"
import { validateRegistry } from "../src/registry.ts"
import { createRuntime, runtimePaths } from "../src/runtime.ts"
import { executeSkillsCommand, handleSkillsPrompt, initializeSession } from "../src/skills-service.ts"
import { StateStore } from "../src/state-store.ts"
import type { Registry } from "../src/types.ts"

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "openarms-core-"))
  roots.push(root)
  const library = path.join(root, "library")
  await mkdir(library)
  for (const name of ["first", "second", "superpower"]) await mkdir(path.join(library, name))
  await writeFile(path.join(library, "first", "first.md"), "FIRST")
  await writeFile(path.join(library, "second", "second.md"), "SECOND")
  await writeFile(path.join(library, "superpower", "superpower.md"), "INDEX")
  const registry: Registry = {
    version: 1,
    skills: { first: "first/first.md", second: "second/second.md", superpower: "superpower/superpower.md" },
    packages: {
      first: { core: ["first"], optional: ["superpower"], detect: { extensions: [".go"] } },
      second: { core: ["second"], optional: [], detect: { dependencies: ["next"] } },
    },
  }
  const file = path.join(root, "state.json")
  const store = await StateStore.open(file)
  await store.setPackage(root, "session", "first", ["superpower"])
  await store.setPackage(root, "session", "second", [])
  const verified = { schemaVersion: 2, packages: Object.fromEntries(Object.entries(registry.packages).map(([id, pkg]) => [id, { ...pkg, detect: { files: [], extensions: [], dependencies: [], ...pkg.detect } }])), skills: Object.fromEntries(Object.entries(registry.skills).map(([id, file]) => [id, { owner: id === "superpower" ? "first" : id, kind: id === "superpower" ? "optional" : "core", path: file, contentHash: hashBytes(Buffer.from(id === "first" ? "FIRST" : id === "second" ? "SECOND" : "INDEX")), maxTokens: 100, defaultPermission: "allow", workflows: id === "superpower" ? { testing: { path: "superpower/workflows/testing/SKILL.md", contentHash: hashBytes(Buffer.from("WORKFLOW")), maxTokens: 100 } } : {}, references: {} }])) }
  await writeFile(path.join(library, "registry.json"), JSON.stringify(verified))
  const runtime = await createRuntime({ directory: root, libraryRoot: library, stateFile: file, approvedRegistryHash: hashBytes(Buffer.from(JSON.stringify(verified))) })
  // Test caller requests one explicit skill; never an implementation fallback.
  const load = async (input: { sessionID: string; packageName: string; workflow?: string }) => {
    const result = await runtime.loadVerifiedSkill({ skill: input.workflow ? "superpower" : input.packageName, ...(input.workflow ? { workflow: input.workflow } : {}) }, { sessionID: input.sessionID })
    if (!result.ok) throw new Error(result.error.code === "TASK_CONFLICT" ? "already uses another package" : result.error.code === "FILE_MISSING" ? "not found" : result.error.code === "INVALID_REQUEST" || result.error.code === "INVALID_WORKFLOW" || result.error.code === "UNSAFE_PATH" ? "Unknown workflow" : result.error.code)
    return result.sources.map((source: any) => source.content).join("\n")
  }
  return { root, library, registry, file, store, load }
}

test("failed file reads do not reserve the task package or record a load", async () => {
  const { root, library, store, load } = await fixture()
  await rm(path.join(library, "first", "first.md"))
  await assert.rejects(load({ sessionID: "session", packageName: "first" }), /not found/)
  const session = await store.getSession(root, "session")
  assert.equal(session?.taskPackage, undefined)
  assert.equal(session?.loadHistory, undefined)
  assert.match(await load({ sessionID: "session", packageName: "second" }), /SECOND/)
})

test("invalid workflows do not reserve the task package", async () => {
  const { root, store, load } = await fixture()
  await assert.rejects(load({ sessionID: "session", packageName: "first", workflow: "../escape" }), /Unknown workflow/)
  assert.equal((await store.getSession(root, "session"))?.taskPackage, undefined)
})

test("rejects a workflows directory symlink outside the library", async () => {
  const { root, library, store, load } = await fixture()
  const outside = path.join(root, "outside")
  await mkdir(path.join(outside, "testing"), { recursive: true })
  await writeFile(path.join(outside, "testing", "SKILL.md"), "OUTSIDE")
  await symlink(outside, path.join(library, "superpower", "workflows"))
  await assert.rejects(load({ sessionID: "session", packageName: "first", workflow: "testing" }), /Unknown workflow/)
  assert.equal((await store.getSession(root, "session"))?.taskPackage, undefined)
})

test("concurrent loads of different packages commit only one package", async () => {
  const { root, store, load } = await fixture()
  const results = await Promise.allSettled([
    load({ sessionID: "session", packageName: "first" }),
    load({ sessionID: "session", packageName: "second" }),
  ])
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1)
  const session = await store.getSession(root, "session")
  assert.equal(session?.verified?.records.length, 1)
  assert.ok(session?.taskPackage)
})

test("load recording refuses a package disabled during loading", async () => {
  const { root, store } = await fixture()
  await store.disablePackage(root, "session", "first")
  await assert.rejects(store.recordPackageLoad(root, "session", "first", ["first"]), /not enabled/)
  assert.equal((await store.getSession(root, "session"))?.taskPackage, undefined)
})

test("load recording rejects selection changed during file reads", async () => {
  const { root, store, registry } = await fixture()
  await store.removeSkills(root, "session", "first", ["superpower"], registry.packages.first)
  await assert.rejects(store.recordPackageLoad(root, "session", "first", ["first", "superpower"], undefined, ["superpower"]), /selection changed/)
  assert.equal((await store.getSession(root, "session"))?.taskPackage, undefined)
})

test("add and remove cannot re-enable a package disabled by another adapter", async () => {
  const { root, store, registry } = await fixture()
  await store.disablePackage(root, "session", "first")
  await assert.rejects(store.addSkills(root, "session", "first", ["superpower"]), /not enabled/)
  await assert.rejects(store.removeSkills(root, "session", "first", ["superpower"], registry.packages.first), /not enabled/)
  assert.deepEqual((await store.getSession(root, "session"))?.packages, { second: [] })
})

test("workflow loads preserve previously loaded core skills for inspect", async () => {
  const { root, library, registry, store, load } = await fixture()
  await mkdir(path.join(library, "superpower", "workflows", "testing"), { recursive: true })
  await writeFile(path.join(library, "superpower", "workflows", "testing", "SKILL.md"), "WORKFLOW")
  await load({ sessionID: "session", packageName: "first" })
  await load({ sessionID: "session", packageName: "first", workflow: "testing" })
  assert.deepEqual((await store.getSession(root, "session"))?.taskLoadedSkills, ["first", "superpower"])
  const message = await executeSkillsCommand({ args: "inspect", projectRoot: root, sessionID: "session", registry, store,
    detected: new Set(), confirmMismatch: async () => false })
  assert.match(message, /first\tUsed/)
  assert.match(message, /superpower\tUsed/)
})

test("corrupt state is reported and preserved instead of overwritten", async () => {
  const { root, file, store } = await fixture()
  for (const content of ["{broken", '{"version":1,"projects":[]}', '{"version":3,"projects":{}}']) {
    await writeFile(file, content)
    await assert.rejects(store.startSession(root, "new"), /not valid/)
    assert.equal(await readFile(file, "utf8"), content)
  }
})

test("separate state stores do not lose concurrent session changes", async () => {
  const { root, file, store } = await fixture()
  const second = await StateStore.open(file)
  await Promise.all([
    store.setPackage(root, "one", "first", []),
    second.setPackage(root, "two", "second", []),
  ])
  assert.deepEqual((await store.getSession(root, "one"))?.packages, { first: [] })
  assert.deepEqual((await store.getSession(root, "two"))?.packages, { second: [] })
})

test("child sessions never inherit selection, approval or the active package lock", async () => {
  const { root, store, load } = await fixture()
  await store.approveMismatch(root, "session", "first")
  await load({ sessionID: "session", packageName: "first" })
  const child = await store.inheritSession(root, "session", "child")
  assert.deepEqual(child.packages, {})
  assert.deepEqual(child.approvedMismatch, [])
  assert.equal(child.taskPackage, undefined)
  await assert.rejects(load({ sessionID: "child", packageName: "second" }), /DISABLED/)
  await store.clearSession(root, "child")
  assert.ok((await store.getSession(root, "session"))?.packages.first)
})

test("new metadata roots inherit selection only and reopen independently", async () => {
  const { root, store, load } = await fixture()
  await load({ sessionID: "session", packageName: "first" })
  await store.clearSession(root, "session")
  const restored = await initializeSession({ projectRoot: root, sessionID: "new", store })
  assert.deepEqual(restored.packages, { first: ["superpower"], second: [] })
  assert.equal(restored.taskPackage, undefined)
  const fresh = await initializeSession({ projectRoot: root, sessionID: "fresh", store })
  assert.deepEqual(fresh.packages, { first: ["superpower"], second: [] })
})

test("registry reconciliation removes obsolete selection and active loaded skills", async () => {
  const { root, store, registry, load } = await fixture()
  await load({ sessionID: "session", packageName: "first" })
  registry.packages.first.optional = []
  await store.reconcileRegistry(root, registry)
  assert.deepEqual((await store.getSession(root, "session"))?.taskLoadedSkills, ["first"])
  delete registry.packages.first
  await store.reconcileRegistry(root, registry)
  assert.equal((await store.getSession(root, "session"))?.taskPackage, undefined)
})

test("registry validation rejects invalid definitions, paths and duplicate ownership", async () => {
  const { registry } = await fixture()
  validateRegistry(registry)
  const duplicate = structuredClone(registry)
  duplicate.packages.second.optional = ["superpower"]
  assert.throws(() => validateRegistry(duplicate), /not valid/)
  const missing = structuredClone(registry)
  missing.packages.first.core = ["missing"]
  assert.throws(() => validateRegistry(missing), /not valid/)
  for (const file of ["../outside.md", "/outside.md", "C:\\outside.md"]) {
    const unsafe = structuredClone(registry)
    unsafe.skills.first = file
    assert.throws(() => validateRegistry(unsafe), /not valid/)
  }
  assert.throws(() => validateRegistry({ version: 1, packages: [], skills: {} }), /not valid/)
})

test("commands reject unexpected arguments and deduplicate skill names", () => {
  for (const input of ["clear first", "status extra", "disable first extra", "add first", "remove first"]) {
    assert.throws(() => parseCommand(input), /arguments|only a package|Skill name/)
  }
  assert.deepEqual(parseCommand("use first superpower,superpower"), { action: "use", packageName: "first", skills: ["superpower"] })
})

test("raw slash commands are handled locally and ordinary prompts pass through", async () => {
  const commands: string[] = []
  const run = async (args: string) => { commands.push(args) }
  assert.equal(await handleSkillsPrompt("/skills status", run), true)
  assert.equal(await handleSkillsPrompt("/skills-extra", run), false)
  assert.equal(await handleSkillsPrompt("write documentation", run), false)
  assert.deepEqual(commands, ["status"])
})

test("project detection ignores symlinks and build directories and handles null manifests", async () => {
  const { root, registry } = await fixture()
  await mkdir(path.join(root, "node_modules"))
  await writeFile(path.join(root, "node_modules", "hidden.go"), "")
  await writeFile(path.join(root, "package.json"), "null")
  const outside = path.join(root, "outside.go")
  await writeFile(outside, "")
  const project = path.join(root, "project")
  await mkdir(project)
  await symlink(outside, path.join(project, "linked.go"))
  assert.deepEqual([...await detectPackages(project, registry)], [])
  await rm(outside)
  assert.deepEqual([...await detectPackages(root, registry)], [])
  await writeFile(path.join(project, "package.json"), JSON.stringify({ devDependencies: { next: "1" } }))
  await writeFile(path.join(project, "main.go"), "")
  assert.deepEqual([...await detectPackages(root, registry)].sort(), ["first", "second"])
})

test("runtime composes the same registry, store and loader with explicit paths", async () => {
  const { root, library, registry, file } = await fixture()
  await writeFile(path.join(library, "registry.json"), JSON.stringify(registry))
  const runtime = await createRuntime({ directory: root, worktree: "/", libraryRoot: library, stateFile: file })
  assert.equal(runtime.projectRoot, root)
  assert.equal(runtime.stateFile, file)
  assert.deepEqual(runtime.registry, registry)
  assert.equal((await runtime.loadVerifiedSkill({ skill: "second" }, { sessionID: "session" })).error.code, "UNVERIFIED")
  assert.equal(runtimePaths({ stateFile: file }).stateFile, file)
})

test("runtime library override respects explicit option precedence", () => {
  const previous = process.env.OPENARMS_LIBRARY_ROOT
  try {
    process.env.OPENARMS_LIBRARY_ROOT = "/opt/installed-router"
    assert.equal(runtimePaths().libraryRoot, "/opt/installed-router")
    assert.equal(runtimePaths({ libraryRoot: "/opt/explicit" }).registryFile, "/opt/explicit/registry.json")
  } finally {
    if (previous === undefined) delete process.env.OPENARMS_LIBRARY_ROOT
    else process.env.OPENARMS_LIBRARY_ROOT = previous
  }
})
