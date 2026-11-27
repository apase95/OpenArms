import type { Plugin } from "@opencode-ai/plugin"
import { outputHooks } from "../src/output-hooks.ts"
import { projectSkills, projectSkillHooks } from "../src/project-skills.ts"
import { projectFeatures, featureEnabled } from "../src/project-features.ts"

// Project skill opt-outs are deny-only; no injection, grants or host DB/config writes.
export const SkillRouterServer = (async ({ directory, worktree }) => {
  const projectRoot = worktree && worktree !== "/" ? worktree : directory
  const features = projectFeatures(projectRoot)
  return {
    ...outputHooks(projectRoot, () => featureEnabled(features, "output-compaction")),
    ...projectSkillHooks(projectSkills(projectRoot), () => featureEnabled(features, "skills-management")),
  }
}) satisfies Plugin
