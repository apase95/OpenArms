import type { Registry, StateStore } from "./shared.ts"
import { orderedPackageNames, packageLabel, parseCommand, validateSelection } from "./shared.ts"

export function parseRawSkillsPrompt(input: string): string | undefined {
  const match = input.trim().match(/^\/skills(?:\s+(.*))?$/)
  return match ? (match[1] ?? "") : undefined
}

export async function handleSkillsPrompt(
  input: string,
  run: (args: string) => Promise<void>,
): Promise<boolean> {
  const args = parseRawSkillsPrompt(input)
  if (args === undefined) return false
  await run(args)
  return true
}

type CommandOptions = {
  args: string
  projectRoot: string
  sessionID: string
  registry: Registry
  store: StateStore
  detected: Set<string>
  confirmMismatch: (title: string, message: string) => Promise<boolean>
}

export function formatSelection(packages: Record<string, string[]>, registry?: Registry): string {
  const names = registry
    ? orderedPackageNames(registry).filter((name) => name in packages)
    : Object.keys(packages).sort()
  const entries = names.map((name) => [name, packages[name]] as const)
  if (entries.length === 0) return "No skills are enabled"
  return entries.map(([name, skills]) => {
    const core = registry?.packages[name]?.core ?? ["core"]
    const enabled = [...core, ...skills].map((skill) => `    • ${skill}`).join("\n")
    return `  ${packageLabel(name)}:\n${enabled}`
  }).join("\n\n")
}

