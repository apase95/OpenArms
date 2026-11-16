import { stripVTControlCharacters } from "node:util"
import { testOutputCompactor } from "./test-output-compactor.ts"
import { buildOutputCompactor } from "./build-output-compactor.ts"
import { linterOutputCompactor } from "./linter-output-compactor.ts"
import { gitDiffOutputCompactor } from "./git-diff-output-compactor.ts"
import { compactFileInspection, isFileInspection } from "./file-inspection-compactor.ts"

export const HARD_CAP = 50000
export const bytes = (text: string) => Buffer.byteLength(text, "utf8")
export const lines = (text: string) => text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0
export type Compaction = { text: string; omittedBytes: number; omittedLines: number }
export type OutputDomain = "test" | "git-diff" | "build" | "linter" | "generic"
export interface DomainCompactor {
  domain: OutputDomain
  match: (command: string, rawText: string) => boolean
  compact: (rawText: string, options: { maxBytes: number; command?: string }) => Compaction
}

function sliceBytes(text: string, limit: number, tail = false) {
  const buffer = Buffer.from(text)
  if (buffer.length <= limit) return text
  if (tail) {
    let start = buffer.length - limit
    while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) start++
    return buffer.subarray(start).toString("utf8")
  }
  let end = limit
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) end--
  return buffer.subarray(0, end).toString("utf8")
}

export function normalizeOutput(raw: string) {
  return stripVTControlCharacters(raw.replace(/\r\n?/g, "\n")).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
}
const escapeMarkers = (text: string) => text.replaceAll("[OPENARMS:", "[TOOL-DAT:")

/** Classify executable/verb positions, never evaluate shell syntax. */
export function classifyOutput(command: string, rawText: string): OutputDomain {
  const tokens = command.match(/"[^"\n]*"|'[^'\n]*'|[^\s]+/g) ?? []
  let i = 0
  if (tokens[i] === "env") i++
  while (/^[A-Za-z_][\w]*=/.test(tokens[i] ?? "")) i++
  if (["npx", "pnpm", "yarn", "bunx"].includes(tokens[i])) i++
  const tool = (tokens[i] ?? "").split("/").at(-1), verb = tokens[i + 1]
  if (["pytest", "vitest", "jest", "mocha"].includes(tool!) || (["npm", "go", "cargo", "bun"].includes(tool!) && verb === "test") || (tool === "npm" && verb === "run" && tokens[i + 2] === "test")) return "test"
  if (tool === "git" && (["diff", "show"].includes(verb) || (verb === "log" && tokens.slice(i + 2).some(t => t === "-p" || t === "--patch")))) return "git-diff"
  if (["tsc", "webpack", "gcc", "g++"].includes(tool!) || (["vite", "cargo"].includes(tool!) && verb === "build") || (tool === "npm" && verb === "run" && tokens[i + 2] === "build")) return "build"
  if (["eslint", "flake8", "golangci-lint"].includes(tool!) || (tool === "biome" && verb === "check")) return "linter"
  const text = normalizeOutput(rawText), signatures: OutputDomain[] = []
  if (/^diff --git a\/.+ b\/.+$/m.test(text)) signatures.push("git-diff")
  if (/^(?:TAP version \d+|\s*(?:PASS|FAIL)\s+\S+\.(?:[cm]?[jt]sx?|py)(?:\s|$)|=+ test session starts =+)/m.test(text)) signatures.push("test")
  if (/^(?:.*\b(?:error TS\d+:)|error\[E\d+\]:|.+:\d+:\d+: (?:fatal )?error:)/m.test(text)) signatures.push("build")
  if (/^(?:✖ \d+ problems? \(|.+:\d+:\d+: [EFW]\d{3}\b)/m.test(text)) signatures.push("linter")
  return signatures.length === 1 ? signatures[0] : "generic"
}

export function compactOutput(raw: string, limit = 32000): Compaction {
  if (!Number.isSafeInteger(limit) || limit < 256) throw Error("Invalid compaction limit")
  const text = escapeMarkers(normalizeOutput(raw))
  if (bytes(text) <= limit) return { text, omittedBytes: 0, omittedLines: 0 }
  const budget = limit - 160
  const head = sliceBytes(text, Math.floor(budget / 2)), tail = sliceBytes(text, Math.floor(budget / 2), true)
  const omitted = text.slice(head.length, text.length - tail.length)
  const omittedBytes = bytes(omitted), omittedLines = lines(omitted)
  return { text: `${head}\n[OPENARMS: omitted ${omittedBytes} UTF8 bytes / ${omittedLines} line fragments]\n${tail}`, omittedBytes, omittedLines }
}

/** Pure parsing first; save ORIGINAL observed output before publishing any changed result.
 * Unchanged text creates no artifact. Parser/sink failures remain visible and bounded.
 * The host adapter preserves title/metadata and must not invent process exit codes.
 */
export async function governOutput(raw: string, options: {
  save: (raw: string) => Promise<string>
  command?: string
  toolName?: string
  path?: string
  compactors?: readonly DomainCompactor[]
}) {
  let result: Compaction, warning = "", domain: OutputDomain = "generic"
  try {
    const normalized = escapeMarkers(normalizeOutput(raw))
    domain = classifyOutput(options.command ?? "", normalized)
    const inspection = isFileInspection(options.toolName, options.command) ? compactFileInspection(raw, options.path) : undefined
    const parser = inspection ? undefined : (options.compactors ?? [testOutputCompactor, linterOutputCompactor, gitDiffOutputCompactor, buildOutputCompactor])
      .find(parser => parser.domain === domain && parser.match(options.command ?? "", normalized))
    const parsed = inspection ?? (parser ? parser.compact(normalized, { maxBytes: 32000, command: options.command }) : compactOutput(normalized))
    const { text, omittedBytes, omittedLines } = parsed
    if (typeof text !== "string" || !Number.isSafeInteger(omittedBytes) || omittedBytes < 0
      || !Number.isSafeInteger(omittedLines) || omittedLines < 0) throw Error("Invalid compaction")
    result = { text: parser ? escapeMarkers(normalizeOutput(text)) : text, omittedBytes, omittedLines }
  } catch {
    result = compactOutput(raw)
    warning = "[OPENARMS: GOVERNOR_FAILED]\n"
  }
  let logPath: string | undefined, logStatus = "not-needed"
  if (result.text !== raw || warning || bytes(result.text) > HARD_CAP) {
    try { logPath = await options.save(raw); logStatus = "written" }
    catch { logStatus = "failed"; warning += "[OPENARMS: LOG_WRITE_FAILED]\n" }
  }
  const reference = logPath
    ? `[OPENARMS: observed output log ${sliceBytes(escapeMarkers(normalizeOutput(logPath)).replace(/[\n\]]/g, "_"), 1024)}]\n`
    : ""
  let text = warning + reference + result.text
  const hardCapApplied = bytes(text) > HARD_CAP
  if (hardCapApplied) {
    const prefix = warning + "[OPENARMS: HARD_CAP_APPLIED]\n" + reference
    const clipped = compactOutput(result.text, HARD_CAP - bytes(prefix))
    result = { ...clipped, omittedBytes: result.omittedBytes + clipped.omittedBytes, omittedLines: result.omittedLines + clipped.omittedLines }
    text = prefix + clipped.text
  }
  return { text, rawBytes: bytes(raw), contextBytes: bytes(text), omittedBytes: result.omittedBytes,
    omittedLines: result.omittedLines, logPath, logStatus, hardCapApplied, domain }
}
