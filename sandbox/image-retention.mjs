import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const imageID = /^sha256:[a-f0-9]{64}$/
const ownedTag = /^openarms-sandbox:(repository|installed|synthetic)-([a-f0-9]{64})$/
export function dockerCommand(args, execute = execFileSync) {
  // Image deletion can be slow on disk; keep discovery bounded more tightly.
  const timeout = args[0] === 'image' && args[1] === 'rm' ? 120000 : 15000
  return execute('docker', args, { encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 })
}
function list(text, pattern) {
  if (typeof text !== 'string') throw Error('Malformed Docker listing')
  const values = text.trim() ? text.trim().split('\n') : []
  if (values.some(value => !pattern.test(value))) throw Error('Malformed Docker identifier')
  return [...new Set(values)]
}
function inspect(docker, kind, name) {
  const data = JSON.parse(docker([kind, 'inspect', name]))
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== 'object') throw Error('Malformed Docker inspection')
  return data[0]
}
function snapshot(docker, current, keep) {
  const selected = inspect(docker, 'image', current).Id
  if (!imageID.test(selected)) throw Error('Malformed selected image')
  const protectedIDs = new Set([selected])
  for (const container of list(docker(['ps', '-aq', '--no-trunc']), /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/)) {
    const referenced = inspect(docker, 'container', container).Image
    if (!imageID.test(referenced)) throw Error('Malformed container image')
    protectedIDs.add(referenced)
  }
  const owned = []
  for (const id of list(docker(['image', 'ls', '-aq', '--no-trunc']), imageID)) {
    const image = inspect(docker, 'image', id)
    if (image.Id !== id || (image.RepoTags !== null && !Array.isArray(image.RepoTags))) throw Error('Malformed image inspection')
    const tags = image.RepoTags ?? []
    if (tags.some(tag => typeof tag !== 'string')) throw Error('Malformed image tags')
    if (!tags.some(tag => tag.startsWith('openarms-sandbox:'))) continue
    // Aliases, legacy tags and mixed ownership are never deleted.
    if (!tags.length || tags.some(tag => !ownedTag.test(tag))) continue
    const labels = image.Config?.Labels
    const matches = tags.map(tag => tag.match(ownedTag))
    if (!labels || matches.some(match => labels['org.openarms.library-mode'] !== match[1] || labels['org.openarms.build-fingerprint'] !== match[2])) throw Error('Invalid OpenArms ownership labels')
    const created = Date.parse(image.Created)
    if (!Number.isFinite(created)) throw Error('Malformed image creation date')
    owned.push({ id, mode: matches[0][1], created })
  }
  for (const mode of ['repository', 'installed', 'synthetic']) {
    for (const image of owned.filter(image => image.mode === mode).sort((a, b) => b.created - a.created || a.id.localeCompare(b.id)).slice(0, keep)) protectedIDs.add(image.id)
  }
  return { current: selected, keep, remove: owned.filter(image => !protectedIDs.has(image.id)).map(image => image.id).sort() }
}
export function retainImages({ docker = dockerCommand, current = process.env.OPENARMS_SANDBOX_IMAGE ?? 'openarms-sandbox:local', keep = 2, apply = false } = {}) {
  if (!Number.isInteger(keep) || keep < 1 || keep > 100) throw Error('keep must be an integer from 1 to 100')
  if (typeof current !== 'string' || !/^openarms-sandbox:[a-zA-Z0-9_.-]+$/.test(current)) throw Error('current must be an OpenArms sandbox tag')
  const plan = snapshot(docker, current, keep)
  if (apply) {
    // Reinspect before each removal; Docker's non-force removal also protects
    // containers created after inspection. Never expand the original set.
    for (const id of plan.remove) {
      if (!snapshot(docker, current, keep).remove.includes(id)) throw Error('Retention inputs changed; review a fresh dry run')
      docker(['image', 'rm', id])
    }
  }
  return { ...plan, apply }
}
export function automaticRetention({ environment = process.env, docker = dockerCommand, report = console.log } = {}) {
  try {
    const setting = environment.OPENARMS_IMAGE_RETENTION ?? 'on'
    if (!['on', 'off'].includes(setting)) throw Error('OPENARMS_IMAGE_RETENTION must be on or off')
    if (setting === 'off') { report('RETENTION: disabled (OPENARMS_IMAGE_RETENTION=off)'); return { disabled: true } }
    const value = environment.OPENARMS_IMAGE_KEEP ?? '2'
    if (!/^[0-9]+$/.test(value)) throw Error('Invalid image keep setting')
    const result = retainImages({ docker, current: environment.OPENARMS_SANDBOX_IMAGE ?? 'openarms-sandbox:local', keep: Number(value), apply: true })
    report(`RETENTION: removed=${result.remove.length} keep=${result.keep}/mode; selected, containers, aliases and unknown ownership protected`)
    return result
  } catch (error) { report(`RETENTION_BLOCKED: ${error.message} (removal may be partial)`); throw error }
}
export function parseRetentionArgs(args) {
  const options = {}
  const seen = new Set()
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (seen.has(arg)) throw Error(`Duplicate option: ${arg}`)
    seen.add(arg)
    if (arg === '--apply') options.apply = true
    else if (arg === '--keep' || arg === '--current') {
      const value = args[++i]
      if (!value || value.startsWith('--')) throw Error(`Missing value: ${arg}`)
      if (arg === '--keep' && !/^[0-9]+$/.test(value)) throw Error('Invalid keep')
      options[arg.slice(2)] = arg === '--keep' ? Number(value) : value
    } else throw Error(`Unknown option: ${arg}`)
  }
  return options
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(retainImages(parseRetentionArgs(process.argv.slice(2))), null, 2)) }
  catch (error) { console.error(`RETENTION_BLOCKED: ${error.message}`); process.exitCode = 2 }
}