export async function executeSkillsCommand(options: CommandOptions): Promise<string> {
  const command = parseCommand(options.args)
  if (command.action === "status") {
    return formatSelection((await options.store.getSession(options.projectRoot, options.sessionID))?.packages ?? {}, options.registry)
  }
  if (command.action === "packages") {
    const active = new Set(Object.keys((await options.store.getSession(options.projectRoot, options.sessionID))?.packages ?? {}))
    return orderedPackageNames(options.registry)
      .map((name) => {
        const states = active.has(name)
          ? ["Activated"]
          : [options.registry.packages[name].detect.always ? "Available" : options.detected.has(name) ? "Detected" : ""].filter(Boolean)
        return `• ${packageLabel(name)}${states.length ? ` (${states.join(" • ")})` : ""}`
      })
      .join("\n")
  }
  if (command.action === "inspect") {
    const session = await options.store.getSession(options.projectRoot, options.sessionID)
    const names = orderedPackageNames(options.registry).filter((name) => name in (session?.packages ?? {}))
    if (names.length === 0) return "No skills are enabled"
    const history = session?.loadHistory ?? []
    return names.flatMap((name) => {
      const definition = options.registry.packages[name]
      const skills = [...definition.core, ...(session!.packages[name] ?? [])]
      return [
        `# ${packageLabel(name)}`,
        ...skills.map((skill) => {
          const loaded = [...history].reverse().find((record) =>
            record.packageName === name && record.skills.some((loadedSkill) => loadedSkill === skill || loadedSkill.startsWith(`${skill}/`)))
          const used = session?.taskPackage === name && session.taskLoadedSkills?.some(
            (loadedSkill) => loadedSkill === skill || loadedSkill.startsWith(`${skill}/`),
          )
          const state = used
            ? "Used"
            : loaded ? "Loaded"
            : "Enabled"
          return `${skill}\t${state}`
        }),
      ]
    }).join("\n")
  }
  if (command.action === "help") {
    return [
      "• status",
      "• packages",
      "• inspect",
      "• list <package>",
      "• use <package> [skills]",
      "• add <package> <skills>",
      "• remove <package> <skills>",
      "• disable <package>",
      "• clear",
    ].join("\n")
  }
  if (command.action === "clear") {
    const session = await options.store.getSession(options.projectRoot, options.sessionID)
    if (Object.keys(session?.packages ?? {}).length === 0) return "No changes were made"
    await options.store.clearSession(options.projectRoot, options.sessionID)
    return "All skills are off for this session"
  }
  if (command.action === "list") {
    const definition = options.registry.packages[command.packageName]
    if (!definition) throw new Error(`Unknown package: ${command.packageName}`)
    const core = definition.core.map((skill) => `• ${skill}`).join("\n")
    const optional = definition.optional.map((skill) => `• ${skill}`).join("\n") || "• none"
    return `CORE:\n${core}\nOPTIONAL:\n${optional}`
  }

  if (command.action === "disable") {
    if (!options.registry.packages[command.packageName]) throw new Error(`Unknown package: ${command.packageName}`)
    const session = await options.store.getSession(options.projectRoot, options.sessionID)
    if (!session?.packages[command.packageName]) throw new Error(`The ${packageLabel(command.packageName)} package is not enabled`)
    await options.store.disablePackage(options.projectRoot, options.sessionID, command.packageName)
    return `The ${packageLabel(command.packageName)} package is off for this session`
  }
  if (command.action !== "use" && command.action !== "add" && command.action !== "remove") {
    throw new Error(`Unsupported skills command: ${command.action}`)
  }

  validateSelection(options.registry, command.packageName, command.skills)
  const definition = options.registry.packages[command.packageName]
  const session = await options.store.getSession(options.projectRoot, options.sessionID)
  let changedSkills = command.skills.filter((skill) => definition.optional.includes(skill))
  if (command.action !== "use" && !session?.packages[command.packageName]) {
    throw new Error(`The ${packageLabel(command.packageName)} package is not enabled`)
  }

  if (command.action === "use" && !definition.detect.always && !options.detected.has(command.packageName) && !session?.approvedMismatch.includes(command.packageName)) {
    const label = packageLabel(command.packageName)
    const allowed = await options.confirmMismatch(
      `${label} was not found in this project`,
      `Use the ${label} package for this session?`,
    )
    if (!allowed) return "No changes were made"
    await options.store.approveMismatch(options.projectRoot, options.sessionID, command.packageName)
  }

  if (command.action === "use") {
    const skills = command.skills.filter((skill) => !definition.core.includes(skill))
    if (session?.packages[command.packageName]) {
      const selected = new Set(session.packages[command.packageName])
      const added = skills.filter((skill) => !selected.has(skill))
      if (added.length === 0) return "No changes were made"
      changedSkills = added
      await options.store.addSkills(options.projectRoot, options.sessionID, command.packageName, added)
    } else {
      await options.store.setPackage(options.projectRoot, options.sessionID, command.packageName, skills)
    }
  }
  if (command.action === "add") {
    const selected = new Set(session!.packages[command.packageName])
    const added = command.skills.filter((skill) => !definition.core.includes(skill) && !selected.has(skill))
    if (added.length === 0) return "No changes were made"
    changedSkills = added
    await options.store.addSkills(
      options.projectRoot,
      options.sessionID,
      command.packageName,
      added,
    )
  }
  if (command.action === "remove") {
    const core = command.skills.find((skill) => definition.core.includes(skill))
    if (core) throw new Error(`${core} is a core skill and cannot be removed`)
    const selected = new Set(session!.packages[command.packageName])
    const removed = command.skills.filter((skill) => selected.has(skill))
    if (removed.length === 0) return "No changes were made"
    await options.store.removeSkills(options.projectRoot, options.sessionID, command.packageName, removed, definition)
    return `Removed from ${packageLabel(command.packageName)}:\n${removed.map((skill) => `• ${skill}`).join("\n")}`
  }
  return changedSkills.length
    ? `Enabled for ${packageLabel(command.packageName)}:\n${changedSkills.map((skill) => `• ${skill}`).join("\n")}`
    : command.action === "use"
      ? `Enabled for ${packageLabel(command.packageName)}:\n${definition.core.map((skill) => `• ${skill} (Core Skill)`).join("\n")}`
      : "No skills were changed"
}

type SessionOptions = {
  projectRoot: string
  sessionID: string
  parentID?: string
  store: StateStore
  confirmRestore: (message: string) => Promise<boolean>
}

export async function initializeSession(options: SessionOptions) {
  if (options.parentID) return options.store.inheritSession(options.projectRoot, options.parentID, options.sessionID)
  const last = await options.store.getLastSelection(options.projectRoot)
  const session = await options.store.startSession(options.projectRoot, options.sessionID)
  if (Object.keys(last).length === 0) return session
  const list = Object.entries(last).flatMap(([name, skills]) => [`- ${name}`, ...skills.map((skill) => `- ${skill}`)])
  const restore = await options.confirmRestore(["The last session used:", ...list, "", "Use these skills again?"].join("\n"))
  return restore ? options.store.restoreSession(options.projectRoot, options.sessionID) : session
}
