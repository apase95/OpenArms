import { auditSkillPackage, auditDisplayText, type SecurityAuditReport } from './skill-security-audit.ts'
import { extractSkillArchive, type RawSkillPackage } from './skill-archive-extractor.ts'
import { parseGithubSource, withSkillDownload, type FetchSeams } from './skill-remote-fetcher.ts'

/** User risk-choice intent, never proof of completed review or reusable authorization. */
export type AuditOverrideRecord = Readonly<{ event: 'STAGED_AUDIT_RISK_OVERRIDE'; phase: 'risk-choice-intent'; outcome: 'pending-final-validation'; fingerprint: string; reportFingerprint: string; source: string; severity: 'MEDIUM'; authority: 'staged-review-only' }>
export type AuditReviewUI = { choose: (title: string, message: string, yes: string, no: string) => Promise<boolean>; record: (record: AuditOverrideRecord) => Promise<void> }
const reportKey = (report: SecurityAuditReport) => JSON.stringify(report)

export function chooseAuditDialog(api: any, render: (props: any) => any, title: string, message: string, yes: string, no: string, timeoutMs = 60_000): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false
    const finish = (value: unknown) => {
      if (settled) return
      settled = true; clearTimeout(timer)
      try { api.ui.dialog.clear(); resolve(value === true) } catch { resolve(false) }
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    try {
      api.lifecycle.onDispose(() => finish(false))
      api.ui.dialog.replace(() => render({ title, message, yes, no, onConfirm: finish }), () => finish(false))
      api.ui.dialog.setSize('large')
    } catch { finish(false) }
  })
}

/** Boolean responses are private to this invocation and never returned as install authority. */
export async function reviewSkillAudit(input: RawSkillPackage, report: SecurityAuditReport, ui: AuditReviewUI): Promise<'denied' | 'staged-review-only'> {
  const expected = reportKey(auditSkillPackage(input))
  if (!report.fingerprint || expected !== reportKey(report)) return 'denied'
  const unchanged = () => expected === reportKey(auditSkillPackage(input)) && expected === reportKey(report)
  const source = auditDisplayText(input.source?.url ?? '[offline package]')
  const message = [source, `Severity: ${report.severity}. Audit only: no installation, loading, or registry write.`,
    ...report.findings.slice(0, 3).map(hit => `${hit.severity} ${hit.file}:${hit.line} ${hit.ruleID}\n${hit.snippet}\n${hit.recommendation}`),
    report.findings.length > 3 ? 'Additional findings omitted from this bounded preview.' : '',
    `Scanned ${report.scanned.length}; unsupported ${report.unsupported.length}; complete ${report.complete}. Heuristic review is not a safety proof.`].join('\n')
  try {
    if (report.decision === 'block') {
      await ui.choose('Security audit blocked', message, 'Close (blocked)', 'Cancel')
      return 'denied'
    }
    if (!await ui.choose('Staged security audit', message, report.decision === 'confirm' ? 'Continue despite risk (audit only)' : 'Continue staged review', 'Cancel')) return 'denied'
    if (!unchanged()) return 'denied'
    if (report.decision === 'confirm') {
      // No raw findings, filenames, credential snippets or arbitrary source metadata in the event.
      const { createHash } = await import('node:crypto')
      if (!unchanged()) return 'denied'
      await ui.record(Object.freeze({ event: 'STAGED_AUDIT_RISK_OVERRIDE', phase: 'risk-choice-intent', outcome: 'pending-final-validation', fingerprint: report.fingerprint,
        reportFingerprint: createHash('sha256').update(expected).digest('hex'), source: createHash('sha256').update(source).digest('hex'), severity: 'MEDIUM', authority: 'staged-review-only' }))
    }
    return unchanged() ? 'staged-review-only' : 'denied'
  } catch { return 'denied' }
}

/** Production caller keeps extraction, scanning and review inside download cleanup. */
export async function stageSkillAudit(url: string, ui: AuditReviewUI, seams?: FetchSeams) {
  const source = parseGithubSource(url)
  return withSkillDownload(source, async archive => {
    const input = extractSkillArchive(archive, { source })
    return reviewSkillAudit(input, auditSkillPackage(input), ui)
  }, seams)
}
