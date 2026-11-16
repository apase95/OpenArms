import { governOutput } from "./output-governor.ts"
import { outputLogStore } from "./output-logs.ts"

// Never rewrite native skill instructions or arbitrary structured/custom tool results.
const supportedTools = new Set(["bash", "read", "grep", "glob", "list"])
export function outputHooks(projectRoot: string) {
  const logs = outputLogStore(projectRoot)
  return {
    "tool.execute.after": async (
      input: { tool: string; args: unknown },
      output: { title: string; output: string; metadata: unknown },
    ) => {
      if (!supportedTools.has(input.tool) || typeof output.output !== "string") return
      const args = input.args as Record<string, unknown> | undefined
      const governed = await governOutput(output.output, {
        toolName: input.tool,
        command: input.tool === "bash" && typeof args?.command === "string" ? args.command : undefined,
        path: input.tool === "read" && typeof args?.filePath === "string" ? args.filePath : undefined,
        save: raw => logs.save(raw),
      })
      output.output = governed.text
    },
  }
}
