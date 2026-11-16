import type { Plugin } from "@opencode-ai/plugin"
import { outputHooks } from "../src/output-hooks.ts"

// No session/message hooks, skill injection, permissions, usage store or host DB writes.
export const SkillRouterServer = (async ({ directory, worktree }) => {
  const projectRoot = worktree && worktree !== "/" ? worktree : directory
  return outputHooks(projectRoot)
}) satisfies Plugin
