import { createHash } from "node:crypto"
import { constants, openSync, readSync, closeSync, fstatSync, lstatSync, readFileSync, readdirSync, readlinkSync, existsSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import YAML from "yaml"
import picomatch from "picomatch"
import { root } from "./test-policy.mjs"
import { contextBytes, syntheticDigest } from './synthetic-context.mjs'

export const smokePolicy = JSON.parse(readFileSync(new URL("./smoke-policy.json", import.meta.url), "utf8"))
export const canonical = (value) => JSON.stringify(sortValue(value))
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]))
  return value
}
export function composeConfig(directory = root) {
  return YAML.parse(readFileSync(path.join(directory, "sandbox/compose.yaml"), "utf8"), { merge: true, maxAliasCount: 100 })
}
export function settings(directory = root, environment = process.env) {
  const dotenv = {}
  const envFile = path.join(directory, "sandbox/.env")
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$/)
      if (!match || ![...smokePolicy.environment, "ROUTER_LIBRARY"].includes(match[1])) continue
      let value = match[2]
      if (/^["']/.test(value)) { if (value.at(-1) !== value[0]) throw new Error(`Invalid quoted ${match[1]}`); value = value.slice(1, -1) }
      else value = value.replace(/\s+#.*$/, "").trim()
      if (value.includes("${")) throw new Error(`Interpolation in ${match[1]} needs-review; supply a literal value`)
      dotenv[match[1]] = value
    }
  }
  const compose = composeConfig(directory)
  const defaults = { NODE_VERSION: compose.services.cli.build.args.NODE_VERSION, OPENCODE_VERSION: compose.services.cli.build.args.OPENCODE_VERSION, SANDBOX_FIXTURE: compose.services.cli.environment.SANDBOX_FIXTURE, TERM: compose.services.cli.environment.TERM }
  const values = {}
  for (const [key, expression] of Object.entries(defaults)) {
    const match = expression.match(/^\$\{([A-Z_]+):-([^}]+)\}$/)
    if (!match || match[1] !== key) throw new Error(`Unsupported Compose setting: ${key}`)
    values[key] = environment[key] || dotenv[key] || match[2]
  }
  for (const key of ["NODE_VERSION", "OPENCODE_VERSION"]) if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(values[key])) throw new Error(`Invalid pinned ${key}`)
  if (!["docs-project", "empty-project"].includes(values.SANDBOX_FIXTURE)) throw new Error("Unknown sandbox fixture")
  if (!/^[a-zA-Z0-9_.+-]{1,80}$/.test(values.TERM)) throw new Error("Invalid TERM")
  const installed = YAML.parse(readFileSync(path.join(directory, "sandbox/compose.installed.yaml"), "utf8"))
  const fallback = installed.services.cli.volumes[0].source.match(/^\$\{ROUTER_LIBRARY:-([^}]+)\}\/registry\.json$/)?.[1]
  if (!fallback) throw new Error("Unsupported installed library mount")
  return { values, libraryRoot: path.resolve(directory, environment.ROUTER_LIBRARY || dotenv.ROUTER_LIBRARY || fallback) }
}
export function dockerIgnore(source) {
  const rules = source.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => {
    const include = line.startsWith("!")
    const pattern = (include ? line.slice(1) : line).replace(/^\//, "").replace(/\/$/, "")
    if (!pattern || pattern.includes("\\") || pattern.includes("..")) throw new Error("Unsupported .dockerignore rule: needs-review")
    return { include, match: picomatch(pattern, { dot: true, noext: true }) }
  })
  return (file) => {
    const parts = file.split("/")
    const candidates = parts.map((_, index) => parts.slice(0, index + 1).join("/"))
    let allowed = true
    for (const rule of rules) if (candidates.some((candidate) => rule.match(candidate))) allowed = rule.include
    return allowed
  }
}
export function copySources(directory = root) {
  const dockerfile = readFileSync(path.join(directory, "sandbox/Dockerfile"), "utf8")
  const sources = []
  for (const line of dockerfile.split("\n")) {
    if (!/^COPY\s/i.test(line)) continue
    if (/--from=|\[|\$|\\/.test(line)) throw new Error("Unsupported COPY form: needs-review build input mapping")
    const tokens = line.trim().split(/\s+/).slice(1, -1)
    for (const token of tokens) {
      const file = token.replace(/\/$/, "").replace(/^\.\//, "")
      if (file.startsWith("/") || file.split("/").includes("..") || /[*?]/.test(file)) throw new Error("Unsupported COPY source: needs-review")
      sources.push(file)
    }
  }
  if (!sources.length) throw new Error("No COPY sources mapped")
  return [...new Set(sources)].sort()
}
// Fingerprints consume bytes only; no source or environment content is persisted.
// Entries are length-framed and sorted; timestamps/workspace path are excluded.
export function digestTree(directory, files, metadata, allowed = () => true, { beforeVisit = () => true, rejectSymlinks = false } = {}) {
  const entries = new Map()
  function visit(file, ancestry = new Set()) {
    const absolute = path.resolve(directory, file)
    const relative = path.relative(directory, absolute).replaceAll("\\", "/")
    if (relative.startsWith("../") || path.isAbsolute(relative)) throw new Error("Fingerprint path escapes input root")
    if (!beforeVisit(relative)) return
    if (rejectSymlinks) {
      const parts = relative.split("/")
      for (let index = 1; index < parts.length; index++) {
        const parent = parts.slice(0, index).join("/")
        try {
          if (lstatSync(path.join(directory, parent)).isSymbolicLink()) throw new Error(`Non-smoke input symlink: ${parent}`)
        } catch (error) { if (error.code !== "ENOENT") throw error; break }
      }
    }
    let stat
    try { stat = lstatSync(absolute) } catch (error) { if (error.code !== "ENOENT") throw error; entries.set(relative, ["missing", 0]); return }
    if (stat.isDirectory()) {
      if (["node_modules", ".git", ".openarms"].includes(path.basename(relative)) && !allowed(relative)) return
      if (allowed(relative)) entries.set(relative, ["directory", 0])
      for (const child of readdirSync(absolute).sort()) visit(path.posix.join(relative, child), ancestry)
    } else if (allowed(relative)) {
      if (stat.isSymbolicLink()) {
        if (rejectSymlinks) throw new Error(`Non-smoke input symlink: ${relative}`)
        const target = path.resolve(path.dirname(absolute), readlinkSync(absolute))
        const normalized = path.relative(directory, target).replaceAll("\\", "/")
        if (normalized.startsWith("../") || path.isAbsolute(normalized) || ancestry.has(normalized)) throw new Error("Unsafe/cyclic input symlink")
        entries.set(relative, ["symlink", Buffer.byteLength(normalized), normalized])
        visit(normalized, new Set([...ancestry, relative]))
      } else if (stat.isFile()) entries.set(relative, [`file:${stat.mode & 0o111}`, stat.size])
      else throw new Error("Unsupported fingerprint file type")
    }
  }
  for (const file of [...new Set(files)].sort()) visit(file)
  const hash = createHash("sha256").update(canonical(metadata))
  const buffer = Buffer.allocUnsafe(65536)
  for (const [file, [type, length, target]] of [...entries].sort(([a], [b]) => a.localeCompare(b, "en"))) {
    hash.update(canonical([file, type, length]))
    if (type === "symlink") hash.update(target)
    else if (type.startsWith("file:")) {
      const fd = openSync(path.join(directory, file), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      try {
        const stat = fstatSync(fd)
        if (!stat.isFile() || stat.size !== length || `file:${stat.mode & 0o111}` !== type) throw new Error(`INPUT_CHANGED_DURING_FINGERPRINT: ${file}`)
        let size = 0, count
        while ((count = readSync(fd, buffer, 0, buffer.length, null)) > 0) { hash.update(buffer.subarray(0, count)); size += count }
        if (size !== length) throw new Error(`INPUT_CHANGED_DURING_FINGERPRINT: ${file}`)
      } finally { closeSync(fd) }
    }
  }
  return hash.digest("hex")
}
// Non-smoke validates authored isolated fixtures, not live-library integrity.
// Do not include sandbox trees: installed/local copies may contain live skills.
// Smoke/build retain their existing input roots and symlink/hash behavior.
export const nonSmokeInputs = [...new Set([
  "src", "plugins", "tests", "scripts", "registry.json", "package.json", "package-lock.json", ".dockerignore",
  // Exact authored inputs consumed by registry-v2 tests; never traverse docs/.github broadly.
  "docs/testing/registry-v2-valid.json", "docs/testing/registry-v2-invalid.json", ".github/workflows/registry-integrity.yml",
  ...smokePolicy.commonInputs.filter((file) => file.startsWith("sandbox/")),
  ...Object.values(smokePolicy.modes).flatMap((scope) => scope.inputs.filter((file) => file.startsWith("sandbox/"))),
])].sort()
export const nonSmokeInputAllowed = (file) => !file.split("/").some((part) => ["skills", "SKILL.md", "node_modules", ".git", ".openarms"].includes(part))
  && !/\.env($|\.)/.test(file) && !file.startsWith("sandbox/local/")
export function nonSmokeFingerprint(mode, command, { directory = root } = {}) {
  return digestTree(directory, nonSmokeInputs,
    { mode, command: [path.basename(command[0]), ...command.slice(1)], node: process.version },
    () => true, { beforeVisit: nonSmokeInputAllowed, rejectSymlinks: true })
}
export function importGraph(directory, roots) {
  const seen = new Set()
  function visit(file) {
    if (seen.has(file)) return
    seen.add(file)
    const source = readFileSync(path.join(directory, file), "utf8")
    for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
      if (!imported.fileName.startsWith(".")) continue
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), imported.fileName))
      if (resolved.startsWith("../")) throw new Error("Import input escapes repository")
      const target = [resolved, ...[".ts", ".tsx", ".mjs", ".js", "/index.ts"].map((suffix) => resolved + suffix)].find((name) => existsSync(path.join(directory, name)))
      if (!target) throw new Error(`Missing smoke import: ${resolved}`)
      visit(target)
    }
  }
  roots.forEach(visit)
  return [...seen].sort()
}
export function smokeFingerprint(mode, { directory = root, installed = false, synthetic = false, configuration = settings(directory), versions = { node: process.version } } = {}) {
  if (synthetic && installed) throw Error('Synthetic and installed are incompatible')
  if (synthetic && mode !== 'smoke-static') return syntheticFingerprint(directory, { mode, configuration: configuration.values, versions })
  const scope = smokePolicy.modes[mode]
  if (!scope) throw new Error(`Unknown fingerprint mode: ${mode}`)
  const inputs = [...smokePolicy.commonInputs, ...scope.inputs, ...importGraph(directory, scope.roots), `sandbox/fixtures/${configuration.values.SANDBOX_FIXTURE}`]
  // Static validates path presence, not adapter implementation bytes.
  const presence = mode === "smoke-static" ? [...copySources(directory), "plugins/skill-router-server.ts", "plugins/skill-router-tui.tsx"].map((file) => [file, existsSync(path.join(directory, file))]) : []
  if (installed) inputs.push("sandbox/compose.installed.yaml")
  let library
  if (scope.library) {
    const libraryRoot = installed ? configuration.libraryRoot : directory
    if (!existsSync(path.join(libraryRoot, "registry.json")) || !existsSync(path.join(libraryRoot, "skills"))) throw new Error("LIBRARY_INPUT_MISSING: registry.json/skills must exist for smoke")
    library = digestTree(libraryRoot, ["registry.json", "skills"], { libraryMode: installed ? "installed" : "repository" })
  }
  const environment = Object.fromEntries(Object.entries(configuration.values).filter(([key]) => mode !== "smoke-runtime" || key !== "TERM"))
  // Classification/report fields do not change an explicitly selected smoke run.
  // Preserve all other fields, including future execution settings, by default.
  const { files, patterns, classes, unknown, bypassOwners, version, cache, ...executionPolicy } = JSON.parse(readFileSync(path.join(directory, "scripts/test-policy.json"), "utf8"))
  return digestTree(directory, inputs, { mode, runnerVersion: smokePolicy.runnerVersion, policyVersion: smokePolicy.version, executionPolicy, environment, versions, libraryMode: installed ? "installed" : "repository", library, presence })
}
export function buildFingerprint({ directory = root, installed = false, synthetic = false, configuration = settings(directory) } = {}) {
  if (synthetic && installed) throw Error('Synthetic and installed are incompatible')
  if (synthetic) return syntheticFingerprint(directory, { mode: 'build', configuration: configuration.values })
  const sources = copySources(directory)
  const allowed = dockerIgnore(readFileSync(path.join(directory, ".dockerignore"), "utf8"))
  return digestTree(directory, [...sources, ".dockerignore", "sandbox/Dockerfile", "sandbox/compose.yaml", ...(installed ? ["sandbox/compose.installed.yaml"] : [])], {
    mode: "build", runnerVersion: smokePolicy.runnerVersion, libraryMode: installed ? "installed" : "repository",
    buildArgs: { NODE_VERSION: configuration.values.NODE_VERSION, OPENCODE_VERSION: configuration.values.OPENCODE_VERSION },
  }, (file) => [".dockerignore", "sandbox/Dockerfile", "sandbox/compose.yaml", "sandbox/compose.installed.yaml"].includes(file) || allowed(file))
}
function syntheticFingerprint(directory, metadata) {
  const entries = contextBytes(directory)
  const hostInputs = importGraph(directory, ['scripts/arms-test.mjs', 'scripts/synthetic-context.mjs'])
  for (const file of [...hostInputs, 'scripts/test-policy.json', 'scripts/test-map.json', 'scripts/smoke-policy.json']) {
    // Exact normal infrastructure inputs; reject symlinks before reading.
    const digest = digestTree(directory, [file], {}, () => true, { rejectSymlinks: true })
    entries.set(`host:${file}`, Buffer.from(digest))
  }
  return syntheticDigest(entries, { libraryMode: 'synthetic', fixtureVersion: 1, ...metadata })
}
