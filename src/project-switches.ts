import { randomUUID } from "node:crypto"
import { lstat, mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT"
const protectedConfig = path.resolve(process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"), "opencode")
export interface ProjectSwitches<Name extends string = string> {
  read(): Promise<Name[]>
  set(name: Name, enabled: boolean): Promise<Name[]>
}

/** Fixed filenames, private local storage; no global config, host DB, grants or cleanup. */
export function projectSwitches<Name extends string>(projectRoot: string, kind: "skills" | "features",
  validName: (name: unknown) => name is Name): ProjectSwitches<Name> {
  const root = path.resolve(projectRoot)
  const folder = path.join(root, ".openarms")
  const file = path.join(folder, `${kind}.json`)
  const checkRoot = async () => {
    const canonical = await realpath(root)
    const config = await realpath(protectedConfig).catch(() => protectedConfig)
    if (!path.isAbsolute(projectRoot) || canonical === path.parse(canonical).root || canonical === homedir()
      || canonical === config || canonical.startsWith(config + path.sep)) {
      throw Error("Open a project workspace before changing preferences")
    }
  }
  const checkFolder = async () => {
    const info = await lstat(folder)
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) throw Error("Unsafe preference directory")
  }
  const read = async (): Promise<Name[]> => {
    try { await checkFolder() } catch (error) { if (missing(error)) return []; throw error }
    let info
    try { info = await lstat(file) } catch (error) { if (missing(error)) return []; throw error }
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) || info.size > 65536) throw Error("Unsafe preferences")
    const data: unknown = JSON.parse(await readFile(file, "utf8"))
    if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1
      || !("disabled" in data) || !Array.isArray(data.disabled) || !data.disabled.every(validName)
      || data.disabled.length > 256 || new Set(data.disabled).size !== data.disabled.length) throw Error("Invalid preferences")
    return [...data.disabled].sort()
  }
  return {
    read,
    async set(name, enabled) {
      await checkRoot()
      if (!validName(name)) throw Error("Invalid preference name")
      await mkdir(folder, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error })
      await checkFolder()
      const lock = path.join(folder, `.${kind}.lock`)
      const handle = await open(lock, "wx", 0o600)
      const temp = path.join(folder, `.${kind}-${randomUUID()}.tmp`)
      try {
        const disabled = new Set(await read())
        if (enabled) disabled.delete(name)
        else disabled.add(name)
        if (disabled.size > 256) throw Error("Too many disabled entries")
        const next = [...disabled].sort()
        const output = await open(temp, "wx", 0o600)
        try { await output.writeFile(JSON.stringify({ version: 1, disabled: next }, null, 2) + "\n"); await output.sync() }
        finally { await output.close() }
        await rename(temp, file)
        return next
      } finally {
        await unlink(temp).catch(() => {})
        await handle.close()
        await unlink(lock)
      }
    },
  }
}
