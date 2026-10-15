import { test } from "node:test"
import assert from "node:assert/strict"
import { governOutput } from "../src/output-governor.ts"
import { buildOutputCompactor as compiler } from "../src/build-output-compactor.ts"

test("C++ template prelude and webpack messages are parsed rather than fallback", () => {
  const raw = "a.cc: In instantiation of ‘void convert(T) [with T = Widget]’:\na.cc:40:8:   required from here\na.cc:3:2: error: no matching function for call to ‘convert(Widget)’\n  3 |\tconvert(value);\n    |\t^~~~~~~\na.cc:1:1: note: candidate expects 2 arguments\n"
  assert.equal(compiler.match("g++", raw), true)
  assert.ok(compiler.compact(raw, { maxBytes: 32000 }).text.includes("required from here"))
  assert.equal(compiler.match("webpack", "ERROR in ./src/a.js 2:3\nModule not found: Error: Can't resolve 'missing'\nwebpack 5.99.0 compiled with 1 error in 45 ms\n"), true)
  assert.equal(compiler.match("tsc", "a.ts:1:1 - error TS2322: bad\nUNKNOWN FATAL RECORD\n"), false)
})

test("large realistic TS diagnostic stream retains exact first five coordinates under 1KB", async () => {
  const raw = Array.from({ length: 400 }, (_, i) => `src/module${i}.ts(${i + 1},7): error TS2322: Type 'string' is not assignable to type 'number'.\n`).join("") + "Found 400 errors in 400 files.\n"
  const result = await governOutput(raw, { command: "tsc --pretty false", save: async () => "raw.log" })
  assert.ok(Buffer.byteLength(raw) > 30000)
  assert.ok(result.contextBytes < 1000)
  for (let i = 0; i < 5; i++) assert.ok(result.text.includes(`src/module${i}.ts(${i + 1},7): error TS2322:`))
  assert.ok(result.text.includes("395 additional build errors"))
  assert.ok(!result.text.includes("module5.ts"))
  console.log(`TS fixture: ${Buffer.byteLength(raw)} raw bytes -> ${result.contextBytes} context bytes`)
})

test("bounded source context preserves multiline messages, ANSI tabs and caret alignment", () => {
  const source = Array.from({ length: 20 }, (_, i) => `${i + 1}\tconst value${i} = 0;${i === 9 ? "\n \t      ~~~~~" : ""}`).join("\n")
  const raw = `\x1b[31ma.ts:10:7 - error TS2322: incompatible\x1b[0m\n  Type 'Widget' is not assignable\n    Property 'id' is missing\n${source}\n`
  const text = compiler.compact(raw, { maxBytes: 32000 }).text
  assert.equal(compiler.match("tsc", raw), true)
  assert.ok(text.includes("  Type 'Widget' is not assignable\n    Property 'id' is missing"))
  assert.ok(text.includes("10\tconst value9 = 0;\n \t      ~~~~~"))
  assert.ok(!text.includes("1\tconst value0"))
  assert.ok(text.includes("source context omitted"))
  assert.ok(!text.includes("\x1b"))
})

test("Rust, Vite and esbuild closed formats remove only recognized noise", () => {
  for (const [command, raw, evidence] of [
    ["cargo build", "   Compiling example v0.1.0 (/tmp/example)\nerror[E0308]: mismatched types\n --> src/main.rs:3:5\n  |\n3 |\tbad()\n  |\t^^^^^ expected u32\n  = note: expected type `u32`\nerror: could not compile `example` (bin) due to 1 previous error\n", "  = note: expected type `u32`"],
    ["vite build", "vite v6.0.0 building for production...\n✓ 12 modules transformed.\n✘ Build failed in 12ms\nerror during build:\n[vite:load-fallback] Could not load missing.ts\nfile: /src/main.ts\n    at load (build.js:2:3)\n", "file: /src/main.ts"],
    ["npm run build", "✘ [ERROR] Could not resolve 'missing'\n\n    src/main.ts:1:7:\n      1 │ import 'missing'\n        ╵        ~~~~~~~~~\n", "        ╵        ~~~~~~~~~"],
  ]) {
    assert.equal(compiler.match(command, raw), true, command)
    assert.ok(compiler.compact(raw, { command, maxBytes: 32000 }).text.includes(evidence))
  }
})

