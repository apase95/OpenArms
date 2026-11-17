import assert from "node:assert/strict"
import { test } from "node:test"
import { spawnSync } from "node:child_process"
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const source = fileURLToPath(new URL("../scripts/opencode-link.mjs", import.meta.url))

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const folder = await mkdtemp(path.join(tmpdir(), "openarms-link-"))
  t.after(() => rm(folder, { recursive: true, force: true }))
  const root = path.join(folder, "checkout space # tiếng Việt")
  const home = path.join(folder, "home")
  const config = path.join(home, ".config/opencode")
  await mkdir(path.join(root, "scripts"), { recursive: true })
  await mkdir(path.join(root, "plugins"))
  await mkdir(config, { recursive: true })
  const script = path.join(root, "scripts/opencode-link.mjs")
  await copyFile(source, script)
  for (const entry of ["skill-router-server.ts", "skill-router-tui.tsx"]) {
    await writeFile(path.join(root, "plugins", entry), "// fixture only\n")
  }
  const sentinel = '{"plugin":["keep-me"],"permission":{"skill":"deny"}}\n'
  await writeFile(path.join(config, "opencode.json"), sentinel)
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], {
    cwd: home, encoding: "utf8",
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.dirname(config), OPENCODE_CONFIG_DIR: config },
  })
  return { root, config, sentinel, run }
}

test("link prints checkout-relative file URLs independent of cwd without touching host config", async t => {
  const { root, config, sentinel, run } = await fixture(t)
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, "")
  assert.deepEqual(JSON.parse(result.stdout), {
    "opencode.json": { plugin: [pathToFileURL(path.join(root, "plugins/skill-router-server.ts")).href] },
    "tui.json": { plugin: [pathToFileURL(path.join(root, "plugins/skill-router-tui.tsx")).href] },
  })
  assert.equal(await readFile(path.join(config, "opencode.json"), "utf8"), sentinel)
  assert.deepEqual(await readdir(config), ["opencode.json"])
  assert.deepEqual((await readdir(root)).sort(), ["plugins", "scripts"])
  assert.equal(run().stdout, result.stdout)
})

test("link rejects missing and non-file entries without partial JSON", async t => {
  const { root, run } = await fixture(t)
  const entry = path.join(root, "plugins/skill-router-tui.tsx")
  await rm(entry)
  for (const directory of [false, true]) {
    if (directory) await mkdir(entry)
    const result = run()
    assert.equal(result.status, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Missing or unreadable plugin entry: plugins\/skill-router-tui\.tsx/)
  }
})

test("link help is print-only and install/apply or extra arguments are rejected", async t => {
  const { root, config, sentinel, run } = await fixture(t)
  await rm(path.join(root, "plugins"), { recursive: true })
  const help = run("--help")
  assert.equal(help.status, 0)
  assert.match(help.stdout, /Merge each fragment manually/)
  for (const args of [["--apply"], ["--install"], ["--help", "extra"]]) {
    const result = run(...args)
    assert.equal(result.status, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /no install\/apply mode/)
  }
  assert.equal(await readFile(path.join(config, "opencode.json"), "utf8"), sentinel)
  assert.deepEqual(await readdir(config), ["opencode.json"])
})
