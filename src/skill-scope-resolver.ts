import path from "node:path"
import { homedir } from "node:os"
import { constants } from "node:fs"
import { access, lstat, mkdir, rmdir } from "node:fs/promises"
import { parseGithubSource } from "./skill-remote-fetcher.ts"

export type InstallScope = "local" | "global"
export type ScopePlan = Readonly<{ scope: InstallScope; base: string; target: string; registry: string; overwrite: boolean }>

export function safeSkillName(name: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 80 || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(name)) throw Error("Invalid skill name: use a single non-reserved kebab-case segment")
  return name
}

export function parseInstallCommand(input: string) {
  const words = input.trim().split(/\s+/)
  if (words.shift() !== "/skills" || words.shift() !== "install") throw Error("Expected /skills install [--local|--global] [--overwrite] <url>")
  let scope: InstallScope = "local", selected = false, overwrite = false, url: string | undefined
  for (const word of words) {
    if (word === "--local" || word === "--global") {
      if (selected) throw Error("Specify scope only once")
      selected = true; scope = word === "--local" ? "local" : "global"
    } else if (word === "--overwrite") {
      if (overwrite) throw Error("Duplicate --overwrite")
      overwrite = true
    } else if (word.startsWith("--")) throw Error(`Unknown install flag: ${word}`)
    else if (url) throw Error("Expected exactly one URL")
    else url = word
  }
  if (!url || !/^https:\/\/github\.com\//.test(url)) throw Error("Expected one HTTPS GitHub URL")
  parseGithubSource(url)
  return Object.freeze({ scope, overwrite, url })
}

function absolute(value: string) {
  if (!value || !path.isAbsolute(value) || value.includes("\0") || path.resolve(value) === path.parse(value).root) throw Error("Unsafe scope root: expected absolute non-root path")
  return path.resolve(value)
}

/** Pure path resolution. Empty XDG follows the XDG fallback convention. */
export function resolveSkillScope(options: { projectRoot: string; skillName: string; scope?: InstallScope; overwrite?: boolean; env?: Record<string, string | undefined>; home?: string }): ScopePlan {
  const scope = options.scope ?? "local"
  if (scope !== "local" && scope !== "global") throw Error("Invalid install scope")
  const root = scope === "local" ? absolute(options.projectRoot) : path.join(absolute((options.env ?? process.env).XDG_CONFIG_HOME || path.join(absolute(options.home ?? homedir()), ".config")), "opencode")
  return Object.freeze({ scope, base: path.join(root, "skills"), target: path.join(root, "skills", safeSkillName(options.skillName)), registry: path.join(root, "registry.json"), overwrite: options.overwrite === true })
}

async function inspect(file: string) {
  try { return await lstat(file) } catch (e: any) { if (e.code === "ENOENT") return; throw e }
}

/** Owner-controlled filesystem only; not a writer capability or a race-proof commit.
 * Future writer must revalidate under its lock. No target/registry content is read. */
export async function prepareSkillScope(plan: ScopePlan): Promise<void> {
  if (!Object.isFrozen(plan) || path.dirname(plan.target) !== plan.base || path.dirname(plan.base) !== path.dirname(plan.registry)) throw Error("Invalid scope plan")
  safeSkillName(path.basename(plan.target))
  const created: string[] = []
  try {
    const parts = absolute(plan.base).split(path.sep).filter(Boolean)
    let current = path.parse(plan.base).root
    // Validate the complete chain before creating anything.
    for (const part of parts) {
      current = path.join(current, part)
      const info = await inspect(current)
      if (info && (!info.isDirectory() || info.isSymbolicLink() || ((info.mode & 0o022) !== 0 && !(info.mode & 0o1000)))) throw Error("Unsafe scope parent")
    }
    const registry = await inspect(plan.registry), target = await inspect(plan.target)
    if (registry && (!registry.isFile() || registry.isSymbolicLink() || registry.nlink !== 1)) throw Error("Unsafe registry target")
    if (target && (!target.isDirectory() || target.isSymbolicLink())) throw Error("Unsafe skill target")
    if (target && !plan.overwrite) throw Error("Skill already exists; explicit --overwrite approval required")
    current = path.parse(plan.base).root
    for (const part of parts) {
      current = path.join(current, part)
      if (!await inspect(current)) {
        try { await mkdir(current, { mode: 0o700 }); created.push(current) }
        catch (e: any) { if (e.code !== 'EEXIST') throw e }
      }
      const info = await lstat(current)
      if (!info.isDirectory() || info.isSymbolicLink()) throw Error("Unsafe scope parent")
    }
    await access(plan.base, constants.W_OK | constants.X_OK)
    if (registry) await access(plan.registry, constants.W_OK)
    if (target) await access(plan.target, constants.W_OK | constants.X_OK)
  } catch (error) {
    const failures: unknown[] = []
    for (const dir of created.reverse()) { try { await rmdir(dir) } catch (e) { failures.push(e) } }
    if (failures.length) throw new AggregateError([error, ...failures], "Scope preparation and rollback failed")
    throw error
  }
}
