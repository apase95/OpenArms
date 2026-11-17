import { randomUUID } from "node:crypto"
import { lstat, mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import type { Hooks } from "@opencode-ai/plugin"

const validName = (name: unknown): name is string => typeof name === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(name)
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT"
const protectedConfig = path.resolve(process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"), "opencode")

export interface ProjectSkills {
  read(): Promise<string[]>
  set(name: string, enabled: boolean): Promise<string[]>
}

/** Local owner-controlled workspace only. No global config, host DB or grants. */
export function projectSkills(projectRoot: string): ProjectSkills {
  const root = path.resolve(projectRoot)
  const folder = path.join(root, ".openarms")
  const file = path.join(folder, "skills.json")
  const checkRoot = async () => {
    const canonical = await realpath(root)
    const config = await realpath(protectedConfig).catch(() => protectedConfig)
    if (!path.isAbsolute(projectRoot) || canonical === path.parse(canonical).root || canonical === homedir()
      || canonical === config || canonical.startsWith(config + path.sep)) {
      throw Error("Open a project workspace before changing skill preferences")
    }
  }
  const checkFolder = async () => {
    const info = await lstat(folder)
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) throw Error("Unsafe preference directory")
  }
  const read = async () => {
    // Missing preferences mean ON; malformed/inaccessible preferences never mean ON.
    try { await checkFolder() } catch (error) { if (missing(error)) return []; throw error }
    let info
    try { info = await lstat(file) } catch (error) { if (missing(error)) return []; throw error }
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) || info.size > 65536) throw Error("Unsafe preferences")
    const data: unknown = JSON.parse(await readFile(file, "utf8"))
    if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1
      || !("disabled" in data) || !Array.isArray(data.disabled) || !data.disabled.every(validName)
      || data.disabled.length > 256 || new Set(data.disabled).size !== data.disabled.length) throw Error("Invalid preferences")
    return [...data.disabled].sort()
  }
  return {
    read,
    async set(name, enabled) {
      await checkRoot()
      if (!validName(name)) throw Error("Skill name is not safe for an exact native permission rule")
      await mkdir(folder, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error })
      await checkFolder()
      // Do not overwrite another client. A leftover lock requires manual review, not auto-deletion.
      const lock = path.join(folder, ".skills.lock")
      const handle = await open(lock, "wx", 0o600)
      const temp = path.join(folder, `.skills-${randomUUID()}.tmp`)
      try {
        const disabled = new Set(await read())
        if (enabled) disabled.delete(name)
        else disabled.add(name)
        if (disabled.size > 256) throw Error("Too many disabled skills")
        const next = [...disabled].sort()
        const output = await open(temp, "wx", 0o600)
        try { await output.writeFile(JSON.stringify({ version: 1, disabled: next }, null, 2) + "\n"); await output.sync() }
        finally { await output.close() }
        await rename(temp, file)
        return next
      } finally {
        await unlink(temp).catch(() => {})
        await handle.close()
        await unlink(lock)
      }
    },
  }
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
const action = (value: unknown) => value === "allow" || value === "ask" || value === "deny"

// The pinned plugin's config callback still uses legacy SDK types without native
// skill permissions. Validate this narrow v1.19.3 runtime boundary explicitly.
function denySkills(permission: unknown, disabled: string[]): Record<string, unknown> {
  if (permission !== undefined && !action(permission) && !record(permission)) throw Error("Unsupported host permissions")
  const base: Record<string, unknown> = typeof permission === "string" ? { "*": permission } : { ...permission as Record<string, unknown> }
  const original = base.skill
  if (original !== undefined && !action(original) && !record(original)) throw Error("Unsupported skill permissions")
  const rules = typeof original === "string" ? { "*": original } : original as Record<string, unknown> | undefined ?? {}
  return { ...base, skill: Object.fromEntries([
    ...Object.entries(rules).filter(([name]) => !disabled.includes(name)),
    ...disabled.map(name => [name, "deny"]),
  ]) }
}

/** Delegate permission evaluation to the host; never turn an existing deny into allow. */
export function applySkillDenies(config: { permission?: unknown; agent?: unknown }, disabled: string[]) {
  if (!disabled.length) return
  if (!disabled.every(validName)) throw Error("Unsafe disabled skill name")
  const permission = denySkills(config.permission, disabled)
  if (config.agent !== undefined && !record(config.agent)) throw Error("Unsupported host agents")
  const agents = config.agent === undefined ? undefined : Object.fromEntries(Object.entries(config.agent).map(([name, agent]) => {
    if (!record(agent)) throw Error("Unsupported host agent")
    return [name, { ...agent, permission: denySkills(agent.permission, disabled) }]
  }))
  // Never mutate nested objects potentially shared with another project's config.
  config.permission = permission
  if (agents) config.agent = agents
}

export function projectSkillHooks(store: ProjectSkills): Pick<Hooks, "config" | "tool.execute.before"> {
  return {
    config: async config => {
      try { applySkillDenies(config, await store.read()) }
      catch { throw Error("[OPENARMS: SKILL_POLICY_UNAVAILABLE] Cannot initialize native project skill denies; check preferences and host compatibility.") }
    },
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "skill") return
      let disabled: string[]
      try { disabled = await store.read() }
      catch { throw Error("[OPENARMS: SKILL_POLICY_UNAVAILABLE] Cannot verify project skill preferences; native skill execution stopped.") }
      if (disabled.includes(output.args?.name)) {
        // Config/agent permissions can be cached and sessions may have saved approvals.
        // This deny-only guard also covers those cases without changing native results.
        throw Error("[OPENARMS: SKILL_OFF] This skill is OFF for this project. Enable it in /arms-skills before requesting it.")
      }
    },
  }
}
