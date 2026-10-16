import { gunzipSync } from "node:zlib"
import { TextDecoder } from "node:util"
import { MAX_SKILL_BYTES, type GithubSource } from "./skill-remote-fetcher.ts"

export type RawSkillPackage = {
  readonly trust: "untrusted"
  readonly source?: GithubSource
  readonly root: string
  readonly document: { path: string; text: string }
  readonly assets: readonly { path: string; bytes: Buffer }[]
}

function text(bytes: Buffer) {
  const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  if (value.includes("\0")) throw Error("NUL in archive text")
  return value
}
function field(bytes: Buffer) {
  const end = bytes.indexOf(0)
  if (end >= 0 && bytes.subarray(end).some(byte => byte !== 0)) throw Error("Malformed tar field")
  return text(end < 0 ? bytes : bytes.subarray(0, end))
}
function number(bytes: Buffer) {
  const raw = bytes.toString("ascii").replace(/[\0 ]+$/, "").replace(/^ +/, "")
  if (!/^[0-7]+$/.test(raw)) throw Error("Invalid tar numeric field")
  const value = Number.parseInt(raw, 8)
  if (!Number.isSafeInteger(value) || value > MAX_SKILL_BYTES) throw Error("Tar size exceeds limit")
  return value
}
function safePath(value: string, directory = false) {
  const clean = directory && value.endsWith("/") ? value.slice(0, -1) : value
  if (!clean || clean.length > 512 || /[\\:\x00-\x1f\x7f%]/.test(clean) || clean.startsWith("/") || clean.split("/").some(part => !part || part === "." || part === ".." || /[. ]$/.test(part))) throw Error("Unsafe archive path")
  return clean
}

/** Bounded in-memory tar.gz subset; never writes extracted paths to disk.
 * POSIX global PAX comments/mtime are allowed, path/size/link overrides denied. */
export function extractSkillArchive(archive: Buffer, options: { source?: GithubSource; subpath?: string } = {}): RawSkillPackage {
  if (archive.length > MAX_SKILL_BYTES) throw Error("Archive exceeds 10 MiB")
  if (archive[0] !== 0x1f || archive[1] !== 0x8b) throw Error("Only tar.gz supported (ZIP unsupported)")
  const tar = gunzipSync(archive, { maxOutputLength: MAX_SKILL_BYTES })
  if (tar.length % 512 !== 0) throw Error("Truncated tar")
  const entries = new Map<string, Buffer | null>(), aliases = new Set<string>()
  let offset = 0, ended = false, count = 0, total = 0
  while (offset < tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) {
      if (tar.length - offset < 1024 || tar.subarray(offset).some(byte => byte !== 0)) throw Error("Malformed trailing tar bytes")
      ended = true; break
    }
    if (++count > 2048) throw Error("Archive entry count exceeds 2048")
    const expected = number(header.subarray(148, 156))
    const actual = [...header].reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0)
    if (actual !== expected) throw Error("Invalid tar checksum")
    if (field(header.subarray(257, 263)) !== "ustar" || header.toString("ascii", 263, 265) !== "00") throw Error("Unsupported tar header")
    const size = number(header.subarray(124, 136)), type = String.fromCharCode(header[156])
    const padded = Math.ceil(size / 512) * 512
    if (offset + 512 + padded > tar.length) throw Error("Truncated tar entry")
    const body = tar.subarray(offset + 512, offset + 512 + size)
    if (tar.subarray(offset + 512 + size, offset + 512 + padded).some(byte => byte !== 0)) throw Error("Invalid tar padding")
    offset += 512 + padded
    if (type === "g") {
      if (size > 8192) throw Error("PAX metadata exceeds limit")
      let pos = 0
      while (pos < body.length) {
        const space = body.indexOf(32, pos), digits = body.toString("ascii", pos, space)
        if (space < pos || !/^[1-9][0-9]*$/.test(digits)) throw Error("Malformed PAX record")
        const length = Number(digits), end = pos + length
        if (!Number.isSafeInteger(length) || end > body.length || end <= space + 1 || body[end - 1] !== 10) throw Error("Malformed PAX record")
        const record = text(body.subarray(space + 1, end - 1))
        if (!/^(comment|mtime|atime|ctime)=[^\r\n]*$/.test(record)) throw Error("Unsupported PAX override")
        pos = end
      }
      continue
    }
    if (!["0", "\0", "5"].includes(type) || field(header.subarray(157, 257))) throw Error("Archive links/special files/extensions unsupported")
    if (type === "5" && size) throw Error("Directory with data")
    const prefix = field(header.subarray(345, 500)), name = field(header.subarray(0, 100))
    const file = safePath(prefix ? `${prefix}/${name}` : name, type === "5")
    const alias = file.toLowerCase()
    if (aliases.has(alias)) throw Error("Duplicate archive path")
    aliases.add(alias)
    entries.set(file, type === "5" ? null : Buffer.from(body))
    total += size
    if (total > MAX_SKILL_BYTES) throw Error("Extracted content exceeds 10 MiB")
  }
  if (!ended) throw Error("Missing tar terminator")
  const canonicalEntries = new Map([...entries].map(([file, bytes]) => [file.toLowerCase(), bytes]))
  for (const file of entries.keys()) {
    const parts = file.split("/")
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join("/").toLowerCase()
      if (canonicalEntries.has(parent) && canonicalEntries.get(parent) !== null) throw Error("Conflicting archive paths")
    }
  }
  const tops = new Set([...entries.keys()].map(file => file.split("/")[0]))
  if (tops.size !== 1) throw Error("Expected one archive top directory")
  const top = [...tops][0]
  if (entries.get(top) !== undefined && entries.get(top) !== null) throw Error("Expected archive directory")
  const files = new Map([...entries].filter(([file, bytes]) => file.startsWith(`${top}/`) && bytes !== null).map(([file, bytes]) => [file.slice(top.length + 1), bytes!]))
  const requested = options.subpath ?? options.source?.subpath ?? ""
  if (requested) safePath(requested)
  const priority = ["SKILL.md", "README.md", "skill.markdown"]
  const find = (root: string) => priority.map(name => root ? `${root}/${name}` : name).find(file => files.has(file))
  let root = requested, document = find(root)
  if (!document && !requested) {
    const children = [...new Set([...files.keys()].filter(file => file.startsWith("skills/")).map(file => file.split("/").slice(0, 2).join("/")))].sort()
    const candidates = children.filter(child => find(child))
    if (candidates.length > 1) throw Error("Ambiguous skills layout; select explicit subpath")
    if (candidates.length === 1) { root = candidates[0]; document = find(root) }
  }
  if (!document) throw Error("No skill document at selected layout")
  const relative = (file: string) => root ? file.slice(root.length + 1) : file
  return Object.freeze({ trust: "untrusted", source: options.source, root,
    document: Object.freeze({ path: relative(document), text: text(files.get(document)!) }),
    assets: Object.freeze([...files].filter(([file]) => file !== document && (!root || file.startsWith(`${root}/`))).sort(([a], [b]) => a.localeCompare(b)).map(([file, bytes]) => Object.freeze({ path: relative(file), bytes }))) })
}
