import type { Registry, SkillsCommand } from "./types.ts"

const PACKAGE_ORDER = ["docs", "go", "nestjs", "nextjs", "python-ai", "ai-research", "shared-skills"]
const PACKAGE_LABELS: Record<string, string> = {
  docs: "Docs", go: "Go", nestjs: "NestJS", nextjs: "NextJS",
  "python-ai": "Python-AI", "ai-research": "AI-Research", "shared-skills": "Shared-Skills",
}

export function packageLabel(name: string): string {
  return Object.hasOwn(PACKAGE_LABELS, name) ? PACKAGE_LABELS[name] : name
}

export function orderedPackageNames(registry: Registry): string[] {
  const rank = new Map(PACKAGE_ORDER.map((name, index) => [name, index]))
  return Object.keys(registry.packages).sort((left, right) =>
    (rank.get(left) ?? PACKAGE_ORDER.length) - (rank.get(right) ?? PACKAGE_ORDER.length)
      || left.localeCompare(right))
}

export function parseCommand(input: string): SkillsCommand {
  const [action = "", packageName, ...rest] = input.trim().split(/\s+/)
  if (["status", "packages", "inspect", "help", "clear"].includes(action)) {
    if (packageName) throw new Error(`${action} does not accept arguments`)
    return { action: action as "status" | "packages" | "inspect" | "help" | "clear" }
  }
  if (action === "list" || action === "disable") {
    if (!packageName) throw new Error("Package name is required")
    if (rest.length) throw new Error(`${action} accepts only a package name`)
    return { action, packageName }
  }
  if (action !== "use" && action !== "add" && action !== "remove") {
    throw new Error(`Unknown skills command: ${action || "empty"}`)
  }
  if (!packageName) throw new Error("Package name is required")
  const skills = [...new Set(rest.join(" ").split(/[\s,]+/).filter(Boolean))]
  if (action !== "use" && !skills.length) throw new Error("Skill name is required")
  return { action, packageName, skills }
}

export function validateSelection(registry: Registry, packageName: string, skills: string[]): void {
  const definition = Object.hasOwn(registry.packages, packageName) ? registry.packages[packageName] : undefined
  if (!definition) throw new Error(`Unknown package: ${packageName}`)
  const known = new Set([...definition.core, ...definition.optional])
  for (const skill of skills) {
    if (!known.has(skill)) throw new Error(`Unknown skill for ${packageName}: ${skill}`)
  }
}
