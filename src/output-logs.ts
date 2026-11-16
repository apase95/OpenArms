import { randomUUID } from "node:crypto"
import { mkdir, lstat, open, readdir, unlink } from "node:fs/promises"
import path from "node:path"

const MAX_AGE = 7 * 86400000
const MAX_FILES = 100
const MAX_BYTES = 64 * 1024 * 1024
const LOG_NAME = /^output-[0-9a-f-]{36}\.log$/

/** Owner-controlled local workspace only; never edits .gitignore or host state/DBs. */
export function outputLogStore(projectRoot: string) {
  const folder = path.join(projectRoot, ".openarms", "logs")
  const ensureFolder = async () => {
    for (const target of [path.dirname(folder), folder]) {
      await mkdir(target, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error })
      const info = await lstat(target)
      if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) {
        throw Error("Output log directory must be private and not a symlink")
      }
    }
  }
  const prune = async (keep: string, now = Date.now()) => {
    const entries = await Promise.all((await readdir(folder)).filter(name => LOG_NAME.test(name)).map(async name => {
      const file = path.join(folder, name)
      const info = await lstat(file).catch(() => undefined)
      return info?.isFile() && !info.isSymbolicLink() ? { file, size: info.size, time: info.mtimeMs } : undefined
    }))
    const files = entries.filter(entry => entry !== undefined).sort((a, b) => a.time - b.time)
    let total = files.reduce((sum, file) => sum + file.size, 0), count = files.length
    for (const entry of files) {
      // Concurrent/recent writers are protected; retention is deliberately best effort.
      if (entry.file === keep || now - entry.time < 60000) continue
      if (now - entry.time <= MAX_AGE && count <= MAX_FILES && total <= MAX_BYTES) continue
      await unlink(entry.file)
      total -= entry.size
      count--
    }
  }
  return {
    async save(raw: string) {
      await ensureFolder()
      const file = path.join(folder, `output-${randomUUID()}.log`)
      const handle = await open(file, "wx", 0o600)
      try { await handle.writeFile(raw, "utf8"); await handle.sync() }
      catch (error) { await unlink(file).catch(() => {}); throw error }
      finally { await handle.close() }
      await prune(file).catch(() => {})
      return file
    },
  }
}
