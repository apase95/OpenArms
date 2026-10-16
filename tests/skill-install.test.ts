import test from "node:test"
import assert from "node:assert/strict"
import { parseInstallCommand, resolveSkillScope, prepareSkillScope } from "../src/skill-scope-resolver.ts"
import { extractSkillArchive } from "../src/skill-archive-extractor.ts"
import { gzipSync, gunzipSync } from "node:zlib"
import { parseGithubSource, withSkillDownload, assertPublicAddress, MAX_SKILL_BYTES, type FetchSeams } from "../src/skill-remote-fetcher.ts"
import { mkdtemp, mkdir, lstat, readdir, readFile, writeFile, rm, symlink, chmod } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

function tar(entries: Array<{ name: string; content?: Buffer; type?: string }>) {
  const chunks: Buffer[] = []
  for (const entry of entries) {
    const body = entry.content ?? Buffer.alloc(0), header = Buffer.alloc(512)
    header.write(entry.name); header.write("0000700\0", 100); header.write("0000000\0", 108); header.write("0000000\0", 116)
    header.write(body.length.toString(8).padStart(11, "0") + "\0", 124)
    header.fill(32, 148, 156); header.write(entry.type ?? "0", 156); header.write("ustar\0", 257); header.write("00", 263)
    header.write([...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, "0") + "\0 ", 148)
    chunks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512))
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]))
}

test("archive smoke: authored document is returned as untrusted data with binary assets", () => {
  const result: any = extractSkillArchive(tar([{ name: "repo/SKILL.md", content: Buffer.from("synthetic opaque text") }, { name: "repo/assets/a.bin", content: Buffer.from([0, 255]) }]))
  assert.equal(result.document.text, "synthetic opaque text")
  assert.deepEqual(result.assets[0].bytes, Buffer.from([0, 255]))
})

test("archive smoke: traversal is rejected before any write", () => {
  assert.throws(() => extractSkillArchive(tar([{ name: "repo/../escape" }])), /Unsafe archive path/)
})

test("install foundation smoke: default local path and immutable approval", () => {
  assert.equal(parseInstallCommand("/skills install https://github.com/example/demo").scope, "local")
  const plan = resolveSkillScope({ projectRoot: "/project", skillName: "demo" })
  assert.equal(plan.target, "/project/skills/demo")
  assert.ok(Object.isFrozen(plan))
})

test("install foundation smoke: traversal and conflicting scope fail closed", () => {
  assert.throws(() => resolveSkillScope({ projectRoot: "/project", skillName: "../escape" }))
  assert.throws(() => parseInstallCommand("/skills install --global --local https://github.com/example/demo"))
})

test("scope: deterministic Linux/macOS, XDG empty fallback and strict names/arguments", () => {
  for (const home of ["/home/tester", "/Users/tester"]) {
    assert.equal(resolveSkillScope({ projectRoot: "/project", skillName: "demo", scope: "global", home, env: {} }).target, `${home}/.config/opencode/skills/demo`)
    assert.equal(resolveSkillScope({ projectRoot: "/project", skillName: "demo", scope: "global", home, env: { XDG_CONFIG_HOME: "" } }).registry, `${home}/.config/opencode/registry.json`)
  }
  assert.equal(resolveSkillScope({ projectRoot: "/project", skillName: "demo", scope: "global", env: { XDG_CONFIG_HOME: "/custom" } }).base, "/custom/opencode/skills")
  assert.throws(() => resolveSkillScope({ projectRoot: "/project", skillName: "demo", scope: "global", env: { XDG_CONFIG_HOME: "relative" } }))
  for (const skillName of ["", "..", "a/b", "a\\b", "/root", "a\0b", "CON", "nul", "a.b", "-a"]) assert.throws(() => resolveSkillScope({ projectRoot: "/project", skillName }))
  for (const args of ["", "--bad", "--overwrite --overwrite", "--local --local", "https://github.com/a/b extra", "https://github.com/a/b#evil", "https://github.com/a/b/../c"]) assert.throws(() => parseInstallCommand(`/skills install ${args}`))
})

