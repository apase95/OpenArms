import assert from "node:assert/strict"
import { test } from "node:test"
import { acceptanceReport } from "../scripts/phase0-report.mjs"

test("acceptance distinguishes missing data, cache hits, overrides and double records", () => {
  assert.match(acceptanceReport([]), /chưa có dữ liệu/)
  const common = { task: "real-task", durationMs: 100, stdoutBytes: 20, stderrBytes: 0, startedAt: "2026-10-07T00:00:00Z", mode: "sandbox-smoke" }
  const smoke = { ...common, source: "smoke-result", mode: "smoke-runtime", fingerprint: "key" }
  const report = acceptanceReport([
    { ...common, source: "baseline" }, { ...common, source: "baseline" },
    { ...common, source: "runner", mode: "smoke-runtime" }, smoke,
    { ...smoke, cached: true, durationMs: 0 },
  ])
  assert.match(report, /Smoke executions\/task \| 2.0 \| 1.0/)
  assert.match(report, /Smoke reduction: 50.0%/)
  assert.match(report, /Duplicate executions không override: 0; cache hits: 1/)
  assert.match(report, /MANUAL_REVIEW_REQUIRED/)
  assert.match(acceptanceReport([{ ...common, source: "runner" }, smoke, smoke]), /không override: 1/)
  assert.match(acceptanceReport([{ ...common, source: "runner" }, smoke, { ...smoke, force: true }]), /không override: 0/)
})

test("a blocked third failure does not count as a smoke execution or duplicate", () => {
  const common = { task: "retry-task", durationMs: 100, stdoutBytes: 20, stderrBytes: 0, startedAt: "2026-10-08T00:00:00Z" }
  const failure = { ...common, source: "smoke-result", mode: "smoke-runtime", fingerprint: "same-input", exitCode: 7 }
  const records = [{ ...common, source: "baseline", mode: "sandbox-smoke" },
    { ...common, source: "runner", mode: "smoke-runtime" }, failure,
    { ...common, source: "runner", mode: "smoke-runtime" }, failure]
  const before = acceptanceReport(records)
  const blocked = { ...failure, blocked: true, exitCode: 2, durationMs: 0, stdoutBytes: 0 }
  assert.equal(acceptanceReport([...records, blocked]), before)
  assert.match(before, /Smoke executions\/task \| 1.0 \| 2.0/)
  assert.match(before, /Duplicate executions không override: 1/)
})
