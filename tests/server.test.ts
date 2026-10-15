import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { buildRouterInstruction, createRuntime } from "../plugins/server-core.ts"
import { hashBytes } from "../scripts/registry-v2.mjs"
import { governanceHooks } from "../src/governance-hooks.ts"
import { createLocalRuntime } from "../src/local-library.ts"
import { SkillRouterServer } from "../plugins/skill-router-server.ts"

test("active adapter exposes only selected-ID local loading and refreshes a shared source", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms-adapter-local-"))
  const previous = process.env.XDG_STATE_HOME
  try {
    process.env.XDG_STATE_HOME = path.join(root, "state")
    await mkdir(path.join(root, "skills"))
    await writeFile(path.join(root, "skills/example.md"), "synthetic adapter content")
    await writeFile(path.join(root, "registry.json"), JSON.stringify({ version: 1, packages: { demo: { core: ["example"], optional: [], detect: {} } }, skills: { example: "skills/example.md" } }))
    const adapter = await SkillRouterServer({ directory: root, worktree: root } as any)
    assert.deepEqual(Object.keys(adapter.tool!).sort(), ["load_skill", "openarms_usage"])
    const load = (args: any) => adapter.tool!.load_skill.execute(args, { sessionID: "s" } as any).then(JSON.parse)
    assert.equal((await load({ skill: "example" })).error.code, "NOT_CONFIGURED")
    const runtime = await createLocalRuntime({ directory: root })
    const config = await runtime.configureLibrary(root, "unset", true)
    await runtime.selectPackage("s", "demo", [], config.revision)
    assert.equal((await load({ skill: "example" })).content, "synthetic adapter content")
    assert.equal((await load({ skill: "example", path: "skills/example.md" })).error.code, "INVALID_REQUEST")
    const output = { system: [] as string[] }
    await adapter["experimental.chat.system.transform"]!({ sessionID: "s" } as any, output)
    assert.match(output.system.join("\n"), /example.*load_skill/)
    await runtime.configureLibrary(root, config.revision, true)
    assert.equal((await load({ skill: "example" })).error.code, "NOT_SELECTED")
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME
    else process.env.XDG_STATE_HOME = previous
    await rm(root, { recursive: true, force: true })
  }
})

test("legacy router lists skill IDs (including core), no internal metadata", () => {
  for (const session of [undefined, { packages: { demo: ["extra"] }, approvedMismatch: [], updatedAt: "now" }]) {
    const prompt = buildRouterInstruction(session, { version: 1, packages: { demo: { core: ["example"], optional: ["extra"], detect: {} } }, skills: {} })
    assert.match(prompt, /Only skill content returned directly by load_verified_skill/)
    assert.match(prompt, /skill ID is not a package name/)
    assert.match(prompt, /filesystem, web, cache or subagent/)
    assert.doesNotMatch(prompt, /load_skill_package|sha256:|Reference root|history/)
    if (session) assert.match(prompt, /- demo: example, extra/)
  }
})

test("legacy verified runtime happy load, tamper failure leaves persisted bytes unchanged", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arms-server-v2-"))
  try {
    await mkdir(path.join(root, "example"))
    await writeFile(path.join(root, "example/interface.txt"), "synthetic bytes")
    const registry = { schemaVersion: 2, packages: { demo: { core: ["example"], optional: [], detect: { files: [], extensions: [], dependencies: [] } } }, skills: { example: { owner: "demo", kind: "core", path: "example/interface.txt", contentHash: hashBytes(Buffer.from("synthetic bytes")), maxTokens: 100, defaultPermission: "allow", workflows: {}, references: {} } } }
    await writeFile(path.join(root, "registry.json"), JSON.stringify(registry))
    const runtime = await createRuntime({ directory: root, libraryRoot: root, stateFile: path.join(root, "state.json"), approvedRegistryHash: hashBytes(Buffer.from(JSON.stringify(registry))) })
    await runtime.store.setPackage(root, "s", "demo", [])
    const result = await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })
    assert.equal(result.ok, true)
    assert.deepEqual(result.sources.map((source: any) => source.content), ["synthetic bytes"])
    const before = await readFile(runtime.stateFile, "utf8")
    await writeFile(path.join(root, "example/interface.txt"), "tampered")
    assert.equal((await runtime.loadVerifiedSkill({ skill: "example" }, { sessionID: "s" })).error.code, "HASH_MISMATCH")
    assert.equal(await readFile(runtime.stateFile, "utf8"), before)
    const output = { title: "skill", output: JSON.stringify(result), metadata: {} }
    await governanceHooks(root)["tool.execute.after"]({ tool: "load_verified_skill", sessionID: "s", callID: "c", args: {} }, output)
    assert.equal(output.output, JSON.stringify(result))
  } finally { await rm(root, { recursive: true, force: true }) }
})
