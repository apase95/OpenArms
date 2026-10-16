import { createHash } from 'node:crypto'
import { TextDecoder } from 'node:util'
import type { RawSkillPackage } from './skill-archive-extractor.ts'
import { auditSkillPackage, skillPackageFingerprint } from './skill-security-audit.ts'
import { reviewSkillAudit, type AuditReviewUI } from './skill-audit-review.ts'
import { DECOMPILED_SKILL_SCHEMA, parseDecompiledSkill, validateDecompiledSkill, estimateTokensByUtf8Bytes, type TokenEstimator, type DecompiledSkill, type ValidationReport } from './skill-decompiler.ts'
import { boundedModelOperation, requireDecompilerModel, type DecompilerModelAdapter, type SelectedDecompilerModel } from './skill-model-adapter.ts'

export const DECOMPILER_SERVICE_LIMITS = Object.freeze({ inputBytes: 10 * 1024 * 1024, sourceBytes: 1024 * 1024, calls: 16, chunkEstimate: 30000, chunkBytes: 30000, overlapChars: 128, mergeBytes: 900000, timeoutMs: 30000 })
const fail = (code: string): never => { throw Error(`DECOMPILER_SERVICE_${code}`) }
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
function decoded(bytes: Buffer): string | undefined {
  try { const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); return text.includes('\0') ? undefined : text } catch { return undefined }
}
/** Exact source format v1: main text unchanged, then sorted text assets preceded by
 * a non-heading JSON path marker. Binary manifest is separate prompt data, never
 * bytes. Markers intentionally introduce no fake Markdown coverage headings.
 * Writer must recompute this function from its own raw input, not trust draft.source.
 */
export function buildDecompilerSource(raw: RawSkillPackage): string {
  if (!auditSkillPackage(raw).fingerprint) fail('INPUT_LIMIT')
  let source = raw.document.text
  for (const asset of [...raw.assets].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    const text = decoded(asset.bytes)
    if (text !== undefined) source += `\n\n[openarms-text-asset ${JSON.stringify(asset.path)}]\n${text}`
  }
  if (Buffer.byteLength(source) > DECOMPILER_SERVICE_LIMITS.sourceBytes) fail('SOURCE_LIMIT')
  return source
}
export type DecompilerAssetMetadata = Readonly<{ path: string; bytes: number; sha256: string; kind: 'text' | 'binary' }>
export type ValidatedDecompilerDraft = Readonly<{
  kind: 'validated-decompiler-draft'; version: 1; trust: 'unregistered'; rawFingerprint: string; source: string
  skill: DecompiledSkill; report: ValidationReport; assets: readonly DecompilerAssetMetadata[]
  selectedModel: SelectedDecompilerModel; stats: Readonly<{ calls: number; chunks: number; compacted: boolean }>
  limits: typeof DECOMPILER_SERVICE_LIMITS; limitations: readonly string[]
}>
export type DecompileSkillOptions = {
  adapter: DecompilerModelAdapter; selectedModel: SelectedDecompilerModel; callerAuditReviewUI: AuditReviewUI
  estimateTokens?: TokenEstimator; signal?: AbortSignal; timeoutMs?: number; maxCalls?: number
}
function evidence(source: string) {
  const constraints = source.split(/\r\n?|\n/).map(line => line.replace(/^\s*(?:[-*+] |\d+[.)] )/, '').trim()).filter(line => /\b(must|shall|never|do not|cannot|invariant|prohibited|required)\b/i.test(line))
  const sections = [...source.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => match[1])
  return { constraints, sections }
}
const normal = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
function retain(source: string, output: string) {
  const required = evidence(source), text = normal(output)
  if ([...required.constraints, ...required.sections].some(value => !text.includes(normal(value)))) fail('CHUNK_COVERAGE')
}
/** Processing review only. Return value is NOT a write/install/load capability.
 * Caller must opt into sending package text to selected model. No TUI wiring or
 * registry side effects. Buffers are copied privately; return exposes metadata
 * rather than mutable byte arrays. Writer separately acquires/revalidates assets.
 */
