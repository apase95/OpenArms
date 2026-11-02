import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { createLocalRuntime } from "../src/local-library.ts"
import path from "node:path"
import { governanceHooks } from "../src/governance-hooks.ts"
import { createUsageRuntime, completedMessageUsage } from "../src/usage-runtime.ts"
import { HandoffStore } from '../src/session-handoff.ts'

export const SkillRouterServer = (async ({ worktree, directory }) => {
  const runtime = await createLocalRuntime({ worktree, directory })
   const { projectRoot, store, buildInstruction, stateFile } = runtime
  const usage = createUsageRuntime(path.dirname(stateFile), projectRoot)

  return {
    ...governanceHooks(path.dirname(stateFile), projectRoot),
    "chat.params": async ({ sessionID, model }) => { await usage.setContextModel(sessionID, model); await usage.evaluate() },
    event: async ({ event }) => {
      if (event.type === "message.updated") {
        const record = completedMessageUsage(event.properties.info)
        if (record) await usage.capture(record)
        return
      }
      if (event.type !== "session.created") return
      const info = event.properties.info
       const library = await runtime.refreshLibrary()
       await runtime.initializeLocalSession(info.id, library.revision, false, info.parentID)
    },
    "experimental.chat.system.transform": async ({ sessionID }, output) => {
      if (!sessionID) return
      const handoffs = new HandoffStore(projectRoot)
      const before = await handoffs.inspect().catch(() => null)
      const injection = await runtime.buildInjection(sessionID)
      output.system.push(injection.instruction)
      // Evidence comes from safe automatic assembly, never model text or a
      // successful toggle. Preserve handoff binding and failed-read behavior.
      if (before?.targetSession === sessionID && before.rotation) {
        for (const skill of injection.skills) await handoffs.activated({ handoffID: before.id, contentHash: before.hash, target: sessionID, revision: injection.revision, skill, ok: true }).catch(() => {})
      }
    },
    tool: {
      openarms_usage: tool({
        description: "Read-only usage and budget report. Missing usage is unknown, not zero; no enforcement or raw content.",
        args: { command: tool.schema.string().describe("usage today|session [id]|project|model <id>, or budget") },
        execute: async ({ command }, context) => usage.command(command, context.sessionID),
      }),
    },
  }
}) satisfies Plugin
