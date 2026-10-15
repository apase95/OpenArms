import type { Compaction, DomainCompactor } from "./output-governor.ts"
import { diagnosticResult } from "./test-output-compactor.ts"

const size = (text: string) => Buffer.byteLength(text, "utf8")
export function classifyDiffFile(file: string): "high" | "middle" | "low" {
  if (/(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|bun\.lockb?|go\.sum)$|(?:\.min\.[cm]?js|\.map|\.svg|\.png|\.jpe?g|\.gif|\.webp|\.ico|\.woff2?|\.base64)$|(?:^|\/)(?:generated|dist|vendor)\//i.test(file)) return "low"
  if (/\.(?:[cm]?[jt]sx?|py|go|rs|java|c|h|cpp|hpp|rb|sh|toml|ya?ml)$|(?:^|\/)(?:package\.json|tsconfig[^/]*\.json|Dockerfile|Makefile|\.gitignore)$/i.test(file)) return "high"
  return "middle"
}

// Git C-quoted paths encode UTF8 bytes, not JS Unicode escapes.
function pathValue(value: string): string | undefined {
  if (!value.startsWith('"')) return value.includes('"') ? undefined : value
  if (!value.endsWith('"')) return undefined
  const chunks: Buffer[] = []
  const body = value.slice(1, -1)
  for (let i = 0; i < body.length;) {
    if (body[i] !== "\\") { const cp = String.fromCodePoint(body.codePointAt(i)!); chunks.push(Buffer.from(cp)); i += cp.length; continue }
    const octal = body.slice(i + 1).match(/^[0-7]{3}/)?.[0]
    if (octal) { chunks.push(Buffer.from([parseInt(octal, 8)])); i += 4; continue }
    const escaped = ({ t: "\t", n: "\n", r: "\r", '"': '"', "\\": "\\" } as Record<string, string>)[body[i + 1]]
    if (escaped === undefined) return undefined
    chunks.push(Buffer.from(escaped)); i += 2
  }
  const decoded = Buffer.concat(chunks).toString("utf8")
  return decoded.includes("\ufffd") ? undefined : decoded
}
type Block = { path: string; text: string; reduced: string; plus: number; minus: number; priority: number; binary: boolean }
function parse(raw: string): { preamble: string; blocks: Block[] } | undefined {
  const starts = [...raw.matchAll(/^diff --git /gm)].map(m => m.index!)
  if (!starts.length) return undefined
  const preamble = raw.slice(0, starts[0])
  // Preserve show/log commit messages verbatim; unsupported headers fall back.
  if (preamble && !/^commit [0-9a-f]+(?:\s|$)/.test(preamble)) return undefined
  const blocks: Block[] = []
  for (let n = 0; n < starts.length; n++) {
    const text = raw.slice(starts[n], starts[n + 1] ?? raw.length)
    const rows = text.split("\n"); if (rows.at(-1) === "") rows.pop()
    const header = rows[0].match(/^diff --git ("(?:[^"\\]|\\.)*"|a\/.*?) ("(?:[^"\\]|\\.)*"|b\/.*)$/)
    if (!header) return undefined
    const old = pathValue(header[1]), next = pathValue(header[2])
    if (!old?.startsWith("a/") || !next?.startsWith("b/")) return undefined
    let plus = 0, minus = 0, binary = false, hunk = false, oldLeft = 0, newLeft = 0
    let oldFile = false, newFile = false, metadata = false
    const reduced: string[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (i === 0) { reduced.push(row); continue }
      const coordinates = row.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/)
      if (coordinates) {
        if (oldLeft || newLeft || !oldFile || !newFile || binary) return undefined
        oldLeft = Number(coordinates[2] ?? 1); newLeft = Number(coordinates[4] ?? 1); hunk = true
        reduced.push(row); continue
      }
      if (row === "\\ No newline at end of file" && hunk) { reduced.push(row); continue }
      if (hunk) {
        if (row.startsWith(" ")) { oldLeft--; newLeft-- }
        else if (row.startsWith("+")) { plus++; newLeft--; reduced.push(row) }
        else if (row.startsWith("-")) { minus++; oldLeft--; reduced.push(row) }
        else return undefined
        if (oldLeft < 0 || newLeft < 0) return undefined
        continue
      }
      if (/^--- /.test(row)) {
        const value = pathValue(row.slice(4)); if (oldFile || (value !== old && value !== "/dev/null")) return undefined
        oldFile = true
      } else if (/^\+\+\+ /.test(row)) {
        const value = pathValue(row.slice(4)); if (!oldFile || newFile || (value !== next && value !== "/dev/null")) return undefined
        newFile = true
      } else if (/^Binary files .+ differ$/.test(row)) { binary = true; metadata = true }
      else if (/^(?:index [0-9a-f]+\.\.[0-9a-f]+(?: \d{6})?|(?:old|new|deleted file|new file) mode \d{6}|(?:dis)?similarity index \d+%|(?:rename|copy) (?:from|to) .+)$/.test(row)) metadata = true
      else return undefined
      reduced.push(row)
    }
    if (oldLeft || newLeft || (!hunk && !metadata) || oldFile !== newFile || (oldFile && !hunk && !binary)) return undefined
    const file = next.slice(2)
    blocks.push({ path: file, text, reduced: reduced.join("\n") + "\n", plus, minus, binary,
      priority: binary ? 2 : ({ high: 0, middle: 1, low: 2 })[classifyDiffFile(file)] })
  }
  return { preamble, blocks }
}

