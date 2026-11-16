import { stripVTControlCharacters } from "node:util"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

export type SkillEntry = {
  name: string
  description: string
  location: string
  content: string
  error?: string
}

const errorMessages = {
  CATALOG_UNSUPPORTED: "This host does not expose app.skills; upgrade OpenCode to use the native skill browser.",
  CATALOG_CONNECTION_FAILED: "Cannot load native skills: the catalog request failed. Check OpenCode connectivity.",
  CATALOG_REJECTED: "Native skill catalog unavailable: the host rejected the request. Check host configuration and diagnostics.",
  CATALOG_INVALID_RESPONSE: "Invalid native skill catalog response. Check host/SDK compatibility; no filesystem fallback was used.",
  DRAFT_TARGET_UNAVAILABLE: "Open a home or session prompt before browsing skills.",
  DRAFT_TARGET_CHANGED: "The session or directory changed. Reopen /skills in the intended prompt; no new append was started.",
  SKILL_CHANGED: "The selected skill changed or is no longer available. Refresh the catalog before requesting it.",
  APPEND_UNSUPPORTED: "This host does not expose tui.appendPrompt; upgrade OpenCode to request a skill in the draft.",
  APPEND_UNCONFIRMED: "Cannot confirm the skill request in the original prompt. Check drafts before retrying; no automatic retry will occur.",
} as const

export class SkillBrowserError extends Error {
  readonly code: keyof typeof errorMessages
  constructor(code: keyof typeof errorMessages) {
    super(`[${code}] ${errorMessages[code]}`)
    this.name = "SkillBrowserError"
    this.code = code
  }
}

// Keep preview layout, but labels/descriptions must remain single-line.
const cleanPreview = (text: string) => stripVTControlCharacters(text.replace(/\r\n?/g, "\n"))
  .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, " ")
const clean = (text: string) => cleanPreview(text).replace(/[\n\t]/g, " ")
type DraftTarget = { directory: string; route: "home" | "session"; sessionID?: string }
export function excerpt(text: string, limit = 12000) {
  const buffer = Buffer.from(text)
  if (buffer.length <= limit) return text
  let end = limit
  while ((buffer[end] & 0xc0) === 0x80) end--
  return buffer.subarray(0, end).toString("utf8") + "\n[Preview truncated; use the native skill tool for full instructions.]"
}

/** Consume the host catalog only. No filesystem discovery, grants or persisted state. */
export function parseSkills(value: unknown): SkillEntry[] {
  if (!Array.isArray(value)) throw new SkillBrowserError("CATALOG_INVALID_RESPONSE")
  const entries = value.map((item, index): SkillEntry => {
    const validName = typeof item?.name === "string" && item.name.trim() === item.name
      && item.name.length > 0 && item.name.length <= 128 && !/[\x00-\x1f\x7f-\x9f]/.test(item.name)
    const valid = validName && typeof item.location === "string" && item.location.length > 0
      && typeof item.content === "string" && (item.description === undefined || typeof item.description === "string")
    return {
      name: validName ? item.name : `Invalid entry ${index + 1}`,
      description: typeof item?.description === "string" ? item.description : "",
      location: typeof item?.location === "string" ? item.location : "",
      content: typeof item?.content === "string" ? item.content : "",
      ...(!valid ? { error: "Invalid native skill metadata" } : {}),
    }
  })
  const counts = new Map<string, number>()
  for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1)
  for (const entry of entries) if (counts.get(entry.name)! > 1) entry.error = "Duplicate native skill name; resolve it in the library"
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

export async function listNativeSkills(client: Pick<TuiPluginApi["client"], "app">, directory: string) {
  if (typeof client.app?.skills !== "function") throw new SkillBrowserError("CATALOG_UNSUPPORTED")
  let response: unknown
  try { response = await client.app.skills({ directory }) }
  catch { throw new SkillBrowserError("CATALOG_CONNECTION_FAILED") }
  if (!response || typeof response !== "object") throw new SkillBrowserError("CATALOG_INVALID_RESPONSE")
  if ("error" in response && response.error != null) throw new SkillBrowserError("CATALOG_REJECTED")
  try {
    if (!("data" in response)) throw new SkillBrowserError("CATALOG_INVALID_RESPONSE")
    return parseSkills(response.data)
  } catch { throw new SkillBrowserError("CATALOG_INVALID_RESPONSE") }
}

export function skillRequest(entry: SkillEntry) {
  if (entry.error) throw Error(entry.error)
  return `\n\nUse the native skill tool to load ${JSON.stringify(entry.name)} for this task.\n`
}

