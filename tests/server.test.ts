import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, test } from "node:test"
import { buildRouterInstruction, createPackageLoader, resolveSkillPath } from "../plugins/server-core.ts"
import { loadRegistry, StateStore, type Registry } from "../plugins/shared.ts"

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "skill-router-server-"))
  roots.push(root)
  const library = path.join(root, "library")
  await mkdir(path.join(library, "skills", "go"), { recursive: true })
  await mkdir(path.join(library, "skills", "graphify"), { recursive: true })
  await mkdir(path.join(library, "skills", "nestjs"), { recursive: true })
  await mkdir(path.join(library, "skills", "superpower", "workflows", "testing"), { recursive: true })
  await writeFile(path.join(library, "skills", "go", "SKILL.md"), "GO CORE")
  await writeFile(path.join(library, "skills", "graphify", "SKILL.md"), "GRAPHIFY")
  await writeFile(path.join(library, "skills", "nestjs", "SKILL.md"), "NEST CORE")
  await writeFile(path.join(library, "skills", "superpower", "SKILL.md"), "SUPERPOWER INDEX")
  await writeFile(path.join(library, "skills", "superpower", "workflows", "testing", "SKILL.md"), "TEST WORKFLOW")
  const registry: Registry = {
    version: 1,
    packages: {
      go: { core: ["go"], optional: ["graphify", "superpower"], detect: {} },
      nestjs: { core: ["nestjs"], optional: [], detect: {} },
    },
    skills: {
      go: "skills/go/SKILL.md",
      graphify: "skills/graphify/SKILL.md",
      nestjs: "skills/nestjs/SKILL.md",
      superpower: "skills/superpower/SKILL.md",
    },
  }
  const store = await StateStore.open(path.join(root, "state.json"))
  await store.startSession(root, "session")
  return { root, library, registry, store }
}

describe("safe skill paths", () => {
  test("accepts a registered file", async () => {
    const { library, registry } = await fixture()
    assert.equal(await resolveSkillPath(library, registry, "go"), path.join(library, "skills", "go", "SKILL.md"))
  })

  test("rejects unknown, absolute, parent, missing, and escaping symlink paths", async () => {
    const { root, library, registry } = await fixture()
    await assert.rejects(resolveSkillPath(library, registry, "missing"), /Unknown skill/)

    registry.skills.bad = "/tmp/SKILL.md"
    await assert.rejects(resolveSkillPath(library, registry, "bad"), /not safe/)
    registry.skills.bad = "../SKILL.md"
    await assert.rejects(resolveSkillPath(library, registry, "bad"), /not safe/)
    registry.skills.bad = "skills/missing/SKILL.md"
    await assert.rejects(resolveSkillPath(library, registry, "bad"), /not found/)

    const outside = path.join(root, "outside.md")
    await writeFile(outside, "outside")
    const link = path.join(library, "skills", "escape.md")
    await symlink(outside, link)
    registry.skills.bad = "skills/escape.md"
    await assert.rejects(resolveSkillPath(library, registry, "bad"), /not safe/)
  })
})

describe("package loading", () => {
  test("rejects a disabled package", async () => {
    const options = await fixture()
    const load = createPackageLoader({ ...options, libraryRoot: options.library, projectRoot: options.root })
    await assert.rejects(load({ sessionID: "session", packageName: "go" }), /The go package is not enabled/)
  })

  test("loads core and selected skills and allows a workflow from the same package", async () => {
    const options = await fixture()
    await options.store.setPackage(options.root, "session", "go", ["graphify", "superpower"])
    const load = createPackageLoader({ ...options, libraryRoot: options.library, projectRoot: options.root })
    const content = await load({ sessionID: "session", packageName: "go" })
    assert.match(content, /GO CORE/)
    assert.match(content, /GRAPHIFY/)
    assert.match(content, /SUPERPOWER INDEX/)
    assert.match(await load({ sessionID: "session", packageName: "go", workflow: "testing" }), /TEST WORKFLOW/)
    const history = (await options.store.getSession(options.root, "session"))?.loadHistory ?? []
    assert.deepEqual(history.map((record) => ({
      packageName: record.packageName,
      skills: record.skills,
      workflow: record.workflow,
    })), [
      { packageName: "go", skills: ["go", "graphify", "superpower"], workflow: undefined },
      { packageName: "go", skills: ["superpower/testing"], workflow: "testing" },
    ])
  })

  test("blocks a second package until the next task", async () => {
    const options = await fixture()
    await options.store.setPackage(options.root, "session", "go", [])
    await options.store.setPackage(options.root, "session", "nestjs", [])
    const load = createPackageLoader({ ...options, libraryRoot: options.library, projectRoot: options.root })
    await load({ sessionID: "session", packageName: "go" })
    await assert.rejects(load({ sessionID: "session", packageName: "nestjs" }), /already uses the go package/)
    await options.store.resetTaskLock(options.root, "session")
    assert.match(await load({ sessionID: "session", packageName: "nestjs" }), /NEST CORE/)
  })
})

