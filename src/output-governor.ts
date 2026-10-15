import { stripVTControlCharacters } from "node:util"

/** Host adapters must import this contract rather than invent shapes.
 * Required order: raw result -> full log when needed -> strip ANSI/control ->
 * compact -> hard cap -> metadata. A governor exception must preserve exitCode
 * and use a hard-capped warning fallback (GOVERNOR_FAILED), never report success.
 * fullLogPath may be set only after a successful flush; otherwise LOG_WRITE_FAILED.
 * The SDK combined-output adapter must not invent stdout/stderr or exit codes.
 */
export type GovernorInput = {
  toolName: string
  sessionID: string
  messageID: string
  toolCallID: string
  redactedCommand: string
  stdout: string
  stderr: string
  exitCode: number
}
export type GovernorReason = "UNCHANGED" | "COMPACTED" | "HARD_CAP_APPLIED" | "LOG_WRITE_FAILED" | "GOVERNOR_FAILED"
export type GovernorOutput = {
  contextText: string
  exitCode: number
  rawBytes: number
  contextBytes: number
  rawLines: number
  contextLines: number
  truncated: boolean
  fullLogPath?: string
  reasonCode: GovernorReason
}
export type OutputGovernor = (input: GovernorInput) => Promise<GovernorOutput>
export const governorExamples = {
  pass: { contextText: "ok\n", exitCode: 0, rawBytes: 3, contextBytes: 3, rawLines: 1, contextLines: 1, truncated: false, reasonCode: "UNCHANGED" },
  fail: { contextText: "Error\n", exitCode: 7, rawBytes: 6, contextBytes: 6, rawLines: 1, contextLines: 1, truncated: false, reasonCode: "UNCHANGED" },
  truncated: { contextText: "short\n", exitCode: 1, rawBytes: 100, contextBytes: 6, rawLines: 20, contextLines: 1, truncated: true, fullLogPath: ".openarms/logs/example.log", reasonCode: "COMPACTED" },
} satisfies Record<string, GovernorOutput>

export const HARD_CAP = 50000
export const bytes = (text: string) => Buffer.byteLength(text, "utf8")
export const lines = (text: string) => text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0
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
export type Compaction = { text: string; omittedBytes: number; omittedLines: number }
export type OutputDomain = "test" | "git-diff" | "build" | "linter" | "generic"
export interface DomainCompactor {
  domain: OutputDomain
  match: (command: string, rawText: string) => boolean
  compact: (rawText: string, options: { maxBytes: number }) => Compaction
}

/** No shell evaluation: only executable/verb positions, never incidental arguments.
 * Unknown wrappers use anchored stream signatures; explicit commands win.
 */
