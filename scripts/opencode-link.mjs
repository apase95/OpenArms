#!/usr/bin/env node
// Print-only checkout linkage: never reads or writes the user's OpenCode config.
import { access, realpath, stat } from "node:fs/promises"
import { constants } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const help = `Usage: node scripts/opencode-link.mjs [--help]
Print JSON fragments for opencode.json and tui.json using this checkout.
Merge each fragment manually; do not replace your existing configuration.
No config, credentials, skills or host database are read or modified.
Restart the host after source changes. Remove these two URLs to disconnect.
`

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(help)
    return
  }
  if (args.length) throw Error("Unsupported arguments. Use --help; this command has no install/apply mode.")
  // Resolve from the script, not cwd: output always belongs to this checkout.
  const root = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."))
  const entries = ["skill-router-server.ts", "skill-router-tui.tsx"]
  const urls = []
  for (const entry of entries) {
    const file = path.join(root, "plugins", entry)
    try {
      if (!(await stat(file)).isFile()) throw Error("Not a file")
      await access(file, constants.R_OK)
    } catch {
      throw Error(`Missing or unreadable plugin entry: plugins/${entry}`)
    }
    urls.push(pathToFileURL(file).href)
  }
  process.stdout.write(JSON.stringify({
    "opencode.json": { plugin: [urls[0]] },
    "tui.json": { plugin: [urls[1]] },
  }, null, 2) + "\n")
}

main().catch(error => {
  console.error(`OpenArms link: ${error.message}`)
  process.exitCode = 1
})
