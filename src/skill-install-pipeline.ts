import path from 'node:path'
import { parseInstallCommand, resolveSkillScope } from './skill-scope-resolver.ts'
import { parseGithubSource, withSkillDownload, type FetchSeams } from './skill-remote-fetcher.ts'
import { extractSkillArchive } from './skill-archive-extractor.ts'
import { decompileSkillPackage } from './skill-decompiler-service.ts'
import { registerDecompiledSkill } from './skill-decompiler-writer.ts'
import { requireDecompilerModel, type SelectedDecompilerModel, type DecompilerModelAdapter } from './skill-model-adapter.ts'
import type { AuditReviewUI } from './skill-audit-review.ts'

/** Host-owned install orchestration. No library switch, selection, loading or fallback. */
export async function installSkill(input: string, options: {
  projectRoot: string; selectedModel: SelectedDecompilerModel; adapter: DecompilerModelAdapter
  ui: AuditReviewUI; progress: (stage: string) => void; signal?: AbortSignal
  fetchSeams?: FetchSeams; env?: Record<string, string | undefined>
}) {
  const command = parseInstallCommand(input), selectedModel = requireDecompilerModel(options.selectedModel)
  const check = () => { if (options.signal?.aborted) throw Error('INSTALL_CANCELLED') }
  check()
  if (!await options.ui.choose('Send source to selected model?', `${command.url}\nScope: ${command.scope}; overwrite: ${command.overwrite}\nModel: ${selectedModel.providerID}/${selectedModel.modelID}\nPackage text and text assets will be sent to this model. Up to 16 calls, 30s each; no billing cap. Host project/plugin context may be included. No tools or fallback model. Installation requires separate final approval.`, 'Send and review', 'Cancel')) throw Error('INSTALL_CANCELLED')
  check(); options.progress('[1/4] Fetching...')
  return withSkillDownload(parseGithubSource(command.url), async archive => {
    check(); options.progress('[2/4] Security Scanning...')
    const raw = extractSkillArchive(archive, { source: parseGithubSource(command.url) })
    const review = { ...options.ui, choose: async (...args: Parameters<AuditReviewUI['choose']>) => { check(); const answer = await options.ui.choose(...args); check(); return answer } }
    const draft = await decompileSkillPackage(raw, { selectedModel, adapter: { ...options.adapter, generate: call => { check(); options.progress('[3/4] AI Restructuring...'); return options.adapter.generate(call) } }, callerAuditReviewUI: review, signal: options.signal })
    check()
    const plan = resolveSkillScope({ projectRoot: options.projectRoot, skillName: draft.skill.id, scope: command.scope, overwrite: command.overwrite, env: options.env })
    const result = await registerDecompiledSkill(raw, draft, { scopePlan: plan, callerAuditReviewUI: review, confirmWrite: async request => {
      check()
      const allowed = await options.ui.choose('Install verified skill?', `Target: ${request.target}\nRegistry: ${plan.registry}\nOverwrite: ${plan.overwrite}\nSource fingerprint: ${request.fingerprint}\nFiles: ${request.files.join(', ')}\nThis writes and registers only. No automatic library switch, selection or load.`, 'Install', 'Cancel')
      check(); return allowed
    } })
    options.progress('[4/4] Verified!')
    return Object.freeze({ id: draft.skill.id, root: path.dirname(plan.registry), registry: plan.registry, target: result.target, references: draft.skill.references.length, coreEstimate: draft.report.coreEstimate, estimator: draft.report.estimator, model: selectedModel })
  }, options.fetchSeams)
}
