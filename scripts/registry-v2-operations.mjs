import { constants, openSync, closeSync, writeFileSync, fsyncSync, unlinkSync, renameSync, lstatSync, fstatSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { validateRegistry, readEntry, readRegular, physicalPath, hashBytes, openDirectory, parseJSON } from './registry-v2.mjs'

export const serialize = value => JSON.stringify(value, null, 2) + '\n'
export function migrate(source, root, decisions) {
  if (source.schemaVersion === 2) return validateRegistry(structuredClone(source))
  if (source.version !== 1 || Object.keys(source).sort().join(',') !== 'packages,skills,version' || !source.packages || !source.skills || !decisions || typeof decisions !== 'object' || Array.isArray(decisions)) throw new Error('Invalid v1 registry or decision manifest')
  if (Object.keys(decisions).sort().join(',') !== Object.keys(source.skills).sort().join(',')) throw new Error('Owner decisions must cover exactly registered skills')
  const output = { schemaVersion: 2, packages: structuredClone(source.packages), skills: {} }
  for (const pkg of Object.values(output.packages)) {
    if (!pkg.detect || typeof pkg.detect !== 'object' || Array.isArray(pkg.detect) || Object.keys(pkg.detect).some(key => !['always', 'files', 'extensions', 'dependencies'].includes(key))) throw new Error('Invalid v1 detection settings')
    pkg.detect = { files: [], extensions: [], dependencies: [], ...pkg.detect }
  }
  for (const id of Object.keys(source.skills).sort()) {
    const assignments = Object.entries(source.packages).flatMap(([owner, pkg]) => ['core', 'optional'].flatMap(kind => (pkg[kind] ?? []).filter(skill => skill === id).map(() => ({ owner, kind }))))
    if (assignments.length !== 1) throw new Error(`${id}: exactly one owner required`)
    const decision = decisions[id]
    if (!decision || Object.keys(decision).sort().join(',') !== 'defaultPermission,maxTokens') throw new Error(`${id}: explicit permission and budget required`)
    const record = { ...assignments[0], path: source.skills[id], contentHash: 'sha256:' + '0'.repeat(64), ...decision, workflows: {}, references: {} }
    output.skills[id] = record
  }
  validateRegistry(output)
  for (const record of Object.values(output.skills)) record.contentHash = hashBytes(readEntry(root, record))
  return validateRegistry(output)
}
export function selectedHashes(registry, root, ids) {
  validateRegistry(registry)
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Select unique existing skill IDs explicitly')
  return [...ids].sort().map(id => {
    if (!Object.hasOwn(registry.skills, id)) throw new Error(`${id}: unknown skill`)
    return { id, oldHash: registry.skills[id].contentHash, newHash: hashBytes(readEntry(root, registry.skills[id])) }
  })
}

/** Cooperative operator transaction: all supported writers take this exclusive lock.
 * Not a security boundary against an actor able to replace the parent directory or
 * ignore the lock. Node has no portable compare-and-swap rename. Use a private,
 * quiescent registry directory; the CLI never claims protection from hostile writers.
 */
export function transaction(registryPath, operation, { write = false, backup = false } = {}) {
  const target = physicalPath(registryPath), parent = path.dirname(target)
  if (!write) {
    const before = readRegular(target), result = operation(parseJSON(before.toString('utf8')))
    result.revalidate?.()
    if (!readRegular(target).equals(before)) throw new Error('Concurrent registry change; no write')
    return { ...result, changed: serialize(validateRegistry(result.output)) !== before.toString('utf8') }
  }
  const directoryFd = openDirectory(parent), pinned = `/proc/self/fd/${directoryFd}/${path.basename(target)}`
  const lock = pinned + '.lock', temporary = pinned + '.' + randomUUID() + '.tmp'
  let descriptor
  let tempCreated = false
  try {
    descriptor = openSync(lock, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    writeFileSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); fsyncSync(descriptor)
    const parentStat = fstatSync(directoryFd)
    const assertParent = () => {
      physicalPath(parent)
      const named = lstatSync(parent)
      if (named.dev !== parentStat.dev || named.ino !== parentStat.ino) throw new Error('Concurrent registry directory change')
    }
    assertParent()
    const before = readRegular(target), stat = lstatSync(target)
    const { output, report, revalidate } = operation(parseJSON(before.toString('utf8')))
    const bytes = Buffer.from(serialize(validateRegistry(output)))
    if (serialize(output) === serialize(JSON.parse(before.toString('utf8')))) {
      revalidate?.(); assertParent()
      if (!readRegular(target).equals(before)) throw new Error('Concurrent registry change; no write')
      return { report, changed: false, output }
    }
    const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, stat.mode & 0o777)
    tempCreated = true
    try { writeFileSync(fd, bytes); fsyncSync(fd) } finally { closeSync(fd) }
    revalidate?.()
    assertParent()
    const current = lstatSync(target)
    if (current.ino !== stat.ino || current.dev !== stat.dev || !readRegular(target).equals(before)) throw new Error('Concurrent registry change; no write')
    if (backup) {
      const backupFd = openSync(pinned + '.bak', constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
      try { writeFileSync(backupFd, before); fsyncSync(backupFd) } finally { closeSync(backupFd) }
      fsyncSync(directoryFd)
    }
    renameSync(temporary, pinned); tempCreated = false
    fsyncSync(directoryFd)
    return { report, changed: true, output }
  } finally {
    if (tempCreated) unlinkSync(temporary)
    if (descriptor !== undefined) { closeSync(descriptor); unlinkSync(lock) }
    closeSync(directoryFd)
  }
}
