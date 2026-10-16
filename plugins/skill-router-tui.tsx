/** @jsxImportSource @opentui/solid */
import { For, Show, createMemo, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { detectPackages } from "../src/project.ts"
import { orderedPackageNames, packageLabel, parseCommand } from "../src/commands.ts"
import { executeLocalSkillsCommand } from "../src/skills-service.ts"
import { createLocalRuntime } from "../src/local-library.ts"
import { HOME_SESSION as homeSession } from "../src/state-store.ts"
import { chooseVerifiedConfirmation, confirmationKey, sessionAction, interceptLocalPrompt, registerLocalSubmit, watchUsagePrompt } from "./tui-core.ts"
import path from "node:path"
import { createUsageRuntime, type BudgetEditAction } from "../src/usage-runtime.ts"
import { appendFile } from "node:fs/promises"
import { chooseAuditDialog, stageSkillAudit, type AuditOverrideRecord } from "../src/skill-audit-review.ts"
import { installSkill } from "../src/skill-install-pipeline.ts"
import { createOpenCodeModelAdapter, requireDecompilerModel } from "../src/skill-model-adapter.ts"

type PickerOption = {
  title: string
  value: string
  description?: string
  descriptionAlign?: "left" | "right"
}

type CustomDialogProps = {
  api: any
  title: string
  placeholder: string
  options: PickerOption[]
  onSelect: (value: string) => void | Promise<void>
}

function CustomDialog(props: CustomDialogProps) {
  const viewportSize = 8
  const theme = props.api.theme.current
  const back = props.options.find((option) => option.value === "__back__")
  const done = props.options.find((option) => option.value === "__done__")
  const choices = props.options.filter((option) => option.value !== "__back__" && option.value !== "__done__")
  const labelWidth = Math.min(24, Math.max(...choices.map((option) => option.title.length), 0) + 2)
  const descriptionWidth = Math.min(32, Math.max(...choices.map((option) => option.description?.length ?? 0), 0))
  const [query, setQuery] = createSignal("")
  const [selected, setSelected] = createSignal(0)
  const [busy, setBusy] = createSignal(false)
  const [hoveredAction, setHoveredAction] = createSignal<"back" | "done" | undefined>()

  const filtered = createMemo(() => {
    const needle = query().trim().toLowerCase()
    if (!needle) return choices
    return choices.filter((option) => `${option.title} ${option.description ?? ""}`.toLowerCase().includes(needle))
  })
  const navigation = createMemo(() => [...filtered(), ...[back, done].filter((option): option is PickerOption => !!option)])
  const viewport = createMemo(() => {
    const options = filtered()
    const selectedChoice = Math.min(selected(), Math.max(0, options.length - 1))
    const start = Math.max(0, Math.min(selectedChoice - Math.floor(viewportSize / 2), options.length - viewportSize))
    return { start, options: options.slice(start, start + viewportSize) }
  })

  const selectionColor = (option: PickerOption) => {
    if (["remove", "disable", "clear"].includes(option.value)) return theme.error
    if (["__back__", "__done__"].includes(option.value)) return theme.warning
    return theme.primary
  }

  const move = (offset: number) => {
    if (busy()) return
    const options = navigation()
    if (options.length === 0) return
    setSelected((current) => (current + offset + options.length) % options.length)
  }

  const moveToAction = (option: PickerOption | undefined) => {
    if (busy()) return
    if (!option) return
    const index = navigation().findIndex((item) => item.value === option.value)
    if (index >= 0) setSelected(index)
  }

  const activate = async (option: PickerOption | undefined) => {
    if (!option || busy()) return
    setBusy(true)
    try {
      await props.onSelect(option.value)
    } catch (error: any) {
      props.api.ui.toast({
        variant: "error",
        title: "Skill Router Error",
        message: "SKILL_ACTION_FAILED",
        duration: 10000,
      })
    } finally {
      setBusy(false)
    }
  }

  const selectCurrent = () => void activate(navigation()[selected()])

  const escape = () => {
    if (busy()) return
    if (query()) {
      setQuery("")
      setSelected(0)
      return
    }
    if (back) void activate(back)
    else props.api.ui.dialog.clear()
  }

  useKeyboard((event) => {
    if (event.name === "escape") {
      event.preventDefault()
      event.stopPropagation()
      escape()
      return
    }
    if (event.name === "up") {
      event.preventDefault()
      event.stopPropagation()
      move(-1)
    }
    if (event.name === "down") {
      event.preventDefault()
      event.stopPropagation()
      move(1)
    }
    if (event.name === "left") {
      event.preventDefault()
      event.stopPropagation()
      moveToAction(back ?? done)
    }
    if (event.name === "right") {
      event.preventDefault()
      event.stopPropagation()
      moveToAction(done ?? back)
    }
  })

  const action = (kind: "back" | "done", option: PickerOption | undefined) => {
    if (!option) return null
    const active = () => option && navigation()[selected()]?.value === option.value
    return (
      <box
        flexGrow={1}
        flexDirection="row"
        justifyContent={kind === "back" ? "flex-start" : "flex-end"}
        onMouseOver={() => {
          setHoveredAction(kind)
        }}
        onMouseOut={() => setHoveredAction(undefined)}
        onMouseUp={() => void activate(option)}
      >
        <box
          paddingLeft={1}
          paddingRight={1}
          backgroundColor={hoveredAction() === kind || active() ? selectionColor(option) : theme.backgroundPanel}
        >
          <text fg={hoveredAction() === kind || active() ? theme.selectedListItemText : theme.textMuted}>
            {option?.title ?? ""}
          </text>
        </box>
      </box>
    )
  }

  return (
    <box flexDirection="column" gap={1} paddingLeft={2} paddingRight={2} paddingBottom={1} width="100%">
      <box flexDirection="row" justifyContent="space-between" width="100%">
        <text fg={theme.text}><b>{props.title}</b></text>
        <text fg={theme.textMuted} onMouseUp={escape}>esc</text>
      </box>
      <input
        focused
        disabled={busy()}
        value={query()}
        placeholder={props.placeholder}
        placeholderColor={theme.textMuted}
        cursorColor={theme.primary}
        focusedBackgroundColor={theme.backgroundPanel}
        focusedTextColor={theme.text}
        onInput={(value) => {
          setQuery(value)
          setSelected(0)
        }}
        onSubmit={selectCurrent}
      />
      <Show when={filtered().length > 0} fallback={<text fg={theme.textMuted}>No matching options</text>}>
        <box flexDirection="column">
          <For each={viewport().options}>
            {(option, index) => {
              const absoluteIndex = () => viewport().start + index()
              const active = () => selected() === absoluteIndex()
              return (
                <box
                  flexDirection="row"
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={active() ? selectionColor(option) : theme.backgroundPanel}
                  onMouseOver={() => {
                    setHoveredAction(undefined)
                  }}
                  onMouseUp={() => void activate(option)}
                >
                  <text
                    width={labelWidth}
                    wrapMode="none"
                    overflow="hidden"
                    fg={active() ? theme.selectedListItemText : theme.text}
                  >
                    {option.title}
                  </text>
                  <box
                    flexGrow={1}
                    flexDirection="row"
                    justifyContent={option.descriptionAlign === "left" ? "flex-start" : "flex-end"}
                  >
                    <box width={option.descriptionAlign === "left" ? undefined : descriptionWidth}>
                      <text
                        wrapMode="none"
                        overflow="hidden"
                        fg={active() ? theme.selectedListItemText : theme.textMuted}
                      >
                        {option.description ?? ""}
                      </text>
                    </box>
                  </box>
                </box>
              )
            }}
          </For>
        </box>
      </Show>
      <Show when={busy()}>
        <text fg={theme.warning}>Working...</text>
      </Show>
      <Show when={back || done}>
        <box flexDirection="row" width="100%">
          {action("back", back)}
          {action("done", done)}
        </box>
      </Show>
    </box>
  )
}

function LibraryPathDialog(props: { api: any; initial: string; onCancel: () => void; onSubmit: (root: string) => Promise<void> }) {
  const theme = props.api.theme.current
  const [value, setValue] = createSignal(props.initial)
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal("")
  useKeyboard(event => {
    if (event.name === "escape" && !busy()) {
      event.preventDefault()
      event.stopPropagation()
      props.onCancel()
    }
  })
  const submit = async () => {
    if (busy()) return
    setBusy(true)
    try { await props.onSubmit(value().trim()) }
    catch { setError("Library unavailable or changed. Choose an absolute root containing registry.json and skills/.") }
    finally { setBusy(false) }
  }
  return <box flexDirection="column" padding={1} gap={1}>
    <box flexDirection="column" gap={1}>
    <text>Set library path</text>
    <input focused focusedBackgroundColor={theme.primary} focusedTextColor={theme.selectedListItemText} value={value()} disabled={busy()} placeholder="Absolute library root" onInput={setValue} onSubmit={() => void submit()} />
    <Show when={error()}><text>{error()}</text></Show>
    <text onMouseUp={() => !busy() && props.onCancel()}>Cancel (Esc)</text>
    </box>
  </box>
}

function ConfirmationDialog(props: any) {
  const [selected, setSelected] = createSignal(false)
  const theme = props.api.theme.current
  useKeyboard(event => {
    const next = confirmationKey(event.name, selected())
    // Consume ordinary typing too: it must not filter options or edit the prompt.
    event.preventDefault()
    event.stopPropagation()
    setSelected(next.selected)
    if (next.accepted !== undefined) props.onConfirm(next.accepted)
  })
   return <box flexDirection="column" padding={1}>
    <box flexDirection="column" gap={1}>
     <text fg={theme.text}><b>{props.title}</b></text>
     <text wrapMode="word" fg={theme.text}>{props.message}</text>
     <box flexDirection="column" gap={0}>
     <For each={[false, true]}>{value => <box height={1} flexShrink={0} paddingLeft={1} paddingRight={1}
      backgroundColor={selected() === value ? theme.primary : theme.backgroundPanel}
      onMouseUp={() => props.onConfirm(value)}>
       <text height={1} wrapMode="none" overflow="hidden" fg={selected() === value ? theme.selectedListItemText : theme.text}>{value ? props.yes : props.no}</text>
    </box>}</For>
    </box>
    </box>
  </box>
}

/** Same renderer/gateway for real audit commands and injected offline host fixtures. */
export function createStagedAuditUI(api: any, record: (event: AuditOverrideRecord) => Promise<void>) {
  return { choose: (title: string, message: string, yes: string, no: string) => chooseAuditDialog(api, props => <ConfirmationDialog api={api} {...props} />, title, message, yes, no), record }
}

/** Shared production UI; fixture injects external transport/model only. */
export async function runSkillInstallUI(api: any, input: string, runtime: Awaited<ReturnType<typeof createLocalRuntime>>, options: Omit<Parameters<typeof installSkill>[1], 'projectRoot' | 'ui' | 'progress'>) {
  const before = await runtime.getLibrary()
  const audit = createStagedAuditUI(api, async record => {
    await appendFile(path.join(path.dirname(runtime.stateFile), 'skill-audit-overrides.jsonl'), JSON.stringify(record) + '\n', { mode: 0o600 })
  })
  const result = await installSkill(input, { ...options, projectRoot: runtime.projectRoot, ui: { ...audit, choose: async (...args) => {
    if ((await runtime.getLibrary()).revision !== before.revision) throw Error('LIBRARY_CHANGED')
    return audit.choose(...args)
  } }, progress: message => api.ui.toast({ title: 'Skill installation', message, variant: 'info', duration: 5000 }) })
  // Registration never implicitly changes single-library configuration.
  let active = false
  if ((await runtime.getLibrary()).revision === before.revision) {
    if (before.root === result.root) { await runtime.refreshLibrary(); active = true }
    else if (await audit.choose('Use installed library?', `Library: ${result.root}\nThis replaces the workspace library and clears selections, load history and task locks. No merge/fallback. Start /new after switching.`, 'Switch library', 'Keep current library')) {
      await runtime.configureLibrary(result.root, before.revision, true); active = true
    }
  }
  api.ui.toast({ title: 'Skill installed', message: `${result.id}: ${result.references} references. ${active ? 'Choose /skills use to select; load exact ID/topic only when needed.' : 'Current library unchanged; configure the installed root in /skills status to use it.'} No measured token-savings claim.`, variant: 'success', duration: 12000 })
  return result
}

function BudgetInputDialog(props: { title: string; onCancel: () => void; onSubmit: (value: string) => Promise<void> }) {
  const [value, setValue] = createSignal("")
  const [error, setError] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  useKeyboard(event => {
    if (event.name !== "escape" || busy()) return
    event.preventDefault(); event.stopPropagation(); props.onCancel()
  })
  const submit = async () => {
    if (busy()) return
    setBusy(true)
    try { await props.onSubmit(value()) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <box flexDirection="column" padding={1} gap={1}>
    <text>{props.title}</text>
    <input focused disabled={busy()} value={value()} onInput={setValue} onSubmit={() => void submit()} />
    <Show when={error()}><text>{error()}</text></Show>
    <text onMouseUp={() => !busy() && props.onCancel()}>Cancel (Esc)</text>
  </box>
}

type ReadOnlyDialogProps = {
  api: any
  title: string
  message: string
  onBack: () => void | Promise<void>
  onEdit?: () => void | Promise<void>
  libraryFirst?: boolean
}

function ReadOnlyDialog(props: ReadOnlyDialogProps) {
  const viewportSize = 10
  const theme = props.api.theme.current
  const lines = props.message.split("\n")
  const status = props.title === "Skill Status"
  const packages = props.title === "Skill Packages"
  const inspect = props.title === "Skill Inspect"
  const help = props.title === "Skills Help"
  const skillList = props.title.endsWith(" Skills") && !status
  const helpRows = lines.map((line) => {
    const [action = "", packageName = "", skill = ""] = line.replace(/^•\s*/, "").trim().split(/\s+/)
    return { action, packageName, skill }
  })
  const packageRows = lines.map((line) => {
    const match = line.trim().replace(/^•\s*/, "").match(/^(.*?)(?: \((.*)\))?$/)
    return { name: match?.[1] ?? "", state: match?.[2] ?? "" }
  })
  const packageStateWidth = Math.max(...packageRows.map((row) => row.state.length), 0)
  const inspectStateWidth = Math.max(...lines.map((line) => line.split("\t")[1]?.length ?? 0), 0)
  const actionWidth = Math.max("Action".length, ...helpRows.map((row) => row.action.length)) + 4
  const packageWidth = Math.max("Package".length, ...helpRows.map((row) => row.packageName.length)) + 4
  const skillWidth = Math.max("Skill".length, ...helpRows.map((row) => row.skill.length))
  const [offset, setOffset] = createSignal(0)
  const [backBusy, setBackBusy] = createSignal(false)
  const maxOffset = Math.max(0, lines.length - viewportSize)

  const move = (amount: number) => {
    setOffset((current) => Math.max(0, Math.min(maxOffset, current + amount)))
  }

  const goBack = async () => {
    if (backBusy()) return
    setBackBusy(true)
    try {
      await props.onBack()
    } catch (error: any) {
      props.api.ui.toast({
        variant: "error",
        title: "Skill Router Error",
        message: "SKILL_ACTION_FAILED",
        duration: 10000,
      })
    } finally {
      setBackBusy(false)
    }
  }

  useKeyboard((event) => {
    if (props.onEdit && event.name === "e") {
      event.preventDefault()
      event.stopPropagation()
      void props.onEdit()
      return
    }
    if (event.name === "escape") {
      event.preventDefault()
      event.stopPropagation()
      void goBack()
      return
    }
    if (event.name === "enter" || event.name === "return") {
      event.preventDefault()
      event.stopPropagation()
      void goBack()
      return
    }
    if (event.name === "up") {
      event.preventDefault()
      move(-1)
    }
    if (event.name === "down") {
      event.preventDefault()
      move(1)
    }
    if (event.name === "pageup") {
      event.preventDefault()
      move(-viewportSize)
    }
    if (event.name === "pagedown") {
      event.preventDefault()
      move(viewportSize)
    }
    if (event.name === "home") {
      event.preventDefault()
      setOffset(0)
    }
    if (event.name === "end") {
      event.preventDefault()
      setOffset(maxOffset)
    }
  })

  return (
    <box flexDirection="column" gap={1} paddingLeft={2} paddingRight={2} paddingBottom={1} width="100%">
      <box flexDirection="row" justifyContent="space-between" width="100%">
        <text fg={theme.text}><b>{props.title}</b></text>
        <text fg={theme.textMuted} onMouseUp={() => void goBack()}>esc</text>
      </box>
      <Show when={props.onEdit && props.libraryFirst}>
        <text fg={theme.primary} onMouseUp={() => props.onEdit?.()}>{props.title === "Budget" ? "Edit project budget (e)" : "Set / edit library path (e)"}</text>
      </Show>
      <box flexDirection="column">
        <For each={lines.slice(offset(), offset() + viewportSize)}>
          {(line, index) => {
            const text = line.trim()
            if (help) {
              const row = helpRows[offset() + index()]
              return (
                <box flexDirection="column">
                  <Show when={offset() === 0 && index() === 0}>
                    <box flexDirection="row" paddingLeft={1} paddingRight={1} width="100%">
                      <text width={actionWidth} fg={theme.secondary}><b>Action</b></text>
                      <text width={packageWidth} fg={theme.secondary}><b>Package</b></text>
                      <text width={skillWidth} fg={theme.secondary}><b>Skill</b></text>
                    </box>
                  </Show>
                  <box flexDirection="row" paddingLeft={1} paddingRight={1} width="100%">
                    <text width={actionWidth} fg={theme.text}>{row.action}</text>
                    <text width={packageWidth} fg={theme.text}>{row.packageName}</text>
                    <text width={skillWidth} fg={theme.text}>{row.skill}</text>
                  </box>
                </box>
              )
            }
            if ((inspect || status || skillList) && text.startsWith("# ")) {
              return <text fg={theme.secondary}><b>{text.slice(2)}</b></text>
            }
            if ((inspect || status || skillList) && line.includes("\t")) {
              const [skill, state = ""] = line.split("\t")
              return (
                <box flexDirection="row" paddingLeft={1} paddingRight={1} width="100%">
                  <text fg={theme.text}>{skill}</text>
                  <box flexGrow={1} flexDirection="row" justifyContent="flex-end">
                    <box width={inspectStateWidth}>
                      <text fg={theme.textMuted}>{state}</text>
                    </box>
                  </box>
                </box>
              )
            }
            if (status && text.endsWith(":")) {
              return <text fg={theme.secondary}><b>{text.slice(0, -1)}</b></text>
            }
            if (status && text.startsWith("• ")) {
              return (
                <box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1} width="100%">
                  <text fg={theme.text}>{text.slice(2)}</text>
                  <box flexGrow={1} flexDirection="row" justifyContent="flex-end">
                    <box width={"Activated".length}>
                      <text fg={theme.textMuted}>Activated</text>
                    </box>
                  </box>
                </box>
              )
            }
            if (packages && text.startsWith("• ")) {
              const match = text.slice(2).match(/^(.*?)(?: \((.*)\))?$/)
              return (
                <box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1} width="100%">
                  <text fg={theme.text}>{match?.[1] ?? text.slice(2)}</text>
                  <box flexGrow={1} flexDirection="row" justifyContent="flex-end">
                    <box width={packageStateWidth}>
                      <text fg={theme.textMuted}>{match?.[2] ?? ""}</text>
                    </box>
                  </box>
                </box>
              )
            }
            if (skillList && text.endsWith(":")) {
              return <text fg={theme.secondary}><b>{text.slice(0, -1)}</b></text>
            }
            if (skillList && text.startsWith("• ")) {
              return (
                <box paddingLeft={1} paddingRight={1} width="100%">
                  <text fg={theme.text}>{text.slice(2)}</text>
                </box>
              )
            }
            return <text fg={theme.text}>{line || " "}</text>
          }}
        </For>
      </box>
      <Show when={props.onEdit && !props.libraryFirst}>
        <text fg={theme.primary} onMouseUp={() => props.onEdit?.()}>{props.title === "Budget" ? "Edit project budget (e)" : "Set / edit library path (e)"}</text>
      </Show>
      <box flexDirection="row" justifyContent="flex-start">
        <box
          paddingLeft={1}
          paddingRight={1}
          backgroundColor={theme.warning}
          onMouseUp={() => void goBack()}
        >
          <text fg={theme.selectedListItemText}>{backBusy() ? "Working..." : "← Back"}</text>
        </box>
      </box>
    </box>
  )
}

export default {
  id: "skill-router-tui",
  async tui(api: any) {
    let activePrompt: any
    let activeSessionID = homeSession
    let disposeSubmit = () => {}
    const runtime = await createLocalRuntime({
      worktree: api.state.path.worktree,
      directory: api.state.path.directory,
    })
    const { store, projectRoot, stateFile } = runtime
    let registry = { version: 1, packages: {}, skills: {} } as Awaited<ReturnType<typeof runtime.refreshLibrary>>["registry"]
    const refreshRegistry = async () => {
      detectedSnapshot = undefined
      try { registry = (await runtime.refreshLibrary()).registry; return true }
      catch { registry = { version: 1, packages: {}, skills: {} } as typeof registry; return false }
    }
    const usage = createUsageRuntime(path.dirname(stateFile), projectRoot)
    // A persisted home draft is history, not a fresh explicit home action.
    const initialLibrary = await runtime.getLibrary()
    if (initialLibrary.root) await runtime.initializeLocalSession(homeSession, initialLibrary.revision, false, undefined, true).catch(() => {})
    const initializing = new Map<string, Promise<unknown>>()
    let detectedSnapshot: Set<string> | undefined
    let detectedAt = 0
    let detecting: Promise<Set<string>> | undefined

    const refreshDetection = (force = false) => {
      if (!force && detectedSnapshot && Date.now() - detectedAt < 30_000) return Promise.resolve(detectedSnapshot)
      if (detecting) return detecting
      const pending = detectPackages(projectRoot, registry).then((detected) => {
        detectedSnapshot = detected
        detectedAt = Date.now()
        return detected
      }).finally(() => {
        if (detecting === pending) detecting = undefined
      })
      detecting = pending
      return pending
    }

    const choose = (title: string, message: string, yes: string, no: string) => chooseVerifiedConfirmation(api, title, message, yes, no,
      props => <ConfirmationDialog api={api} {...props} />)

     const ensureSession = (sessionID: string, resetHome = false) => {
      const current = initializing.get(sessionID)
      if (current) return current
      const pending = (async () => {
        if (!await refreshRegistry()) return
        const config = await runtime.getLibrary()
        if (!config.root) return
        const parentID = api.state.session.get(sessionID)?.parentID
        if (parentID) {
          await runtime.initializeLocalSession(sessionID, config.revision, false, parentID)
          return
        }
         await runtime.initializeLocalSession(sessionID, config.revision, false, undefined, resetHome && sessionID === homeSession)
      })()
      initializing.set(sessionID, pending)
      void pending.finally(() => {
        if (initializing.get(sessionID) === pending) initializing.delete(sessionID)
      }).catch(() => {})
      return pending
    }

    const toast = (
      title: string,
      message: string,
      variant: "info" | "success" | "warning" | "error" = "info",
    ) => api.ui.toast({
      variant,
      title,
      message,
      duration: variant === "error" ? 10000 : 12000,
    })

    function openReadOnly(title: string, message: string, onBack: () => void | Promise<void>) {
      api.ui.dialog.replace(() => <ReadOnlyDialog api={api} title={title} message={message} onBack={onBack}
        onEdit={title === "Skill Status" ? openLibraryEditor : title === "Budget" ? () => openBudgetMenu(activeSessionID) : undefined} libraryFirst={!message.includes("\t")} />)
      api.ui.dialog.setSize("medium")
    }

    async function openLibraryEditor() {
      const config = await runtime.getLibrary()
      api.ui.dialog.replace(() => <LibraryPathDialog api={api} initial={config.root ?? ""} onCancel={() => void run("status")}
        onSubmit={async root => {
           const allowed = await choose("Change library path?", "Clears skill selections, load history and task locks in this workspace. Start /new after changing.", "Confirm", "Cancel")
          if (allowed) {
            try {
              await runtime.configureLibrary(root, config.revision, true)
              await refreshRegistry()
              toast("Library changed", "Re-select skills. Recommended: open /new.", "success")
            } catch {
              toast("Library not changed", "Invalid or changed library. Choose an absolute root containing registry.json and skills/.", "error")
            }
          }
          await run("status")
        }} />)
      api.ui.dialog.setSize("medium")
    }

    const run = async (args: string, sessionID = activeSessionID, onReadOnlyBack?: () => void | Promise<void>, pickerRevision?: string) => {
      try {
        await ensureSession(sessionID)
        const expectedRevision = pickerRevision ?? (await runtime.getLibrary()).revision
        if ((await runtime.getLibrary()).revision !== expectedRevision) throw new Error("LIBRARY_CHANGED")
        const command = parseCommand(args)
        const session = await store.getSession(projectRoot, sessionID)
        if (command.action === "clear" && Object.keys(session?.packages ?? {}).length > 0) {
          const allowed = await choose(
            "Clear all skills?",
            `Disable ${Object.keys(session!.packages).length} enabled package(s) for this session?`,
            "Clear",
            "Cancel",
          )
          if (!allowed) {
            toast("No Changes", "Clear was cancelled", "warning")
            return
          }
        }
        if (command.action === "disable") {
          if (session?.packages && command.packageName in session.packages) {
            const definition = registry.packages[command.packageName]
            const skills = [...(definition?.core ?? []), ...session.packages[command.packageName]]
            const allowed = await choose(
              `Disable ${packageLabel(command.packageName)}?`,
              ["This also removes:", ...skills.map((skill) => `• ${skill}`)].join("\n"),
              "Disable",
              "Cancel",
            )
            if (!allowed) {
              toast("No Changes", "Disable was cancelled", "warning")
              return
            }
          }
        }
        const message = await executeLocalSkillsCommand(runtime, sessionID, args, expectedRevision)
        const titles: Record<string, string> = {
          status: "Skill Status",
          packages: "Skill Packages",
          inspect: "Skill Inspect",
          help: "Skills Help",
          list: command.action === "list" ? `${packageLabel(command.packageName)} Skills` : "Package Skills",
          use: "Skills Enabled",
          add: "Skills Enabled",
          remove: "Skills Removed",
          disable: "Package Disabled",
          clear: "Skills Cleared",
        }
        const readOnly = ["status", "packages", "inspect", "help", "list"].includes(command.action)
        const unchanged = message === "No changes were made" || message === "No skills were changed"
        if (readOnly) {
          openReadOnly(titles[command.action], message, onReadOnlyBack ?? (() => api.ui.dialog.clear()))
          return
        }
        toast(unchanged ? "No Changes" : titles[command.action], message, unchanged ? "warning" : readOnly ? "info" : "success")
      } catch (error: any) {
        const message = error.message === "NOT_CONFIGURED" ? "Set a library path in /skills status."
          : error.message === "LIBRARY_CHANGED" ? "Library changed. Re-open the picker and re-select skills."
          : error.message === "INVALID_LIBRARY" ? "Library unavailable. Edit the path in /skills status."
          : "Invalid skills command or unavailable state. Open /skills help for syntax."
        toast("Skill Router Error", message, "error")
      }
    }

    const openSelect = (
      title: string,
      placeholder: string,
      options: PickerOption[],
      onSelect: (value: string) => void | Promise<void>,
      emptyMessage = "No matching options are available",
    ) => {
      if (options.every((option) => option.value === "__back__" || option.value === "__done__")) {
        api.ui.dialog.clear()
        toast("No Options", emptyMessage, "warning")
        return
      }
      api.ui.dialog.replace(() => (
        <CustomDialog api={api} title={title} placeholder={placeholder} options={options} onSelect={onSelect} />
      ))
      api.ui.dialog.setSize("medium")
    }

    const openSkillPicker = async (action: "use" | "add" | "remove", packageName: string, sessionID: string, revision: string) => {
      if ((await runtime.refreshLibrary()).revision !== revision) throw new Error("LIBRARY_CHANGED")
      const definition = registry.packages[packageName]
      const session = await store.getSession(projectRoot, sessionID)
      const selected = new Set(session?.packages[packageName] ?? [])
      let skills = definition.optional
      if (action === "add") skills = skills.filter((skill) => !selected.has(skill))
      if (action === "remove") skills = skills.filter((skill) => selected.has(skill))

      const options: Array<{ title: string; value: string; description?: string }> = skills.map((skill) => ({
        title: skill,
        value: skill,
        description: selected.has(skill) ? "Activated" : "Optional",
      }))
      if (action === "use") {
        options.unshift({ title: definition.core.join(", "), value: "", description: "Core" })
      }
      options.push(
        { title: "← Back", value: "__back__" },
        { title: "Done", value: "__done__" },
      )
      openSelect(
        "Select Skill",
        "Type to filter skills",
        options,
        async (skill) => {
          if (skill === "__back__") {
            await openPackagePicker(action, sessionID)
            return
          }
          if (skill === "__done__") {
            api.ui.dialog.clear()
            return
          }
           await run(`${action} ${packageName}${skill ? ` ${skill}` : ""}`, sessionID, undefined, revision)
           await openSkillPicker(action, packageName, sessionID, revision)
        },
        action === "add"
          ? "All optional skills are already enabled"
          : "This package has no enabled optional skills to remove",
      )
    }

    const openPackagePicker = async (action: "list" | "use" | "add" | "remove" | "disable", sessionID: string) => {
      await ensureSession(sessionID)
      const snapshot = await runtime.refreshLibrary()
      registry = snapshot.registry
      const revision = snapshot.revision
      if (detecting) await detecting
      const session = await store.getSession(projectRoot, sessionID)
      const enabled = new Set(Object.keys(session?.packages ?? {}))
      const detected = detectedSnapshot ?? new Set<string>()
      let names = orderedPackageNames(registry)
      if (["add", "remove", "disable"].includes(action)) names = names.filter((name) => enabled.has(name))

      const options: PickerOption[] = names.map((name) => ({
        title: packageLabel(name),
        value: name,
        description: enabled.has(name)
          ? "Activated"
          : registry.packages[name].detect.always
            ? "Available"
            : detected.has(name) ? "Detected" : undefined,
      }))
      options.push(
        { title: "← Back", value: "__back__" },
        { title: "Done", value: "__done__" },
      )

      openSelect(
        "Select Package",
        "Type to filter packages",
        options,
        async (packageName) => {
          if (packageName === "__back__") {
            openActionPicker(sessionID)
            return
          }
          if (packageName === "__done__") {
            api.ui.dialog.clear()
            return
          }
          if (action === "list") {
            await run(`${action} ${packageName}`, sessionID, () => openPackagePicker(action, sessionID))
            return
          }
          if (action === "disable") {
             await run(`${action} ${packageName}`, sessionID, undefined, revision)
            api.ui.dialog.clear()
            return
          }
           await openSkillPicker(action, packageName, sessionID, revision)
        },
        "No active packages. Use 'use' to enable one",
      )
    }

    const openActionPicker = (sessionID = activeSessionID) => {
      activePrompt?.reset()
      void refreshDetection(true)
      const actions: PickerOption[] = [
        { title: "status", value: "status", description: "Show enabled packages and skills" },
        { title: "packages", value: "packages", description: "Show packages and project detection" },
        { title: "inspect", value: "inspect", description: "Check which skills were actually loaded" },
        { title: "list", value: "list", description: "Show skills in a package" },
        { title: "use", value: "use", description: "Enable a package and optional skill" },
        { title: "add", value: "add", description: "Add an optional skill" },
        { title: "remove", value: "remove", description: "Remove an optional skill" },
        { title: "disable", value: "disable", description: "Disable one package" },
        { title: "clear", value: "clear", description: "Disable all packages for this session" },
        { title: "help", value: "help", description: "Show command syntax" },
        { title: "install", value: "install", description: "Install an audited GitHub skill" },
        { title: "Done", value: "__done__" },
      ].map((option) => option.value === "__done__" ? option : { ...option, descriptionAlign: "left" })
      openSelect("Select Action", "Type to filter actions", actions, async (action) => {
        if (action === "__done__") {
          api.ui.dialog.clear()
          return
        }
        if (action === 'install') { openInstall(); return }
        if (["status", "packages", "inspect", "help"].includes(action)) {
          await run(action, sessionID, () => openActionPicker(sessionID))
          return
        }
        if (action === "clear") {
          await run(action, sessionID)
          api.ui.dialog.clear()
          return
        }
        await openPackagePicker(action as "list" | "use" | "add" | "remove" | "disable", sessionID).catch((error: any) => {
          api.ui.dialog.clear()
          toast("Skill Router Error", "SKILL_ACTION_FAILED", "error")
        })
      })
    }

    let installing = false
    const openInstall = (input?: string) => {
      if (installing) { toast('Install busy', 'Finish or cancel the current installation.', 'warning'); return }
      const modelInput = (command: string) => {
        api.ui.dialog.replace(() => <BudgetInputDialog title="Install model: enter exact providerID/modelID (no fallback)" onCancel={() => api.ui.dialog.clear()} onSubmit={async value => {
          const slash = value.indexOf('/')
          const selectedModel = requireDecompilerModel({ providerID: value.slice(0, slash), modelID: slash < 1 ? '' : value.slice(slash + 1) })
          installing = true
          const controller = new AbortController()
          api.lifecycle.onDispose(() => controller.abort())
          try {
            await runSkillInstallUI(api, command, runtime, { selectedModel, adapter: createOpenCodeModelAdapter(api.client), signal: controller.signal })
            await refreshRegistry()
          } catch (error) {
            const code = (error as Error).message
            toast(/CANCELLED|CONSENT|AUDIT_DENIED/.test(code) ? 'Install cancelled or denied' : 'Install failed', 'No automatic retry or fallback. Inspect target/registry before retrying if publication or cleanup failed. Existing library selection is not escalated.', 'warning')
          } finally { installing = false }
        }} />)
        api.ui.dialog.setSize('large')
      }
      if (input?.trim() !== '/skills install') { if (input) { modelInput(input); return } }
      api.ui.dialog.replace(() => <BudgetInputDialog title="Install: [--local|--global] [--overwrite] HTTPS GitHub URL" onCancel={() => api.ui.dialog.clear()} onSubmit={async value => modelInput(`/skills install ${value}`)} />)
      api.ui.dialog.setSize('large')
    }

    const showUsage = async (input: string, sessionID: string, back = () => api.ui.dialog.clear()) => {
      const message = await usage.command(input, sessionID)
      openReadOnly(input === "/budget" ? "Budget" : "Usage and Budget", `${input === "/budget" ? `Project path: ${projectRoot}\n` : ""}${message}`, back)
    }
    const openUsageSteps = (sessionID = activeSessionID) => {
      openSelect("Usage scope", "Choose scope", ["today", "session", "project", "model"].map(value => ({ title: value, value })).concat([{ title: "Cancel", value: "__done__" }]), async value => {
        if (value === "__done__") { api.ui.dialog.clear(); return }
        // Only selection consumes the original command; Escape leaves it visible.
        activePrompt?.reset()
        if (value !== "model") { await showUsage(`/usage ${value}`, sessionID, () => openUsageSteps(sessionID)); return }
        try {
          const models = await usage.knownModels()
          if (!models.length) { openReadOnly("Usage models", "No known model IDs recorded for this project. No provider query was made.", () => openUsageSteps(sessionID)); return }
          openSelect("Usage model", "Filter recorded model IDs", models.map(value => ({ title: value, value })).concat([{ title: "Cancel", value: "__done__" }]), async model => {
            if (model === "__done__") { api.ui.dialog.clear(); return }
            await showUsage(`/usage model ${model}`, sessionID, () => openUsageSteps(sessionID))
          })
        } catch { toast("Usage unavailable", "Cannot read known model IDs from local storage.", "error") }
      })
    }
    const openBudgetMenu = (sessionID = activeSessionID) => {
      const options: PickerOption[] = [
        { title: "Dashboard", value: "dashboard" },
        { title: "Set day cost limit", value: "day-cost", description: "Project day · USD" },
        { title: "Set session cost limit", value: "session-cost", description: "Every project session · USD" },
        { title: "Warning percentages", value: "warnings", description: "Enable report-only warnings" },
        { title: "Remove day cost limit", value: "remove-day-cost", description: "Also disables inherited global limit" },
        { title: "Remove session cost limit", value: "remove-session-cost", description: "Also disables inherited global limit" },
        { title: "Cancel", value: "__done__" },
      ]
      const save = async (action: BudgetEditAction, value: string) => {
        const ticket = await usage.prepareBudgetEdit(action, value)
        const library = await runtime.getLibrary()
        if (!await choose("Save project budget?", `Project path: ${projectRoot}\n${action}: ${value || "disable selected cost limit, including global inheritance"}\nSession limit applies independently to every project session. Other metrics/settings are preserved. Report-only; does not block requests.`, "Save", "Cancel")) { openBudgetMenu(sessionID); return }
        if ((await runtime.getLibrary()).revision !== library.revision) throw Error("LIBRARY_CHANGED")
        await usage.commitBudgetEdit(ticket)
        toast("Budget saved", "Project override saved. Report-only; no blocking.", "success")
        openBudgetMenu(sessionID)
      }
      openSelect("Project budget · report-only", "Choose budget action", options, async value => {
        if (value === "__done__") { api.ui.dialog.clear(); return }
        if (value === "dashboard") { await showUsage("/budget", sessionID, () => openBudgetMenu(sessionID)); return }
        const action = value as BudgetEditAction
        if (value.startsWith("remove-")) {
          try { await save(action, "") } catch (e) { toast("Budget not saved", (e as Error).message, "error"); openBudgetMenu(sessionID) }
          return
        }
        api.ui.dialog.replace(() => <BudgetInputDialog title={value === "warnings" ? "Warning percentages: comma-separated, 0 < n ≤ 100" : "Cost limit USD: positive, finite, at most 1,000,000"} onCancel={() => openBudgetMenu(sessionID)} onSubmit={async input => {
          try { await save(action, input) }
          catch (e) { toast("Budget not saved", (e as Error).message, "error"); openBudgetMenu(sessionID) }
        }} />)
      })
    }
    const runLocal = (input: string, sessionID: string) => {
      if (/^\/skills\s+install(?:\s|$)/.test(input)) { openInstall(input); return }
      if (/^\/skills\s+audit(?:\s|$)/.test(input)) {
        const url = input.replace(/^\/skills\s+audit\s*/, '')
        void stageSkillAudit(url, createStagedAuditUI(api, async record => {
          await appendFile(path.join(path.dirname(stateFile), 'skill-audit-overrides.jsonl'), JSON.stringify(record) + '\n', { mode: 0o600 })
        })).then(result => toast('Staged audit only', result === 'denied' ? 'Review denied. Temporary download removed. Nothing installed.' : 'Review continued; temporary download removed. Nothing installed or loaded.', result === 'denied' ? 'warning' : 'info'))
          .catch(() => toast('Audit failed', 'Download, audit or cleanup failed. Nothing installed.', 'error'))
        return
      }
      if (input === "/budget") { void showUsage(input, sessionID); return }
      if (input === "/usage") { openUsageSteps(sessionID); return }
      if (/^\/(usage|budget)(?:\s|$)/.test(input)) {
        void showUsage(input, sessionID)
      } else if (input === "/skills") openActionPicker(sessionID)
      else void run(input.slice("/skills".length).trim(), sessionID)
    }
    const submit = () => {
      const prompt = activePrompt
      const sessionID = activeSessionID
      if (!interceptLocalPrompt(prompt, input => runLocal(input, sessionID))) prompt?.submit()
    }
    const renderPrompt = (value: any, props: Record<string, unknown>, sessionID: string) => {
      let promptRef: any
      return api.ui.Prompt({
        ...props,
        visible: value.visible,
        disabled: value.disabled,
        ref(next: any) {
          if (!next) {
            value.ref?.(undefined)
            if (activePrompt === promptRef) { activePrompt = undefined; disposeSubmit() }
            return
          }
           promptRef = next
           activePrompt = next
           const enteringHome = sessionID === homeSession && activeSessionID !== homeSession
          activeSessionID = sessionID
          // Public slot ref submission must use the same pre-submit decision.
          value.ref?.({
            get focused() { return next.focused },
            get current() { return next.current },
            set: (prompt: any) => next.set(prompt), reset: () => next.reset(),
            blur: () => next.blur(), focus: () => next.focus(),
            submit: () => { if (!interceptLocalPrompt(next, input => runLocal(input, sessionID))) next.submit() },
          })
            void ensureSession(sessionID, enteringHome).catch((error: any) => {
            toast("Skill Router Error", "SKILL_ACTION_FAILED", "error")
          })
          disposeSubmit()
           // registerLayer target is a concrete Renderable, NOT a Solid accessor.
           // The public pre-key interceptor runs before autocomplete, base-mode
           // dispatch and the textarea's native submission. Ordinary keys escape.
           const disposeInput = registerLocalSubmit(api, next,
             () => activePrompt === next && value.visible !== false && !value.disabled,
             input => runLocal(input, sessionID))
           const disposeCommands = api.keymap.registerLayer({
             priority: 1000,
             commands: [
               { name: "prompt.submit", title: "Submit input", hidden: true,
                 run(context: any) {
                   if (!activePrompt?.focused || api.ui.dialog.open) return false
                   context.event?.preventDefault()
                   context.event?.stopPropagation()
                   submit()
                 },
               },
              {
                 name: "prompt.skills",
                 title: "Manage skills",
                 namespace: "palette",
                desc: "Choose actions, packages, and skills",
                slashName: "skills",
                 run: sessionAction(() => activeSessionID, openActionPicker),
               },
                ...["usage", "budget"].map(name => ({
                 name: `prompt.openarms.${name}`, title: name === "usage" ? "Show usage" : "Show budget",
                 namespace: "palette", slashName: name, desc: "Local read-only report; no model request",
                 run: () => { activePrompt?.reset(); runLocal(`/${name}`, activeSessionID) },
                })),
                { name: 'prompt.openarms.install', title: 'Install skill', namespace: 'palette', slashName: 'skills-install', desc: 'Audited GitHub install; explicit model and write consent', run: () => { activePrompt?.reset(); openInstall() } },
            ],
            bindings: [],
           })
            const disposeWatcher = watchUsagePrompt(() => activePrompt === next ? next : undefined,
              () => value.visible !== false && !value.disabled && !api.ui.dialog.open && api.mode.current() === "base",
              () => openUsageSteps(sessionID))
            disposeSubmit = () => { disposeWatcher(); disposeInput(); disposeCommands() }
        },
        onSubmit: value.on_submit,
      })
    }

    api.slots.register({
      slots: {
        home_prompt(_context: unknown, value: any) {
          return renderPrompt(value, { workspaceID: value.workspace_id }, homeSession)
        },
        session_prompt(_context: unknown, value: any) {
          return renderPrompt(value, { sessionID: value.session_id }, value.session_id)
        },
      },
    })

    let polling = false, disposed = false, warningError = ""
    const warningTimer = setInterval(() => {
      if (polling || disposed || !activePrompt) return
      polling = true
      const session = activeSessionID
      void usage.claimWarnings(session).then(warnings => {
        if (disposed || session !== activeSessionID) return
        warningError = ""
        for (const warning of warnings) {
          const label = warning.metric === "costUSD" ? "Cost (USD)" : warning.metric === "output" ? "Output (tokens)" : warning.metric === "contextUtilization" ? "Context utilization" : warning.metric
          toast("Budget warning · report-only", `${warning.estimated ? "Approximate / estimated: " : "Recorded usage: "}${warning.scope} · ${label} crossed ${warning.crossed.join(", ")}% of limit. Does not block requests.`, "warning")
        }
      }).catch((e: Error) => {
        if (!disposed && warningError !== e.message) { warningError = e.message; toast("Budget notifications unavailable", "Policy or local storage error; requests remain allowed. Open /budget to diagnose.", "error") }
      }).finally(() => { polling = false })
    }, 1000)
    warningTimer.unref?.()
    api.lifecycle.onDispose(() => { disposed = true; clearInterval(warningTimer); disposeSubmit() })
  },
}
