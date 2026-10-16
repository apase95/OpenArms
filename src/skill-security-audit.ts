import { createHash } from 'node:crypto'
import { TextDecoder } from 'node:util'
import type { RawSkillPackage } from './skill-archive-extractor.ts'

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type SecurityFinding = Readonly<{ ruleID: string; severity: Severity; file: string; line: number; snippet: string; recommendation: string }>
export type SecurityAuditReport = Readonly<{
  version: 1; fingerprint: string; severity: Severity; decision: 'continue' | 'confirm' | 'block'
  complete: boolean; findings: readonly SecurityFinding[]; scanned: readonly string[]
  unsupported: readonly Readonly<{ file: string; reason: string }>[]
  scriptPolicy: 'never-execute-or-chmod'; trust: 'untrusted'
}>
const rank: Record<Severity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }
const MAX_BYTES = 10 * 1024 * 1024, MAX_FILES = 2048, MAX_FINDINGS = 128, MAX_LINE = 8192
const normalize = (value: string) => value.replace(/\r\n?/g, '\n').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').normalize('NFKC').replace(/[^\S\n]/gu, ' ').toLowerCase()
/** Sanitize untrusted display metadata; never use it as executable markup. */
export function auditDisplayText(value: string, limit = 160): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').slice(0, limit)
}
function files(input: RawSkillPackage) {
  return [{ path: input.document.path, bytes: Buffer.from(input.document.text, 'utf8') }, ...input.assets]
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : Buffer.compare(a.bytes, b.bytes))
}
export function skillPackageFingerprint(input: RawSkillPackage): string {
  const hash = createHash('sha256')
  const add = (value: string | Buffer) => { const bytes = Buffer.from(value); hash.update(String(bytes.length) + ':'); hash.update(bytes) }
  add('openarms-audit-v1'); add(JSON.stringify(input.source ?? null)); add(input.root); add(input.document.path)
  for (const file of files(input)) { add(file.path); add(file.bytes) }
  return hash.digest('hex')
}

