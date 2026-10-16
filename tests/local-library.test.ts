import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, rm, symlink, rename } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { createLocalRuntime } from "../src/local-library.ts"
import { executeLocalSkillsCommand } from "../src/skills-service.ts"

test("Home previews latest selection before prompt without drafting or copying authority", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openarms-preview-"))
  const home = "__skill_router_home__"
  try {
    await mkdir(path.join(dir, "skills"))
    await writeFile(path.join(dir, "registry.json"), JSON.stringify({ version: 1, packages: { demo: { core: ["example"], optional: ["extra"], detect: {} } }, skills: { example: "skills/example.md", extra: "skills/extra.md" } }))
    const a = await createLocalRuntime({ directory: dir, stateFile: path.join(dir, "state.json") })
    const config = await a.configureLibrary(dir, "unset", true)
    await a.selectPackage("old", "demo", ["extra"], config.revision)
    for (let i = 0; i < 2; i++) {
      await a.initializeLocalSession(home, config.revision, false, undefined, true)
      assert.match(await executeLocalSkillsCommand(a, home, "status"), /example\tSelected/)
      assert.doesNotMatch(await executeLocalSkillsCommand(a, home, "status"), /Loaded/)
      const preview = await a.store.getSession(dir, home)
      for (const field of ["pendingHomeSelection", "loadHistory", "verified", "taskPackage", "taskLoadedSkills", "taskSession"]) assert.equal(preview?.[field], undefined)
      assert.deepEqual(await a.store.getLastSelection(dir), { demo: ["extra"] })
    }
    await a.mutateSelection(home, "remove", "demo", ["extra"], config.revision)
    await a.initializeLocalSession(home, config.revision) // ordinary ensure cannot reset an explicit choice
    assert.equal((await a.store.getSession(dir, home))?.pendingHomeSelection, true)
    await a.initializeLocalSession("root", config.revision)
    assert.deepEqual((await a.store.getSession(dir, "root"))?.packages, { demo: [] })
    assert.equal((await a.store.getSession(dir, home))?.pendingHomeSelection, undefined)
    await a.mutateSelection(home, "clear", "", [], config.revision)
    await a.initializeLocalSession("empty", config.revision)
    await a.initializeLocalSession(home, config.revision, false, undefined, true)
    assert.deepEqual((await a.store.getSession(dir, home))?.packages, {})
    await a.initializeLocalSession("old", config.revision)
    assert.deepEqual((await a.store.getSession(dir, "old"))?.packages, { demo: ["extra"] })
    await a.initializeLocalSession("child", config.revision, false, "old")
    assert.deepEqual((await a.store.getSession(dir, "child"))?.packages, {})
    const other = path.join(dir, "other")
    await mkdir(other)
    const b = await createLocalRuntime({ directory: other, stateFile: path.join(dir, "state.json") })
    const separate = await b.configureLibrary(dir, "unset", true)
    await b.initializeLocalSession(home, separate.revision, false, undefined, true)
    assert.deepEqual((await b.store.getSession(other, home))?.packages, {})
    const next = await a.configureLibrary(dir, config.revision, true)
    await assert.rejects(a.initializeLocalSession(home, config.revision, false, undefined, true), /LIBRARY_CHANGED/)
    await a.initializeLocalSession(home, next.revision, false, undefined, true)
    assert.deepEqual((await a.store.getSession(dir, home))?.packages, {})
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("canonical initial symlink configuration preserves unchanged source selections", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openarms-root-"))
  try {
    const root = path.join(dir, "a"), alias = path.join(dir, "alias")
    await mkdir(path.join(root, "skills"), { recursive: true })
    await writeFile(path.join(root, "skills/example.md"), "synthetic a")
    await writeFile(path.join(root, "registry.json"), JSON.stringify({ version: 1, packages: { demo: { core: ["example"], optional: [], detect: {} } }, skills: { example: "skills/example.md" } }))
    await symlink(root, alias)
    const runtime = await createLocalRuntime({ directory: dir, stateFile: path.join(dir, "state.json") })
    const config = await runtime.configureLibrary(alias, "unset", true)
    assert.equal(config.root, root)
    await runtime.selectPackage("s", "demo", [], config.revision)
    assert.equal((await runtime.refreshLibrary()).revision, config.revision)
    assert.equal((await runtime.loadSkill("s", "example")).content, "synthetic a")
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("equal-hash canonical root retarget retires state and rejects a captured load across runtimes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openarms-root-"))
  try {
    const root = path.join(dir, "a"), other = path.join(dir, "b")
    const metadata = JSON.stringify({ version: 1, packages: { demo: { core: ["example"], optional: [], detect: {} } }, skills: { example: "skills/example.md" } })
    for (const [library, content] of [[root, "synthetic a"], [other, "synthetic b"]]) {
      await mkdir(path.join(library, "skills"), { recursive: true })
      await writeFile(path.join(library, "skills/example.md"), content)
      await writeFile(path.join(library, "registry.json"), metadata)
    }
    const options = { directory: dir, stateFile: path.join(dir, "state.json") }
    const a = await createLocalRuntime(options), b = await createLocalRuntime(options)
    const config = await a.configureLibrary(root, "unset", true)
    await a.selectPackage("s", "demo", [], config.revision)
    await a.selectPackage("__skill_router_home__", "demo", [], config.revision)
    assert.equal((await a.loadSkill("s", "example")).content, "synthetic a")
    const transaction = a.store.localTransaction.bind(a.store)
    let captured!: () => void, release!: () => void
    const entered = new Promise<void>(resolve => { captured = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    a.store.localTransaction = async (...args) => { captured(); await gate; return transaction(...args) }
    const loading = a.loadSkill("s", "example")
    await entered
    await rename(root, path.join(dir, "original-a"))
    await symlink(other, root)
    // Revalidation must reject even before another runtime advances the revision.
    release()
    assert.equal((await loading).error?.code, "LIBRARY_CHANGED")
    const next = await b.refreshLibrary()
    assert.equal(next.root, other)
    assert.equal(next.registryHash, config.registryHash)
    assert.notEqual(next.revision, config.revision)
    assert.deepEqual(await b.store.getLastSelection(dir), {})
    for (const id of ["s", "__skill_router_home__"]) {
      const session = await b.store.getSession(dir, id)
      assert.deepEqual(session?.packages, {})
      assert.equal(session?.loadHistory, undefined)
      assert.equal(session?.taskLoadedSkills, undefined)
      assert.equal(session?.pendingHomeSelection, undefined)
    }
    assert.equal((await a.loadSkill("s", "example")).error?.code, "NOT_SELECTED")
    await assert.rejects(a.selectPackage("s", "demo", [], config.revision), /LIBRARY_CHANGED/)
    await b.selectPackage("s", "demo", [], next.revision)
    assert.equal((await a.loadSkill("s", "example")).content, "synthetic b")
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("local load validates context and cannot publish across an in-flight source switch", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openarms-race-"))
  try {
    for (const name of ["a", "b"]) {
      await mkdir(path.join(dir, name, "skills"), { recursive: true })
      await writeFile(path.join(dir, name, "skills/example.md"), `synthetic ${name}`)
      await writeFile(path.join(dir, name, "registry.json"), JSON.stringify({ version: 1, packages: { demo: { core: ["example"], optional: [], detect: {} } }, skills: { example: "skills/example.md" } }))
    }
    const options = { directory: dir, stateFile: path.join(dir, "state.json") }
    const a = await createLocalRuntime(options), b = await createLocalRuntime(options)
    const config = await a.configureLibrary(path.join(dir, "a"), "unset", true)
    await a.selectPackage("s", "demo", [], config.revision)
    assert.equal((await a.loadSkill("s", "example")).content, "synthetic a")
    assert.equal((await a.loadSkill("", "example")).error?.code, "INVALID_CONTEXT")
    // Synchronize after the loader captured A, before its real locked transaction.
    const transaction = a.store.localTransaction.bind(a.store)
    let captured!: () => void, release!: () => void
    const entered = new Promise<void>(resolve => { captured = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    a.store.localTransaction = async (...args) => { captured(); await gate; return transaction(...args) }
    const loading = a.loadSkill("s", "example")
    await entered
    const next = await b.configureLibrary(path.join(dir, "b"), config.revision, true)
    release()
    assert.equal((await loading).error?.code, "LIBRARY_CHANGED")
    assert.equal((await b.getSkillStatus("s", "example")).state, "Missing")
    assert.doesNotMatch(await b.buildInstruction("s"), /Selected local skill IDs/)
    assert.equal((await b.store.getSession(dir, "s"))?.loadHistory, undefined)
    await b.selectPackage("s", "demo", [], next.revision)
    assert.equal((await b.loadSkill("s", "example")).content, "synthetic b")
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("local lifecycle: automatic selection and mutation reject a stale source revision", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openarms-lifecycle-"))
  try {
    await mkdir(path.join(dir, "skills"))
    await writeFile(path.join(dir, "skills", "example.md"), "synthetic")
    await writeFile(path.join(dir, "registry.json"), JSON.stringify({ version: 1, packages: { demo: { core: ["example"], optional: ["extra"], detect: {} } }, skills: { example: "skills/example.md", extra: "skills/example.md" } }))
    const a = await createLocalRuntime({ directory: dir, stateFile: path.join(dir, "state.json") })
    assert.match(await executeLocalSkillsCommand(a, "s", "status"), /Not configured/)
    const config = await a.configureLibrary(dir, "unset", true)
    await a.selectPackage("s", "demo", ["extra"], config.revision)
    const status = await executeLocalSkillsCommand(a, "s", "status")
    assert.match(status, /example\tSelected/)
    assert.ok(status.indexOf("Library:") > status.indexOf("example"))
    await a.initializeLocalSession("new", config.revision)
    assert.deepEqual((await a.store.getSession(dir, "new"))?.packages, { demo: ["extra"] })
    await a.initializeLocalSession("no", config.revision)
    assert.deepEqual((await a.store.getSession(dir, "no"))?.packages, { demo: ["extra"] })
    await a.mutateSelection("s", "remove", "demo", ["extra"], config.revision)
    assert.deepEqual((await a.store.getSession(dir, "s"))?.packages, { demo: [] })
    await executeLocalSkillsCommand(a, "s", "clear")
    assert.deepEqual(await a.store.getLastSelection(dir), {})
    await executeLocalSkillsCommand(a, "s", "use demo extra")
    await a.configureLibrary(dir, config.revision, true)
    await assert.rejects(executeLocalSkillsCommand(a, "s", "use demo extra", config.revision), /LIBRARY_CHANGED/)
    await assert.rejects(a.initializeLocalSession("late", config.revision, true), /LIBRARY_CHANGED/)
    await assert.rejects(a.mutateSelection("s", "add", "demo", ["extra"], config.revision), /LIBRARY_CHANGED/)
    assert.deepEqual(await a.store.getLastSelection(dir), {})
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("automatic roots atomically consume Home once, preserve reopened roots and isolate children", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openarms-auto-"))
  try {
    await mkdir(path.join(dir, "skills"))
    await writeFile(path.join(dir, "registry.json"), JSON.stringify({ version: 1, packages: { demo: { core: ["example"], optional: ["extra"], detect: {} } }, skills: { example: "skills/example.md", extra: "skills/example.md" } }))
    const options = { directory: dir, stateFile: path.join(dir, "state.json") }
    const a = await createLocalRuntime(options), b = await createLocalRuntime(options)
    const config = await a.configureLibrary(dir, "unset", true)
    await a.selectPackage("old", "demo", ["extra"], config.revision)
    await Promise.all([a.initializeLocalSession("root", config.revision), b.initializeLocalSession("root", config.revision)])
    assert.deepEqual((await a.store.getSession(dir, "root"))?.packages, { demo: ["extra"] })
    await a.mutateSelection("__skill_router_home__", "clear", "", [], config.revision)
    await a.selectPackage("old", "demo", ["extra"], config.revision)
    await a.initializeLocalSession("home-root", config.revision)
    assert.deepEqual((await a.store.getSession(dir, "home-root"))?.packages, {})
    await a.initializeLocalSession("next", config.revision)
    assert.deepEqual((await a.store.getSession(dir, "next"))?.packages, { demo: ["extra"] })
    await a.initializeLocalSession("child", config.revision, false, "old")
    assert.deepEqual((await a.store.getSession(dir, "child"))?.packages, {})
    await a.mutateSelection("root", "clear", "", [], config.revision)
    await a.selectPackage("old", "demo", ["extra"], config.revision)
    await b.initializeLocalSession("root", config.revision)
    assert.deepEqual((await a.store.getSession(dir, "root"))?.packages, {})
    const root = await a.store.getSession(dir, "next")
    for (const field of ["loadHistory", "verified", "taskPackage", "taskLoadedSkills", "taskSession"]) assert.equal(root?.[field], undefined)
    const changed = await a.configureLibrary(dir, config.revision, true)
    await b.initializeLocalSession("new-source", changed.revision)
    assert.deepEqual((await a.store.getSession(dir, "new-source"))?.packages, {})
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("synthetic local library: explicit configuration, selected load and switch isolation", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openarms-local-"))
  try {
    const library = path.join(dir, "library")
    await mkdir(path.join(library, "skills"), { recursive: true })
    await writeFile(path.join(library, "skills", "example.md"), "synthetic content")
    await writeFile(path.join(library, "registry.json"), JSON.stringify({ version: 1, packages: { demo: { core: ["example"], optional: [], detect: {} } }, skills: { example: "skills/example.md" } }))
    const options = { directory: dir, stateFile: path.join(dir, "state.json") }
    const a = await createLocalRuntime(options), b = await createLocalRuntime(options)
    assert.equal((await a.loadSkill("s", "example")).error?.code, "NOT_CONFIGURED")
    const initial = await a.getLibrary()
    await a.configureLibrary(library, initial.revision, false)
    assert.equal((await a.getLibrary()).root, undefined)
    const config = await a.configureLibrary(library, initial.revision, true)
    await a.selectPackage("s", "demo", [], config.revision)
    assert.equal((await b.loadSkill("s", "example")).content, "synthetic content")
    assert.equal((await b.getSkillStatus("s", "example")).state, "Loaded")
    assert.match(await b.buildInstruction("s"), /example.*load_skill/)
    await a.selectPackage("__skill_router_home__", "demo", [], config.revision)
    const other = path.join(dir, "other")
    await mkdir(other)
    const c = await createLocalRuntime({ directory: other, stateFile: options.stateFile })
    const otherConfig = await c.configureLibrary(library, "unset", true)
    await c.selectPackage("s", "demo", [], otherConfig.revision)
    const changed = await a.configureLibrary(library, config.revision, true)
    assert.notEqual(changed.revision, config.revision)
    await assert.rejects(a.store.setPackage(dir, "s", "demo", []), /LOCAL_LIBRARY_REQUIRES_REVISION/)
    await assert.rejects(a.store.restoreSession(dir, "s"), /LOCAL_LIBRARY_REQUIRES_REVISION/)
    await assert.rejects(a.store.verifiedTransaction(dir, "s", session => {
      session.packages = { demo: [] }
      return { ok: true }
    }), /LOCAL_LIBRARY_REQUIRES_REVISION/)
    assert.equal((await b.loadSkill("s", "example")).error?.code, "NOT_SELECTED")
    assert.deepEqual(await a.store.getLastSelection(a.projectRoot), {})
    assert.deepEqual((await a.store.getSession(a.projectRoot, "__skill_router_home__"))?.packages, {})
    assert.equal((await c.loadSkill("s", "example")).ok, true)
    await assert.rejects(a.selectPackage("s", "demo", [], config.revision), /LIBRARY_CHANGED/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("synthetic v2 metadata needs no grants and registry edits retire selections", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openarms-local-"))
  try {
    await mkdir(path.join(dir, "skills"))
    await writeFile(path.join(dir, "skills", "example.md"), "synthetic")
    const metadata = { schemaVersion: 2, packages: { demo: { core: ["example"], optional: [], detect: { files: [], extensions: [], dependencies: [] } } }, skills: { example: { path: "skills/example.md", owner: "demo", kind: "core", contentHash: `sha256:${createHash("sha256").update("synthetic").digest("hex")}`, maxTokens: 100, defaultPermission: "deny", workflows: {}, references: {} } } }
    await writeFile(path.join(dir, "registry.json"), JSON.stringify(metadata))
    const options = { directory: dir, stateFile: path.join(dir, "state.json") }
    const a = await createLocalRuntime(options), b = await createLocalRuntime(options)
    const config = await a.configureLibrary(dir, "unset", true)
    await a.selectPackage("s", "demo", [], config.revision)
    assert.equal((await b.loadSkill("s", "example")).content, "synthetic")
    await writeFile(path.join(dir, "registry.json"), JSON.stringify(metadata, null, 2))
    assert.equal((await b.loadSkill("s", "example")).error?.code, "NOT_SELECTED")
    assert.notEqual((await a.getLibrary()).revision, config.revision)
    await assert.rejects(a.configureLibrary(dir, config.revision, true), /LIBRARY_CHANGED/)
    assert.equal((await a.loadSkill("s", "unknown")).error?.code, "UNKNOWN_ID")
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("synthetic local library rejects escaping symlinks and oversized output", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openarms-local-"))
  try {
    const library = path.join(dir, "library")
    await mkdir(path.join(library, "skills"), { recursive: true })
    await writeFile(path.join(dir, "outside.md"), "outside")
    await symlink(path.join(dir, "outside.md"), path.join(library, "skills", "example.md"))
    await writeFile(path.join(library, "registry.json"), JSON.stringify({ version: 1, packages: { demo: { core: ["example"], optional: [], detect: {} } }, skills: { example: "skills/example.md" } }))
    const runtime = await createLocalRuntime({ directory: dir, stateFile: path.join(dir, "state.json"), maxBytes: 4 })
    const config = await runtime.configureLibrary(library, (await runtime.getLibrary()).revision, true)
    await runtime.selectPackage("s", "demo", [], config.revision)
    assert.equal((await runtime.loadSkill("s", "example")).error?.code, "UNSAFE_PATH")
    await rm(path.join(library, "skills", "example.md"))
    await writeFile(path.join(library, "skills", "example.md"), "oversized")
    assert.equal((await runtime.loadSkill("s", "example")).error?.code, "OUTPUT_TOO_LARGE")
    await writeFile(path.join(library, "skills", "example.md"), Buffer.from([0xc3, 0x28]))
    assert.equal((await runtime.loadSkill("s", "example")).error?.code, "INVALID_ENCODING")
    await assert.rejects(runtime.configureLibrary(path.join(dir, "missing"), config.revision, true), /INVALID_LIBRARY/)
    assert.equal((await runtime.getLibrary()).revision, config.revision)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
