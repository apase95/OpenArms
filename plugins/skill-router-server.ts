import type { Plugin } from "@opencode-ai/plugin"
import { outputHooks } from "../src/output-hooks.ts"
import { projectSkills, projectSkillHooks } from "../src/project-skills.ts"

// Project skill opt-outs are deny-only; no injection, grants or host DB/config writes.
export const SkillRouterServer = (async ({ directory, worktree }) => {
  const projectRoot = worktree && worktree !== "/" ? worktree : directory
  return { ...outputHooks(projectRoot), ...projectSkillHooks(projectSkills(projectRoot)) }
}) satisfies Plugin