export const gitDiffOutputCompactor: DomainCompactor = {
  domain: "git-diff",
  match: (_command, raw) => size(raw) <= 4000 ? /^diff --git /m.test(raw) : parse(raw) !== undefined,
  compact: (raw, { maxBytes }): Compaction => {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 256) throw Error("Invalid compaction limit")
    if (size(raw) <= 4000) return diagnosticResult(raw, raw, maxBytes)
    const parsed = parse(raw)
    if (!parsed) return diagnosticResult(raw, raw, maxBytes)
    const blocks = [...parsed.blocks].sort((a, b) => a.priority - b.priority)
    let text = "Git diff summary (observed +/- lines):\n", shown = 0
    // Reserve a bounded marker even when thousands of paths/stat rows exceed budget.
    const statBudget = Math.min(Math.floor(maxBytes / 3), 8000)
    for (const block of blocks) {
      const row = `${JSON.stringify(block.path)} | +${block.plus}/-${block.minus}${block.binary ? " binary" : ""}${block.priority === 2 ? " (omitted generated/binary details)" : ""}\n`
      if (size(text + row) > statBudget) break
      text += row; shown++
    }
    if (shown < blocks.length) text += `[compactor: ${blocks.length - shown} file stat rows omitted; check full raw log]\n`
    if (parsed.preamble) {
      if (size(text + parsed.preamble) < maxBytes / 2) text += parsed.preamble
      else text += "[compactor: commit preamble omitted; check full raw log]\n"
    }
    let omitted = 0
    for (const block of blocks) {
      if (block.priority === 2) continue
      const budget = maxBytes - size(text) - 160
      if (size(block.text) <= budget) { text += block.text; continue }
      const reduced = "[compactor: context lines omitted; coordinates refer to original hunks; review excerpt, NOT an applicable patch]\n" + block.reduced
      if (size(reduced) <= budget) text += reduced
      else {
        const marker = "[compactor: partial change excerpt; context/changes omitted; original coordinates; NOT an applicable patch; check full raw log]\n"
        let excerpt = marker, kept = false
        for (const row of block.reduced.split("\n")) {
          if (!row) continue
          if (size(excerpt + row + "\n") > budget) break
          excerpt += row + "\n"
          if (/^[+-](?![+-])/.test(row)) kept = true
        }
        if (kept) text += excerpt
        else omitted++ // No arbitrary partial UTF8 lines or unmarked patch fragments.
      }
    }
    if (omitted) text += `[compactor: ${omitted} file diffs omitted (budget); check full raw log]\n`
    return diagnosticResult(raw, text, maxBytes)
  },
}
