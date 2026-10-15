import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { testMap, resolveTests, validateMap } from "./test-map.mjs"

export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
export const policy = JSON.parse(readFileSync(new URL("./test-policy.json", import.meta.url), "utf8"))
export const modes = ["syntax", "related", "full", "smoke-static", "smoke-runtime", "tui-smoke", "verify"]
export function parseArgs(args) {
  const options = { mode: "verify", files: [], explicitFiles: false, plan: false, installed: false, task: "unassigned" }
  let modeSeen = false
  const seenOptions = new Set()
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (modes.includes(arg) || ["smoke", "baseline", "report"].includes(arg)) {
      if (modeSeen) throw new Error("Specify exactly one mode")
      options.mode = arg === "smoke" ? "smoke-runtime" : arg
      modeSeen = true
    } else if (["--file", "--base", "--task", "--command", "--reason"].includes(arg)) {
      const value = args[++i]
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`)
      if (arg === "--file") { options.files.push(value); options.explicitFiles = true }
      else {
        const key = arg.slice(2)
        if (seenOptions.has(key)) throw new Error(`Duplicate ${arg}`)
        seenOptions.add(key)
        if (key === "task" && !/^[a-zA-Z0-9_.-]{1,80}$/.test(value)) throw new Error("--task requires a non-sensitive identifier")
        if (key === "reason" && (!value.trim() || value.length > 160 || /[\x00-\x1f\x7f]/.test(value))) throw new Error("--reason requires 1–160 printable characters")
        options[key] = value
      }
    } else if (["--plan", "--installed", "--synthetic", "--force", "--rebuild", "--pre-push"].includes(arg)) {
      const key = arg.slice(2)
      if (options[key]) throw new Error(`Duplicate ${arg}`)
      options[key] = true
    } else throw new Error(`Unknown argument: ${arg}`)
  }
  if (options.base && options.explicitFiles) throw new Error("--base and --file are mutually exclusive")
  if (options.synthetic && options.installed) throw new Error('--synthetic and --installed are incompatible')
  if (options.synthetic && !['verify', 'smoke-runtime', 'tui-smoke'].includes(options.mode)) throw new Error('--synthetic requires verify or a runtime smoke mode')
  if (options["pre-push"] && options.mode !== "verify") throw new Error("--pre-push requires verify")
  if (options.base?.startsWith("-")) throw new Error("Invalid --base revision")
  if (options.command && options.mode !== "baseline") throw new Error("--command is only for baseline")
  if (options.mode === "baseline" && !["npm-test", "sandbox-test", "sandbox-smoke", "tui-smoke"].includes(options.command)) throw new Error("baseline requires --command npm-test|sandbox-test|sandbox-smoke|tui-smoke")
  if (options.installed && !["verify", "smoke-static", "smoke-runtime", "tui-smoke", "baseline"].includes(options.mode)) throw new Error("--installed requires a smoke mode")
  if (options.installed && options.mode === "baseline" && !["sandbox-smoke", "tui-smoke"].includes(options.command)) throw new Error("--installed requires a smoke command")
  if (options.force && ["baseline", "report"].includes(options.mode)) throw new Error("--force requires a test mode")
  if (options.reason && !options.force) throw new Error("--reason requires --force")
  if (options.rebuild && !["verify", "smoke-runtime", "tui-smoke"].includes(options.mode)) throw new Error("--rebuild requires verify or a runtime smoke mode")
  if (options.rebuild && options.mode === "smoke-static") throw new Error("Static smoke has no image to rebuild")
  if (options.mode === "report" && (options.plan || options.installed || options.base || options.explicitFiles)) throw new Error("report takes no execution options")
  return options
}
export function normalizeFile(file, directory = root) {
  const normalized = file.replaceAll("\\", "/")
  const relative = path.posix.isAbsolute(normalized) ? path.relative(directory, normalized).replaceAll("\\", "/") : path.posix.normalize(normalized)
  if (!relative || relative === "." || relative === ".." || relative.startsWith("../") || /^[A-Za-z]:/.test(relative) || /[\x00-\x1f\x7f]/.test(relative)) throw new Error(`Unsafe changed path: ${file}`)
  return relative
}
export function git(args, directory = root) {
  return execFileSync("git", args, { cwd: directory, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
}
export function changedFiles(options, directory = root) {
  let files = options.files
  if (!options.explicitFiles) {
    // HEAD includes staged + unstaged; --no-renames includes both ends of renames.
    files = git(["diff", "--name-only", "--no-renames", "-z", options.base ?? "HEAD", "--"], directory).split("\0")
      .concat(git(["ls-files", "--others", "--exclude-standard", "-z"], directory).split("\0"))
  }
  return [...new Set(files.filter(Boolean).map((file) => normalizeFile(file, directory)))].sort()
}
export function classify(file) {
  const kind = policy.files[file] ?? policy.patterns.find((rule) => new RegExp(rule.pattern).test(file))?.class
  if (kind === "test") return { file, kind, tests: [file], full: false, smoke: [], reason: "TEST_CHANGED" }
  const mapping = testMap.entries.find((entry) => entry.source === file)
  if (mapping && kind) return { file, kind, ...policy.classes[kind], tests: [...new Set(mapping.tests)].sort(), full: Boolean(mapping.full) }
  if (!kind && /^(src|plugins|scripts)\//.test(file) && existsSync(path.join(root, file))) {
    const resolved = resolveTests([file])
    return { file, kind: "test-infra", tests: resolved.tests, full: resolved.full, smoke: [], reason: "BASENAME_TEST" }
  }
  return kind ? { file, kind, ...policy.classes[kind] } : { file, kind: "needs-review", tests: [], full: false, smoke: [], reason: "UNMAPPED_FILE" }
}
export function allTests(directory = root) {
  return readdirSync(path.join(directory, "tests")).filter((file) => /\.test\.(ts|mjs)$/.test(file)).sort().map((file) => `tests/${file}`)
}
export function createPlan(files, options) {
  // Mapping is an authority for selective execution, not a prerequisite for
  // explicit full or integration modes (which may run in a partial fixture).
  const mappingErrors = ["verify", "related"].includes(options.mode) ? validateMap() : []
  if (mappingErrors.length) throw new Error(mappingErrors.join("\n"))
  const classifications = [...new Set(files)].sort().map(classify)
  const unknown = classifications.some((entry) => entry.kind === "needs-review")
  const code = classifications.some((entry) => !["docs", "metadata", "content"].includes(entry.kind))
  const related = [...new Set(classifications.flatMap((entry) => entry.tests))].sort()
  const full = options["pre-push"] || classifications.some((entry) => entry.full)
  const smoke = new Set(classifications.flatMap((entry) => entry.smoke))
  if (smoke.size) smoke.add("smoke-static")
  const override = options.mode !== "verify"
  const decisions = modes.filter((mode) => mode !== "verify").map((mode) => {
    let status = "skipped", reason = "NOT_AFFECTED"
    if (override) {
      if (options.mode === mode) { status = "required"; reason = "EXPLICIT_OVERRIDE" }
      else reason = "EXPLICIT_MODE_SCOPE"
    } else if (unknown) { status = "blocked"; reason = "NEEDS_REVIEW" }
    else if (mode === "syntax" && code) { status = "recommended"; reason = "FAST_FEEDBACK" }
    else if (mode === "related" && related.length && !full) { status = "required"; reason = "RELATED_TESTS" }
    else if (mode === "related" && full) reason = "COVERED_BY_FULL"
    else if (mode === "full" && full) { status = "required"; reason = options["pre-push"] ? "PRE_PUSH_VALIDATION" : "SHARED_OR_INFRASTRUCTURE" }
    else if (smoke.has(mode)) { status = "required"; reason = "INTEGRATION_BOUNDARY" }
    if (mode === "related" && options.mode === "related" && unknown) { status = "blocked"; reason = "NEEDS_REVIEW" }
    if (mode === "related" && options.mode === "related" && !unknown && !related.length) { status = "skipped"; reason = "NO_RELATED_TESTS" }
    if (override && ["smoke-runtime", "tui-smoke"].includes(options.mode) && mode === "smoke-static") { status = "required"; reason = "STATIC_PREREQUISITE" }
    const dependency = ["smoke-runtime", "tui-smoke"].includes(mode) ? "smoke-static; fingerprinted image; Docker" + (mode === "tui-smoke" ? "; Python3/PTY" : "") : mode === "syntax" ? "Node/TypeScript parser" : "Node"
    const cache = ["smoke-static", "smoke-runtime", "tui-smoke"].includes(mode) ? options.force || options.rebuild ? "bypassed-explicitly" : "pass-only-sha256" : "disabled"
    return { mode, tier: mode === "syntax" ? "T0" : mode === "related" ? "T1" : mode === "full" ? "T2" : "T3", status, reason, dependency, cache }
  })
  return { version: policy.version, files: classifications, related, decisions, override, installed: options.installed, force: Boolean(options.force), rebuild: Boolean(options.rebuild) }
}
export function formatPlan(plan) {
  const rows = [["Scope", "Status/class", "Reason", "Dependency", "Cache"],
    ...plan.files.map((entry) => [entry.file, entry.kind, entry.reason, entry.tests.join(", ") || "—", "—"]),
    ...plan.decisions.map((entry) => [`${entry.tier}/${entry.mode}`, entry.status, entry.reason, entry.dependency, entry.cache])]
  const widths = rows[0].map((_, index) => Math.max(...rows.map((row) => row[index].length)))
  return rows.map((row) => row.map((cell, index) => cell.padEnd(widths[index])).join(" | ").trimEnd()).join("\n")
}
export function syntaxInputs(files, directory = root) {
  return files.filter((file) => existsSync(path.join(directory, file)) && /\.(ts|tsx|mjs|json)$/.test(file) && !file.startsWith("skills/"))
}
