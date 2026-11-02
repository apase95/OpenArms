import path from 'node:path'
import { constants } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import { TextDecoder } from 'node:util'

export type CatalogPackage = { id: string; skills: { id: string; path: string }[] }
export type PackageCatalog = { packages: CatalogPackage[]; errors: { package: string; code: string }[] }
const identifier = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const manifestLimit = 64 * 1024
const reject = (): never => { throw new Error('INVALID_MANIFEST') }
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Metadata discovery only. Skill files are deliberately not opened here. */
export async function discoverPackages(directory: string): Promise<PackageCatalog> {
  const result: PackageCatalog = { packages: [], errors: [] }
  let root: string
  try { root = await realpath(directory) }
  catch (error: any) {
    if (error.code === 'ENOENT') return result
    throw error
  }
  const entries = (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    if (!identifier.test(entry.name)) continue
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    try {
      const packageRoot = path.join(root, entry.name)
      if (!(await lstat(packageRoot)).isDirectory() || await realpath(packageRoot) !== packageRoot) reject()
      const manifest = path.join(packageRoot, 'package.json')
      const expected = await lstat(manifest)
      if (!expected.isFile() || expected.size > manifestLimit) reject()
      const handle = await open(manifest, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      let metadata: unknown
      try {
        const before = await handle.stat()
        if (!before.isFile() || before.dev !== expected.dev || before.ino !== expected.ino || before.size > manifestLimit) reject()
        const bytes = Buffer.alloc(manifestLimit + 1)
        let length = 0
        while (length < bytes.length) {
          const read = await handle.read(bytes, length, bytes.length - length, null)
          if (!read.bytesRead) break
          length += read.bytesRead
        }
        if (length > manifestLimit) reject()
        metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)))
        const after = await handle.stat()
        const identity = await lstat(manifest)
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || identity.dev !== before.dev || identity.ino !== before.ino || !identity.isFile() || await realpath(packageRoot) !== packageRoot) reject()
      } finally { await handle.close() }
      if (!object(metadata) || Object.keys(metadata).some(key => key !== 'skills') || !object(metadata.skills)) reject()
      const skills: CatalogPackage['skills'] = []
      for (const [id, relative] of Object.entries(metadata.skills)) {
        if (!identifier.test(id) || typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes('\0') || path.posix.isAbsolute(relative) || relative.split('/').some(part => !part || part === '.' || part === '..') || /^[A-Za-z]:/.test(relative)) reject()
        skills.push({ id: `${entry.name}/${id}`, path: path.join(packageRoot, relative) })
      }
      result.packages.push({ id: entry.name, skills: skills.sort((a, b) => a.id.localeCompare(b.id)) })
    } catch { result.errors.push({ package: entry.name, code: 'INVALID_MANIFEST' }) }
  }
  return result
}
