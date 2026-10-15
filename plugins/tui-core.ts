export { parseRawSkillsPrompt, handleSkillsPrompt, formatSelection, executeSkillsCommand, initializeSession } from "../src/skills-service.ts"

export const isLocalPrompt = (input: string) => /^\/(skills|usage|budget)(?:\s|$)/.test(input.trim())

/** Clear synchronously, before the host's native double-deferred submission.
 * Never defer the consume decision and never delegate ordinary text twice. */
export function interceptLocalPrompt(prompt: any, run: (input: string) => void): boolean {
  const input = prompt?.current.input ?? ""
  if (prompt?.current.mode === "shell" || !isLocalPrompt(input)) return false
  prompt.reset()
  run(input.trim())
  return true
}

/** Public host pre-key boundary, before autocomplete/base/native submission. */
export function registerLocalSubmit(api: any, prompt: any, eligible: () => boolean, run: (input: string) => void) {
  const matches = ["return", ...api.tuiConfig.keybinds.get("prompt.submit").map((binding: any) => binding.key), ...api.tuiConfig.keybinds.get("input.submit").map((binding: any) => binding.key)]
    .filter(key => api.keymap.parseKeySequence(key).length === 1)
    .map(key => api.keymap.createKeyMatcher(key))
  return api.keymap.intercept("key", (context: any) => {
    if (!eligible() || !prompt.focused || api.ui.dialog.open || api.mode.current() !== "base") return
    if (!matches.some((match: any) => match(context.event))) return
    if (interceptLocalPrompt(prompt, run)) context.consume()
  }, { priority: 1000 })
}

/** Host command callbacks receive a command context, never a session ID. */
export const sessionAction = (current: () => string, open: (sessionID: string) => void) => () => open(current())

/** Public Prompt has no change callback. Read its supported current ref at 75ms;
 * never submit/reset on typing or cancellation, and rearm only after input changes. */
export function watchUsagePrompt(current: () => any, eligible: () => boolean, open: () => void,
  timers: { every: (fn: () => void) => any; clear: (timer: any) => void } = {
    every: fn => setInterval(fn, 75), clear: timer => clearInterval(timer),
  }) {
  let seen: string | undefined, previous: any, disposed = false
  const timer = timers.every(() => {
    if (disposed) return
    const prompt = current(), input = prompt?.current?.input
    if (prompt !== previous) { previous = prompt; seen = undefined }
    if (input !== "/usage ") { seen = undefined; return }
    if (seen === input || !eligible() || !prompt?.focused || prompt.current.mode === "shell") return
    seen = input
    open()
  })
  timer?.unref?.()
  return () => { disposed = true; timers.clear(timer) }
}

/** No editable input: only navigation plus Enter can affirm; Esc always denies. */
export function confirmationKey(key: string, selected: boolean): { selected: boolean; accepted?: boolean } {
  if (key === "escape") return { selected: false, accepted: false }
  if (key === "return" || key === "enter") return { selected, accepted: selected }
  if (["up", "down", "left", "right", "tab"].includes(key)) return { selected: !selected }
  return { selected }
}

export function chooseVerifiedConfirmation(api: any, title: string, message: string, yes: string, no: string, render: (props: any) => any): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false
    const finish = (value: unknown) => {
      if (settled) return
      settled = true
      resolve(value === true)
      api.ui.dialog.clear()
    }
    api.ui.dialog.replace(() => render({ title, message, yes, no, onConfirm: finish }), () => finish(false))
  })
}

/** Trusted UI action contract; not a renderer or host SDK compatibility proof. */
export async function runVerifiedAction({ runtime, action, skill, sessionID, scope, ticket, choose, toast }: any) {
  try {
  const approval = ticket ?? await runtime.prepareVerifiedGrant({ skill }, { sessionID })
  if (action === "grant" && !["Available", "Enabled", "Loaded", "Used"].includes(approval.authorization.state)) {
    toast("Skill approval denied", `${skill}: ${approval.status.state} (${approval.status.reason})`, "warning")
    return
  }
  if (!await choose(`${action} ${skill}?`, `Scope: ${scope}. This does not approve registry sources or filesystem access.`, action === "grant" ? "Grant" : "Revoke", "Cancel")) return
  const result = await (action === "grant" ? runtime.commitVerifiedGrant : runtime.commitVerifiedRevoke)(approval, scope)
  toast(result.ok ? `Skill ${action} saved` : `Skill ${action} denied`, result.ok ? `${skill}: ${scope}` : `${skill}: ${result.error?.code ?? "INVALID_GRANT"}`, result.ok ? "success" : "warning")
  return result
  } catch {
    const result = { ok: false, state: "Unverified", error: { code: "RUNTIME_ERROR" } }
    toast("Skill action failed", "RUNTIME_ERROR", "warning")
    return result
  }
}
