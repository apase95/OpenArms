import { request } from "node:https"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

export const MAX_SKILL_BYTES = 10 * 1024 * 1024
export type GithubSource = Readonly<{ url: string; owner: string; repo: string; ref?: string; subpath: string; archiveURL: string }>

function segment(value: string) {
  if (!/^[A-Za-z0-9_.-]+$/.test(value) || value === "." || value === "..") throw Error("Unsafe GitHub path segment")
  return value
}

export function parseGithubSource(input: string, options: { ref?: string; subpath?: string } = {}): GithubSource {
  if (!/^https:\/\/github\.com\//.test(input) || /[%\\\s?#@]/.test(input)) throw Error("Only unambiguous HTTPS github.com URLs are supported")
  input.slice("https://github.com/".length).replace(/\/$/, "").split("/").forEach(segment)
  const url = new URL(input)
  if (url.port || url.username || url.password || url.hostname !== "github.com") throw Error("Unsafe GitHub URL")
  const parts = url.pathname.replace(/\/$/, "").slice(1).split("/").map(segment)
  const [owner, rawRepo, action, ...tail] = parts
  if (!owner || !rawRepo) throw Error("Expected GitHub owner/repository")
  const repo = segment(rawRepo.replace(/\.git$/, ""))
  let ref = options.ref, subpath = options.subpath ?? ""
  if (action) {
    if (action === "commit" && tail.length === 1 && /^[a-fA-F0-9]{40}$/.test(tail[0]) && !ref) ref = tail[0]
    else if (action === "tree" && tail.length && ref) {
      const supplied = tail.join("/")
      if (supplied !== ref && !supplied.startsWith(`${ref}/`)) throw Error("Explicit ref does not match tree URL")
      const inferred = supplied === ref ? "" : supplied.slice(ref.length + 1)
      if (options.subpath !== undefined && options.subpath !== inferred) throw Error("Conflicting subpath")
      subpath = inferred
    } else throw Error("Tree URLs require explicit ref (branches may contain slashes); commit links require a full SHA")
  }
  if (ref) ref.split("/").forEach(segment)
  if (subpath) subpath.split("/").forEach(segment)
  const archiveURL = `https://codeload.github.com/${owner}/${repo}/tar.gz/${ref ? (/^[a-fA-F0-9]{40}$/.test(ref) ? ref : `refs/heads/${ref}`) : "HEAD"}`
  return Object.freeze({ url: input, owner, repo, ref, subpath, archiveURL })
}

export function assertPublicAddress(address: string) {
  // Conservative subset: IPv4 globally routed unicast only. IPv6 (including
  // mapped IPv4) is deliberately denied rather than maintaining partial ranges.
  if (isIP(address) !== 4) throw Error("Non-public DNS destination")
  const [a, b] = address.split(".").map(Number)
  if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0)) throw Error("Non-public DNS destination")
}

export type HttpResponse = { status: number; location?: string; encoding?: string; body: AsyncIterable<Uint8Array>; close: () => Promise<void> }
export type FetchSeams = {
  dns: (host: string, signal: AbortSignal) => Promise<readonly { address: string; family: number }[]>
  http: (url: URL, destination: { address: string; family: number }, signal: AbortSignal) => Promise<HttpResponse>
  deadlineMs?: number
  temporaryRoot?: string
  armDeadline?: (expire: () => void, milliseconds: number) => () => void
}

const nativeSeams: FetchSeams = {
  dns: async host => lookup(host, { all: true }),
  http: (url, destination, signal) => new Promise((resolve, reject) => {
    const req = request(url, { signal, agent: false, family: 4, autoSelectFamily: false, headers: { "Accept-Encoding": "identity" }, lookup: (_host, _opts, callback) => callback(null, destination.address, destination.family) }, response => {
      resolve({ status: response.statusCode ?? 0, location: response.headers.location, encoding: response.headers["content-encoding"], body: response,
        close: async () => {
          if (!response.closed) await new Promise<void>(done => { response.once("close", done); response.destroy() })
          if (!req.closed) await new Promise<void>(done => { req.once("close", done); req.destroy() })
        } })
    })
    let requestError: Error | undefined
    req.once("error", error => { requestError = error })
    req.once("close", () => { if (requestError) reject(requestError) })
    req.end()
  }),
}

