import { createHash } from 'node:crypto'
import { constants, lstatSync, openSync, closeSync, fstatSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { parseDocument } from 'yaml'

const fail = (id, rule, expected, actual) => { throw Object.assign(new Error(`${id}: ${rule}`), { result: { id, rule, expected, actual } }) }
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
export function parseJSON(text) {
  // JSON.parse enforces JSON syntax; the installed YAML parser supplies duplicate-key
  // detection (including escaped keys), which native JSON.parse does not expose.
  try {
    const value = JSON.parse(text)
    if (parseDocument(text, { uniqueKeys: true, strict: true }).errors.length) throw new Error('duplicate key')
    return value
  } catch { fail('registry', 'json', 'valid JSON with unique keys', 'invalid or duplicate') }
}
function fields(value, keys, id) {
  if (!object(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail(id, 'fields', keys, object(value) ? Object.keys(value) : typeof value)
}
const identifier = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
export function relativePath(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('\\') && !/[\x00-\x1f\x7f:]/.test(value) && !path.posix.isAbsolute(value) && value.split('/').every(part => part && part !== '.' && part !== '..')
}
export function validateRegistry(registry) {
  fields(registry, ['schemaVersion', 'packages', 'skills'], 'registry')
  if (registry.schemaVersion !== 2) fail('registry', 'schemaVersion', 2, registry.schemaVersion)
  if (!object(registry.packages) || !object(registry.skills)) fail('registry', 'records', 'objects', null)
  const ids = new Set(), paths = new Set(), owners = new Map()
  function uniqueId(id) {
    if (!identifier(id) || ids.has(id.toLowerCase())) fail(id, 'unique-id', 'unique lowercase ID', id)
    ids.add(id.toLowerCase())
  }
  function entry(id, value) {
    uniqueId(id)
    if (!relativePath(value.path) || paths.has(value.path.toLowerCase())) fail(id, 'unique-safe-path', 'normalized unique relative path', value.path)
    paths.add(value.path.toLowerCase())
    if (typeof value.contentHash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.contentHash)) fail(id, 'hash-format', 'sha256:64 lowercase hex', value.contentHash)
    if (!Number.isSafeInteger(value.maxTokens) || value.maxTokens < 1) fail(id, 'budget', 'positive safe integer', value.maxTokens)
  }
  for (const [id, pkg] of Object.entries(registry.packages)) {
    if (!identifier(id)) fail(id, 'package-id', 'lowercase ID', id)
    fields(pkg, ['core', 'optional', 'detect'], id)
    fields(pkg.detect, ['files', 'extensions', 'dependencies', ...(object(pkg.detect) && Object.hasOwn(pkg.detect, 'always') ? ['always'] : [])], id)
    if (Object.hasOwn(pkg.detect, 'always') && typeof pkg.detect.always !== 'boolean') fail(id, 'detection-always', 'boolean', pkg.detect.always)
    for (const key of ['files', 'extensions', 'dependencies']) {
      const values = pkg.detect[key]
      if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value.length)) fail(id, 'detection', 'nonempty string arrays', values)
    }
    for (const kind of ['core', 'optional']) {
      if (!Array.isArray(pkg[kind])) fail(id, 'assignment', 'ID array', pkg[kind])
      for (const skill of pkg[kind]) {
        if (!Object.hasOwn(registry.skills, skill) || owners.has(skill)) fail(skill, 'ownership', 'one registered assignment', id)
        owners.set(skill, { id, kind })
      }
    }
  }
  for (const [id, skill] of Object.entries(registry.skills)) {
    fields(skill, ['owner', 'kind', 'path', 'contentHash', 'maxTokens', 'defaultPermission', 'workflows', 'references'], id)
    entry(id, skill)
    if (owners.get(id)?.id !== skill.owner || owners.get(id)?.kind !== skill.kind) fail(id, 'ownership', owners.get(id) ?? 'one owner', { owner: skill.owner, kind: skill.kind })
    if (!['allow', 'ask', 'deny'].includes(skill.defaultPermission)) fail(id, 'permission', 'allow|ask|deny', skill.defaultPermission)
    const root = path.posix.dirname(skill.path)
    if (root === '.') fail(id, 'skill-root', 'dedicated directory', root)
    for (const group of ['workflows', 'references']) {
      if (!object(skill[group])) fail(id, 'allowlist', 'ID record', skill[group])
      for (const [childId, child] of Object.entries(skill[group])) {
        fields(child, ['path', 'contentHash', 'maxTokens'], childId)
        entry(childId, child)
        if (!child.path.startsWith(root + '/')) fail(childId, 'skill-root', root, child.path)
      }
    }
  }
  // Dedicated roots must not overlap: otherwise another skill's children could be authorized.
  const roots = Object.values(registry.skills).map(skill => path.posix.dirname(skill.path))
  for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) {
    const a = roots[i].toLowerCase(), b = roots[j].toLowerCase()
    if (a === b || a.startsWith(b + '/') || b.startsWith(a + '/')) fail('registry', 'overlapping-roots', 'disjoint roots', [roots[i], roots[j]])
  }
  return registry
}
export const hashBytes = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
export const estimatorVersion = 'utf8-bytes-v1'
export const estimateTokens = bytes => Math.ceil(bytes.length / 4)