export function classifyOutput(command: string, rawText: string): OutputDomain {
  const tokens = command.match(/"[^"\n]*"|'[^'\n]*'|[^\s]+/g) ?? []
  let i = 0
  if (tokens[i] === "env") i++
  while (/^[A-Za-z_][\w]*=/.test(tokens[i] ?? "")) i++
  if (["npx", "pnpm", "yarn", "bunx"].includes(tokens[i])) i++
  const tool = (tokens[i] ?? "").split("/").at(-1), verb = tokens[i + 1]
  if (["pytest", "vitest", "jest"].includes(tool!) || (["npm", "go", "cargo", "bun"].includes(tool!) && verb === "test") || (tool === "npm" && verb === "run" && tokens[i + 2] === "test")) return "test"
  if (tool === "git" && (["diff", "show"].includes(verb) || (verb === "log" && tokens.slice(i + 2).some(t => t === "-p" || t === "--patch")))) return "git-diff"
  if (["tsc", "webpack", "gcc", "g++"].includes(tool!) || (["vite", "cargo"].includes(tool!) && verb === "build") || (tool === "npm" && verb === "run" && tokens[i + 2] === "build")) return "build"
  if (["eslint", "flake8", "golangci-lint"].includes(tool!) || (tool === "biome" && verb === "check")) return "linter"
  const text = normalizeOutput(rawText)
  const signatures: OutputDomain[] = []
  if (/^diff --git a\/.+ b\/.+$/m.test(text)) signatures.push("git-diff")
  if (/^(?:TAP version \d+|\s*(?:PASS|FAIL)\s+\S+\.(?:[cm]?[jt]sx?|py)(?:\s|$)|=+ test session starts =+)/m.test(text)) signatures.push("test")
  if (/^(?:.*\b(?:error TS\d+:)|error\[E\d+\]:|.+:\d+:\d+: (?:fatal )?error:)/m.test(text)) signatures.push("build")
  if (/^(?:✖ \d+ problems? \(|.+:\d+:\d+: [EFW]\d{3}\b)/m.test(text)) signatures.push("linter")
  return signatures.length === 1 ? signatures[0] : "generic"
}

export function normalizeOutput(raw: string) {
  return stripVTControlCharacters(raw.replace(/\r\n?/g, "\n"))
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
}

/** Conservative bypass: diagnostic, pass/progress/banner lines require routing.
 * This detects noise, not a promise to remove it (parsers land in later sprints).
 */
export function hasOutputNoise(text: string) {
  return /\b(?:warn(?:ing)?s?|errors?|failed|failure|PASS|FAIL)\b|[✓✔]|\b\d+%|\[[=># .-]{3,}\]|^TAP version\b/im.test(text)
}
export function compactOutput(raw: string, limit = 32000): Compaction {
  if (!Number.isSafeInteger(limit) || limit < 256) throw Error("Invalid compaction limit")
  // Reserved marker syntax is escaped in data, so raw output cannot impersonate it.
  const text = stripVTControlCharacters(raw.replace(/\r\n?/g, "\n"))
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
    .replaceAll("[OPENARMS:", "[TOOL-DAT:")
  if (bytes(text) <= limit) return { text, omittedBytes: 0, omittedLines: 0 }
  const budget = limit - 160
  const head = sliceBytes(text, Math.floor(budget / 2))
  const tail = sliceBytes(text, Math.floor(budget / 2), true)
  const omitted = text.slice(head.length, text.length - tail.length)
  const omittedBytes = bytes(omitted), omittedLines = lines(omitted)
  return { text: `${head}\n[OPENARMS: omitted ${omittedBytes} UTF8 bytes / ${omittedLines} line fragments]\n${tail}`, omittedBytes, omittedLines }
}
export async function governOutput(raw: string, options: {
  save: (raw: string) => Promise<string>
  compact?: (raw: string) => Compaction
  authoritative?: boolean
  command?: string
  compactors?: readonly DomainCompactor[]
}) {
  let logPath: string | undefined, logStatus = "not-needed", warning = ""
  // Save before invoking any transform, including custom parsers.
  const domainAware = !options.authoritative && (options.command !== undefined || options.compactors !== undefined)
  if (domainAware || bytes(raw) > (options.authoritative ? HARD_CAP : 32000) || options.compact) {
    try { logPath = await options.save(raw); logStatus = "written" }
    catch { logStatus = "failed"; warning = "[OPENARMS: LOG_WRITE_FAILED]\n" }
  }
  let result: Compaction
  let domain: OutputDomain = "generic", fastPath = false
  try {
    if (options.authoritative) result = { text: raw, omittedBytes: 0, omittedLines: 0 }
    else if (options.compact) result = options.compact(raw) // Legacy callback receives unchanged raw input.
    else if (domainAware) {
      const normalized = normalizeOutput(raw).replaceAll("[OPENARMS:", "[TOOL-DAT:")
      domain = classifyOutput(options.command ?? "", normalized)
      fastPath = bytes(normalized) < 1000 && !hasOutputNoise(normalized)
      const parser = fastPath ? undefined : options.compactors?.find(parser => parser.domain === domain && parser.match(options.command ?? "", normalized))
      result = parser ? parser.compact(normalized, { maxBytes: 32000 }) : compactOutput(normalized)
      // Untrusted/injected parsers cannot mint reserved governor metadata.
      if (parser) result = { ...result, text: normalizeOutput(result.text).replaceAll("[OPENARMS:", "[TOOL-DAT:") }
    } else result = compactOutput(raw)
  }
  catch {
    result = domainAware ? compactOutput(raw) : { text: raw, omittedBytes: 0, omittedLines: 0 }
    warning += "[OPENARMS: GOVERNOR_FAILED]\n"
  }
  // Persist every domain-aware stream, but keep clean short responses byte-for-byte.
  // Transformed output/warnings retain provenance; logPath is always returned.
  const unchangedFastPath = fastPath && !warning && result.text === raw && result.omittedBytes === 0 && result.omittedLines === 0
  const reference = logPath && !unchangedFastPath ? `[OPENARMS: full log ${sliceBytes(normalizeOutput(logPath).replaceAll("[OPENARMS:", "[TOOL-DAT:").replace(/[\n\]]/g, "_"), 1024)}]\n` : ""
  let text = warning + reference + result.text
  const hardCapApplied = bytes(text) > HARD_CAP
  if (hardCapApplied) {
    const prefix = warning + "[OPENARMS: HARD_CAP_APPLIED]\n" + reference
    const clipped = options.authoritative
      ? { text: "[OPENARMS: SKILL_OUTPUT_TOO_LARGE; package NOT loaded. No authoritative skill fragment returned.]", omittedBytes: bytes(raw), omittedLines: lines(raw) }
      : compactOutput(result.text, HARD_CAP - bytes(prefix))
    result = { ...clipped, omittedBytes: result.omittedBytes + clipped.omittedBytes, omittedLines: result.omittedLines + clipped.omittedLines }
    text = prefix + clipped.text
  }
  return { ...result, text, rawBytes: bytes(raw), contextBytes: bytes(text), logPath, logStatus, hardCapApplied, domain, fastPath }
}
