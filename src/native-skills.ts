import { stripVTControlCharacters } from "node:util"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

export type SkillEntry = {
  name: string
  description: string
  location: string
  content: string
  error?: string
}

const clean = (text: string) => stripVTControlCharacters(text).replace(/[\x00-\x1f\x7f-\x9f]/g, " ")
export function excerpt(text: string, limit = 12000) {
  const buffer = Buffer.from(text)
  if (buffer.length <= limit) return text
  let end = limit
  while ((buffer[end] & 0xc0) === 0x80) end--
  return buffer.subarray(0, end).toString("utf8") + "\n[Preview truncated; use the native skill tool for full instructions.]"
}

/** Consume the host catalog only. No filesystem discovery, grants or persisted state. */
export function parseSkills(value: unknown): SkillEntry[] {
  if (!Array.isArray(value)) throw Error("Invalid native skill catalog response")
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
  if (typeof client.app?.skills !== "function") throw Error("This host does not expose app.skills; upgrade OpenCode")
  const response = await client.app.skills({ directory })
  if (response.error || !response.data) throw Error("Native skill catalog unavailable; check the host configuration")
  return parseSkills(response.data)
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
  const showList = async () => {
    if (disposed || loading) return
    loading = true
    try {
      const directory = api.state.path.directory
      const entries = await listNativeSkills(api.client, directory)
      if (disposed || api.state.path.directory !== directory) return
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
        onSelect: option => showActions(entries[option.value]),
      }))
    } catch {
      notify("Cannot load native skills. Check OpenCode connectivity, version and skill configuration.")
    } finally { loading = false }
  }
  const showActions = (entry: SkillEntry) => {
    if (disposed) return
    api.ui.dialog.replace(() => api.ui.DialogSelect({
      title: clean(entry.name),
      options: [
        { title: "Inspect", value: "inspect", description: "Preview host-reported location and content" },
        ...(!entry.error ? [{ title: "Request in draft", value: "request", description: "Append a request; review and submit it yourself" }] : []),
        { title: "Back / refresh", value: "back" },
      ],
      onSelect: option => {
        if (option.value === "inspect") {
          api.ui.dialog.replace(() => api.ui.DialogAlert({
            title: clean(entry.name),
            message: excerpt(clean(`${entry.error ? `ERROR: ${entry.error}\n` : ""}${entry.description}\n\nLocation: ${entry.location}\n\n${entry.content}`)),
            onConfirm: () => showActions(entry),
          }))
        } else if (option.value === "request") void request(entry)
        else void showList()
      },
    }))
  }
  let requesting = false
  const request = async (entry: SkillEntry) => {
    if (disposed || requesting) return
    requesting = true
    try {
      // Refresh before staging: do not request a removed/renamed/ambiguous entry.
      const directory = api.state.path.directory
      const current = (await listNativeSkills(api.client, directory))
        .find(skill => skill.name === entry.name && skill.location === entry.location)
      if (!current || current.error || api.state.path.directory !== directory) throw Error("Skill changed")
      if (disposed) return
      const result = await api.client.tui.appendPrompt({ directory, text: skillRequest(current) })
      if (result.error || result.data !== true) throw Error("Draft unavailable")
      if (!disposed) {
        api.ui.dialog.clear()
        api.ui.toast({ title: "Skill request appended", message: "Review your draft and submit when ready. OpenCode controls skill execution and permissions.", variant: "info" })
      }
    } catch {
      notify("Cannot append the skill request. Refresh the catalog and check the active prompt.")
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
