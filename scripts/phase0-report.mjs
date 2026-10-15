import { readObservations, baselineReport } from "./test-observation.mjs"
import { fileURLToPath } from "node:url"
import path from "node:path"

// Executions and smoke-result records describe the same run: count each once.
export function acceptanceReport(records) {
  const cohort = (source) => {
    const tasks = new Map()
    for (const r of records.filter((r) => r.source === source && r.task && r.task !== "unassigned")) {
      const t = tasks.get(r.task) ?? { wait: 0, smoke: 0, bytes: 0 }
      t.wait += r.durationMs ?? 0
      t.bytes += (r.stdoutBytes ?? 0) + (r.stderrBytes ?? 0)
      if (source === "baseline" && ["sandbox-smoke", "tui-smoke"].includes(r.mode)) t.smoke++
      tasks.set(r.task, t)
    }
    return tasks
  }
  const before = cohort("baseline"), after = cohort("runner")
  const smokes = records.filter((r) => r.source === "smoke-result" && ["smoke-runtime", "tui-smoke"].includes(r.mode) && after.has(r.task))
  const seen = new Set()
  let duplicate = 0
  for (const r of smokes) {
    if (r.cached || r.blocked) continue
    after.get(r.task).smoke++
    const key = `${r.mode}:${r.fingerprint}:${Boolean(r.installed)}`
    if (seen.has(key) && !r.force && !r.rebuild && !r.ciCacheBypass) duplicate++
    seen.add(key)
  }
  const average = (tasks, field) => tasks.size ? [...tasks.values()].reduce((n, t) => n + t[field], 0) / tasks.size : null
  const oldSmoke = average(before, "smoke"), newSmoke = average(after, "smoke")
  const reduction = oldSmoke > 0 && newSmoke !== null ? 100 * (1 - newSmoke / oldSmoke) : null
  const value = (n) => n === null ? "chưa có dữ liệu" : n.toFixed(1)
  return ["Phase 0: PENDING_OBSERVATION / MANUAL_REVIEW_REQUIRED",
    `Task có tên: baseline=${before.size}; rollout=${after.size}`,
    "Metric | Baseline | Rollout",
    `Wait ms/task | ${value(average(before, "wait"))} | ${value(average(after, "wait"))}`,
    `Smoke executions/task | ${value(oldSmoke)} | ${value(newSmoke)}`,
    `Raw output bytes/task (không phải context bytes) | ${value(average(before, "bytes"))} | ${value(average(after, "bytes"))}`,
    `Smoke reduction: ${value(reduction)}%; mục tiêu >=50%`,
    `Duplicate executions không override: ${duplicate}; cache hits: ${smokes.filter((r) => r.cached).length}`,
    "Cần review: cohort đại diện >=10 task hoặc một tuần, baseline đủ 4 command; context bytes, diagnosis success, escaped regressions và required boundaries.",
    "Executions gồm cả startup thất bại; kiểm tra log để xác nhận số OpenCode starts. CI/rebuild/force là override tường minh, không tính duplicate mặc định.",
    "Không tự suy ra acceptance từ fixture hoặc từ số task đơn thuần.", "", baselineReport(records)].join("\n")
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) { console.error("Usage: node scripts/phase0-report.mjs"); process.exitCode = 2 }
  else console.log(acceptanceReport(readObservations()))
}
