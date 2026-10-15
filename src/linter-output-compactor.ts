import type { DomainCompactor } from "./output-governor.ts"
import { diagnosticResult } from "./test-output-compactor.ts"
import { stripVTControlCharacters } from "node:util"

type Issue = { file: string; line: string; column: string; severity: string; message: string; rule: string }
function parse(raw: string): Issue[] | undefined {
  const issues: Issue[] = []
  let file = ""
  for (const row of stripVTControlCharacters(raw).split(/\r?\n/)) {
    let m = row.match(/^(.+?):(\d+):(\d+):\s+([A-Z]\d{3})\s+(.+)$/)
    if (m) { issues.push({ file: m[1], line: m[2], column: m[3], rule: m[4], message: m[5], severity: m[4].startsWith("W") ? "warning" : "error" }); continue }
    m = row.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(\S+)\s*$/)
    if (m && file) { issues.push({ file, line: m[1], column: m[2], severity: m[3], message: m[4], rule: m[5] }); continue }
    m = row.match(/^(.+?):(\d+):(\d+)\s+(\S+)\s+.*[━─]/)
    if (m) { issues.push({ file: m[1], line: m[2], column: m[3], rule: m[4], severity: /\bWARN(?:ING)?\b/.test(row) ? "warning" : "error", message: "" }); file = ""; continue }
    if (issues.length && /^(?:\s*[×!i│┃⚠ℹ]|\s*\d+\s*│)/.test(row)) {
      if (/^\s*⚠/.test(row)) issues.at(-1)!.severity = "warning"
      issues.at(-1)!.message += `\n${row}`; continue
    }
    if (/^(?:[^\s].*[/\\])?[^\s/\\]+\.[\w]+\s*$/.test(row)) { file = row.trim(); continue }
    if (!row.trim() || /^\s*(?:✖ \d+ problems|Checked \d+|Found \d+|check\s|\d+ errors? and \d+ warnings?)/.test(row)) continue
    // Partial recognition must not silently discard serious diagnostics.
    return undefined
  }
  return issues.length ? issues : undefined
}
export const linterOutputCompactor: DomainCompactor = {
  domain: "linter",
  match: (_command, raw) => parse(raw) !== undefined,
  compact: (raw, { maxBytes }) => {
    const issues = parse(raw)
    if (!issues) return diagnosticResult(raw, raw, maxBytes)
    const errors = issues.filter(i => i.severity === "error")
    const warnings = issues.filter(i => i.severity === "warning")
    const style = (rule: string) => /^(?:W[12]\d{2}|(?:@stylistic\/)?(?:indent|quotes|semi|comma-spacing|key-spacing|no-trailing-spaces)|format(?:\/.*)?|lint\/style\/.*)$/.test(rule)
    const visible = issues.filter(i => i.severity === "error" || !errors.length || !style(i.rule))
    let count = 0
    const selected = visible.filter(i => i.severity !== "error" || count++ < 10)
    const groups = new Map<string, string[]>()
    for (const i of selected) groups.set(i.file, [...(groups.get(i.file) ?? []), `  Line ${i.line}:${i.column} - ${i.severity}: ${i.message} [${i.rule}]`])
    const text = [...groups].map(([file, rows]) => `${file}:\n${rows.join("\n")}`).join("\n")
      + `\nTotal: ${errors.length} errors, ${warnings.length} warnings.`
      + (errors.length > 10 ? `\n[compactor: ${errors.length - 10} additional lint errors omitted; check full log]` : "")
      + (visible.length < issues.length ? `\n[compactor: ${issues.length - visible.length} style warnings suppressed; included in totals]` : "")
    return diagnosticResult(raw, text, maxBytes)
  },
}
