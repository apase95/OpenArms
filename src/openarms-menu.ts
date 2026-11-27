import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { installSkillBrowser, type DialogFrame } from "./native-skills.ts"
import { FEATURES, projectFeatures, type FeatureID, type FeatureStores, type ProjectFeatures } from "./project-features.ts"
import type { ProjectSkills } from "./project-skills.ts"
import type { SkillListRenderer } from "./skill-list.ts"

type Target = { directory: string; root: string; route: string; sessionID?: string }
type Context = { target: Target; store: ProjectFeatures }

/** Feature controls remain accessible even when every runtime feature is OFF. */
export function installOpenArmsMenu(api: TuiPluginApi, frame: DialogFrame,
  dependencies: { features?: FeatureStores; skills?: (root: string) => ProjectSkills; skillList?: SkillListRenderer } = {}) {
  const stores = dependencies.features ?? projectFeatures
  let disposed = false, busy = false, view = 0
  const notify = (code: string, message: string) => {
    if (!disposed) api.ui.toast({ title: "OpenArms", message: `[${code}] ${message}`, variant: "error" })
  }
  const target = (): Target | undefined => {
    const route = api.route.current
    const { directory, worktree } = api.state.path
    const root = worktree && worktree !== "/" ? worktree : directory
    if (route.name === "home") return { directory, root, route: "home" }
    const sessionID = "params" in route ? route.params?.sessionID : undefined
    if (route.name === "session" && typeof sessionID === "string" && sessionID) return { directory, root, route: "session", sessionID }
  }
  const check = (original: Target) => {
    if (disposed) return false
    const current = target()
    if (current && current.directory === original.directory && current.root === original.root
      && current.route === original.route && current.sessionID === original.sessionID) return true
    notify("FEATURE_TARGET_CHANGED", "The project or session changed. Reopen /arms-skills; an in-flight save may still finish in the original project.")
    return false
  }
  const close = () => { if (!disposed) { ++view; api.ui.dialog.clear() } }
  const present = (render: (active: () => boolean) => ReturnType<TuiPluginApi["ui"]["DialogAlert"]>, back: () => void) => {
    const token = ++view
    const active = () => !disposed && view === token
    api.ui.dialog.replace(() => frame(() => render(active), {
      back: () => { if (active()) back() }, done: () => { if (active()) close() },
    }), () => { if (view === token) ++view })
  }
  const skills = installSkillBrowser(api, frame, dependencies.skills, {
    features: stores, onBack: () => open(), skillList: dependencies.skillList,
  })
  const open = () => {
    if (disposed) return
    const current = target()
    if (!current) { notify("FEATURE_TARGET_UNAVAILABLE", "Open a home or session prompt before opening OpenArms."); return }
    const context = { target: current, store: stores(current.root) }
    present(active => api.ui.DialogSelect({
      title: "OpenArms", skipFilter: true,
      options: [
        { title: "Skills management", value: "skills" },
        { title: "Output compaction", value: "output" },
        { title: "Features", value: "features" },
      ],
      onSelect: option => {
        if (!active() || !check(current)) return
        if (option.value === "skills") void skills.open(active)
        else if (option.value === "output") void showOutput(context)
        else if (option.value === "features") showFeatures(context)
      },
    }), close)
  }
  const showFeatures = (context: Context) => {
    if (!check(context.target)) return
    present(active => api.ui.DialogSelect({
      title: "OpenArms features", skipFilter: true,
      options: FEATURES.map(feature => ({ title: feature.name, value: feature.id })),
      onSelect: option => { if (active() && check(context.target)) void showFeature(context, option.value) },
    }), open)
  }
  const showFeature = async (context: Context, feature: FeatureID) => {
    const token = view
    try {
      const disabled = await context.store.read()
      if (!check(context.target) || view !== token) return
      renderFeature(context, feature, disabled)
    } catch {
      notify("FEATURE_STATE_UNAVAILABLE", "Cannot read project features. Review .openarms/features.json and private storage permissions.")
    }
  }
  const renderFeature = (context: Context, feature: FeatureID, disabled: FeatureID[]) => {
    const definition = FEATURES.find(item => item.id === feature)
    if (!definition) return
    present(active => api.ui.DialogSelect({
      title: `${definition.name} · ${disabled.includes(feature) ? "OFF" : "ON"}`, skipFilter: true,
      options: [{ title: "ON", value: "on" }, { title: "OFF", value: "off" }],
      onSelect: option => {
        if (!active() || !check(context.target) || busy) return
        if (option.value === "on" || option.value === "off") void change(context, feature, option.value === "on")
      },
    }), () => showFeatures(context))
  }
  const change = async (context: Context, feature: FeatureID, enabled: boolean) => {
    const token = view
    busy = true
    try {
      const disabled = await context.store.set(feature, enabled)
      if (!check(context.target) || view !== token) return
      renderFeature(context, feature, disabled)
      api.ui.toast({ title: `${FEATURES.find(item => item.id === feature)!.name} ${enabled ? "ON" : "OFF"}`, variant: "info",
        message: feature === "skills-management" && !enabled
          ? "Browser and OpenArms skill guards are disabled. Restart the host to remove cached OpenArms native denies; host permissions remain unchanged."
          : feature === "skills-management" ? "Saved per-skill choices apply again. Host permissions still apply."
            : feature === "compact-transcript"
              ? "Applies to the current project in OpenCode with the OpenArms transcript patch."
              : enabled ? "Subsequent supported tool output will be compacted when needed."
              : "Subsequent tool output is unchanged by OpenArms, with no new raw-output artifacts. Existing logs are preserved.",
      })
    } catch {
      notify("FEATURE_WRITE_UNCONFIRMED", "Cannot confirm the change. Review project path, features.json, private permissions and lock; refresh before retrying.")
    } finally { busy = false }
  }
  const showOutput = async (context: Context) => {
    const token = view
    try {
      const disabled = await context.store.read()
      if (!check(context.target) || view !== token) return
      present(() => api.ui.DialogAlert({
        title: `Output compaction · ${disabled.includes("output-compaction") ? "OFF" : "ON"}`,
        message: "Automatic processing of bash/read/grep/glob/list output. Compaction and original-output artifacts are one feature. Change ON/OFF through Features; native skill/custom tool results are never transformed.",
      }), open)
    } catch { notify("FEATURE_STATE_UNAVAILABLE", "Cannot read project features. Review .openarms/features.json.") }
  }
  const unregister = api.keymap.registerLayer({
    commands: [{ name: "openarms.menu", title: "OpenArms", namespace: "palette", slashName: "arms-skills",
      desc: "OpenArms tools and project feature ON/OFF", run: open }], bindings: [],
  })
  api.lifecycle.onDispose(() => { disposed = true; ++view; unregister() })
  return { open }
}
