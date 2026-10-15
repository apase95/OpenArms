import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { createLocalRuntime } from "../src/local-library.ts"
import path from "node:path"
import { governanceHooks } from "../src/governance-hooks.ts"
import { createUsageRuntime, completedMessageUsage } from "../src/usage-runtime.ts"

export const SkillRouterServer = (async ({ worktree, directory }) => {
  const runtime = await createLocalRuntime({ worktree, directory })
  const { projectRoot, store, loadSkill, buildInstruction, stateFile } = runtime
  const usage = createUsageRuntime(path.dirname(stateFile), projectRoot)

  return {
    ...governanceHooks(path.dirname(stateFile), projectRoot),
    "chat.params": async () => { await usage.evaluate() },
    event: async ({ event }) => {
      if (event.type === "message.updated") {
        const record = completedMessageUsage(event.properties.info)
        if (record) await usage.capture(record)
        return
      }
      if (event.type !== "session.created") return
      const info = event.properties.info
      const library = await runtime.getLibrary()
      if (library.root) {
        await runtime.initializeLocalSession(info.id, library.revision, false, info.parentID)
      } else if (!library.root) await store.startSession(projectRoot, info.id)
    },
    "chat.message": async ({ sessionID }, output) => {
      // Root initialization and Home draft consumption share the revision-checked
      // transaction with the TUI; neither event ordering can publish empty first.
      if (!(await runtime.getLibrary()).root) await store.resetTaskLock(projectRoot, sessionID, output.message.id)
    },
    "experimental.chat.system.transform": async ({ sessionID }, output) => {
      if (!sessionID) return
      const instruction = await buildInstruction(sessionID)
      if (instruction) output.system.push(instruction)
    },
    tool: {
      openarms_usage: tool({
        description: "Read-only usage and budget report. Missing usage is unknown, not zero; no enforcement or raw content.",
        args: { command: tool.schema.string().describe("usage today|session [id]|project|model <id>, or budget") },
        execute: async ({ command }, context) => usage.command(command, context.sessionID),
      }),
      load_skill: tool({
        description: "Load one exact selected skill ID from the project's explicitly configured local library. No arbitrary paths, grants or fallback sources. Never acquire skill content through filesystem/web/subagents.",
        args: {
          skill: tool.schema.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).describe("Enabled skill ID, not package name"),
        },
        execute: async (args, context) => {
          try {
            if (Object.keys(args).some(key => key !== "skill")) return JSON.stringify({ ok: false, error: { code: "INVALID_REQUEST" } })
            return JSON.stringify(await loadSkill(context.sessionID, args.skill))
          }
          catch { return JSON.stringify({ ok: false, error: { code: "RUNTIME_ERROR" } }) }
        },
      }),
    },
  }
}) satisfies Plugin
