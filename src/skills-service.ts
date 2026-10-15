import type { Registry } from "./types.ts"
import type { StateStore } from "./state-store.ts"
import { orderedPackageNames, packageLabel, parseCommand, validateSelection } from "./commands.ts"
import type { createLocalRuntime } from "./local-library.ts"

export async function executeLocalSkillsCommand(runtime: Awaited<ReturnType<typeof createLocalRuntime>>, sessionID: string, args: string, expectedRevision?: string) {
  const command = parseCommand(args)
  if (command.action === "help") return "status · packages · inspect · list <package> · use/add/remove <package> [IDs] · disable <package> · clear"
  const config = await runtime.getLibrary()
  let current: Awaited<ReturnType<typeof runtime.refreshLibrary>>
  try { current = await runtime.refreshLibrary() }
  catch {
    if (command.action === "status") return `Library: ${config.root ?? "Not configured"}${config.root ? "\nLibrary unavailable; edit the library path." : ""}`
    throw new Error(config.root ? "INVALID_LIBRARY" : "NOT_CONFIGURED")
  }
  if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new Error("LIBRARY_CHANGED")
  const session = await runtime.store.getSession(runtime.projectRoot, sessionID)
  if (["status", "inspect", "list"].includes(command.action)) {
    const names = command.action === "list" ? [command.packageName] : orderedPackageNames(current.registry).filter(name => Object.hasOwn(session?.packages ?? {}, name))
    const rows: string[] = []
    for (const name of names) {
      const definition = Object.hasOwn(current.registry.packages, name) ? current.registry.packages[name] : undefined
      if (!definition) throw new Error("UNKNOWN_ID")
      rows.push(`# ${packageLabel(name)}`)
      for (const id of [...definition.core, ...(command.action === "list" ? definition.optional : session!.packages[name])]) rows.push(`${id}\t${(await runtime.getSkillStatus(sessionID, id)).state}`)
    }
    const library = `Library: ${current.root}`
    return rows.length ? [...rows, "", library].join("\n") : `${library}\nNo skills selected`
  }
  if (command.action === "packages") return orderedPackageNames(current.registry).map(name => `• ${packageLabel(name)}`).join("\n") || "No packages in this library"
  if (!["use", "add", "remove", "disable", "clear"].includes(command.action)) throw new Error("Unsupported skills command")
  await runtime.mutateSelection(sessionID, command.action as "use" | "add" | "remove" | "disable" | "clear", "packageName" in command ? command.packageName : "", "skills" in command ? command.skills : [], current.revision)
  return "Selection updated"
}

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
  verifiedStatus?: (skill: string) => Promise<{ state: string; reason: string }>
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
  if (options.verifiedStatus && ["status", "inspect", "list"].includes(command.action)) {
    const session = await options.store.getSession(options.projectRoot, options.sessionID)
    const names = command.action === "list" ? [command.packageName] : orderedPackageNames(options.registry).filter(name => name in (session?.packages ?? {}))
    const rows: string[] = []
    for (const name of names) {
      const definition = Object.hasOwn(options.registry.packages, name) ? options.registry.packages[name] : undefined
      if (!definition) throw new Error(`Unknown package: ${name}`)
      rows.push(`# ${packageLabel(name)} (package)`)
      const skills = command.action === "list" ? [...definition.core, ...definition.optional] : [...definition.core, ...(session?.packages[name] ?? [])]
      for (const skill of skills) {
        const status = await options.verifiedStatus(skill)
        rows.push(`${skill}\t${status.state} (${status.reason})`)
      }
    }
    return rows.join("\n") || "No skills are enabled"
  }
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
    const history = session?.verified?.records.map(record => ({
      packageName: Object.keys(options.registry.packages).find(name => [...options.registry.packages[name].core, ...options.registry.packages[name].optional].includes(record.skill)),
      skills: [record.skill],
    })) ?? session?.loadHistory ?? []
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
             : "Selected"
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
    const definition = Object.hasOwn(options.registry.packages, command.packageName) ? options.registry.packages[command.packageName] : undefined
    if (!definition) throw new Error(`Unknown package: ${command.packageName}`)
    const core = definition.core.map((skill) => `• ${skill}`).join("\n")
    const optional = definition.optional.map((skill) => `• ${skill}`).join("\n") || "• none"
    return `CORE:\n${core}\nOPTIONAL:\n${optional}`
  }

  if (command.action === "disable") {
    if (!Object.hasOwn(options.registry.packages, command.packageName)) throw new Error(`Unknown package: ${command.packageName}`)
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
}

export async function initializeSession(options: SessionOptions) {
  if (options.parentID) return options.store.startChildSession(options.projectRoot, options.sessionID)
  return options.store.initializeRootSelection(options.projectRoot, options.sessionID)
}
