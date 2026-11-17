/** @jsxImportSource @opentui/solid */
import { onCleanup } from "solid-js"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { DialogFrame } from "../src/native-skills.ts"

/** A footer inside the existing host dialog stack, never a second modal or Prompt. */
export function skillDialogFrame(api: TuiPluginApi): DialogFrame {
  return (render, navigation) => {
    const unregister = api.keymap.registerLayer({
      mode: "modal",
      bindings: [
        { key: "alt+left", cmd: navigation.back, desc: "OpenArms: Back" },
        { key: "alt+return", cmd: navigation.done, desc: "OpenArms: Done" },
      ],
    })
    onCleanup(unregister)
    return (
      <box flexDirection="column">
        {render()}
        <box flexDirection="row" justifyContent="space-between" paddingLeft={4} paddingRight={4} paddingBottom={1}>
          <box paddingLeft={2} paddingRight={2} backgroundColor={api.theme.current.backgroundElement}
            onMouseUp={event => { event.stopPropagation(); navigation.back() }}>
            <text fg={api.theme.current.text}>Back</text>
          </box>
          <box paddingLeft={2} paddingRight={2} backgroundColor={api.theme.current.primary}
            onMouseUp={event => { event.stopPropagation(); navigation.done() }}>
            <text fg={api.theme.current.selectedListItemText}>Done</text>
          </box>
        </box>
        <box paddingLeft={4} paddingRight={4} paddingBottom={1}>
          <text fg={api.theme.current.textMuted}>Alt+← Back · Alt+Enter Done</text>
        </box>
      </box>
    )
  }
}
