import { readFile } from "node:fs/promises"
import path from "node:path"
import type { Registry } from "./types.ts"
import { validateRegistry as validateV2, parseJSON } from "../scripts/registry-v2.mjs"

export const isRecord = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

export const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)

export function validateRegistry(value: unknown): asserts value is Registry {
  const invalid = () => { throw new Error("The skill registry is not valid.") }
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.packages) || !isRecord(value.skills)) return invalid()
  const owners = new Set<string>()
  const validName = (name: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)
  for (const [name, file] of Object.entries(value.skills)) {
    if (!validName(name) || typeof file !== "string" || !file || path.isAbsolute(file)
      || path.win32.isAbsolute(file) || file.split(/[\\/]/).includes("..")) return invalid()
  }
  for (const [name, definition] of Object.entries(value.packages)) {
    if (!validName(name) || !isRecord(definition) || !isStringArray(definition.core)
      || !isStringArray(definition.optional) || !isRecord(definition.detect)) return invalid()
    for (const skill of [...definition.core, ...definition.optional]) {
      if (!Object.hasOwn(value.skills, skill) || owners.has(skill)) return invalid()
      owners.add(skill)
    }
    const detect = definition.detect
    if (detect.always !== undefined && typeof detect.always !== "boolean") return invalid()
    for (const key of ["files", "extensions", "dependencies"]) {
      if (detect[key] !== undefined && !isStringArray(detect[key])) return invalid()
    }
  }
}

export async function loadRegistry(file: string): Promise<Registry> {
  const value: unknown = parseJSON(await readFile(file, "utf8"))
  return registrySelection(value)
}

// Project selection and verification must derive from the same metadata snapshot.
export function registrySelection(value: unknown): Registry {
  if (isRecord(value) && value.schemaVersion === 2) {
    validateV2(value)
    // UI selection/detection compatibility is metadata only, not a loader fallback.
    return { version: 1, packages: structuredClone(value.packages), skills: Object.fromEntries(Object.entries(value.skills).map(([id, skill]: [string, any]) => [id, skill.path])) }
  }
  validateRegistry(value)
  return value
}
