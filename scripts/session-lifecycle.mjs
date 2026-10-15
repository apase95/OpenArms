import { readFile } from "node:fs/promises"
import { HandoffStore } from "../src/session-handoff.ts"
import { replayBudget } from "../src/budget-executor.ts"
import { UsageStore } from "../src/usage-store.ts"

/** Operator commands, not model tools. No new session or automatic rotation. */
export async function lifecycleCommand(args) {
  const [command, root, ...rest] = args
  if (!root) throw Error("INVALID_LIFECYCLE_COMMAND")
  const store = new HandoffStore(root)
  if (command === "inspect" && !rest.length) return store.inspect()
  if (command === "recover" && !rest.length) return store.recover()
  if (["claim", "acknowledge", "archive"].includes(command) && rest.length === 3) return store[command](...rest)
  if (command === "prepare" && rest.length === 2) return store.prepare(JSON.parse(await readFile(rest[0], "utf8")), rest[1] === "none" ? null : rest[1])
  if (command === "replay" && rest.length === 2) {
    const policies = JSON.parse(await readFile(rest[1], "utf8"))
    if (!Array.isArray(policies) || !policies.length) throw Error("INVALID_LIFECYCLE_COMMAND")
    const usage = new UsageStore(rest[0])
    return replayBudget((await usage.read(policies[0])).records, policies)
  }
  throw Error("INVALID_LIFECYCLE_COMMAND")
}
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  try { console.log(JSON.stringify(await lifecycleCommand(process.argv.slice(2)), null, 2)) }
  catch { console.error("LIFECYCLE_COMMAND_FAILED: inspect local state and documented recovery procedure."); process.exitCode = 1 }
}