// Reject all symlinks, including root ancestors. Operators must use a physical root.
export function physicalPath(target) {
  const absolute = path.resolve(target)
  let current = path.parse(absolute).root
  for (const segment of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    if (lstatSync(current).isSymbolicLink()) fail('filesystem', 'symlink', 'physical path', 'symlink')
  }
  if (realpathSync(absolute) !== absolute) fail('filesystem', 'realpath', 'physical path', 'changed')
  return absolute
}
export function openDirectory(target) {
  if (process.platform !== 'linux') fail('filesystem', 'platform', 'Linux descriptor-relative I/O', process.platform)
  let fd = openSync('/', constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    for (const segment of path.resolve(target).split('/').filter(Boolean)) {
      const next = openSync(`/proc/self/fd/${fd}/${segment}`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
      closeSync(fd); fd = next
    }
    return fd
  } catch (error) { closeSync(fd); throw error }
}
export function readRegular(target, { snapshot = false } = {}) {
  // Linux descriptor-relative walk pins each ancestor. No check/open pathname gap.
  if (process.platform !== 'linux') fail('filesystem', 'platform', 'Linux descriptor-relative I/O', process.platform)
  const absolute = path.resolve(target), segments = absolute.split('/').filter(Boolean), directories = []
  let fd
  try {
    let directory = openSync('/', constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    directories.push(directory)
    for (const segment of segments.slice(0, -1)) {
      directory = openSync(`/proc/self/fd/${directory}/${segment}`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
      directories.push(directory)
    }
    const pinned = `/proc/self/fd/${directory}/${segments.at(-1)}`
    fd = openSync(pinned, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const before = fstatSync(fd)
    if (!before.isFile()) fail('filesystem', 'regular-file', 'regular file', 'non-regular')
    const bytes = readFileSync(fd), after = fstatSync(fd), named = lstatSync(pinned)
    if (before.dev !== named.dev || before.ino !== named.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail('filesystem', 'concurrent-file', 'unchanged file', 'changed')
    return snapshot ? { bytes, identity: [after.dev, after.ino, after.size, after.mtimeMs, after.ctimeMs] } : bytes
  } finally { if (fd !== undefined) closeSync(fd); for (const directory of directories.reverse()) closeSync(directory) }
}
export function readEntry(root, skill, entry = skill, options = {}) {
  const physical = physicalPath(root)
  if (!lstatSync(physical).isDirectory() || !relativePath(entry.path)) fail('filesystem', 'root', 'safe directory/path', 'invalid')
  const skillRoot = path.resolve(physical, path.posix.dirname(skill.path))
  const target = path.resolve(physical, entry.path)
  if (!target.startsWith(skillRoot + path.sep) || !target.startsWith(physical + path.sep)) fail('filesystem', 'skill-root', 'contained path', 'escape')
  return readRegular(target, options)
}
export function integrity(registry, root) {
  validateRegistry(registry)
  const results = []
  for (const [id, skill] of Object.entries(registry.skills).sort()) {
    const entries = [[id, skill], ...Object.entries(skill.workflows), ...Object.entries(skill.references)].sort(([a], [b]) => a.localeCompare(b, 'en'))
    for (const [entryId, entry] of entries) {
      try {
        const bytes = readEntry(root, skill, entry), actual = hashBytes(bytes)
        results.push({ id: entryId, rule: 'hash', expected: entry.contentHash, actual })
        results.push({ id: entryId, rule: 'budget', expected: entry.maxTokens, actual: estimateTokens(bytes), estimatorVersion })
      } catch (error) { results.push({ id: entryId, rule: 'safe-file', expected: 'regular contained file', actual: error.code ?? error.result?.rule ?? 'read-error' }) }
    }
  }
  return results.sort((a, b) => a.id.localeCompare(b.id, 'en') || a.rule.localeCompare(b.rule, 'en'))
}
export const resultFailed = result => result.rule === 'budget' ? result.actual > result.expected : result.actual !== result.expected