describe("router instructions", () => {
  test("blocks unregistered skill discovery with zero packages", () => {
    const text = buildRouterInstruction({ packages: {}, approvedMismatch: [], updatedAt: "now" })
    assert.match(text!, /OpenArms is the only authority/)
    assert.match(text!, /Never search for, discover, read, or follow any other SKILL\.md/)
    assert.match(text!, /No skill packages are enabled/)
  })

  test("lists mixed packages and the one-package rule", () => {
    const text = buildRouterInstruction({
      packages: { nestjs: ["ponytail"], go: ["soul", "graphify"] },
      approvedMismatch: [],
      updatedAt: "now",
    })
    assert.match(text!, /- go: graphify, soul/)
    assert.match(text!, /- nestjs: ponytail/)
    assert.match(text!, /ask the user to choose one/)
    assert.match(text!, /Only skill content returned directly by load_skill_package is authorized/)
    assert.match(text!, /immediately call load_skill_package with its package name/)
    assert.match(text!, /archify is not a package name/)
  })
})

describe("local skill library", () => {
  test("contains valid registered skills and keeps extra skills disabled", async () => {
    const library = path.dirname(new URL("../registry.json", import.meta.url).pathname)
    const actual = await loadRegistry(path.join(library, "registry.json"))
    for (const [name, registered] of Object.entries(actual.skills)) {
      const content = await readFile(path.join(library, registered), "utf8")
      assert.match(content, new RegExp(`^---\\nname: ${name}\\n`))
      assert.match(content, /\ndescription: .+/)
      assert.doesNotMatch(content, /\/home\/hodangthaiduy\/(?:\.config|\.cache)\/opencode/)
    }

    await assert.rejects(resolveSkillPath(library, actual, "unregistered-skill"), /Unknown skill/)
  })

  test("assigns every packaged skill to exactly one package", async () => {
    const library = path.dirname(new URL("../registry.json", import.meta.url).pathname)
    const actual = await loadRegistry(path.join(library, "registry.json"))
    const owners = new Map<string, string>()
    for (const [packageName, definition] of Object.entries(actual.packages)) {
      for (const skill of [...definition.core, ...definition.optional]) {
        assert.ok(!owners.has(skill), `${skill} belongs to both ${owners.get(skill)} and ${packageName}`)
        owners.set(skill, packageName)
      }
    }
  })

  test("loads every added package core skill", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-router-packages-"))
    roots.push(root)
    const library = path.dirname(new URL("../registry.json", import.meta.url).pathname)
    const actual = await loadRegistry(path.join(library, "registry.json"))
    const store = await StateStore.open(path.join(root, "state.json"))
    await store.startSession(root, "session")
    const load = createPackageLoader({ registry: actual, store, libraryRoot: library, projectRoot: root })

    for (const packageName of ["docs"]) {
      await store.setPackage(root, "session", packageName, [])
      const output = await load({ sessionID: "session", packageName })
      assert.match(output, new RegExp(`# ${actual.packages[packageName].core[0]}`))
      await store.resetTaskLock(root, "session")
    }
  })

  test("loads a registered optional skill through the docs package", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-router-archify-"))
    roots.push(root)
    const library = path.dirname(new URL("../registry.json", import.meta.url).pathname)
    const actual = await loadRegistry(path.join(library, "registry.json"))
    const store = await StateStore.open(path.join(root, "state.json"))
    await store.startSession(root, "session")
    await store.setPackage(root, "session", "docs", ["docs-editor"])
    const load = createPackageLoader({ registry: actual, store, libraryRoot: library, projectRoot: root })

    const output = await load({ sessionID: "session", packageName: "docs" })
    assert.match(output, /# technical-writing/)
    assert.match(output, /# docs-editor/)
  })
})
