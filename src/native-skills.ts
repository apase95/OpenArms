import { stripVTControlCharacters } from "node:util"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { projectSkills, type ProjectSkills } from "./project-skills.ts"
import { projectFeatures, featureEnabled, type FeatureStores } from "./project-features.ts"
import type { SkillListProps, SkillListRenderer } from "./skill-list.ts"

export type SkillEntry = { name: string; description: string; location: string; content: string; error?: string }
const errorMessages = {
  CATALOG_UNSUPPORTED: "This host does not expose app.skills; upgrade OpenCode to use the native skill browser.",
  CATALOG_CONNECTION_FAILED: "Cannot load native skills: the catalog request failed. Check OpenCode connectivity.",
  CATALOG_REJECTED: "Native skill catalog unavailable: the host rejected the request. Check host configuration and diagnostics.",
  CATALOG_INVALID_RESPONSE: "Invalid native skill catalog response. Check host/SDK compatibility; no filesystem fallback was used.",
  DRAFT_TARGET_UNAVAILABLE: "Open a home or session prompt before browsing skills.",
  DRAFT_TARGET_CHANGED: "The session or directory changed. Reopen /arms-skills in the intended prompt; no new append was started.",
  SKILL_CHANGED: "The selected skill changed or is no longer available. Refresh the catalog before requesting it.",
  APPEND_UNSUPPORTED: "This host does not expose tui.appendPrompt; upgrade OpenCode to request a skill in the draft.",
  APPEND_UNCONFIRMED: "Cannot confirm the skill request in the original prompt. Check drafts before retrying; no automatic retry will occur.",
  SKILL_OFF: "This skill is OFF for this project. Select ON before requesting it.",
  FEATURE_OFF: "Skills management is OFF for this project. Enable it through /arms-skills → Features.",
  FEATURE_STATE_UNAVAILABLE: "Cannot verify project feature settings. Review .openarms/features.json before retrying.",
  POLICY_READ_FAILED: "Cannot verify project skill preferences. Check .openarms/skills.json and private directory permissions; no request was appended.",
  POLICY_WRITE_FAILED: "Cannot confirm the preference change. Check project path, private storage, skill name and lock; refresh before retrying.",
} as const

export class SkillBrowserError extends Error {
  readonly code: keyof typeof errorMessages
  constructor(code: keyof typeof errorMessages) {
    super(`[${code}] ${errorMessages[code]}`)
    this.name = "SkillBrowserError"
    this.code = code
  }
}

const clean = (text: string) => stripVTControlCharacters(text.replace(/\r\n?/g, "\n"))
  .replace(/[\x00-\x1f\x7f-\x9f]/g, " ")
type DraftTarget = { directory: string; projectRoot: string; route: "home" | "session"; sessionID?: string }
type Browser = { target: DraftTarget; store: ProjectSkills; disabled: Set<string>; entries: SkillEntry[] }
export type DialogNavigation = { back: () => void; done: () => void }
export type DialogFrame = (render: () => ReturnType<TuiPluginApi["ui"]["DialogAlert"]>, navigation: DialogNavigation) => ReturnType<TuiPluginApi["ui"]["DialogAlert"]>

/** The host owns discovery; no filesystem skill scanner or loader. */
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
  if (!("data" in response)) throw new SkillBrowserError("CATALOG_INVALID_RESPONSE")
  return parseSkills(response.data)
}

export function skillRequest(entry: SkillEntry) {
  if (entry.error) throw Error(entry.error)
  return `\n\nUse the native skill tool to load ${JSON.stringify(entry.name)} for this task.\n`
}

