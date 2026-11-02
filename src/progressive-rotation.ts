import { handoffSections, sanitizeHandoffField, type HandoffFields } from "./session-handoff.ts"

export type RotationThresholds = { precompute: number; suggest: number; saturation: number }
export type RotationFrame = { session: string; model: string; turn: string; revision: number; active: boolean; utilization: number | null }
/** Only independently trusted callers may supply this assertion. This type is
 * not an authentication mechanism and host idle/message events cannot create it. */
export type TaskCompletionAttestation = RotationFrame & {
  authority: "trusted-task-owner"; boundary: "task-completed"; finalReason: "stop"
  pendingTools: 0; primary: true
}
export type RotationPresentation = { kind: "suggestion" | "critical"; preview: { title: string; lines: string[] }[] }
export class ProgressiveRotation {
  readonly thresholds: RotationThresholds
  private frame?: RotationFrame
  private fields?: HandoffFields
  private seen = 0
  private scope?: { session: string; model: string }
  private visible?: RotationPresentation
  constructor(thresholds: RotationThresholds = { precompute: .5, suggest: .75, saturation: 1 }) {
    const { precompute: a, suggest: b, saturation: c } = thresholds
    if (![a,b,c].every(n => Number.isFinite(n) && n > 0 && n <= 1) || !(a < b && b < c)) throw Error("INVALID_ROTATION_THRESHOLDS")
    this.thresholds = { ...thresholds }
  }
  get draft() { return this.fields ? structuredClone(this.fields) : undefined }
  private tier(value: number) { return value >= this.thresholds.saturation || value > .9 ? 3 : value >= this.thresholds.suggest ? 2 : value >= this.thresholds.precompute ? 1 : 0 }
  update(next: RotationFrame, fields: HandoffFields = {}) {
    const previous = this.frame
    const value = next.utilization
    if (![next.session, next.model, next.turn].every(id => typeof id === "string" && id.trim().length > 0) || !Number.isSafeInteger(next.revision) || next.revision < 0 || typeof next.active !== "boolean" || typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      this.frame = undefined; this.fields = undefined; this.visible = undefined; return
    }
    if (previous && previous.session === next.session && previous.model === next.model && next.revision < previous.revision) return
    const changed = !previous || previous.session !== next.session || previous.model !== next.model || previous.turn !== next.turn
    if (!this.scope || this.scope.session !== next.session || this.scope.model !== next.model) {
      this.seen = 0; this.scope = { session: next.session, model: next.model }
    }
    if (changed) { this.fields = undefined; this.visible = undefined }
    this.frame = { ...next }
    if (next.active || (previous?.utilization != null && value < previous.utilization)) this.visible = undefined
    if (this.tier(value) < 1) { this.fields = undefined; return }
    // Single current session/turn only, bounded before sanitizing; never read
    // conversation text or write disk. Callers provide sourced facts, not guesses.
    this.fields = Object.fromEntries(handoffSections.map(section => {
      const facts = fields && typeof fields === "object" ? fields[section] : undefined
      return [section, (Array.isArray(facts) ? facts : []).slice(0, 8).map(field => {
        // Bound input BEFORE invoking regex sanitization; never truncate a prefix
        // that could conceal a credential later in the original fact.
        const valid = field && typeof field.text === "string" && field.text.length <= 4096 && ["task", "runtime", "owner"].includes(field.source)
        return valid ? { text: sanitizeHandoffField(field).text, source: field.source } : { text: "[omitted: unsafe or uncertain content]", source: "runtime" }
      })]
    }))
  }
  eligible(proof?: TaskCompletionAttestation) {
    const f = this.frame
    return !!(f && proof && proof.authority === "trusted-task-owner" && proof.boundary === "task-completed" && proof.finalReason === "stop" && proof.pendingTools === 0 && proof.primary === true && proof.active === false && f.active === false && ["session", "model", "turn", "revision"].every(k => proof[k as keyof RotationFrame] === f[k as keyof RotationFrame]) && typeof f.utilization === "number" && Number.isFinite(f.utilization) && f.utilization >= 0 && f.utilization <= 1)
  }
  present(proof?: TaskCompletionAttestation): RotationPresentation | undefined {
    if (!this.eligible(proof)) return
    const tier = this.tier(this.frame!.utilization!)
    if (tier < 2 || tier <= this.seen) return
    this.seen = tier
    this.visible = { kind: tier === 3 ? "critical" : "suggestion", preview: ["Objective", "Completed", "Next Step", "Active"].map(section => ({ title: section === "Active" ? "Selected skills (caller-sourced; selection unchanged)" : section, lines: (this.fields?.[section as keyof HandoffFields] ?? []).map(f => f.text) })) }
    return structuredClone(this.visible)
  }
  dismiss() { this.visible = undefined }
  dispose() { this.frame = undefined; this.fields = undefined; this.visible = undefined; this.seen = 0; this.scope = undefined }
}

/** Presenter ports must own prompt/dialog focus and return cleanup functions.
 * No production registration: the public host lacks atomic completion authority.
 * Confirmation prepares an existing handoff, never creates/submits a session. */
export function createRotationPresenter(engine: ProgressiveRotation, ui: {
  ownsPrompt(): boolean
  show(view: RotationPresentation, actions: { confirm(): void; dismiss(): void }): () => void
  prepareHandoff(fields: HandoffFields): void
}, clock = { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (id: ReturnType<typeof setTimeout>) => clearTimeout(id) }) {
  let close: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  const dismiss = () => { generation++; if (timer !== undefined) clock.clear(timer); timer = undefined; const off = close; close = undefined; engine.dismiss(); off?.() }
  return {
    dismiss,
    // Call for typing, active transitions, navigation, model changes, loss of
    // prompt ownership and de-escalation, before refreshing engine state.
    invalidate: dismiss,
    show(proof: TaskCompletionAttestation) {
      dismiss()
      if (!ui.ownsPrompt()) return
      const view = engine.present(proof)
      if (!view) return
      const owner = generation
      const ownedDismiss = () => { if (owner === generation) dismiss() }
      const off = ui.show(view, { dismiss: ownedDismiss, confirm() {
        if (owner !== generation) return
        if (!ui.ownsPrompt() || !engine.eligible(proof)) { ownedDismiss(); return }
        const draft = engine.draft
        ownedDismiss()
        if (draft) ui.prepareHandoff(draft)
      } })
      if (owner !== generation) { off(); return }
      close = off
      if (view.kind === "suggestion") timer = clock.set(ownedDismiss, 8000)
    },
    dispose() { dismiss(); engine.dispose() },
  }
}
