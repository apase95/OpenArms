#!/usr/bin/env node
// Thin entrypoint retained for repository guidance; no tiers, cache, smoke or test mapping DB.
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
process.chdir(root)
const args = process.argv.slice(2)
const mode = args[0] && !args[0].startsWith("--") ? args.shift() : "verify"
if (!["syntax", "verify", "full", "policy"].includes(mode)) throw Error(`Unsupported check: ${mode}`)
let plan = false, base, task = "unassigned"
const files = []
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === "--plan") { plan = true; continue }
  if (!["--file", "--task", "--base"].includes(arg) || !args[i + 1] || args[i + 1].startsWith("--")) throw Error(`Invalid argument: ${arg}`)
  const value = args[++i]
  if (arg === "--file") files.push(value)
  else if (arg === "--base") base = value
  else task = value
}
if (base && files.length) throw Error("Use --base or --file, not both")
if (base?.startsWith("-")) throw Error("Invalid base")
const git = (...argv) => execFileSync("git", argv, { encoding: "utf8" }).split("\0").filter(Boolean)
const scope = [...new Set(files.length ? files : [
  ...git("diff", "--name-only", "--no-renames", "-z", base ?? "HEAD", "--"),
  ...git("ls-files", "--others", "--exclude-standard", "-z"),
])].sort()

// Reviewed scope rules include removed legacy paths for the vNext migration.
// Scope is diagnostic only: the small host suite always runs in full.
function classify(file) {
  if (path.isAbsolute(file) || file.split(/[\\/]/).includes("..") || /[\x00-\x1f]/.test(file)) throw Error(`Unsafe scope: ${file}`)
  if (/^(docs\/|README\.md$|AGENTS\.md$|process\.md$)/.test(file)) return "docs"
  if (/^skills\//.test(file)) return "skill-content"
  if (/^(src|plugins|tests|scripts|sandbox|prompts|examples|\.github)\//.test(file)) return "code / automation (including removed legacy paths)"
  if (["package.json", "package-lock.json", "tsconfig.json", "registry.json", ".dockerignore", ".gitignore", ".graphifyignore", "LICENSE"].includes(file)) return "metadata / configuration"
  throw Error(`needs-review: add a reviewed scope rule before checking ${file}`)
}
for (const file of scope) classify(file)
if (plan) {
  for (const file of scope) console.log(`${classify(file)}: ${file}`)
  console.log(`Task ${task}: syntax = TypeScript + local imports + active doc links; full = all small host unit tests. No cache, selective tiers, sandbox or smoke.`)
  process.exit(0)
}
const run = argv => {
  const result = spawnSync(process.execPath, argv, { stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
function walk(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name)
    if (entry.isSymbolicLink()) return []
    return entry.isDirectory() ? walk(file) : [file]
  })
}
function syntax() {
  run(["node_modules/typescript/lib/tsc.js", "--noEmit"])
  const scripts = walk("scripts").filter(file => file.endsWith(".mjs"))
  for (const file of scripts) run(["--check", file])
  for (const file of [...scripts, ...walk("src"), ...walk("plugins"), ...walk("tests")]) {
    const source = readFileSync(file, "utf8")
    for (const match of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
      if (!existsSync(path.resolve(path.dirname(file), match[1]))) throw Error(`Missing import: ${file} → ${match[1]}`)
    }
  }
  for (const file of ["README.md", "AGENTS.md", ...walk("docs").filter(file => file.endsWith(".md"))]) {
    const text = readFileSync(file, "utf8")
    if ((text.match(/^```/gm)?.length ?? 0) % 2) throw Error(`Unbalanced fences: ${file}`)
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split("#")[0]
      if (!target || /^\w+:/.test(target)) continue
      if (!existsSync(path.resolve(path.dirname(file), target))) throw Error(`Missing doc link: ${file} → ${target}`)
    }
  }
  console.log("check: types, local imports and documentation links passed")
}
function policy() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"))
  const allowed = {
    check: "node scripts/arms-test.mjs syntax",
    test: "node scripts/arms-test.mjs verify",
    "test:plan": "node scripts/arms-test.mjs verify --plan",
    "test:policy": "node scripts/arms-test.mjs policy",
  }
  if (JSON.stringify(pkg.scripts) !== JSON.stringify(allowed)) throw Error("Review changed package automation before updating the allowed commands")
  const workflows = existsSync(".github/workflows") ? readdirSync(".github/workflows").filter(name => /\.ya?ml$/.test(name)) : []
  if (workflows.length) throw Error("Review new workflow automation explicitly; no workflows are approved in vNext yet")
  console.log("policy: package scripts use the thin runner; no raw/sandbox bypass scripts or unreviewed workflows")
}
if (mode === "policy") policy()
else {
  if (mode !== "full") syntax()
  if (mode !== "syntax") {
    const tests = readdirSync("tests").filter(file => file.endsWith(".test.ts")).sort().map(file => `tests/${file}`)
    if (!tests.length) throw Error("No host tests found")
    run(["--experimental-strip-types", "--test", ...tests])
  }
}