function archiveEndpoint(input: string) {
  if (!/^https:\/\/codeload\.github\.com\//.test(input) || /[%\\\s?#@]/.test(input)) throw Error("Unsafe archive redirect")
  try { input.slice("https://codeload.github.com/".length).split("/").forEach(segment) } catch { throw Error("Unsafe archive redirect") }
  const url = new URL(input)
  if (url.port || url.username || url.password || url.hostname !== "codeload.github.com") throw Error("Unsafe archive redirect")
  url.pathname.slice(1).split("/").forEach(segment)
  return url
}

/** Callback owns no paths after return. Transport is pinned to validated DNS;
 * HTTPS retains hostname/SNI/certificate verification, no proxy or generic fetch. */
export async function withSkillDownload<T>(source: GithubSource, consume: (archive: Buffer, temporaryFile: string) => Promise<T>, seams: FetchSeams = nativeSeams): Promise<T> {
  const controller = new AbortController()
  const deadline = Math.min(seams.deadlineMs ?? 30_000, 30_000)
  if (!Number.isFinite(deadline) || deadline <= 0) throw Error("Invalid download deadline")
  const expire = () => controller.abort(Error("Download deadline exceeded"))
  const cancelDeadline = seams.armDeadline ? seams.armDeadline(expire, deadline) : (() => { const timer = setTimeout(expire, deadline); return () => clearTimeout(timer) })()
  let dir: string | undefined, failure: unknown
  const abortable = async <R>(pending: Promise<R>): Promise<R> => {
    controller.signal.throwIfAborted()
    let abort!: () => void
    const aborted = new Promise<never>((_resolve, reject) => { abort = () => reject(controller.signal.reason); controller.signal.addEventListener("abort", abort, { once: true }) })
    try { return await Promise.race([pending, aborted]) } finally { controller.signal.removeEventListener("abort", abort) }
  }
  try {
    dir = await mkdtemp(path.join(seams.temporaryRoot ?? tmpdir(), "openarms-fetch-"))
    let next = source.archiveURL
    const visited = new Set<string>()
    for (let redirects = 0; redirects <= 3; redirects++) {
      const url = archiveEndpoint(next)
      if (visited.has(next)) throw Error("Archive redirect loop")
      visited.add(next)
      const addresses = await abortable(seams.dns(url.hostname, controller.signal))
      if (!addresses.length) throw Error("Empty DNS response")
      for (const destination of addresses) { assertPublicAddress(destination.address); if (destination.family !== 4) throw Error("Unsupported DNS family") }
      const pending = seams.http(url, addresses[0], controller.signal)
      // Injected transports must settle on abort just like node:https. Await
      // their release before deleting temporary storage or returning failure.
      let response: HttpResponse
      try { response = await abortable(pending) }
      catch (error) {
        await pending.then(reply => reply.close(), () => {})
        throw error
      }
      let responseFailure: unknown
      try {
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (!response.location || redirects === 3) throw Error("Invalid archive redirect")
          // Validate raw location before URL normalization can erase traversal.
          archiveEndpoint(response.location)
          next = response.location; continue
        }
        if (response.status !== 200 || (response.encoding && response.encoding !== "identity")) throw Error("Expected identity-encoded GitHub tar.gz response")
        const chunks: Buffer[] = []; let size = 0
        const iterator = response.body[Symbol.asyncIterator]()
        while (true) {
          const item = await abortable(iterator.next())
          if (item.done) break
          size += item.value.byteLength
          if (size > MAX_SKILL_BYTES) throw Error("Download exceeds 10 MiB")
          chunks.push(Buffer.from(item.value))
        }
        const archive = Buffer.concat(chunks, size)
        const file = path.join(dir, "source.tar.gz")
        await writeFile(file, archive, { mode: 0o600, flag: "wx" })
        controller.signal.throwIfAborted()
        cancelDeadline() // Deadline covers download, not arbitrary consumer work.
        return await consume(archive, file)
      } catch (error) { responseFailure = error; throw error }
      finally {
        try { await response.close() }
        catch (error) { throw new AggregateError(responseFailure ? [responseFailure, error] : [error], "HTTP response cleanup failed") }
      }
    }
    throw Error("Too many redirects")
  } catch (error) { failure = error; controller.abort(error); throw error }
  finally {
    cancelDeadline()
    if (dir) {
      try { await rm(dir, { recursive: true, force: true }) }
      catch (error) { throw new AggregateError(failure ? [failure, error] : [error], "Download cleanup failed") }
    }
  }
}
