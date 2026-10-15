import assert from "node:assert/strict"
import fs from "node:fs"
import { syncBuiltinESMExports } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { nonSmokeFingerprint, smokeFingerprint, buildFingerprint } from "../scripts/smoke-inputs.mjs"

test("non-smoke hashes source revisions and registry metadata without library I/O", () => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), "arms-non-smoke-"))
  const originals = new Map()
  try {
    fs.mkdirSync(path.join(directory, "src"))
    fs.writeFileSync(path.join(directory, "src/example.ts"), "export const value = 1")
    fs.writeFileSync(path.join(directory, "registry.json"), "{\"version\":1}")
    const authoredInputs = ["docs/testing/registry-v2-valid.json", "docs/testing/registry-v2-invalid.json", ".github/workflows/registry-integrity.yml"]
    for (const file of authoredInputs) {
      fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true })
      fs.writeFileSync(path.join(directory, file), "authored input A")
    }
    fs.symlinkSync("../skills", path.join(directory, "src/skills"))
    fs.symlinkSync("../skills/fixture", path.join(directory, "src/SKILL.md"))
    // No library is created or accessed. Guard stat as well as reads/traversal;
    // a filter applied only after lstat is not sufficient.
    for (const name of ["lstatSync", "statSync", "realpathSync", "readdirSync", "readFileSync", "openSync", "readlinkSync"]) {
      const original = fs[name]
      originals.set(name, original)
      fs[name] = function (file, ...args) {
        const relative = path.relative(directory, String(file)).replaceAll("\\", "/")
        assert.ok(!relative.split("/").includes("skills") && path.basename(relative) !== "SKILL.md", `Forbidden library I/O: ${name} ${relative}`)
        return original.call(this, file, ...args)
      }
    }
    syncBuiltinESMExports()
    const key = () => nonSmokeFingerprint("full", ["node", "fixture"], { directory })
    const before = key()
    assert.equal(key(), before)
    fs.writeFileSync(path.join(directory, "src/example.ts"), "export const value = 2")
    assert.notEqual(key(), before)
    const sourceRevision = key()
    fs.writeFileSync(path.join(directory, "registry.json"), "{\"version\":2}")
    assert.notEqual(key(), sourceRevision)
    const invalidations = authoredInputs.map((file) => {
      const beforeChange = key()
      // Same-size single-byte change: neither mtime nor file length is proof.
      fs.writeFileSync(path.join(directory, file), "authored input B")
      return [file, key() !== beforeChange]
    })
    assert.deepEqual(invalidations, authoredInputs.map((file) => [file, true]))
  } finally {
    for (const [name, original] of originals) fs[name] = original
    syncBuiltinESMExports()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test("non-smoke refuses source symlinks before following them into a library", () => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), "arms-non-smoke-link-"))
  try {
    fs.mkdirSync(path.join(directory, "src"))
    fs.symlinkSync("../skills", path.join(directory, "src/linked"))
    assert.throws(() => nonSmokeFingerprint("syntax", ["node", "fixture"], { directory }), /Non-smoke input symlink/)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test("explicit sandbox inputs reject a symlink parent before touching its children", () => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), "arms-non-smoke-parent-"))
  try {
    fs.symlinkSync("skills", path.join(directory, "sandbox"))
    assert.throws(() => nonSmokeFingerprint("full", ["node", "fixture"], { directory }), /Non-smoke input symlink: sandbox/)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test("smoke and build still invalidate when synthetic library bytes change", () => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), "arms-smoke-bytes-"))
  try {
    for (const folder of ["skills", "plugins", "scripts", "sandbox"]) fs.mkdirSync(path.join(directory, folder))
    fs.writeFileSync(path.join(directory, "plugins/skill-router-server.ts"), "export {}")
    fs.writeFileSync(path.join(directory, "scripts/test-policy.json"), "{}")
    fs.writeFileSync(path.join(directory, "registry.json"), "{}")
    fs.writeFileSync(path.join(directory, "skills/fixture.txt"), "opaque data A")
    fs.writeFileSync(path.join(directory, ".dockerignore"), "")
    fs.writeFileSync(path.join(directory, "sandbox/Dockerfile"), "COPY skills /opt/fixture/skills\n")
    const configuration = { values: { SANDBOX_FIXTURE: "docs-project", NODE_VERSION: "24.12.0", OPENCODE_VERSION: "1.18.35", TERM: "xterm" } }
    const smoke = () => smokeFingerprint("smoke-runtime", { directory, configuration })
    const build = () => buildFingerprint({ directory, configuration })
    const beforeSmoke = smoke(), beforeBuild = build()
    fs.writeFileSync(path.join(directory, "skills/fixture.txt"), "opaque data B")
    assert.notEqual(smoke(), beforeSmoke)
    assert.notEqual(build(), beforeBuild)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
