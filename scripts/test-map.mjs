import { readFileSync, readdirSync, statSync, lstatSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const mapRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
export const testMap = JSON.parse(readFileSync(new URL("./test-map.json", import.meta.url), "utf8"))
export function mapPath(value) {
  if (typeof value !== "string") throw new Error("path must be a string")
  const file = value.replaceAll("\\", "/")
  if (!file || path.posix.isAbsolute(file) || /^[A-Za-z]:/.test(file) || file.split("/").some((part) => !part || part === "." || part === "..") || /[\x00-\x1f\x7f]/.test(file)) throw new Error(`unsafe path ${value}`)
  return file
}
function exactPath(file, directory) {
  let current = directory
  for (const part of file.split("/")) {
    if (!readdirSync(current).includes(part)) throw new Error(`missing or incorrect casing: ${file}`)
    current = path.join(current, part)
    if (lstatSync(current).isSymbolicLink()) throw new Error(`symlink path: ${file}; remove the symlink and use a real repository path`)
  }
  return current
}
function exactFile(file, directory) {
  const current = exactPath(file, directory)
  if (!statSync(current).isFile()) throw new Error(`not a file: ${file}`)
}
export function validateMap(manifest = testMap, directory = mapRoot, { drift = true } = {}) {
  const errors = [], seen = new Set()
  const fail = (message) => errors.push(`${message}; fix scripts/test-map.json with an exact source and existing tests entry`)
  if (manifest.version !== 1 || !Array.isArray(manifest.entries) || !Array.isArray(manifest.sourceDirectories)) return ["Invalid test-map schema: require version=1, entries[], sourceDirectories[]"]
  for (const entry of manifest.entries) {
    try {
      const source = mapPath(entry.source)
      if (seen.has(source)) fail(`duplicate source: ${source}`)
      seen.add(source)
      exactFile(source, directory)
      if (!Array.isArray(entry.tests) || !entry.tests.length || (entry.full !== undefined && typeof entry.full !== "boolean")) throw new Error(`invalid mapping: ${source}`)
      const tests = new Set()
      for (const value of entry.tests) {
        const test = mapPath(value)
        if (!/^tests\/.*\.test\.(ts|mjs)$/.test(test)) throw new Error(`test outside tests directory: ${test}`)
        if (tests.has(test)) fail(`duplicate test: ${source} -> ${test}`)
        tests.add(test); exactFile(test, directory)
      }
    } catch (error) { fail(error.message) }
  }
  if (drift) {
    const walk = (folder) => {
      for (const entry of readdirSync(exactPath(folder, directory), { withFileTypes: true })) {
        const file = `${folder}/${entry.name}`
        if (entry.isSymbolicLink()) { fail(`symlink path: ${file}; remove the symlink and use a real repository path`); continue }
        if (/^(?:generated|build|dist|vendor|node_modules)$/.test(entry.name) || /\.d\.ts$/.test(file)) continue
        if (entry.isDirectory()) walk(file)
        else if (entry.isFile() && /\.(?:ts|tsx|mjs)$/.test(file) && !seen.has(file)) {
          try { exactFile(basenameTest(file), directory) } catch { fail(`missing mapping: ${file}`) }
        }
      }
    }
    for (const folder of manifest.sourceDirectories) {
      try { walk(mapPath(folder)) } catch (error) { fail(error.message) }
    }
  }
  return errors.sort()
}
function basenameTest(file) {
  const extension = file.endsWith(".mjs") ? "mjs" : "ts"
  return `tests/${path.posix.basename(file).replace(/\.(ts|tsx|mjs)$/, "")}.test.${extension}`
}
export function resolveTests(files, manifest = testMap, directory = mapRoot) {
  const errors = validateMap(manifest, directory)
  if (errors.length) throw new Error(errors.join("\n"))
  const tests = new Set(); let full = false
  for (const value of files) {
    const file = mapPath(value)
    if (/^(docs\/.*\.md|README\.md|AGENTS\.md)$/.test(file)) continue
    exactFile(file, directory)
    if (/^tests\/.*\.test\.(ts|mjs)$/.test(file)) { tests.add(file); continue }
    const entry = manifest.entries.find((entry) => mapPath(entry.source) === file)
    if (entry) { entry.tests.forEach((test) => tests.add(mapPath(test))); full ||= Boolean(entry.full) }
    else { const test = basenameTest(file); exactFile(test, directory); tests.add(test) }
  }
  return { tests: [...tests].sort(), full }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = validateMap()
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 2 }
  else console.log("test-map: valid; no source drift")
}
