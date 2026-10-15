import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import type { Registry } from "./types.ts"

export function resolveProjectRoot(worktree: string | undefined, directory: string): string {
  return worktree && worktree !== "/" ? worktree : directory
}

const SKIP = new Set(["node_modules", "dist", "build", "coverage", ".git", ".cache", ".next"])

export async function detectPackages(root: string, registry: Registry): Promise<Set<string>> {
  const found = new Set<string>()
  const remaining = new Set(Object.entries(registry.packages)
    .filter(([, definition]) => !definition.detect.always && (
      definition.detect.files?.length || definition.detect.extensions?.length || definition.detect.dependencies?.length
    ))
    .map(([name]) => name))

  async function visit(dir: string): Promise<void> {
    if (remaining.size === 0) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (remaining.size === 0) return
      if (entry.isSymbolicLink()) continue
      const target = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue
        await visit(target)
        continue
      }
      if (!entry.isFile()) continue
      for (const name of [...remaining]) {
        const definition = registry.packages[name]
        if (definition.detect.files?.includes(entry.name) || definition.detect.extensions?.includes(path.extname(entry.name))) {
          found.add(name)
          remaining.delete(name)
        }
      }
      if (entry.name !== "package.json") continue
      let manifest: any
      try {
        manifest = JSON.parse(await readFile(target, "utf8"))
      } catch {
        continue
      }
      for (const name of [...remaining]) {
        if (registry.packages[name].detect.dependencies?.some((dependency) =>
          manifest?.dependencies?.[dependency] || manifest?.devDependencies?.[dependency])) {
          found.add(name)
          remaining.delete(name)
        }
      }
    }
  }
  await visit(root)
  return found
}
