import type { Compaction } from "./output-governor.ts"

/** Deliberately not a shell parser: one exact cat invocation, no pipelines/subshells. */
export function isFileInspection(toolName?: string, command = "") {
  return toolName === "read" || /^(?:\/[^\s'";|&<>`$]+\/)?cat(?:\s+(?:--|-[AbenstuvET]+|"[^"\n`$]+"|'[^'\n]+'|[^\s'";|&<>`$]+))*\s*$/.test(command.trim())
}

/** Called only AFTER the raw sink. No filesystem access/probes; sizes are observed bytes. */
export function compactFileInspection(raw: string, path?: string): Compaction | undefined {
  let reason: string | undefined
  if (/\x00/.test(raw) || /^(?:<type>binary<\/type>|(?:Error: )?Cannot (?:display|read) (?:a )?binary file[^\n]*)$/im.test(raw)) reason = "binary content"
  const rows = raw.split(/\r\n?|\n/).map(row => row.replace(/^\s*\d+(?:: |\t)/, ""))
  if (!reason && rows.some(row => row.length > 5000)) {
    // Extension plus code syntax, or extremely dense JS syntax. Long prose is not minified.
    const minified = rows.some(row => row.length > 5000 && ((/\.min\.[cm]?js$/i.test(path ?? "") && /[{};=]/.test(row)) || (/^(?:\(?function\b|[!;(]?\(?\(?\(?\s*\(?\s*(?:function\b|\(\)=>)|(?:const|var|let)\s)/.test(row) && (row.match(/[{};=]/g)?.length ?? 0) > row.length / 30)))
    reason = minified ? "minified bundle" : "line longer than 5000 characters"
  }
  if (!reason) return undefined
  const count = Buffer.byteLength(raw)
  const text = `[compactor: File inspection detected ${reason}; observed output size: ${count} UTF8 bytes (not whole-file size). Use targeted range read or grep; check full raw log.]\n`
  return { text, omittedBytes: Math.max(1, count - Buffer.byteLength(text)), omittedLines: Math.max(0, rows.length - 1) }
}