/** Local global-host plugin: public dialogs only, no Prompt replacement or config writes. */
export function installSkillBrowser(api: TuiPluginApi, frame: DialogFrame, stores: (root: string) => ProjectSkills = projectSkills,
  options: { features?: FeatureStores; onBack?: () => void; skillList?: SkillListRenderer } = {}) {
  let disposed = false, loading = false, busy = false, view = 0
  const present = (render: (active: () => boolean) => ReturnType<TuiPluginApi["ui"]["DialogAlert"]>, back: () => void) => {
    const token = ++view
    const done = () => {
      if (disposed || view !== token) return
      ++view
      api.ui.dialog.clear()
    }
    api.ui.dialog.replace(() => frame(() => render(() => !disposed && view === token), {
      back: () => { if (!disposed && view === token) back() }, done,
    }), () => { if (view === token) ++view })
  }
  const close = () => { if (!disposed) { ++view; api.ui.dialog.clear() } }
  const notify = (error: unknown, fallback: keyof typeof errorMessages) => {
    if (!disposed) api.ui.toast({ title: "OpenArms skills", message: error instanceof SkillBrowserError
      ? error.message : new SkillBrowserError(fallback).message, variant: "error" })
  }
  const draftTarget = (): DraftTarget | undefined => {
    const route = api.route?.current
    const { directory, worktree } = api.state.path
    const projectRoot = worktree && worktree !== "/" ? worktree : directory
    if (route?.name === "home") return { directory, projectRoot, route: "home" }
    const sessionID = route && "params" in route ? route.params?.sessionID : undefined
    if (route?.name === "session" && typeof sessionID === "string" && sessionID.length > 0) {
      return { directory, projectRoot, route: "session", sessionID }
    }
  }
  const sameTarget = (target: DraftTarget) => {
    const current = draftTarget()
    return !!current && current.directory === target.directory && current.projectRoot === target.projectRoot
      && current.route === target.route && current.sessionID === target.sessionID
  }
  const checkTarget = (target: DraftTarget) => {
    if (disposed) return false
    if (sameTarget(target)) return true
    notify(new SkillBrowserError("DRAFT_TARGET_CHANGED"), "DRAFT_TARGET_CHANGED")
    return false
  }
  const requireFeature = async (target: DraftTarget) => {
    let enabled: boolean
    try { enabled = await featureEnabled((options.features ?? projectFeatures)(target.projectRoot), "skills-management") }
    catch { throw new SkillBrowserError("FEATURE_STATE_UNAVAILABLE") }
    if (!enabled) throw new SkillBrowserError("FEATURE_OFF")
  }
  const readPolicy = async (browser: Browser) => {
    try { browser.disabled = new Set(await browser.store.read()) }
    catch { throw new SkillBrowserError("POLICY_READ_FAILED") }
  }
  const showList = async (parentActive: () => boolean = () => true) => {
    if (disposed || loading || busy) return
    loading = true
    const openedFrom = view
    const active = () => view === openedFrom && parentActive()
    try {
      const target = draftTarget()
      if (!target) throw new SkillBrowserError("DRAFT_TARGET_UNAVAILABLE")
      await requireFeature(target)
      if (!checkTarget(target) || !active()) return
      const entries = await listNativeSkills(api.client, target.directory)
      if (!checkTarget(target) || !active()) return
      const browser: Browser = { target, store: stores(target.projectRoot), disabled: new Set(), entries }
      await readPolicy(browser)
      if (!checkTarget(target) || !active()) return
      renderList(browser)
    } catch (error) { notify(error, "CATALOG_CONNECTION_FAILED") }
    finally { loading = false }
  }
  const renderList = (browser: Browser) => {
    if (!checkTarget(browser.target)) return
    if (!browser.entries.length) {
      present(() => api.ui.DialogAlert({ title: "OpenArms skills", message: "No skills reported by OpenCode. Add native skills or configure skills.paths, then refresh the host." }), options.onBack ?? close)
      return
    }
    present(active => {
      const props: SkillListProps = {
        title: "OpenArms skills", placeholder: "Filter skills",
        options: browser.entries.map((entry, index) => ({ title: clean(entry.name), value: index })),
        offValues: new Set(browser.entries.flatMap((entry, index) => browser.disabled.has(entry.name) ? [index] : [])),
        onSelect: option => { if (active()) showActions(browser.entries[option.value], browser) },
      }
      return options.skillList ? options.skillList(props) : api.ui.DialogSelect(props)
    }, options.onBack ?? close)
  }
  const showActions = (entry: SkillEntry, browser: Browser) => {
    if (!checkTarget(browser.target)) return
    const off = browser.disabled.has(entry.name)
    present(active => api.ui.DialogSelect({
      title: `${clean(entry.name)} · ${off ? "OFF" : "ON"}${entry.error ? " · ERROR" : ""}`,
      skipFilter: true,
      options: [
        // Native DialogSelect hides disabled options. Keep all three rows and
        // enforce OFF/invalid guards in the handlers instead.
        { title: "ON", value: "on" },
        { title: "OFF", value: "off" },
        { title: "REQUEST", value: "request" },
      ],
      onSelect: option => {
        if (!active() || !checkTarget(browser.target) || busy) return
        if (entry.error) { notify(new SkillBrowserError("SKILL_CHANGED"), "SKILL_CHANGED"); return }
        if (option.value === "on" || option.value === "off") void change(entry, browser, option.value === "on")
        else if (option.value === "request") void request(entry, browser)
      },
    }), () => renderList(browser))
  }
  const revalidate = async (entry: SkillEntry, browser: Browser, token: number) => {
    await requireFeature(browser.target)
    if (!checkTarget(browser.target) || view !== token) return
    const current = (await listNativeSkills(api.client, browser.target.directory))
      .find(skill => skill.name === entry.name && skill.location === entry.location)
    await requireFeature(browser.target)
    if (!checkTarget(browser.target) || view !== token) return
    if (!current || current.error) throw new SkillBrowserError("SKILL_CHANGED")
    return current
  }
  const change = async (entry: SkillEntry, browser: Browser, enabled: boolean) => {
    busy = true
    const token = view
    try {
      if (!await revalidate(entry, browser, token)) return
      browser.disabled = new Set(await browser.store.set(entry.name, enabled))
      if (!checkTarget(browser.target) || view !== token) return // A finished write must not reopen a closed/navigated dialog.
      showActions(entry, browser)
      api.ui.toast({ title: enabled ? "Skill ON for project" : "Skill OFF for project", variant: "info",
        message: enabled ? "OpenArms restriction removed. Restart the host to refresh cached native permissions; existing host denies still apply."
          : "Subsequent native skill calls are blocked while the server plugin is active. In-flight calls and already-loaded instructions are unchanged." })
    } catch (error) { notify(error, "POLICY_WRITE_FAILED") }
    finally { busy = false }
  }
  const request = async (entry: SkillEntry, browser: Browser) => {
    busy = true
    const token = view
    try {
      const current = await revalidate(entry, browser, token)
      if (!current) return
      await readPolicy(browser)
      await requireFeature(browser.target)
      if (!checkTarget(browser.target) || view !== token) return
      if (browser.disabled.has(entry.name)) { showActions(entry, browser); throw new SkillBrowserError("SKILL_OFF") }
      if (typeof api.client.tui?.appendPrompt !== "function") throw new SkillBrowserError("APPEND_UNSUPPORTED")
      const result = await api.client.tui.appendPrompt(
        { directory: browser.target.directory, text: skillRequest(current) }, { signal: api.lifecycle.signal },
      )
      if (disposed || view !== token) return
      if (!sameTarget(browser.target) || result.error || result.data !== true) throw new SkillBrowserError("APPEND_UNCONFIRMED")
      api.ui.dialog.clear()
      api.ui.toast({ title: "Skill request appended", message: "Review your draft and submit when ready. OpenCode controls skill execution and permissions.", variant: "info" })
    } catch (error) { notify(error, "APPEND_UNCONFIRMED") }
    finally { busy = false }
  }
  // The root menu owns the sole /arms-skills command; this controller is internal.
  api.lifecycle.onDispose(() => { disposed = true; ++view })
  return { open: showList }
}
