import { createHash, randomUUID } from "node:crypto"
import { chmod, lstat, mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises"
import path from "node:path"

export const handoffSections = ["Objective", "Completed", "Active", "Decisions", "Verification", "Relevant Files", "Next Step"] as const
type Section = typeof handoffSections[number]
export type HandoffFields = Partial<Record<Section, { text: string; source: string }[]>>
const omitted = "[omitted: unsafe or uncertain content]"
/** Conservative common-pattern detector, not universal secret detection. Audit
 * contains rule IDs only; never matched text, native exceptions or source IDs. */
export function sanitizeHandoffField(field: { text: string; source: string }) {
  const rules: [string, RegExp][] = [
    ["CREDENTIAL", /(?:\bBearer\s+\S+|\b(?:sk-[A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9]+|AKIA[A-Z0-9]{16})\b|(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+|https?:\/\/[^\s/]+:[^\s/]+@)/i],
    ["PRIVATE_KEY", /-----BEGIN .*PRIVATE KEY-----/],
    ["ENV_ASSIGNMENT", /(?:^|\n)\s*(?:export\s+)?[A-Z_][A-Z0-9_]*\s*=/],
    ["ABSOLUTE_PATH", /(?:^|[\s"'(])(?:\/(?:[^\s]+)|[A-Za-z]:[\\/][^\s]+)/],
    ["RAW_OUTPUT", /(?:```|@@\s+-\d|^(?:diff --git|\+\+\+ |--- |Traceback|\s*at .+\(.+:\d+)|\x1b\[)/m],
    ["UNCERTAIN", /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|[A-Za-z0-9_+/=-]{40,}/],
    ["INSTRUCTION", /(?:ignore|override|disregard)\s+(?:all\s+|previous\s+|system\s+|safety\s+)*(?:instructions|rules|restrictions)|(?:load_skill|load_skill_package)\s*\(|<\/?(?:system|assistant|tool)|\b(?:system|assistant|developer)\s*:/i],
  ]
  if (!field || !["task", "runtime", "owner"].includes(field.source) || typeof field.text !== "string") return { text: omitted, rules: ["UNTRUSTED"] }
  const matched = rules.filter(([, detector]) => detector.test(field.text)).map(([id]) => id)
  if (matched.length) return { text: omitted, rules: matched }
  return { text: field.text.replace(/\s+/g, " ").replace(/[<>]/g, "").trim().slice(0, 140) || "[no sourced status]", rules: [] as string[] }
}
export function compactHandoff(fields: HandoffFields) {
  if (!fields || typeof fields !== "object" || Object.keys(fields).some(k => !handoffSections.includes(k as Section)) || Object.values(fields).some(v => !Array.isArray(v))) throw Error("INVALID_HANDOFF")
  const audit = new Set<string>()
  // Sanitize ALL fields before counting, prioritizing or compacting.
  const rows = handoffSections.map(section => [...new Set((fields[section] ?? []).map(field => {
    const safe = sanitizeHandoffField(field); safe.rules.forEach(rule => audit.add(rule)); return safe.text
  }))])
  const quotas = [2, 5, 3, 3, 3, 5, 2] // 23 items + 7 headings = 30; Next Step always retained.
  const body = handoffSections.flatMap((section, index) => [`## ${section}`, ...(rows[index].length ? rows[index].slice(0, quotas[index]) : ["[no sourced status]"]).map(text => `- ${text}`)]).join("\n") + "\n"
  return { body, audit: [...audit].sort() }
}
const hash = (body: string) => createHash("sha256").update(body).digest("hex")
const id = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(v)
// Accept legacy journal IDs and canonical package/skill IDs, never arbitrary paths.
const skillID = (v: unknown) => id(v) || (typeof v === 'string' && v.length <= 321 && /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v))
export type RotationSelection = { revision: string; packages: Record<string, string[]>; skills: string[] }
type RotationPhase = 'creating' | 'created' | 'restored' | 'navigated' | 'submitting' | 'submitted'
export type HandoffMetadata = { schemaVersion: 1; id: string; sourceSession: string; targetSession?: string; createdAt: string; hash: string; state: "prepared" | "claimed" | "acknowledged" | "archived"; rotation?: { phase: RotationPhase; revision: string; skills: string[]; activation?: string } }
type Envelope = { metadata: HandoffMetadata; body: string; audit: string[] }
/** Local, cooperating writers only. Journal is authoritative; progress.md is an
 * atomic projection recoverable after a crash. Never steal an abandoned lock. */
export class HandoffStore {
  readonly root: string
  constructor(root: string) { this.root = root }
  private async folder() {
    const root = await realpath(this.root), folder = path.join(root, ".openarms")
    try { await mkdir(folder, { mode: 0o700 }) } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw Error("HANDOFF_IO") }
    let info = await lstat(folder)
    if (!info.isDirectory() || await realpath(folder) !== folder) throw Error("UNSAFE_HANDOFF_PATH")
    if (info.mode & 0o022) {
      await chmod(folder, 0o700).catch(() => {})
      info = await lstat(folder)
      if (info.mode & 0o022) throw Error("UNSAFE_HANDOFF_PATH")
    }
    for (const name of ["handoff.json", "progress.md", ".handoff-lock"]) {
      try { const itemInfo = await lstat(path.join(folder, name)); if (itemInfo.isSymbolicLink() || (name !== ".handoff-lock" && !itemInfo.isFile())) throw Error("UNSAFE_HANDOFF_PATH") }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e }
    }
    return folder
  }
  private async read(folder: string): Promise<Envelope | null> {
    try {
      const value = JSON.parse(await readFile(path.join(folder, "handoff.json"), "utf8")), m = value.metadata
      if (!m || m.schemaVersion !== 1 || !id(m.id) || !id(m.sourceSession) || (m.targetSession !== undefined && !id(m.targetSession)) || !["prepared", "claimed", "acknowledged", "archived"].includes(m.state) || typeof m.createdAt !== "string" || !Number.isFinite(Date.parse(m.createdAt)) || typeof value.body !== "string" || m.hash !== hash(value.body) || value.body.trimEnd().split("\n").length > 30 || !Array.isArray(value.audit) || value.audit.some((r: any) => !["UNTRUSTED", "CREDENTIAL", "PRIVATE_KEY", "ENV_ASSIGNMENT", "ABSOLUTE_PATH", "RAW_OUTPUT", "UNCERTAIN", "INSTRUCTION"].includes(r))) throw Error("CORRUPT_HANDOFF")
      if (m.rotation && (!['creating', 'created', 'restored', 'navigated', 'submitting', 'submitted'].includes(m.rotation.phase) || !id(m.rotation.revision) || !Array.isArray(m.rotation.skills) || m.rotation.skills.some((s: unknown) => !skillID(s)) || (m.rotation.activation !== undefined && !m.rotation.skills.includes(m.rotation.activation)))) throw Error('CORRUPT_HANDOFF')
      return value
    } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw Error("CORRUPT_HANDOFF") }
  }
  private async atomic(folder: string, name: string, content: string) {
    const temporary = path.join(folder, `.${randomUUID()}.tmp`), handle = await open(temporary, "wx", 0o600)
    try {
      await handle.writeFile(content); await handle.sync(); await handle.close(); await rename(temporary, path.join(folder, name))
      const dir = await open(folder, "r"); try { await dir.sync() } finally { await dir.close() }
    } finally { await handle.close().catch(() => {}); await rm(temporary, { force: true }) }
  }
  private async transaction<T>(action: (folder: string, old: Envelope | null) => Promise<T>) {
    const folder = await this.folder(), lock = path.join(folder, ".handoff-lock")
    try { await mkdir(lock, { mode: 0o700 }) } catch { throw Error("HANDOFF_BUSY") }
    try { await this.folder(); return await action(folder, await this.read(folder)) }
    catch (e) { const code = (e as Error).message; throw Error(["UNSAFE_HANDOFF_PATH", "CORRUPT_HANDOFF", "STALE_HANDOFF", "INVALID_HANDOFF", "ACK_REQUIRED"].includes(code) ? code : "HANDOFF_IO") }
    finally { await rm(lock, { recursive: true, force: true }) }
  }
  async inspect() { const value = await this.read(await this.folder()); return value ? structuredClone(value.metadata) : null }
  /** Read the authoritative, hash-checked body, never the editable projection. */
  async review() { const value = await this.read(await this.folder()); return value ? structuredClone(value) : null }
  async reserveRotation(handoffID: string, contentHash: string, source: string, selection: RotationSelection) {
    if (!id(selection.revision) || !Array.isArray(selection.skills) || selection.skills.some(s => !skillID(s))) throw Error('INVALID_HANDOFF')
    return this.transaction(async (folder, old) => {
      if (!old || old.metadata.id !== handoffID || old.metadata.hash !== contentHash || old.metadata.sourceSession !== source || old.metadata.state !== 'prepared' || old.metadata.rotation) throw Error('STALE_HANDOFF')
      // Repair projection before reserving and before any SDK side effect.
      await this.atomic(folder, 'progress.md', old.body)
      old.metadata.rotation = { phase: 'creating', revision: selection.revision, skills: [...selection.skills] }
      await this.atomic(folder, 'handoff.json', JSON.stringify(old))
      return structuredClone(old.metadata)
    })
  }
  async rotationStep(handoffID: string, contentHash: string, expected: RotationPhase, next: RotationPhase, target: string) {
    if (!id(target)) throw Error('INVALID_HANDOFF')
    const phases = ['creating', 'created', 'restored', 'navigated', 'submitting', 'submitted']
    if (phases.indexOf(next) !== phases.indexOf(expected) + 1) throw Error('INVALID_HANDOFF')
    return this.transaction(async (folder, old) => {
      const m = old?.metadata
      if (!m || m.id !== handoffID || m.hash !== contentHash || m.rotation?.phase !== expected || (m.targetSession && m.targetSession !== target) || target === m.sourceSession || !['prepared', 'claimed', 'acknowledged'].includes(m.state)) throw Error('STALE_HANDOFF')
      m.targetSession = target
      if (m.state === 'prepared') m.state = 'claimed'
      m.rotation!.phase = next
      await this.atomic(folder, 'handoff.json', JSON.stringify(old))
      return structuredClone(m)
    })
  }
  /** Called only after safe automatic instruction assembly succeeds.
   * Text, model claims and generic tool-after events are not activation proof. */
  async activated(proof: { handoffID: string; contentHash: string; target: string; revision: string; skill: string; ok: boolean }) {
    return this.transaction(async (folder, old) => {
      const m = old?.metadata, r = m?.rotation
      if (!m || !r || !proof.ok || m.id !== proof.handoffID || m.hash !== proof.contentHash || m.targetSession !== proof.target || r.revision !== proof.revision || !r.skills.includes(proof.skill) || !['submitting', 'submitted'].includes(r.phase) || !['claimed', 'acknowledged'].includes(m.state)) throw Error('STALE_HANDOFF')
      m.state = 'acknowledged'; r.activation = proof.skill
      await this.atomic(folder, 'handoff.json', JSON.stringify(old))
      return structuredClone(m)
    })
  }
  async prepare(input: { id: string; sourceSession: string; createdAt: string; fields: HandoffFields }, expectedHash: string | null) {
    if (!id(input.id) || !id(input.sourceSession) || !Number.isFinite(Date.parse(input.createdAt)) || new Date(input.createdAt).toISOString() !== input.createdAt) throw Error("INVALID_HANDOFF")
    const compact = compactHandoff(input.fields)
    return this.transaction(async (folder, old) => {
      if (old?.metadata.id === input.id && old.metadata.hash === hash(compact.body) && old.metadata.sourceSession === input.sourceSession && old.metadata.createdAt === input.createdAt) { await this.atomic(folder, "progress.md", old.body); return structuredClone(old.metadata) }
      if ((old?.metadata.hash ?? null) !== expectedHash || (old && (old.metadata.state !== "archived" || input.createdAt <= old.metadata.createdAt))) throw Error("STALE_HANDOFF")
      if (old) {
        const archive = path.join(folder, "handoff-archive")
        try { await mkdir(archive, { mode: 0o700 }) } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw Error("HANDOFF_IO") }
        if (!(await lstat(archive)).isDirectory() || await realpath(archive) !== archive) throw Error("UNSAFE_HANDOFF_PATH")
        await this.atomic(archive, `${old.metadata.id}-${old.metadata.hash}.json`, JSON.stringify(old))
      }
      const metadata: HandoffMetadata = { schemaVersion: 1, id: input.id, sourceSession: input.sourceSession, createdAt: input.createdAt, hash: hash(compact.body), state: "prepared" }
      await this.atomic(folder, "handoff.json", JSON.stringify({ metadata, ...compact }))
      await this.atomic(folder, "progress.md", compact.body)
      return metadata
    })
  }
  private async advance(handoffID: string, contentHash: string, target: string, state: "claimed" | "acknowledged" | "archived") {
    if (!id(target)) throw Error("INVALID_HANDOFF")
    return this.transaction(async (folder, old) => {
      if (!old || old.metadata.id !== handoffID || old.metadata.hash !== contentHash || (old.metadata.targetSession && old.metadata.targetSession !== target)) throw Error("STALE_HANDOFF")
      if (old.metadata.rotation && (state !== 'archived' || old.metadata.state !== 'acknowledged' || !old.metadata.rotation.activation)) throw Error('ACK_REQUIRED')
      const order = ["prepared", "claimed", "acknowledged", "archived"]
      const current = order.indexOf(old.metadata.state), next = order.indexOf(state)
      if (current >= next) return structuredClone(old.metadata)
      if (next !== current + 1) throw Error("ACK_REQUIRED")
      old.metadata = { ...old.metadata, state, targetSession: target }
      await this.atomic(folder, "handoff.json", JSON.stringify(old))
      // Archive is a durable logical state; content is retained, never deleted.
      return structuredClone(old.metadata)
    })
  }
  claim(id: string, hash: string, target: string) { return this.advance(id, hash, target, "claimed") }
  acknowledge(id: string, hash: string, target: string) { return this.advance(id, hash, target, "acknowledged") }
  archive(id: string, hash: string, target: string) { return this.advance(id, hash, target, "archived") }
  recover() { return this.transaction(async (folder, old) => { if (!old) return null; await this.atomic(folder, "progress.md", old.body); return structuredClone(old.metadata) }) }
  async saveSessionHandoff(input: {
    sessionID: string
    fields?: HandoffFields
    source?: "runtime" | "owner" | "task"
    metadataNotes?: Record<string, string>
  }) {
    if (!id(input.sessionID)) throw Error("INVALID_HANDOFF")
    return this.transaction(async (folder, old) => {
      if (old && old.metadata.state !== "archived") throw Error("STALE_HANDOFF")
      const handoffDir = path.join(folder, "handoff")
      try { await mkdir(handoffDir, { mode: 0o700 }) }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw Error("HANDOFF_IO") }
      if (!(await lstat(handoffDir)).isDirectory() || await realpath(handoffDir) !== handoffDir) throw Error("UNSAFE_HANDOFF_PATH")

      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, "0")
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
      const handoffID = `h-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`

      const defaultSource = input.source ?? "runtime"
      const fields: HandoffFields = input.fields ?? {
        Objective: [{ text: `Continue task in session ${input.sessionID}`, source: defaultSource }],
        Completed: [{ text: "Session state recorded and verified", source: defaultSource }],
        Active: [{ text: "Review active task progress", source: defaultSource }],
        Decisions: [{ text: "Persist session handoff snapshot", source: defaultSource }],
        Verification: [{ text: "Inspect session handoff history", source: defaultSource }],
        "Relevant Files": [{ text: ".openarms/progress.md", source: defaultSource }],
        "Next Step": [{ text: "Proceed with next session", source: defaultSource }],
      }

      const compact = compactHandoff(fields)
      const notes = Object.entries(input.metadataNotes ?? {}).map(([key, value]) => {
        const safeKey = sanitizeHandoffField({ text: key, source: defaultSource })
        const safeValue = sanitizeHandoffField({ text: value, source: defaultSource })
        const joined = sanitizeHandoffField({ text: `${safeKey.text}: ${safeValue.text}`, source: defaultSource })
        compact.audit.push(...safeKey.rules, ...safeValue.rules, ...joined.rules)
        return `- ${joined.text}`
      })
      compact.audit = [...new Set(compact.audit)].sort()
      const contentHash = hash(compact.body)

      if (old) {
        const archive = path.join(folder, "handoff-archive")
        try { await mkdir(archive, { mode: 0o700 }) } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw Error("HANDOFF_IO") }
        if (!(await lstat(archive)).isDirectory() || await realpath(archive) !== archive) throw Error("UNSAFE_HANDOFF_PATH")
        await this.atomic(archive, `${old.metadata.id}-${old.metadata.hash}.json`, JSON.stringify(old))
      }

      const metadata: HandoffMetadata = {
        schemaVersion: 1,
        id: handoffID,
        sourceSession: input.sessionID,
        createdAt: now.toISOString(),
        hash: contentHash,
        state: "prepared",
      }

      const envelope = { metadata, ...compact }

      const mdHeader = [
        `# OpenArms Session Handoff Snapshot`,
        ``,
        `- Session ID: ${input.sessionID}`,
        `- Created At: ${now.toISOString()}`,
        ...notes,
        ``,
      ].join("\n")
      const fullMarkdown = `${mdHeader}${compact.body}`
      const stampMdName = `handoff-${stamp}.md`
      await this.atomic(handoffDir, stampMdName, fullMarkdown)
      await this.atomic(folder, "progress.md", compact.body)
      await this.atomic(handoffDir, "progress.md", fullMarkdown)
      await this.atomic(folder, "handoff.json", JSON.stringify(envelope))
      await this.atomic(handoffDir, `handoff-${stamp}.json`, JSON.stringify(envelope))

      return {
        stamp,
        handoffID,
        stampFile: path.join(handoffDir, stampMdName),
        progressFile: path.join(folder, "progress.md"),
        jsonFile: path.join(folder, "handoff.json"),
        metadata,
        body: compact.body,
      }
    })
  }
}