/** Host dialogs/keymap only: never replace Prompt slots, submit, reset or change permissions. */
export function installSkillBrowser(api: TuiPluginApi) {
  let disposed = false
  let loading = false
  const notify = (message: string) => {
    if (!disposed) api.ui.toast({ title: "OpenArms skills", message, variant: "error" })
  }
  const notifyError = (error: unknown, fallback: string) => notify(error instanceof SkillBrowserError ? error.message : fallback)
  const draftTarget = (): DraftTarget | undefined => {
    const route = api.route?.current
    const directory = api.state.path.directory
    if (route?.name === "home") return { directory, route: "home" }
    const sessionID = route && "params" in route ? route.params?.sessionID : undefined
    if (route?.name === "session" && typeof sessionID === "string" && sessionID.length > 0) {
      return { directory, route: "session", sessionID }
    }
  }
  const sameTarget = (target: DraftTarget) => {
    const current = draftTarget()
    return !!current && current.directory === target.directory && current.route === target.route && current.sessionID === target.sessionID
  }
  const checkTarget = (target: DraftTarget) => {
    if (disposed) return false
    if (sameTarget(target)) return true
    notify(new SkillBrowserError("DRAFT_TARGET_CHANGED").message)
    return false
  }
  const showList = async () => {
    if (disposed || loading) return
    loading = true
    try {
      const target = draftTarget()
      if (!target) throw new SkillBrowserError("DRAFT_TARGET_UNAVAILABLE")
      const entries = await listNativeSkills(api.client, target.directory)
      if (!checkTarget(target)) return
      if (!entries.length) {
        api.ui.dialog.replace(() => api.ui.DialogAlert({
          title: "Native skills",
          message: "No skills reported by OpenCode. Add SKILL.md files to a native skill directory or configure skills.paths, then refresh the host. OpenArms does not scan legacy package manifests.",
        }))
        return
      }
      api.ui.dialog.replace(() => api.ui.DialogSelect({
        title: "Native skills · select to inspect or request",
        placeholder: "Filter skills",
        options: entries.map((entry, index) => ({
          title: `${clean(entry.name)}${entry.error ? " · ERROR" : ""}`,
          value: index,
          description: excerpt(clean(entry.error ?? entry.description), 300),
        })),
        onSelect: option => showActions(entries[option.value], target),
      }))
    } catch (error) {
      notifyError(error, "Cannot load native skills. Check OpenCode connectivity, version and skill configuration.")
    } finally { loading = false }
  }
  const showActions = (entry: SkillEntry, target: DraftTarget) => {
    if (!checkTarget(target)) return
    api.ui.dialog.replace(() => api.ui.DialogSelect({
      title: clean(entry.name),
      options: [
        { title: "Inspect", value: "inspect", description: "Preview host-reported location and content" },
        ...(!entry.error ? [{ title: "Request in draft", value: "request", description: "Append a request; review and submit it yourself" }] : []),
        { title: "Back / refresh", value: "back" },
      ],
      onSelect: option => {
        if (!checkTarget(target)) return
        if (option.value === "inspect") {
          api.ui.dialog.replace(() => api.ui.DialogAlert({
            title: clean(entry.name),
            message: excerpt(cleanPreview(`${entry.error ? `ERROR: ${entry.error}\n` : ""}${entry.description}\n\nLocation: ${entry.location}\n\n${entry.content}`)),
            onConfirm: () => showActions(entry, target),
          }))
        } else if (option.value === "request") void request(entry, target)
        else void showList()
      },
    }))
  }
  let requesting = false
  const request = async (entry: SkillEntry, target: DraftTarget) => {
    if (requesting || !checkTarget(target)) return
    requesting = true
    try {
      // Bind to the target captured when the browser opened, not the route at click time.
      const current = (await listNativeSkills(api.client, target.directory))
        .find(skill => skill.name === entry.name && skill.location === entry.location)
      if (!checkTarget(target)) return
      if (!current || current.error) throw new SkillBrowserError("SKILL_CHANGED")
      if (typeof api.client.tui?.appendPrompt !== "function") throw new SkillBrowserError("APPEND_UNSUPPORTED")
      const result = await api.client.tui.appendPrompt(
        { directory: target.directory, text: skillRequest(current) },
        { signal: api.lifecycle.signal },
      )
      if (disposed) return
      // The API has no sessionID/compare-and-append. A route change in flight is ambiguous.
      if (!sameTarget(target) || result.error || result.data !== true) throw new SkillBrowserError("APPEND_UNCONFIRMED")
      api.ui.dialog.clear()
      api.ui.toast({ title: "Skill request appended", message: "Review your draft and submit when ready. OpenCode controls skill execution and permissions.", variant: "info" })
    } catch (error) {
      notifyError(error, new SkillBrowserError("APPEND_UNCONFIRMED").message)
    } finally { requesting = false }
  }
  const unregister = api.keymap.registerLayer({
    commands: [{
      name: "openarms.skills", title: "Browse native skills", namespace: "palette",
      slashName: "skills", desc: "Inspect skills or append a native skill request to your draft",
      run: () => { void showList() },
    }],
    bindings: [],
  })
  api.lifecycle.onDispose(() => { disposed = true; unregister() })
}