test("scope preparation: private directories, nondestructive overwrite, symlinks and collisions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "openarms-scope-test-"))
  try {
    const plan = resolveSkillScope({ projectRoot: root, skillName: "demo" })
    assert.deepEqual(await readdir(root), []) // resolution did not write
    await prepareSkillScope(plan)
    assert.equal((await lstat(plan.base)).mode & 0o777, 0o700)
    await mkdir(plan.target, { mode: 0o700 }); await writeFile(path.join(plan.target, "keep"), "preserved")
    await assert.rejects(prepareSkillScope(plan), /already exists/)
    await prepareSkillScope(resolveSkillScope({ projectRoot: root, skillName: "demo", overwrite: true }))
    assert.equal(await readFile(path.join(plan.target, "keep"), "utf8"), "preserved")
    await symlink(root, path.join(plan.base, "alias"))
    await assert.rejects(prepareSkillScope(resolveSkillScope({ projectRoot: root, skillName: "alias", overwrite: true })), /Unsafe/)
    await symlink(root, path.join(root, "registry.json"))
    await assert.rejects(prepareSkillScope(plan), /Unsafe registry/)
    await rm(path.join(root, "registry.json"))
    await chmod(plan.base, 0o777)
    await assert.rejects(prepareSkillScope(plan), /Unsafe scope/)
    assert.equal((await lstat(plan.base)).mode & 0o777, 0o777) // no chmod existing dirs
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("GitHub parser: repo/.git/commit/explicit slash ref; encoded and private origins rejected", () => {
  assert.equal(parseGithubSource("https://github.com/a/demo.git").repo, "demo")
  const sha = "a".repeat(40)
  assert.equal(parseGithubSource(`https://github.com/a/demo/commit/${sha}`).archiveURL, `https://codeload.github.com/a/demo/tar.gz/${sha}`)
  const source = parseGithubSource("https://github.com/a/demo/tree/feature/one/skills/demo", { ref: "feature/one" })
  assert.equal(source.subpath, "skills/demo")
  assert.match(source.archiveURL, /refs\/heads\/feature\/one$/)
  assert.throws(() => parseGithubSource("https://github.com/a/demo/tree/main/skills/demo"), /explicit ref/)
  for (const url of ["http://github.com/a/b", "https://localhost/a/b", "https://127.0.0.1/a/b", "https://[::1]/a/b", "https://user@github.com/a/b", "https://github.com:443/a/b", "https://github.com/a/b#x", "https://github.com/a/%2e%2e", "https://github.com/a/b/../c", "https://github.com/a/b?x=y", "file:///tmp/a", "https://github.com/a/b\\evil"]) assert.throws(() => parseGithubSource(url), url)
  for (const address of ["127.0.0.1", "10.1.1.1", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "0.0.0.0", "224.0.0.1"]) assert.throws(() => assertPublicAddress(address), address)
})

const source = parseGithubSource("https://github.com/example/demo")
function offline(bytes: Buffer, extra: Partial<FetchSeams> = {}): FetchSeams {
  return { dns: async () => [{ address: "140.82.112.1", family: 4 }], http: async () => ({ status: 200, body: (async function* () { yield bytes })(), close: async () => {} }), ...extra }
}

test("download: exact 10 MiB/missing length, cleanup success and consumer exception, private modes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "openarms-download-test-"))
  try {
    const seams = offline(Buffer.alloc(MAX_SKILL_BYTES), { temporaryRoot: root })
    await withSkillDownload(source, async (bytes, file) => {
      assert.equal(bytes.length, MAX_SKILL_BYTES)
      assert.equal((await lstat(file)).mode & 0o777, 0o600)
      assert.equal((await lstat(path.dirname(file))).mode & 0o777, 0o700)
      assert.equal((await readFile(file)).length, MAX_SKILL_BYTES)
    }, seams)
    assert.deepEqual(await readdir(root), [])
    await assert.rejects(withSkillDownload(source, async () => { throw Error("consumer failure") }, offline(Buffer.from("x"), { temporaryRoot: root })), /consumer failure/)
    await assert.rejects(withSkillDownload(source, async () => {}, offline(Buffer.alloc(MAX_SKILL_BYTES + 1), { temporaryRoot: root })), /exceeds/)
    assert.deepEqual(await readdir(root), [])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("download: DNS is pinned; all DNS answers and every redirect checked before transport", async () => {
  let requests = 0, lookups = 0, closed = 0
  await withSkillDownload(source, async () => {}, offline(Buffer.from("ok"), {
    dns: async () => { lookups++; return [{ address: "140.82.112.1", family: 4 }] },
    http: async (_url, destination) => { requests++; assert.equal(destination.address, "140.82.112.1"); return { status: 200, body: (async function* () { yield Buffer.from("ok") })(), close: async () => { closed++ } } },
  }))
  assert.equal(lookups, 1); assert.equal(requests, 1); assert.equal(closed, 1)
  for (const address of ["10.0.0.1", "::1", "::ffff:127.0.0.1"]) {
    await assert.rejects(withSkillDownload(source, async () => {}, offline(Buffer.alloc(0), { dns: async () => [{ address: "140.82.112.1", family: 4 }, { address, family: address.includes(":") ? 6 : 4 }], http: async () => { throw Error("must not connect") } })), /Non-public/)
  }
  for (const location of ["https://127.0.0.1/evil", "https://[::1]/evil", "https://codeload.github.com:443/a/b", "https://codeload.github.com/a/../b", "https://user@codeload.github.com/a/b", "https://codeload.github.com/a/%2e%2e"]) {
    await assert.rejects(withSkillDownload(source, async () => {}, offline(Buffer.alloc(0), { http: async () => ({ status: 302, location, body: (async function* () {})(), close: async () => {} }) })), /Unsafe/)
  }
  lookups = 0; requests = 0
  await assert.rejects(withSkillDownload(source, async () => {}, offline(Buffer.alloc(0), {
    dns: async () => [{ address: ++lookups === 1 ? "140.82.112.1" : "127.0.0.1", family: 4 }],
    http: async () => { requests++; return { status: 302, location: "https://codeload.github.com/a/other/tar.gz/HEAD", body: (async function* () {})(), close: async () => {} } },
  })), /Non-public/)
  assert.equal(requests, 1)
})

test("download: whole-stream deadline aborts and awaits response cleanup", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "openarms-deadline-test-"))
  let aborted = false, closed = false
  let expire!: () => void
  try {
    await assert.rejects(withSkillDownload(source, async () => {}, offline(Buffer.alloc(0), { temporaryRoot: root, deadlineMs: 15,
      armDeadline: callback => { expire = callback; return () => {} },
      http: async (_url, _destination, signal) => ({ status: 200, body: { [Symbol.asyncIterator]: () => ({ next: () => new Promise(resolve => { signal.addEventListener("abort", () => { aborted = true; resolve({ done: true, value: undefined }) }, { once: true }); queueMicrotask(expire) }) }) }, close: async () => { await Promise.resolve(); closed = true } }),
    })), /deadline/)
    assert.ok(aborted); assert.ok(closed); assert.deepEqual(await readdir(root), [])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("download: timeout awaiting headers settles transport before cleanup", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "openarms-headers-test-"))
  let released = false, expire!: () => void
  try {
    await assert.rejects(withSkillDownload(source, async () => {}, offline(Buffer.alloc(0), { temporaryRoot: root, deadlineMs: 10,
      armDeadline: callback => { expire = callback; return () => {} },
      http: async (_url, _destination, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => { released = true; reject(signal.reason) }, { once: true })
        queueMicrotask(expire)
      }),
    })), /deadline/)
    assert.ok(released); assert.deepEqual(await readdir(root), [])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("download: cleanup failure preserves consumer failure, HTTP compression rejected", async () => {
  await assert.rejects(withSkillDownload(source, async () => { throw Error("original failure") }, offline(Buffer.alloc(0), {
    http: async () => ({ status: 200, body: (async function* () {})(), close: async () => { throw Error("close failure") } }),
  })), (error: any) => error instanceof AggregateError && error.errors[0].message === "original failure" && error.errors[1].message === "close failure")
  await assert.rejects(withSkillDownload(source, async () => {}, offline(Buffer.alloc(0), {
    http: async () => ({ status: 200, encoding: "gzip", body: (async function* () {})(), close: async () => {} }),
  })), /identity-encoded/)
})

test("archive: malicious path/type/duplicate/checksum/truncation/trailing bytes reject", () => {
  for (const name of ["../etc/passwd", "/etc/passwd", "C:/evil", "repo/../../evil", "repo/a\\b", "//host/file", "repo/a:b", "repo/%2e%2e/a", "repo/a./x"]) assert.throws(() => extractSkillArchive(tar([{ name }])), name)
  for (const type of ["1", "2", "3", "4", "6", "7", "x", "L", "K"]) assert.throws(() => extractSkillArchive(tar([{ name: "repo/link", type }])), /unsupported/)
  assert.throws(() => extractSkillArchive(tar([{ name: "repo/a" }, { name: "repo/a" }])), /Duplicate/)
  assert.throws(() => extractSkillArchive(tar([{ name: "repo/A" }, { name: "repo/a" }])), /Duplicate/)
  assert.throws(() => extractSkillArchive(tar([{ name: "repo/a" }, { name: "repo/a/b" }])), /Conflicting/)
  assert.throws(() => extractSkillArchive(tar([{ name: "repo/A" }, { name: "repo/a/b" }])), /Conflicting/)
  const plain = gunzipSync(tar([{ name: "repo/SKILL.md", content: Buffer.from("data") }]))
  const corrupt = Buffer.from(plain); corrupt[0] ^= 1
  assert.throws(() => extractSkillArchive(gzipSync(corrupt)), /checksum/)
  assert.throws(() => extractSkillArchive(gzipSync(plain.subarray(0, 700))))
  assert.throws(() => extractSkillArchive(gzipSync(Buffer.concat([plain, Buffer.from("garbage")]))))
  assert.throws(() => extractSkillArchive(Buffer.from("PK zip")), /ZIP unsupported/)
  assert.throws(() => extractSkillArchive(gzipSync(Buffer.alloc(MAX_SKILL_BYTES + 1))))
  assert.throws(() => extractSkillArchive(tar(Array.from({ length: 2049 }, (_, i) => ({ name: `repo/file-${i}` })))), /entry count/)
})

function pax(record: string) {
  let size = Buffer.byteLength(record) + 3
  while (Buffer.byteLength(`${size} ${record}\n`) !== size) size = Buffer.byteLength(`${size} ${record}\n`)
  return Buffer.from(`${size} ${record}\n`)
}

test("archive: GitHub global PAX comment compatible; overrides, invalid UTF8/NUL rejected", () => {
  const doc = { name: "repo/SKILL.md", content: Buffer.from("opaque") }
  assert.equal(extractSkillArchive(tar([{ name: "pax_global_header", type: "g", content: pax("comment=synthetic-commit") }, doc])).document.text, "opaque")
  assert.throws(() => extractSkillArchive(tar([{ name: "pax_global_header", type: "g", content: pax("path=../evil") }, doc])), /PAX override/)
  for (const content of [Buffer.from([0xc3, 0x28]), Buffer.from("bad\0text")]) assert.throws(() => extractSkillArchive(tar([{ ...doc, content }])))
})

test("layout: document priority, explicit subpath, preserved binary assets and ambiguity", () => {
  const archive = tar([{ name: "repo/README.md", content: Buffer.from("readme") }, { name: "repo/SKILL.md", content: Buffer.from("primary") }, { name: "repo/skill.markdown", content: Buffer.from("third") }])
  assert.equal(extractSkillArchive(archive).document.text, "primary")
  const nested = tar([{ name: "repo/skills/a/SKILL.md", content: Buffer.from("a") }, { name: "repo/skills/b/README.md", content: Buffer.from("b") }, { name: "repo/skills/b/assets/x", content: Buffer.from([0, 128]) }])
  assert.throws(() => extractSkillArchive(nested), /Ambiguous/)
  const selected = extractSkillArchive(nested, { subpath: "skills/b" })
  assert.equal(selected.document.text, "b"); assert.equal(selected.assets[0].path, "assets/x")
  assert.deepEqual(selected.assets[0].bytes, Buffer.from([0, 128]))
  assert.throws(() => extractSkillArchive(nested, { subpath: "../b" }), /Unsafe/)
  assert.equal(extractSkillArchive(tar([{ name: "repo/", type: "5" }, { name: "repo/skills/a/skill.markdown", content: Buffer.from("single") }])).document.text, "single")
})
