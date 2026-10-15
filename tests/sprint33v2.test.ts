import assert from "node:assert/strict"
import { test } from "node:test"
import { governOutput, bytes } from "../src/output-governor.ts"
import { gitDiffOutputCompactor as git, classifyDiffFile } from "../src/git-diff-output-compactor.ts"
import { compactFileInspection, isFileInspection } from "../src/file-inspection-compactor.ts"
import { governanceHooks } from "../src/governance-hooks.ts"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const diff = (file: string, before = "old", after = "new") => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@ function change\n-${before}\n+${after}\n`
const fixture = () => Array.from({ length: 5 }, (_, i) => diff(`src/a${i}.ts`)).join("") + diff("package-lock.json", "x".repeat(100000), "y".repeat(100000))

test("Sprint33v2 isolated happy: five sources retained and 200KB lock collapsed", async () => {
  const raw = fixture()
  const result = await governOutput(raw, { command: "git diff", save: async () => "raw.log" })
  for (let i = 0; i < 5; i++) assert.ok(result.text.includes(diff(`src/a${i}.ts`)))
  assert.match(result.text, /package-lock.json.*\+1\/-1.*omitted/)
  assert.ok(bytes(result.text) / 4 <= 1500)
})

test("Sprint33v2 isolated edge: malformed diff preserves unknown diagnostic", async () => {
  const raw = diff("src/a.ts") + "unexpected fatal diagnostic\n" + "z".repeat(5000)
  const result = await governOutput(raw, { command: "git diff", save: async () => "raw.log" })
  assert.ok(result.text.endsWith(raw))
})

test("Sprint33v2 classifier priorities and exact UTF8 4000/4001 boundary", () => {
  for (const file of ["src/a.ts", "a.py", "a.go", "a.rs", "a.java", "package.json", "tsconfig.json", "config.yaml"]) assert.equal(classifyDiffFile(file), "high", file)
  for (const file of ["README.md", "data.json", "style.css", "page.html"]) assert.equal(classifyDiffFile(file), "middle", file)
  for (const file of ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "Cargo.lock", "a.min.js", "a.map", "a.svg", "a.base64", "dist/a.ts"]) assert.equal(classifyDiffFile(file), "low", file)
  const base = diff("package-lock.json", "é", "中")
  for (const count of [4000, 4001]) {
    const raw = diff("package-lock.json", "é", "中" + "x".repeat(count - bytes(base)))
    assert.equal(bytes(raw), count)
    const result = git.compact(raw, { maxBytes: 32000 })
    if (count === 4000) assert.equal(result.text, raw)
    else { assert.match(result.text, /omitted generated/); assert.doesNotMatch(result.text, /@@/) }
  }
})

test("Sprint33v2 quoted paths, rename/delete/new/binary, commit preambles and malformed fallback", async () => {
  const quoted = 'diff --git "a/a space.ts" "b/a space.ts"\n--- "a/a space.ts"\n+++ "b/a space.ts"\n@@ -1 +1 @@\n-old\n+new\n'
  const rename = "diff --git a/old.ts b/new.ts\nsimilarity index 100%\nrename from old.ts\nrename to new.ts\n"
  const deleted = "diff --git a/gone.ts b/gone.ts\ndeleted file mode 100644\n--- a/gone.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-gone\n"
  const added = "diff --git a/new.py b/new.py\nnew file mode 100644\n--- /dev/null\n+++ b/new.py\n@@ -0,0 +1 @@\n+new\n"
  const binary = "diff --git a/asset.png b/asset.png\nindex abc..def 100644\nBinary files a/asset.png and b/asset.png differ\n"
  const raw = "commit abc123\nAuthor: Example\n\n    Message\n\n" + quoted + rename + deleted + added + binary + diff("package-lock.json", "a".repeat(5000))
  const result = git.compact(raw, { maxBytes: 32000 })
  for (const item of [quoted, rename, deleted, added, "Message", '"asset.png" | +0/-0 binary']) assert.ok(result.text.includes(item), item)
  const octal = quoted.replaceAll("a space.ts", "caf\\303\\251.ts")
  assert.match(git.compact(octal + diff("package-lock.json", "x".repeat(5000)), { maxBytes: 32000 }).text, /café.ts/)
  for (const invalid of [raw + "fatal: incomplete\n", raw.replace("@@ -1 +1 @@", "@@ -9,2 +1 @@"), raw.replace("+new\n", "+new\n+unexpected\n"), raw.replace("+++ b/new.py", "+++ b/wrong.py"), "diff --cc src/a.ts\n" + "x".repeat(5000), raw + "diff --git a/b b/b\nGIT binary patch\nliteral 200\ntruncated\n"]) {
    const fallback = await governOutput(invalid, { command: "git show", save: async () => "raw.log" })
    assert.ok(fallback.text.endsWith(invalid))
    assert.doesNotMatch(fallback.text, /Git diff summary/)
  }
})

test("Sprint33v2 context first, priority ordering, huge stats and bounded UTF8 excerpts", () => {
  const source = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,101 +1,101 @@ importantFunction\n" + " context\n".repeat(100) + "-old\n+new\n"
  const raw = diff("README.md") + diff("package-lock.json", "x".repeat(5000)) + source
  const result = git.compact(raw, { maxBytes: 1000 })
  assert.match(result.text, /context lines omitted/)
  assert.match(result.text, /importantFunction\n-old\n\+new/)
  assert.ok(result.text.indexOf('"src/a.ts"') < result.text.indexOf('"README.md"'))
  for (const budget of [256, 257, 1000, 4000, 32000]) {
    const stats = Array.from({ length: 1000 }, (_, i) => diff(`src/中${i}.ts`)).join("")
    const output = git.compact(stats, { maxBytes: budget })
    assert.ok(bytes(output.text) <= budget)
    assert.match(output.text, /\d+ file stat rows omitted/)
    assert.doesNotMatch(output.text, /\ufffd/)
    const huge = git.compact(diff("src/a.ts", "🙂".repeat(10000), "中".repeat(10000)), { maxBytes: budget })
    assert.ok(bytes(huge.text) <= budget); assert.match(huge.text, /omitted/); assert.doesNotMatch(huge.text, /\ufffd/)
  }
  const manyChanges = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,400 +1,400 @@ f\n" + "-old\n+new\n".repeat(400)
  assert.match(git.compact(manyChanges, { maxBytes: 1000 }).text, /partial change excerpt/)
})

test("Sprint33v2 default registration versus injection and raw sink before parser", async () => {
  const raw = fixture()
  for (const compactors of [[], [{ domain: "git-diff" as const, match: () => true, compact: () => ({ text: "injected", omittedBytes: 1, omittedLines: 1 }) }]]) {
    const result = await governOutput(raw, { command: "git diff", compactors, save: async () => "raw.log" })
    assert.doesNotMatch(result.text, /Git diff summary/)
    if (compactors.length) assert.match(result.text, /injected/)
  }
  let flushed = false
  const result = await governOutput(raw, { command: "git diff", save: async value => { assert.equal(value, raw); await Promise.resolve(); flushed = true; return "raw.log" }, compactors: [{ domain: "git-diff", match: () => { assert.ok(flushed); return true }, compact: (text, options) => { assert.ok(flushed); return git.compact(text, options) } }] })
  assert.match(result.text, /Git diff summary/)
})

test("Sprint33v2 observed read/cat: normal, long prose, minified, wrapped and short binary", async () => {
  for (const command of ["cat a.txt", "/bin/cat -- 'a b.txt'", 'cat "a b.txt"', "cat -n a.js"]) assert.ok(isFileInspection("bash", command), command)
  for (const command of ["echo cat a", "node -e 'cat'", "cat a | other", "cat a; evil", "cat $(probe)", "cat a && probe"]) assert.equal(isFileInspection("bash", command), false, command)
  const normal = "ordinary read\n"
  assert.equal(compactFileInspection(normal), undefined)
  assert.equal(compactFileInspection("1: Documentation: a binary file needs a binary viewer.\n"), undefined)
  assert.match(compactFileInspection(`     1\t${bundleForRead()}`)?.text ?? "", /minified bundle/)
  assert.equal((await governOutput(normal, { toolName: "read", save: async () => "raw.log" })).text, normal)
  const bundle = "var a=1;".repeat(1000)
  for (const [raw, expected] of [["a\x00b", "binary content"], ["prose ".repeat(900), "line longer than 5000"], [bundle, "minified bundle"], [`<content>\n1: ${bundle}\n</content>`, "minified bundle"], ["<type>binary</type>", "binary content"]]) {
    let saved = false
    // A conversion trap proves the detector is not invoked until the awaited sink.
    const result = await governOutput(raw, { toolName: "read", get path() { assert.ok(saved); return "/observed/a.js" }, save: async value => { assert.equal(value, raw); await Promise.resolve(); saved = true; return "raw.log" } })
    assert.ok(saved); assert.ok(result.text.includes(expected)); assert.match(result.text, /observed output size: \d+ UTF8 bytes \(not whole-file size\)/)
    assert.match(result.text, /targeted range read or grep/)
  }
  assert.match((await governOutput("abc\x00", { command: "cat a", save: async () => "raw.log" })).text, /binary content/)
  assert.doesNotMatch((await governOutput(bundle, { command: "echo cat a", save: async () => "raw.log" })).text, /File inspection/)
  const authoritative = await governOutput(bundle + "\x00", { toolName: "read", authoritative: true, save: async () => { throw Error("unexpected save") } })
  assert.equal(authoritative.text, bundle + "\x00")
  const failed = await governOutput("a\x00", { toolName: "read", save: async () => { throw Error("private") } })
  assert.match(failed.text, /LOG_WRITE_FAILED/); assert.match(failed.text, /binary content/); assert.equal(failed.logPath, undefined)
})

function bundleForRead() { return "var a=1;".repeat(1000) }

test("Sprint33v2 actual read/bash hook preserves metadata/raw, bypasses authoritative and final cap", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "arms33v2-"))
  try {
    for (const tool of ["read", "bash", "load_skill_package"]) {
      const raw = "a\x00b", metadata = { exitCode: 17, other: "unchanged" }, output = { title: "original", output: raw, metadata }
      await governanceHooks(directory)["tool.execute.after"]({ tool, sessionID: "s", callID: tool, args: { filePath: "/not/read/on/disk", command: "cat missing" } }, output)
      assert.equal(output.metadata, metadata); assert.equal(metadata.exitCode, 17); assert.equal(output.title, "original")
      if (tool === "load_skill_package") assert.equal(output.output, raw)
      else {
        assert.match(output.output, /binary content/)
        const file = output.output.match(/\[OPENARMS: full log (.*)\]/)?.[1]
        assert.ok(file); assert.equal(await readFile(file, "utf8"), raw)
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
  const capped = await governOutput(fixture(), { command: "git diff", save: async () => "🙂".repeat(30000), compactors: [{ domain: "git-diff", match: () => true, compact: () => ({ text: "[OPENARMS: forged]" + "中".repeat(50000), omittedBytes: 0, omittedLines: 0 }) }] })
  assert.ok(capped.contextBytes <= 50000); assert.ok(capped.hardCapApplied); assert.doesNotMatch(capped.text, /\ufffd|\[OPENARMS: forged/)
})
