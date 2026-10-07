/** @jsxImportSource @opentui/solid */
import { For, Show, createMemo, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { homedir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { detectPackages, loadRegistry, orderedPackageNames, packageLabel, parseCommand, resolveProjectRoot, StateStore } from "./shared.ts"
import { executeSkillsCommand, handleSkillsPrompt, initializeSession } from "./tui-core.ts"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const stateFile = path.join(homedir(), ".local", "state", "openarms", "state.json")
const homeSession = "__skill_router_home__"

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
        message: error?.message ?? "The skill action failed",
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
      move(-1)
    }
    if (event.name === "down") {
      event.preventDefault()
      move(1)
    }
    if (event.name === "left") {
      event.preventDefault()
      moveToAction(back ?? done)
    }
    if (event.name === "right") {
      event.preventDefault()
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
          moveToAction(option)
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
                    if (!busy()) setSelected(absoluteIndex())
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

type ReadOnlyDialogProps = {
  api: any
  title: string
  message: string
  onBack: () => void | Promise<void>
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
        message: error?.message ?? "Could not return to skill options",
        duration: 10000,
      })
    } finally {
      setBackBusy(false)
    }
  }

  useKeyboard((event) => {
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
            if (inspect && text.startsWith("# ")) {
              return <text fg={theme.secondary}><b>{text.slice(2)}</b></text>
            }
            if (inspect && line.includes("\t")) {
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
    const registry = await loadRegistry(path.join(root, "registry.json"))
    const store = await StateStore.open(stateFile)
    const projectRoot = resolveProjectRoot(api.state.path.worktree, api.state.path.directory)
    await store.reconcileRegistry(projectRoot, registry)
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
    void refreshDetection()

    const choose = (title: string, message: string, yes: string, no: string) => new Promise<boolean>((resolve) => {
      api.ui.dialog.replace(
        () => api.ui.DialogSelect({
          title: `${title}\n${message}`,
          options: [
            { title: no, value: false },
            { title: yes, value: true },
          ],
          onSelect(option: any) {
            resolve(option.value)
          },
        }),
        () => resolve(false),
      )
    })

    const ensureSession = (sessionID: string) => {
      const current = initializing.get(sessionID)
      if (current) return current
      const pending = (async () => {
        await store.migrateLegacySession(projectRoot, sessionID)
        if (await store.getSession(projectRoot, sessionID)) return
        if (sessionID === homeSession) {
          await initializeSession({
            projectRoot,
            sessionID,
            store,
            confirmRestore: (message) => choose("Restore skills", message, "Yes", "No"),
          })
          return
        }
        const parentID = api.state.session.get(sessionID)?.parentID
        if (parentID) {
          await initializeSession({ projectRoot, sessionID, parentID, store, confirmRestore: async () => false })
          return
        }
        if (await store.getSession(projectRoot, homeSession)) {
          await store.inheritSession(projectRoot, homeSession, sessionID)
          return
        }
        await initializeSession({
          projectRoot,
          sessionID,
          store,
          confirmRestore: (message) => choose("Restore skills", message, "Yes", "No"),
        })
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
      api.ui.dialog.replace(() => <ReadOnlyDialog api={api} title={title} message={message} onBack={onBack} />)
      api.ui.dialog.setSize("medium")
    }

    const run = async (args: string, sessionID = activeSessionID, onReadOnlyBack?: () => void | Promise<void>) => {
      try {
        await ensureSession(sessionID)
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
        const message = await executeSkillsCommand({
          args,
          projectRoot,
          sessionID,
          registry,
          store,
          detected: ["use", "packages"].includes(command.action)
            ? await refreshDetection(command.action === "packages")
            : new Set(),
          confirmMismatch: (title, text) => choose(title, text, "Allow", "Cancel"),
        })
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
        toast("Skill Router Error", error?.message ?? "The skills command failed", "error")
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

    const openSkillPicker = async (action: "use" | "add" | "remove", packageName: string, sessionID: string) => {
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
          await run(`${action} ${packageName}${skill ? ` ${skill}` : ""}`, sessionID)
          await openSkillPicker(action, packageName, sessionID)
        },
        action === "add"
          ? "All optional skills are already enabled"
          : "This package has no enabled optional skills to remove",
      )
    }

    const openPackagePicker = async (action: "list" | "use" | "add" | "remove" | "disable", sessionID: string) => {
      await ensureSession(sessionID)
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
            await run(`${action} ${packageName}`, sessionID)
            api.ui.dialog.clear()
            return
          }
          await openSkillPicker(action, packageName, sessionID)
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
        { title: "Done", value: "__done__" },
      ].map((option) => option.value === "__done__" ? option : { ...option, descriptionAlign: "left" })
      openSelect("Select Action", "Type to filter actions", actions, async (action) => {
        if (action === "__done__") {
          api.ui.dialog.clear()
          return
        }
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
          toast("Skill Router Error", error?.message ?? "Could not load skill options", "error")
        })
      })
    }

    const submit = () => {
      const prompt = activePrompt
      const sessionID = activeSessionID
      const input = prompt?.current.input ?? ""
      if (input.trim() === "/skills") {
        openActionPicker(sessionID)
        return
      }
      void handleSkillsPrompt(input, (args) => run(args, sessionID)).then((handled) => {
        if (handled) prompt?.reset()
        else prompt?.submit()
      })
    }
    const renderPrompt = (value: any, props: Record<string, unknown>, sessionID: string) => {
      let promptRef: any
      return api.ui.Prompt({
        ...props,
        visible: value.visible,
        disabled: value.disabled,
        ref(next: any) {
          value.ref?.(next)
          if (!next) {
            if (activePrompt === promptRef) activePrompt = undefined
            return
          }
          promptRef = next
          activePrompt = next
          activeSessionID = sessionID
          void ensureSession(sessionID).catch((error: any) => {
            toast("Skill Router Error", error?.message ?? "Could not initialize this skill session", "error")
          })
          disposeSubmit()
          disposeSubmit = api.keymap.registerLayer({
            commands: [
              {
                name: "input.submit",
                title: "Submit input",
                hidden: true,
                run(context: any) {
                  context.event?.preventDefault()
                  context.event?.stopPropagation()
                  submit()
                },
              },
              {
                name: "prompt.skills",
                title: "Manage skills",
                desc: "Choose actions, packages, and skills",
                slashName: "skills",
                run: openActionPicker,
              },
            ],
            bindings: [],
          })
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

    api.lifecycle.onDispose(() => disposeSubmit())
  },
}