export async function decompileSkillPackage(raw: RawSkillPackage, options: DecompileSkillOptions): Promise<ValidatedDecompilerDraft> {
  const selectedModel = requireDecompilerModel(options.selectedModel)
  const maxCalls = options.maxCalls ?? DECOMPILER_SERVICE_LIMITS.calls, timeoutMs = options.timeoutMs ?? DECOMPILER_SERVICE_LIMITS.timeoutMs
  if (!Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 16 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000 || !options.callerAuditReviewUI || typeof options.callerAuditReviewUI.choose !== 'function' || typeof options.callerAuditReviewUI.record !== 'function') fail('CONFIG')
  // Audit bounds work before fingerprinting/copying arbitrary input.
  const initial = auditSkillPackage(raw)
  if (!initial.fingerprint) fail('INPUT_LIMIT')
  const fingerprint = initial.fingerprint
  const snapshot: RawSkillPackage = Object.freeze({ trust: 'untrusted', source: raw.source ? Object.freeze({ ...raw.source }) : undefined, root: raw.root,
    document: Object.freeze({ ...raw.document }), assets: Object.freeze(raw.assets.map(a => Object.freeze({ path: a.path, bytes: Buffer.from(a.bytes) }))) })
  const unchanged = () => {
    const report = auditSkillPackage(raw)
    if (report.fingerprint !== fingerprint || skillPackageFingerprint(snapshot) !== fingerprint) fail('INPUT_CHANGED')
    if (options.signal?.aborted) fail('ABORTED')
  }
  unchanged()
  if (await reviewSkillAudit(snapshot, auditSkillPackage(snapshot), options.callerAuditReviewUI) !== 'staged-review-only') fail('AUDIT_DENIED')
  unchanged()
  const source = buildDecompilerSource(snapshot), estimate = options.estimateTokens ?? estimateTokensByUtf8Bytes
  const requiredEvidence = evidence(source)
  if (!requiredEvidence.constraints.length || requiredEvidence.constraints.length > 256 || !requiredEvidence.sections.length || requiredEvidence.sections.length > 128) fail('HUMAN_REVIEW_EVIDENCE')
  const count = (text: string) => { const n = estimate(text); if (!Number.isSafeInteger(n) || n < 0) fail('TOKEN_ESTIMATOR'); return n }
  const assets = Object.freeze(snapshot.assets.map(a => Object.freeze({ path: a.path, bytes: a.bytes.length, sha256: hash(a.bytes), kind: decoded(a.bytes) === undefined ? 'binary' as const : 'text' as const })))
  let calls = 0, compacted = false
  const call = async (data: unknown, schema: Readonly<Record<string, unknown>>) => {
    unchanged()
    if (++calls > maxCalls) fail('CALL_LIMIT')
    const prompt = JSON.stringify(data)
    if (Buffer.byteLength(prompt) > 1024 * 1024) fail('PROMPT_LIMIT')
    const controller = new AbortController(), abort = () => controller.abort()
    options.signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, timeoutMs)
    try {
      const result = await boundedModelOperation(() => options.adapter.generate({ selectedModel, prompt, schema, signal: controller.signal, timeoutMs }), controller.signal)
      unchanged()
      if (typeof result !== 'string' || Buffer.byteLength(result) > 262144) fail('OUTPUT_LIMIT')
      return result
    } catch (cause) {
      if (cause instanceof Error && /^DECOMPILER_(?:MODEL|SERVICE)_[A-Z_]+$/.test(cause.message)) throw cause
      fail('MODEL_REQUEST_FAILED')
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort) }
  }
  // Split whole lines where possible, keeping literal constraints/headings intact.
  const chunks: { start: number; end: number; text: string }[] = []
  if (count(source) <= 30000 && Buffer.byteLength(source) <= 30000) chunks.push({ start: 0, end: source.length, text: source })
  else {
    let start = 0
    while (start < source.length) {
      let end = Math.min(start + 30000, source.length)
      while (end > start && (Buffer.byteLength(source.slice(start, end)) > 30000 || count(source.slice(start, end)) > 30000)) end = start + Math.floor((end - start) / 2)
      if (end < source.length) { const line = source.lastIndexOf('\n', end); if (line > start) end = line + 1 }
      if (end <= start || (end < source.length && source[end - 1] !== '\n')) fail('CHUNK_LINE_LIMIT')
      chunks.push({ start, end, text: source.slice(start, end) })
      if (chunks.length + 2 > maxCalls) fail('CALL_LIMIT')
      if (end === source.length) break
      const overlap = source.indexOf('\n', Math.max(start + 1, end - 128)) + 1
      start = overlap > start && overlap < end ? overlap : end
    }
  }
  let skill: DecompiledSkill
  if (chunks.length === 1) skill = parseDecompiledSkill(await call({ kind: 'untrusted-source-data', source, assets }, DECOMPILED_SKILL_SCHEMA))
  else {
    const schema = { type: 'object', additionalProperties: false, required: ['index', 'summary'], properties: { index: { type: 'integer' }, summary: { type: 'string', minLength: 1, maxLength: 32768 } } }
    const partials: { index: number; start: number; end: number; summary: string }[] = []
    for (const [index, chunk] of chunks.entries()) {
      let partial: any
      const response = await call({ kind: 'untrusted-chunk-data', task: 'Summarize this chunk; retain every explicit constraint and heading literally. Return index and summary only.', index, ...chunk }, schema)
      try { partial = JSON.parse(response) } catch { fail('PARTIAL_JSON') }
      if (!partial || Object.keys(partial).sort().join(',') !== 'index,summary' || partial.index !== index || typeof partial.summary !== 'string' || !partial.summary.trim() || Buffer.byteLength(partial.summary) > 32768) fail('PARTIAL_SHAPE')
      retain(chunk.text, partial.summary)
      partials.push({ index, start: chunk.start, end: chunk.end, summary: partial.summary })
    }
    if (Buffer.byteLength(JSON.stringify(partials)) > DECOMPILER_SERVICE_LIMITS.mergeBytes) fail('MERGE_LIMIT')
    skill = parseDecompiledSkill(await call({ kind: 'untrusted-ordered-partials', task: 'Merge in source order; preserve every literal constraint, heading and asset link. Return final skill JSON.', partials, assets }, DECOMPILED_SKILL_SCHEMA))
  }
  if (count(skill.coreInterface) >= 800) {
    compacted = true
    const previous = skill
    skill = parseDecompiledSkill(await call({ kind: 'untrusted-compact-data', task: 'Compact core below 800 estimated tokens; retain all constraints and reference map. No truncation.', skill, evidence: evidence(source) }, DECOMPILED_SKILL_SCHEMA))
    if (skill.id !== previous.id || previous.references.some(ref => !skill.references.some(r => r.id === ref.id))) fail('COMPACT_REFERENCE_MAP')
  }
  const validated = validateDecompiledSkill(source, skill, { estimateTokens: options.estimateTokens, assets: assets.map(a => a.path) })
  // Original local asset links must survive transformation, not merely be allowed.
  const rendered = [skill.coreInterface, ...skill.references.map(r => r.content)].join('\n')
  for (const [, link] of source.matchAll(/!?\[[^\]\n]*\]\(([^)\n]*)\)/g)) if (assets.some(a => a.path === link) && !rendered.includes(`](${link})`)) fail('ASSET_LINK_MISSING')
  const generated: RawSkillPackage = { trust: 'untrusted', root: '', document: { path: 'SKILL.md', text: `${skill.description}\n${skill.coreInterface}` }, assets: [
    ...skill.references.map(r => ({ path: `references/${r.id}.md`, bytes: Buffer.from(`${r.title}\n${r.content}`) })), ...snapshot.assets.map(a => ({ path: a.path, bytes: Buffer.from(a.bytes) })),
  ] }
  if (await reviewSkillAudit(generated, auditSkillPackage(generated), options.callerAuditReviewUI) !== 'staged-review-only') fail('OUTPUT_AUDIT_DENIED')
  unchanged()
  return Object.freeze({ kind: 'validated-decompiler-draft', version: 1, trust: 'unregistered', rawFingerprint: fingerprint, source, skill: validated.skill, report: validated.report, assets,
    selectedModel, stats: Object.freeze({ calls, chunks: chunks.length, compacted }), limits: DECOMPILER_SERVICE_LIMITS,
    limitations: Object.freeze(['Processing review only; writer must independently revalidate raw input, assets, generated output and explicit write authorization.', 'Literal evidence is not semantic proof; implicit meaning and uncovered prose require human review.', ...(options.adapter.limitations ?? [])]) })
}