test("warning-only and command flags are conservative; UTF8 budget marks huge evidence", () => {
  const warning = "a.c:1:1: warning: important\n  1 | bad();\n    | ^~~\n"
  assert.equal(compiler.match("gcc", warning), false)
  const raw = warning + "a.c:2:1: error: broken\n"
  for (const command of ["gcc -Werror", "gcc -Werror=unused", "cargo build -Dwarnings", "cargo build --deny=warnings", "RUSTFLAGS=-Dwarnings cargo build"]) {
    assert.equal(compiler.match(command, raw), false)
    assert.equal(compiler.compact(raw, { command, maxBytes: 32000 }).text, raw)
  }
  const huge = "a.ts:1:1 - error TS2322: " + "漢🙂".repeat(1000)
  const result = compiler.compact(huge, { maxBytes: 256 })
  assert.ok(Buffer.byteLength(result.text) <= 256)
  assert.ok(!result.text.includes("�"))
  assert.ok(result.text.includes("diagnostic bytes omitted"))
})

test("long C++ template diagnostics retain causal notes without counting notes as errors", () => {
  const causal = "a.cc: In instantiation of ‘void convert(T) [with T = Widget]’:\na.cc:40:8:   required from here\na.cc:3:2: error: no matching function for call to ‘convert(Widget)’\n  3 |\tconvert(value);\n    |\t^~~~~~~\na.cc:1:1: note: candidate template ignored: substitution failure\n  deduced conflicting types for parameter T:\n    std::vector<Widget> versus std::vector<int>\n"
  const warning = "a.cc:1:1: warning: unused variable [-Wunused-variable]\n  1 | int unused;\n    |     ^~~~~~\n"
  const raw = warning.repeat(400) + causal + "1 error generated.\n"
  assert.equal(compiler.match("clang++", raw), true)
  const result = compiler.compact(raw, { maxBytes: 32000 })
  assert.ok(Buffer.byteLength(raw) > 30000)
  assert.ok(Buffer.byteLength(result.text) < 1000)
  assert.ok(result.text.includes(causal.trimEnd()))
  assert.ok(!result.text.includes("unused variable"))
})

test("build routing removes known warning blocks and retains aligned TypeScript evidence", async () => {
  const diagnostic = "src/main.ts:4:2 - error TS2322: Type 'string' is not assignable to type 'number'.\n\n4\tconst n: number = 'bad'\n \t      ~\n"
  const raw = "lib.c:1:1: warning: unused variable [-Wunused-variable]\n  1 | int unused;\n    |     ^~~~~~\n".repeat(400) + diagnostic
  const result = await governOutput(raw, { command: "tsc --pretty", save: async text => { assert.equal(text, raw); return ".openarms/logs/build.log" } })
  assert.equal(result.domain, "build")
  assert.ok(Buffer.byteLength(raw) > 30000)
  assert.ok(result.contextBytes < 1000)
  assert.ok(result.text.includes(diagnostic.trimEnd()))
  assert.ok(!result.text.includes("unused variable"))
})

test("unknown serious build records and warnings-as-errors are retained", async () => {
  for (const command of ["gcc -Werror", "cargo build --deny warnings", "cargo build -D warnings"]) {
    const raw = "src/a.c:1:1: warning: important warning\n    | ^\nUNKNOWN FATAL DIAGNOSTIC\n"
    const result = await governOutput(raw, { command, save: async () => "raw.log" })
    assert.ok(result.text.includes(raw.trimEnd()))
  }
})

test("standard compiler families, first five errors and ANSI preserve diagnostic structure", async () => {
  for (const [command, raw, evidence] of [
    ["tsc", "src/a.ts(2,3): error TS2322: incompatible\n", "TS2322"],
    ["gcc", "src/a.c:2:3: error: invalid conversion\n  2 |\tbad();\n    |\t^~~\nsrc/a.c:1:1: note: instantiated here\n", "instantiated here"],
    ["cargo build", "error[E0308]: mismatched types\n --> src/main.rs:2:3\n  |\n2 | bad()\n  | ^^^^^ expected u32\n", "expected u32"],
    ["webpack", "ERROR in ./src/a.js 2:3\nModule not found: Error: Can't resolve 'missing'\n", "Can't resolve"],
    ["npm run build", "✘ [ERROR] Could not resolve missing\n\n    src/a.ts:2:3:\n      2 │ missing()\n        ╵ ~~~~~~~\n", "~~~~~~~"],
  ]) {
    const result = await governOutput(`\x1b[31m${raw}\x1b[0m`, { command, save: async () => "raw.log" })
    assert.ok(result.text.includes(evidence))
    assert.ok(!result.text.includes("\x1b"))
  }
  const raw = Array.from({ length: 8 }, (_, i) => `a.ts:${i + 1}:1 - error TS2322: issue-${i}\n`).join("")
  const result = await governOutput(raw, { command: "tsc", save: async () => "raw.log" })
  assert.ok(result.text.includes("issue-4"))
  assert.ok(!result.text.includes("issue-5"))
  assert.ok(result.text.includes("3 additional build errors"))
})
