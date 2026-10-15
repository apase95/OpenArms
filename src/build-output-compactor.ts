import { stripVTControlCharacters } from "node:util"
import type { DomainCompactor } from "./output-governor.ts"
import { diagnosticResult } from "./test-output-compactor.ts"

// Closed top-level grammar: unknown significant records abort the entire parse.
const start = /^(?:.+(?:\(\d+,\d+\)|:\d+(?::\d+)?)(?: - |:\s+)(?:(?:fatal )?error(?: TS\d+)?|warning|note):|error(?:\[E\d+\])?:|warning(?:\[[^\]]+\])?:|(?:ERROR|WARNING) in |\s*[✘▲] \[(?:ERROR|WARNING)\]|\[vite:[^\]]+\])/
const noise = /^(?:\s*|\s*\[[=># .-]+\]\s*\d+%\s*|\s*(?:Compiling|Checking|Downloading|Downloaded|Finished)\s+\S.*|webpack \S+ compiled (?:successfully|with \d+ errors?(?: and \d+ warnings?)?).*|vite v\S+ building .*|transforming\.\.\.|✓ \d+ modules transformed\.|[✘×] Build failed in .+|error during build:|Found \d+ errors?(?: in .*|\.)|\d+ errors?(?: and \d+ warnings?)? generated\.|For more information about this error, try `rustc --explain E\d+`\.)$/
const prelude = /^(?:.+: In (?:instantiation|substitution|function|member function|constructor|static member function).*|.+:\d+(?::\d+)?:\s+required from .*|In file included from .+|\s+from .+:\d+[:,]?)$/

// Only numbered source rows are elided; message/caret rows are never reindented.
function excerpt(rows: string[]) {
  const source = rows.flatMap((row, i) => /^\s*\d+(?:\s*[|│]|\s+\S)/.test(row) ? [i] : [])
  const anchors = source.filter(i => /[~^╵]/.test(rows[i + 1] ?? ""))
  if (!anchors.length) return rows
  const kept = new Set(source.filter(i => anchors.some(a => Math.abs(source.indexOf(i) - source.indexOf(a)) <= 2)))
  let omitted = false
  return rows.flatMap((row, i) => {
    if (source.includes(i) && !kept.has(i)) {
      if (omitted) return []
      omitted = true
      return ["[compactor: source context omitted]"]
    }
    omitted = false
    return [row]
  })
}

function parse(raw: string, command: string): string | undefined {
  if (/(?:^|[\s=])(?:-Werror\b|--deny(?:=|\s+)warnings\b|-D\s*warnings\b)/.test(command)) return undefined
  const rows = stripVTControlCharacters(raw.replace(/\r\n?/g, "\n")).split("\n")
  const blocks: { rows: string[]; warning: boolean; note: boolean; bundler: boolean }[] = []
  let current: typeof blocks[number] | undefined
  let pending: string[] = []
  for (const row of rows) {
    // Rust terminal summaries are not additional primary errors.
    if (/^error: (?:could not compile .+|aborting due to .+)$/.test(row)) { current = undefined; continue }
    if (prelude.test(row)) { pending.push(row); current = undefined; continue }
    if (start.test(row)) {
      current = { rows: [...pending, row], warning: /(?:\bwarning(?:\[[^\]]+\])?:|\[WARNING\]|^WARNING in )/.test(row), note: /:\s+note:/.test(row), bundler: /^(?:ERROR in |\[vite:)/.test(row) }
      pending = []
      blocks.push(current)
    } else if (noise.test(row)) {
      if (!row.trim() && current) current.rows.push(row)
      else current = undefined
    } else if (current && (/^(?:\s+\S|\s*\d+\s*[|│]?|[~^]+\s*$)/.test(row)
      || (current.bundler && /^(?:Module (?:not found|build failed)|Error: |(?:Could not|Failed to) resolve |file: |\S+:\d+:\d+\s*$|\d+: )/.test(row)))) current.rows.push(row)
    else return undefined
  }
  if (pending.length || !blocks.some(block => !block.warning && !block.note)) return undefined
  const selected: string[] = []
  let errors = 0, keep = false
  for (const block of blocks) {
    if (block.warning) { keep = false; continue }
    if (!block.note) keep = ++errors <= 5
    if (keep) selected.push(excerpt(block.rows).join("\n").trimEnd())
  }
  if (errors > 5) selected.push(`[compactor: ${errors - 5} additional build errors omitted; check full log]`)
  return selected.join("\n")
}
export const buildOutputCompactor: DomainCompactor = {
  domain: "build",
  match: (command, raw) => parse(raw, command) !== undefined,
  compact: (raw, { maxBytes, command = "" }) => diagnosticResult(raw, parse(raw, command) ?? raw, maxBytes),
}
