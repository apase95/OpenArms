import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { homedir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildRouterInstruction, createPackageLoader } from "./server-core.ts"
import { loadRegistry, resolveProjectRoot, StateStore } from "./shared.ts"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const stateFile = path.join(homedir(), ".local", "state", "openarms", "state.json")
const homeSession = "__skill_router_home__"

export const SkillRouterServer = (async ({ worktree, directory }) => {
  const projectRoot = resolveProjectRoot(worktree, directory)
  const registry = await loadRegistry(path.join(root, "registry.json"))
  const store = await StateStore.open(stateFile)
  await store.reconcileRegistry(projectRoot, registry)
  const loadPackage = createPackageLoader({ registry, store, libraryRoot: root, projectRoot })

  return {
    event: async ({ event }) => {
      if (event.type !== "session.created") return
      const info = event.properties.info
      if (await store.migrateLegacySession(projectRoot, info.id)) return
      if (info.parentID) await store.inheritSession(projectRoot, info.parentID, info.id)
      else if (await store.getSession(projectRoot, homeSession)) await store.inheritSession(projectRoot, homeSession, info.id)
      else await store.startSession(projectRoot, info.id)
    },
    "chat.message": async ({ sessionID }) => {
      await store.migrateLegacySession(projectRoot, sessionID)
      await store.resetTaskLock(projectRoot, sessionID)
    },
    "experimental.chat.system.transform": async ({ sessionID }, output) => {
      if (!sessionID) return
      await store.migrateLegacySession(projectRoot, sessionID)
      const instruction = buildRouterInstruction(await store.getSession(projectRoot, sessionID))
      if (instruction) output.system.push(instruction)
    },
    tool: {
      load_skill_package: tool({
        description: "The only authorized way to access skills. Load one enabled package and all selected skills for the current task. Use the package name shown to the left of the skill in the OpenArms system instruction; for example, load package 'docs' when the user asks for its selected 'archify' skill. Never search the filesystem, config, PATH, or web for skills.",
        args: {
          package: tool.schema.string().describe("Enabled package name from OpenArms, not an optional skill name"),
          workflow: tool.schema.string().optional().describe("Optional Superpower workflow name"),
        },
        execute: async (args, context) => loadPackage({
          sessionID: context.sessionID,
          packageName: args.package,
          workflow: args.workflow,
        }),
      }),
    },
  }
}) satisfies Plugin
