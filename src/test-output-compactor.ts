import { stripVTControlCharacters } from "node:util"
import type { Compaction, DomainCompactor } from "./output-governor.ts"

/** Shared UTF8 boundary; no runtime dependency on the governor. */
export function diagnosticResult(raw: string, output: string, maxBytes: number): Compaction {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 256) throw Error("Invalid compaction limit")
  let text = output
  if (Buffer.byteLength(text) > maxBytes) {
    const marker = "\n[compactor: diagnostic bytes omitted; check full raw log]\n"
    const buffer = Buffer.from(text)
    let end = maxBytes - Buffer.byteLength(marker)
    while ((buffer[end] & 0xc0) === 0x80) end--
    text = buffer.subarray(0, end).toString("utf8") + marker
  }
  return { text, omittedBytes: Math.max(0, Buffer.byteLength(raw) - Buffer.byteLength(text)), omittedLines: Math.max(0, raw.split("\n").length - text.split("\n").length) }
}

const summary = /^\s*(?:Test Suites:|Tests:|Test Files\s|Tests\s+\d|Snapshots:|Time:|=+ .*\b(?:failed|passed|error)\b|\d+ (?:passing|failing|pending)\b|FAIL\s+\S+\s+[\d.]+s|ok\s+\S+\s+[\d.]+s)/
function parse(raw: string): string | undefined {
  const rows = stripVTControlCharacters(raw.replace(/\r\n?/g, "\n")).replaceAll("[OPENARMS:", "[TOOL-DAT:").split("\n")
  const jest = rows.some(s => /^\s*(?:PASS|FAIL)\s+\S+\.[cm]?[jt]sx?\b/.test(s))
  const pytest = rows.some(s => /^=+ (?:FAILURES|ERRORS|test session starts)\b/.test(s))
  const go = rows.some(s => /^(?:--- FAIL: |=== RUN\s|ok\s+\S+\s+[\d.]+s)/.test(s))
  const mocha = rows.some(s => /^\s*\d+ (?:passing|failing)\b/.test(s))
  const vitest = rows.some(s => /^\s*(?:❯|×) .+|^\s*FAIL\s+.+ > /.test(s))
  if (!jest && !pytest && !go && !mocha && !vitest) return undefined
  const isFailure = (s: string) => pytest ? /^_{3,}\s+\S.*_{3,}$/.test(s)
    : go ? /^--- FAIL: /.test(s)
    : mocha ? /^\s+\d+\) .+/.test(s)
    : /^\s*(?:● |FAIL\s+.+ > )/.test(s)
  const starts = rows.flatMap((s, i) => isFailure(s) ? [i] : [])
  if (!starts.length && jest) starts.push(...rows.flatMap((s, i) => /^\s*FAIL\s+/.test(s) ? [i] : []))
  const summaries = rows.filter(s => summary.test(s))
  if (!starts.length) {
    // Discard only recognized success records; unexpected diagnostics remain.
    return rows.filter(s => !/^\s*(?:PASS\s+\S+|[✓✔] .+|--- PASS: .+|=== RUN\s+.+|ok\s+\S+\s+[\d.]+s)/.test(s)
      && !(pytest && /^(?:\S+\.py\s+[.s]+\s*(?:\[\s*\d+%\])?|[.s]+\s*\[\s*\d+%\])\s*$/.test(s))).join("\n").trim() || "Tests passed"
  }
  let end = starts[1] ?? rows.length
  for (let i = starts[0] + 1; i < end; i++) if (summary.test(rows[i]) || /^=+ short test summary info =+/.test(rows[i]) || (go && /^=== RUN\s/.test(rows[i])) || (jest && /^\s*(?:PASS|FAIL)\s+\S+\.[cm]?[jt]sx?\b/.test(rows[i]))) { end = i; break }
  // Go assertion logs precede the --- FAIL header.
  let begin = starts[0]
  if (go) { while (begin > 0 && /^(?:\s+\S|\s*$)/.test(rows[begin - 1])) begin-- }
  let frames = 0
  const detail = rows.slice(begin, end).filter(s => {
    if (/^\s+(?:at\s|❯\s+.+:\d+:\d+)/.test(s)) return !/node_modules|node:internal|internal\/|jest-circus/.test(s) && ++frames <= 5
    return true
  })
  const suite = jest ? rows.slice(0, starts[0] + 1).find(s => /^\s*FAIL\s+/.test(s)) : undefined
  return [suite, ...detail, ...starts.slice(1, 6).map(i => `Next failure: ${rows[i].trim()}`), ...summaries].filter(Boolean).join("\n")
}
export const testOutputCompactor: DomainCompactor = {
  domain: "test",
  match: (_command, raw) => parse(raw) !== undefined,
  compact: (raw, { maxBytes }) => diagnosticResult(raw, parse(raw) ?? raw, maxBytes),
}
