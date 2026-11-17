import type { Hooks } from "@opencode-ai/plugin"
import { projectSwitches, type ProjectSwitches } from "./project-switches.ts"

const validName = (name: unknown): name is string => typeof name === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(name)
export type ProjectSkills = ProjectSwitches

export function projectSkills(projectRoot: string): ProjectSkills {
  return projectSwitches(projectRoot, "skills", validName)
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

export function projectSkillHooks(store: ProjectSkills, enabled: () => Promise<boolean> = async () => true): Pick<Hooks, "config" | "tool.execute.before"> {
  return {
    config: async config => {
      try { if (await enabled()) applySkillDenies(config, await store.read()) }
      catch { throw Error("[OPENARMS: SKILL_POLICY_UNAVAILABLE] Cannot initialize native project skill denies; check preferences and host compatibility.") }
    },
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "skill") return
      let disabled: string[]
      try {
        if (!await enabled()) return
        disabled = await store.read()
      }
      catch { throw Error("[OPENARMS: SKILL_POLICY_UNAVAILABLE] Cannot verify project skill preferences; native skill execution stopped.") }
      if (disabled.includes(output.args?.name)) {
        // Config/agent permissions can be cached and sessions may have saved approvals.
        // This deny-only guard also covers those cases without changing native results.
        throw Error("[OPENARMS: SKILL_OFF] This skill is OFF for this project. Enable it in /arms-skills before requesting it.")
      }
    },
  }
}
