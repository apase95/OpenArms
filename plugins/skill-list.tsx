/** @jsxImportSource @opentui/solid */
import { batch, createMemo, createSignal, For, Show, onCleanup, onMount } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { TextAttributes, type InputRenderable } from "@opentui/core"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { filterSkillOptions, moveSkillSelection, skillListWindow, skillRowColor, type SkillListRenderer } from "../src/skill-list.ts"

/** Public OpenTUI primitives: the host DialogSelect API cannot color individual titles. */
export function skillListRenderer(api: TuiPluginApi): SkillListRenderer {
  return props => {
    const dimensions = useTerminalDimensions()
    const [query, setQuery] = createSignal("")
    const [selected, setSelected] = createSignal(0)
    const filtered = createMemo(() => filterSkillOptions(props.options, query()))
    const rows = createMemo(() => Math.max(1, Math.floor(dimensions().height / 2) - 6))
    const window = createMemo(() => skillListWindow(filtered().length, selected(), rows()))
    const move = (delta: number) => setSelected(index => moveSkillSelection(index, delta, filtered().length))
    const choose = () => { const option = filtered()[selected()]; if (option) props.onSelect(option) }
    let input: InputRenderable | undefined
    onMount(() => input?.focus())
    const unregister = api.keymap.registerLayer({
      mode: "modal",
      bindings: [
        { key: "up", cmd: () => move(-1), desc: "Previous skill" },
        { key: "down", cmd: () => move(1), desc: "Next skill" },
        { key: "pageup", cmd: () => move(-rows()), desc: "Previous skill page" },
        { key: "pagedown", cmd: () => move(rows()), desc: "Next skill page" },
        { key: "return", cmd: choose, desc: "Select skill" },
      ],
    })
    onCleanup(unregister)
    return (
      <box flexDirection="column" gap={1} paddingBottom={1}>
        <box paddingLeft={4} paddingRight={4}>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={api.theme.current.text} attributes={TextAttributes.BOLD}>{props.title}</text>
            <text fg={api.theme.current.textMuted} onMouseUp={() => api.ui.dialog.clear()}>esc</text>
          </box>
          <box paddingTop={1}>
            <input ref={node => { input = node }} placeholder={props.placeholder}
              backgroundColor={api.theme.current.backgroundPanel} focusedBackgroundColor={api.theme.current.backgroundPanel}
              placeholderColor={api.theme.current.textMuted} textColor={api.theme.current.text}
              focusedTextColor={api.theme.current.text} cursorColor={api.theme.current.primary}
              onInput={value => batch(() => { setQuery(value); setSelected(0) })} />
          </box>
        </box>
        <box paddingLeft={1} paddingRight={1} onMouseScroll={event => {
          if (event.scroll?.direction === "up") move(-3)
          else if (event.scroll?.direction === "down") move(3)
          event.stopPropagation()
        }}>
          <Show when={filtered().length} fallback={<text fg={api.theme.current.textMuted}>No results found</text>}>
            <For each={filtered().slice(window().start, window().end)}>{option => {
              const active = () => filtered()[selected()]?.value === option.value
              const off = () => props.offValues.has(option.value)
              return (
                <box height={1} paddingLeft={3} onMouseOver={() => {
                  const index = filtered().indexOf(option)
                  if (index >= 0) setSelected(index)
                }}
                  backgroundColor={active() ? off() ? api.theme.current.backgroundElement : api.theme.current.primary : undefined}
                  onMouseUp={event => { event.stopPropagation(); props.onSelect(option) }}>
                  <text width="100%" wrapMode="none" attributes={active() ? TextAttributes.BOLD : undefined}
                    fg={skillRowColor(off(), active(), api.theme.current.text, api.theme.current.selectedListItemText)}>
                    {option.title}
                  </text>
                </box>
              )
            }}</For>
          </Show>
        </box>
      </box>
    )
  }
}
