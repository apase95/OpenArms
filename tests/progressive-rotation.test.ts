import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import { ProgressiveRotation, createRotationPresenter } from "../src/progressive-rotation.ts"

const frame = (extra = {}) => ({ session: "s", model: "m", turn: "u", revision: 1, active: false, utilization: .75, ...extra })
const proof = (extra = {}) => ({ ...frame(), authority: "trusted-task-owner", boundary: "task-completed", finalReason: "stop", pendingTools: 0, primary: true, ...extra })
test("silent sanitized RAM draft then explicit boundary suggestion, dedup and critical", () => {
  const engine = new ProgressiveRotation()
  assert.equal(engine.update(frame({ utilization: .5 }), { Objective: [{ text: "secret=unsafe", source: "task" }] }), undefined)
  assert.equal(engine.draft?.Objective?.[0].text, "[omitted: unsafe or uncertain content]")
  engine.update(frame())
  assert.equal(engine.present(proof())?.kind, "suggestion")
  engine.dismiss()
  assert.equal(engine.present(proof()), undefined)
  engine.update(frame({ utilization: .91, revision: 2 }))
  assert.equal(engine.present(proof({ utilization: .91, revision: 2 }))?.kind, "critical")
})
test("idle/tool completion are not attestations; stale/active/subagent/unknown fail closed", () => {
  const engine = new ProgressiveRotation()
  engine.update(frame())
  for (const p of [undefined, {}, proof({ boundary: "idle" }), proof({ pendingTools: 1 }), proof({ primary: false }), proof({ revision: 0 }), proof({ turn: "old" }), proof({ finalReason: "tool-calls" })]) assert.equal(engine.present(p as any), undefined)
  engine.update(frame({ active: true, revision: 2 }))
  assert.equal(engine.present(proof({ revision: 2 })), undefined)
  engine.update(frame({ utilization: NaN, revision: 3 }))
  assert.equal(engine.draft, undefined)
  assert.throws(() => new ProgressiveRotation({ precompute: .8, suggest: .7, saturation: 1 }))
})
test("presenter cleanup, 8s expiry, explicit preparation and ownership guard", () => {
  const engine = new ProgressiveRotation()
  let actions: any, callback: any, closed = 0, cleared = 0, prepared = 0, owned = true
  const presenter = createRotationPresenter(engine, {
    ownsPrompt: () => owned,
    show: (_view, a) => { actions = a; return () => { closed++ } },
    prepareHandoff: () => { prepared++ },
  }, { set: (fn, ms) => { assert.equal(ms, 8000); callback = fn; return 1 as any }, clear: () => { cleared++ } })
  engine.update(frame())
  presenter.show(proof()); callback()
  assert.equal(closed, 1); assert.equal(cleared, 1)
  actions.confirm(); assert.equal(prepared, 0)
  engine.update(frame({ revision: 2, utilization: 1 }))
  presenter.show(proof({ revision: 2 })); owned = false; actions.confirm()
  assert.equal(prepared, 0)
  engine.update(frame({ session: "s2", turn: "u2", revision: 3, utilization: 1 }))
  owned = true; presenter.show(proof({ session: "s2", turn: "u2", revision: 3 })); actions.confirm()
  assert.equal(prepared, 1)
  presenter.dispose(); assert.equal(engine.draft, undefined)
})
test("invalid identities and revisions clear validated state even with matching proof", () => {
  for (const invalid of [{ session: "" }, { model: "" }, { turn: "" }, { revision: -1 }, { revision: 1.5 }, { revision: NaN }]) {
    const engine = new ProgressiveRotation()
    engine.update(frame())
    engine.update(frame(invalid))
    assert.equal(engine.eligible(proof(invalid) as any), false)
    assert.equal(engine.draft, undefined)
  }
})
test("new turns refresh drafts without resetting session/model tier dedup", () => {
  const engine = new ProgressiveRotation()
  engine.update(frame()); assert.equal(engine.present(proof())?.kind, "suggestion"); engine.dismiss()
  engine.update(frame({ turn: "next", revision: 2 }), { Objective: [{ text: "new objective", source: "owner" }] })
  assert.equal(engine.present(proof({ turn: "next", revision: 2 })), undefined)
  assert.equal(engine.draft?.Objective?.[0].text, "new objective")
  engine.update(frame({ turn: "next", revision: 3, utilization: .95 }))
  assert.equal(engine.present(proof({ turn: "next", revision: 3 }))?.kind, "critical")
})
test("replacement presentation owns actions and queued expiry", () => {
  const engine = new ProgressiveRotation(), actions: any[] = [], timers: (() => void)[] = []
  let closed = 0, prepared = 0
  const presenter = createRotationPresenter(engine, { ownsPrompt: () => true, show: (_, a) => { actions.push(a); return () => { closed++ } }, prepareHandoff: () => { prepared++ } }, { set: fn => { timers.push(fn); return 1 as any }, clear: () => {} })
  engine.update(frame()); presenter.show(proof())
  engine.update(frame({ revision: 2, utilization: .95 })); presenter.show(proof({ revision: 2 }))
  actions[0].dismiss(); actions[0].confirm(); timers[0]()
  assert.equal(closed, 1); assert.equal(prepared, 0)
  actions[1].confirm(); assert.equal(prepared, 1); assert.equal(closed, 2)
})
test("synchronous dismissal during show cleans returned handle and schedules no timer", () => {
  const engine = new ProgressiveRotation(); let closed = 0, scheduled = 0
  const presenter = createRotationPresenter(engine, { ownsPrompt: () => true, show: (_, a) => { a.dismiss(); return () => { closed++ } }, prepareHandoff: () => assert.fail() }, { set: () => { scheduled++; return 1 as any }, clear: () => {} })
  engine.update(frame()); presenter.show(proof())
  assert.equal(closed, 1); assert.equal(scheduled, 0)
})
test("RAM facts reject oversized and malformed values, retaining honest provenance without disk", t => {
  const writes = ["mkdir", "open", "writeFile", "rename"].map(name => t.mock.method(fs, name as "open", (() => { assert.fail("silent draft must not touch disk") }) as any))
  const engine = new ProgressiveRotation()
  engine.update(frame({ utilization: .5 }), { Objective: [{ text: "safe ".repeat(10000) + "secret=hidden", source: "task" }, null, { text: 42, source: "owner" }, { text: "safe", source: "invented" }, { text: "known", source: "owner" }], Completed: {} } as any)
  assert.equal(engine.draft?.Objective?.[0].text, "[omitted: unsafe or uncertain content]")
  assert.equal(engine.draft?.Objective?.[1].text, "[omitted: unsafe or uncertain content]")
  assert.equal(engine.draft?.Objective?.[4].source, "owner")
  assert.deepEqual(engine.draft?.Completed, [])
  for (const write of writes) assert.equal(write.mock.callCount(), 0)
  engine.update(frame({ utilization: .5 }), null as any)
  assert.deepEqual(engine.draft?.Objective, [])
})
test("synchronous confirmation prepares once and cleans returned handle", () => {
  const engine = new ProgressiveRotation(); let closed = 0, prepared = 0
  const presenter = createRotationPresenter(engine, { ownsPrompt: () => true, show: (_, a) => { a.confirm(); a.confirm(); return () => { closed++ } }, prepareHandoff: () => { prepared++ } })
  engine.update(frame()); presenter.show(proof())
  assert.equal(prepared, 1); assert.equal(closed, 1)
})
