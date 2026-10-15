import { validateRegistry, readEntry, hashBytes, estimateTokens, estimatorVersion } from '../scripts/registry-v2.mjs'

const id = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const reject = code => { throw Object.assign(new Error(code), { loaderCode: code }) }
export const verifiedRequestSchema = Object.freeze({
  type: 'object', additionalProperties: false, required: ['skill'],
  properties: Object.fromEntries(['skill', 'workflow', 'reference'].map(key => [key, { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }])),
  not: { required: ['workflow', 'reference'] },
})
export function validateVerifiedRequest(request) {
  if (!object(request) || !Object.hasOwn(request, 'skill') || Object.keys(request).some(key => !['skill', 'workflow', 'reference'].includes(key)) || Object.values(request).some(value => !id(value)) || (Object.hasOwn(request, 'workflow') && Object.hasOwn(request, 'reference'))) reject('INVALID_REQUEST')
  return { ...request }
}
const categories = ['core', 'optional', 'router', 'workflow', 'reference']
export function validateBudgetPolicy(policy) {
  if (!object(policy) || policy.estimatorVersion !== estimatorVersion || Object.keys(policy).sort().join(',') !== 'categories,estimatorVersion,responseMaximum' || !Number.isSafeInteger(policy.responseMaximum) || policy.responseMaximum < 1 || !object(policy.categories) || Object.keys(policy.categories).sort().join(',') !== [...categories].sort().join(',')) reject('INVALID_BUDGET_POLICY')
  for (const rule of Object.values(policy.categories)) {
    if (!object(rule) || Object.keys(rule).sort().join(',') !== 'enforcement,maximum' || !['hard', 'report-only'].includes(rule.enforcement) || (rule.maximum !== null && (!Number.isSafeInteger(rule.maximum) || rule.maximum < 1)) || (rule.enforcement === 'hard' && rule.maximum === null)) reject('INVALID_BUDGET_POLICY')
  }
  return structuredClone(policy)
}
/** Audit exactly serialized response bytes; source rows count content bytes separately.
 * Estimator changes require a new policy version/baseline, never silent recalibration. */