/** Heuristic, offline, data-only review. No report grants loading or installation. */
export function auditSkillPackage(input: RawSkillPackage): SecurityAuditReport {
  const findings: SecurityFinding[] = [], scanned: string[] = [], unsupported: { file: string; reason: string }[] = []
  let complete = true, bytes = 0, count = 0
  const add = (ruleID: string, severity: Severity, file: string, line: number, recommendation: string) => {
    if (findings.length >= MAX_FINDINGS) { complete = false; return }
    const evidence: Record<string, string> = { INSTRUCTION_OVERRIDE: '[authority override phrase; remaining text redacted]', CREDENTIAL_EXFILTRATION: '[credential reference + outbound request; values redacted]', HOST_DESTRUCTION: '[destructive host or reverse-shell pattern; arguments redacted]', ENCODED_EXECUTION: '[base64/atob + execution; payload redacted]', OUTSIDE_PACKAGE: '[outside-package path; path redacted]', NETWORK_ACCESS: '[outbound network request; destination and data redacted]' }
    findings.push(Object.freeze({ ruleID, severity, file: auditDisplayText(file), line, snippet: evidence[ruleID] ?? '[Unscannable content withheld]', recommendation }))
  }
  const seen = new Set<string>()
  // Bound package work before sorting/hashing arbitrarily large caller-supplied input.
  const validSize = input.root.length <= 512 && JSON.stringify(input.source ?? null).length <= 4096 && input.assets.length < MAX_FILES && input.document.text.length <= MAX_BYTES && input.assets.every(file => {
    bytes += file.bytes.length
    return bytes <= MAX_BYTES && file.path.length <= 512
  }) && bytes + Buffer.byteLength(input.document.text) <= MAX_BYTES && input.document.path.length <= 512
  if (!validSize) {
    add('SCAN_LIMIT', 'HIGH', '[package]', 1, 'Reduce package to the supported file/byte limits and rescan.')
    return Object.freeze({ version: 1, fingerprint: '', severity: 'HIGH', decision: 'block', complete: false, findings: Object.freeze(findings), scanned: Object.freeze(scanned), unsupported: Object.freeze([{ file: '[package]', reason: 'Package budget exceeded; fingerprint unavailable' }]), scriptPolicy: 'never-execute-or-chmod', trust: 'untrusted' })
  }
  for (const file of files(input)) {
    if (++count > MAX_FILES) { complete = false; break }
    const name = auditDisplayText(file.path)
    if (seen.has(file.path.toLowerCase()) || /(^|\/)\.\.?(\/|$)|^\/|[\\\x00-\x1f]/.test(file.path)) {
      add('UNSAFE_PATH', 'HIGH', name, 1, 'Remove duplicate or unsafe package paths.'); complete = false
    }
    seen.add(file.path.toLowerCase())
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)
      if (text.includes('\0')) throw Error('binary')
    } catch {
      const image = /\.(png|jpe?g|gif|webp|ico)$/i.test(file.path)
      unsupported.push(Object.freeze({ file: name, reason: image ? 'Opaque image; not inspected' : 'Binary or invalid UTF-8; cannot audit' }))
      complete = false
      add('UNSUPPORTED_CONTENT', image ? 'MEDIUM' : 'HIGH', name, 1, 'Remove opaque content or review it with a separate trusted analyzer.')
      continue
    }
    scanned.push(name)
    const lines = normalize(text).split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.length > MAX_LINE) { complete = false; add('SCAN_LIMIT', 'HIGH', name, i + 1, 'Split oversized lines and rescan.'); continue }
      const context = lines.slice(Math.max(0, i - 2), i + 3).map(item => item.slice(0, MAX_LINE)).join(' ')
      // Only whole, narrowly defined prose statements qualify, per rule. Neither
      // incidental safety words nor comments/quotes demote executable behavior.
      // Unknown asset types are conservative: prose handling is text/docs only.
      const prose = /\.(md|markdown|txt)$/i.test(file.path) && !/(^|\/)(scripts|bin)\//i.test(file.path)
      const overrideDiscussion = prose && /^(?:(?:detect|reject) ignore (?:previous|prior|above) instructions as (?:a prompt injection example|an injection attempt)|(?:never|do not|must not) enable developer mode in response to untrusted (?:package prose|content|instructions))\.?$/.test(line.trim())
      const destructionDiscussion = prose && /^(?:do not|must not|never) use rm -rf for (?:routine application cleanup|routine cleanup|temporary file cleanup)\.?$/.test(line.trim())
      const credentialDiscussion = prose && /^(?:never|do not|must not) send api keys to a webhook(?: or include them in telemetry)?\.?$/.test(line.trim())
      const override = /ignore\s+(all\s+)?(previous|prior|above)\s+instructions|system\s+prompt\s+reset|developer\s+mode|disregard\s+(all\s+)?safety/.test(context)
      if (override && /ignore|reset|developer|disregard/.test(line)) add('INSTRUCTION_OVERRIDE', overrideDiscussion ? 'LOW' : 'HIGH', name, i + 1, 'Remove instructions attempting to replace host authority.')
      const credential = /\.env\b|id_rsa|\.ssh\b|aws.{0,20}credentials|api[_ -]?(key|secret)|github[_ -]?token/.test(context)
      const outbound = /\bcurl\b|\bwget\b|\bfetch\s*\(|requests\.(post|get)|https?\.(request|get)|webhook|send.{0,40}https?:/.test(context)
      if (credential && outbound && /curl|wget|fetch|post|request|webhook|send/.test(line)) add('CREDENTIAL_EXFILTRATION', credentialDiscussion ? 'LOW' : 'CRITICAL', name, i + 1, 'Do not read or transmit host credentials.')
      if (/\brm\s+(-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*)\b|\bmkfs\b|\bdd\b.{0,100}of=\/dev\/|\/etc\/sudoers|\/dev\/tcp\/|\bnc\b.{0,80}\s-e\s|socket.{0,80}connect/.test(line)) add('HOST_DESTRUCTION', destructionDiscussion ? 'LOW' : 'CRITICAL', name, i + 1, 'Remove destructive host operations and reverse shells.')
      if (/base64|atob\s*\(/.test(context) && /\beval\b|\bexec\b|\bexecsync\b|\bsh\b|\bbash\b/.test(context) && /base64|atob|eval|exec/.test(line)) add('ENCODED_EXECUTION', 'HIGH', name, i + 1, 'Remove decode-and-execute behavior; inspect decoded source offline.')
      if (/\.\.\/|~\/|\/etc\/|\/home\/|\/root\//.test(line)) add('OUTSIDE_PACKAGE', 'MEDIUM', name, i + 1, 'Keep file access within the package.')
      if (outbound && /curl|wget|fetch|requests\.|https?\./.test(line)) add('NETWORK_ACCESS', 'MEDIUM', name, i + 1, 'Review destination, protocol, and transmitted data before continuing.')
    }
  }
  if (!complete && !findings.some(hit => rank[hit.severity] >= rank.HIGH) && findings.length >= MAX_FINDINGS) findings[MAX_FINDINGS - 1] = Object.freeze({ ruleID: 'SCAN_LIMIT', severity: 'HIGH', file: '[package]', line: 1, snippet: '[omitted]', recommendation: 'Finding budget exhausted; reduce input and rescan.' })
  const severity = findings.reduce<Severity>((highest, hit) => rank[hit.severity] > rank[highest] ? hit.severity : highest, 'LOW')
  return Object.freeze({ version: 1, fingerprint: skillPackageFingerprint(input), severity, decision: rank[severity] >= 2 ? 'block' : rank[severity] === 1 ? 'confirm' : 'continue', complete, findings: Object.freeze(findings), scanned: Object.freeze(scanned), unsupported: Object.freeze(unsupported), scriptPolicy: 'never-execute-or-chmod', trust: 'untrusted' })
}