export function auditVerifiedResponse(response, policy, router = '') {
  policy = validateBudgetPolicy(policy)
  const entries = response.sources.map(source => {
    const bytes = Buffer.byteLength(source.content), estimatedTokens = estimateTokens(Buffer.from(source.content))
    const rule = policy.categories[source.category]
    const maximum = rule.maximum === null ? source.maximum : Math.min(rule.maximum, source.maximum)
    return { id: source.id, category: source.category, bytes, estimatedTokens, maximum, delta: estimatedTokens - maximum, enforcement: rule.enforcement }
  })
  if (router) {
    const bytes = Buffer.byteLength(router), rule = policy.categories.router, estimatedTokens = estimateTokens(Buffer.from(router))
    entries.push({ id: 'router', category: 'router', bytes, estimatedTokens, maximum: rule.maximum, delta: rule.maximum === null ? null : estimatedTokens - rule.maximum, enforcement: rule.enforcement })
  }
  entries.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const bytes = Buffer.byteLength(JSON.stringify(response)), estimatedTokens = estimateTokens(Buffer.from(JSON.stringify(response)))
  return { estimatorVersion, bytes, estimatedTokens, maximum: policy.responseMaximum, delta: estimatedTokens - policy.responseMaximum,
    entries, topContributors: [...entries].sort((a, b) => b.bytes - a.bytes || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(({ id, bytes }) => ({ id, bytes })),
    failed: estimatedTokens > policy.responseMaximum || entries.some(row => row.enforcement === 'hard' && row.delta > 0) }
}
const defaultPolicy = { estimatorVersion, responseMaximum: 12500, categories: Object.fromEntries(categories.map(category => [category, { maximum: null, enforcement: category === 'reference' || category === 'router' ? 'report-only' : 'hard' }])) }
// Entry maxTokens supplies the hard ceiling; router has no implicit hard ceiling.
defaultPolicy.categories.core.maximum = Number.MAX_SAFE_INTEGER
defaultPolicy.categories.optional.maximum = Number.MAX_SAFE_INTEGER
defaultPolicy.categories.workflow.maximum = Number.MAX_SAFE_INTEGER

function fileError(error) {
  if (error.loaderCode) return error.loaderCode
  if (error.code === 'ENOENT') return 'FILE_MISSING'
  if (error.result?.rule === 'regular-file') return 'NON_REGULAR_FILE'
  if (error.result?.rule === 'concurrent-file') return 'CONCURRENT_FILE_CHANGE'
  if (error.result?.rule === 'platform') return 'UNSUPPORTED_PLATFORM'
  if (['symlink', 'realpath', 'root', 'skill-root'].includes(error.result?.rule) || ['ELOOP', 'ENOTDIR'].includes(error.code)) return 'UNSAFE_PATH'
  return 'READ_ERROR'
}
/** Trusted host creates this synchronous in-memory seam. No persistence or tool activation.
 * Hooks exist for deterministic race fixtures; never model-provided callbacks. */
export function createVerifiedLoader({ root, registry, approvedRevision = false, budgetPolicy = defaultPolicy, hooks = {}, audit = () => {} }) {
  let current = structuredClone(registry), approved = approvedRevision === true, generation = 0
  const budgets = validateBudgetPolicy(budgetPolicy)
  let grants = [], records = [], locks = []
  let busy = false
  const revision = () => hashBytes(Buffer.from(JSON.stringify(current)))
  const contextValid = context => object(context) && ['project', 'session', 'task'].every(key => typeof context[key] === 'string' && context[key].length > 0)
  function authorize(request, context) {
    if (!contextValid(context)) reject('INVALID_CONTEXT')
    if (!object(current?.skills) || !Object.hasOwn(current.skills, request.skill)) reject('UNKNOWN_SKILL')
    const skill = current.skills[request.skill]
    if (!approved || !/^sha256:[a-f0-9]{64}$/.test(skill?.contentHash ?? '')) reject('UNVERIFIED')
    try { validateRegistry(current) } catch { reject('UNVERIFIED') }
    if (Object.hasOwn(context, 'enabledSkills')) {
      if (!Array.isArray(context.enabledSkills) || context.enabledSkills.some(value => !id(value))) reject('INVALID_CONTEXT')
      if (!context.enabledSkills.includes(request.skill)) reject('DISABLED')
    }
    const group = request.workflow ? 'workflows' : request.reference ? 'references' : null
    const childId = request.workflow ?? request.reference
    if (group && !Object.hasOwn(skill[group], childId)) reject(request.workflow ? 'INVALID_WORKFLOW' : 'INVALID_REFERENCE')
    if (skill.defaultPermission === 'deny') reject('DENIED')
    const rev = revision()
    const grant = grants.find(item => item.skill === request.skill && item.revision === rev && item.project === context.project && (item.scope === 'project' || item.session === context.session) && (item.scope !== 'once' || item.task === context.task))
    if ((skill.defaultPermission === 'ask' || context.requireApprovalSkills?.includes(request.skill)) && !grant) reject('APPROVAL_REQUIRED')
    if (locks.some(lock => lock.project === context.project && lock.session === context.session && lock.task === context.task && lock.owner !== skill.owner)) reject('TASK_CONFLICT')
    return { skill, group, childId, grant, rev }
  }
  function emit(event) { try { audit(structuredClone(event)) } catch { /* Audit sink failure must not leak content or turn a commit into a false failure. */ } }
  return {
    schema: verifiedRequestSchema,
    replaceRegistry(next, { approvedRevision: approval = false } = {}) {
      current = structuredClone(next); approved = approval === true; generation++
      grants = []; // Explicit source/revision approval required again, including metadata-only changes.
    },
    restore(snapshot, { taskState = false } = {}) {
      // Trusted persisted metadata only; authorization is always derived again.
      if (!object(snapshot) || !['grants', 'records', 'locks'].every(key => Array.isArray(snapshot[key]))) reject('INVALID_STATE')
      const rev = revision()
      grants = snapshot.grants.filter(item => object(item) && id(item.skill) && ['once', 'session', 'project'].includes(item.scope)
        && typeof item.project === 'string' && item.project.length > 0 && item.revision === rev
        && item.owner === current.skills?.[item.skill]?.owner
        && current.skills?.[item.skill]?.defaultPermission !== 'deny'
        && (item.scope === 'project' || (typeof item.session === 'string' && item.session.length > 0))
        && (item.scope !== 'once' || (taskState && typeof item.task === 'string' && item.task.length > 0))).map(item => structuredClone(item))
      records = structuredClone(snapshot.records.slice(-20))
      locks = taskState ? structuredClone(snapshot.locks) : []
    },
    grant(request, context, scope) {
      request = validateVerifiedRequest(request)
      if (!contextValid(context) || !['once', 'session', 'project'].includes(scope)) reject('INVALID_GRANT')
      try { authorize(request, context) } catch (error) { if (error.loaderCode !== 'APPROVAL_REQUIRED') throw error }
      const item = { skill: request.skill, owner: current.skills[request.skill].owner, scope, project: context.project, revision: revision(), ...(scope !== 'project' ? { session: context.session } : {}), ...(scope === 'once' ? { task: context.task } : {}) }
      grants = [...grants.filter(old => !(old.skill === item.skill && old.scope === scope && old.project === item.project && old.session === item.session)), item].slice(-200)
      return structuredClone(item)
    },
    revoke(request, context, scope) {
      request = validateVerifiedRequest(request)
      if (!contextValid(context) || !['once', 'session', 'project'].includes(scope)) reject('INVALID_GRANT')
      grants = grants.filter(item => !(item.skill === request.skill && item.project === context.project && item.scope === scope
        && (scope === 'project' || item.session === context.session)
        && (scope !== 'once' || item.task === context.task)))
    },
    inspect() { return structuredClone({ grants, records, locks }) },
    status(request, context) {
      try { authorize(validateVerifiedRequest(request), context); return { state: 'Enabled', decision: 'allow', reason: 'AUTHORIZED' } }
      catch (error) { const code = fileError(error); return { state: code === 'APPROVAL_REQUIRED' ? 'Available' : ['UNVERIFIED', 'UNKNOWN_SKILL'].includes(code) ? 'Unverified' : 'Denied', decision: code === 'APPROVAL_REQUIRED' ? 'ask' : 'deny', reason: code } }
    },
    load_verified_skill(input, hostContext) {
      let request, acquired = false
      try {
        request = validateVerifiedRequest(input)
        const context = structuredClone(hostContext), startGeneration = generation
        if (busy) reject('CONCURRENT_LOAD')
        busy = true; acquired = true
        const auth = authorize(request, context)
        const selected = [[request.skill, auth.skill, auth.skill.kind], ...(auth.group ? [[auth.childId, auth.skill[auth.group][auth.childId], request.workflow ? 'workflow' : 'reference']] : [])]
        hooks.afterAuthorize?.()
        const snapshots = selected.map(([sourceId, entry, category]) => {
          const snapshot = readEntry(root, auth.skill, entry, { snapshot: true })
          if (hashBytes(snapshot.bytes) !== entry.contentHash) reject('HASH_MISMATCH')
          // Invalid UTF-8 would replace bytes during response encoding: fail rather than hash different content.
          const content = snapshot.bytes.toString('utf8')
          if (!Buffer.from(content).equals(snapshot.bytes)) reject('INVALID_ENCODING')
          return { entry, snapshot, source: { id: sourceId, category, content, hash: entry.contentHash, estimatedTokens: estimateTokens(snapshot.bytes), maximum: entry.maxTokens } }
        })
        const response = { ok: true, skill: request.skill, state: 'Loaded', used: true, estimatorVersion, sources: snapshots.map(item => item.source) }
        const budget = auditVerifiedResponse(response, budgets)
        if (budget.failed) reject('BUDGET_EXCEEDED')
        hooks.beforeCommit?.()
        if (generation !== startGeneration || revision() !== auth.rev) reject('CONCURRENT_REGISTRY_CHANGE')
        const check = authorize(request, context)
        if (check.grant !== auth.grant) reject('APPROVAL_REQUIRED')
        for (const item of snapshots) {
          const now = readEntry(root, auth.skill, item.entry, { snapshot: true })
          if (!now.bytes.equals(item.snapshot.bytes) || JSON.stringify(now.identity) !== JSON.stringify(item.snapshot.identity)) reject('CONCURRENT_FILE_CHANGE')
        }
        hooks.finalRevalidate?.()
        // No callbacks/await after revalidation: one synchronous publication, no failed mutation.
        const nextRecords = [...records, { project: context.project, session: context.session, task: context.task, skill: request.skill, revision: auth.rev, sources: response.sources.map(({ id, hash }) => ({ id, hash })), state: 'Loaded', used: true }].slice(-20)
        const existing = locks.find(lock => lock.project === context.project && lock.session === context.session && lock.task === context.task)
        const nextLock = { project: context.project, session: context.session, task: context.task, owner: auth.skill.owner, revision: auth.rev, usedSkills: [...new Set([...(existing?.usedSkills ?? []), request.skill])].slice(-200) }
        const nextLocks = [...locks.filter(lock => lock !== existing), nextLock]
        grants = auth.grant?.scope === 'once' ? grants.filter(item => item !== auth.grant) : grants
        records = nextRecords; locks = nextLocks
        emit({ event: 'verified-load', skill: request.skill, revision: auth.rev, budget })
        return response
      } catch (error) {
        const code = fileError(error), state = ['UNVERIFIED', 'HASH_MISMATCH', 'FILE_MISSING', 'READ_ERROR', 'NON_REGULAR_FILE', 'UNSAFE_PATH', 'CONCURRENT_FILE_CHANGE', 'CONCURRENT_REGISTRY_CHANGE', 'INVALID_ENCODING'].includes(code) ? 'Unverified' : code === 'APPROVAL_REQUIRED' ? 'Available' : 'Denied'
        emit({ event: 'verified-load-denied', ...(request ? { skill: request.skill } : {}), code, state })
        return { ok: false, state, error: { code } }
      } finally { if (acquired) busy = false }
    },
  }
}
