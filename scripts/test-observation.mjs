import { randomUUID } from "node:crypto"
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { git, root } from "./test-policy.mjs"
import { nonSmokeFingerprint } from "./smoke-inputs.mjs"

export const observationsFile = path.join(root, ".openarms/test-runs.jsonl")
export function snapshot(files, mode) {
  // Observation shares the source-only boundary: enumerating arbitrary sandbox
  // paths or explicit library paths must not introduce live-content reads.
  // This remains observational, never proof of runtime/library/environment state.
  return { revision: git(["rev-parse", "HEAD"]).trim(), inputRevision: nonSmokeFingerprint(mode, ["observation", ...[...new Set(files)].sort()]) }
}
export function readObservations(file = observationsFile) {
  if (!existsSync(file)) return []
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
}
export function recordRun(record) {
  mkdirSync(path.dirname(observationsFile), { recursive: true, mode: 0o700 })
  appendFileSync(observationsFile, JSON.stringify({ schemaVersion: 1, runId: randomUUID(), ...record }) + "\n", { mode: 0o600 })
}
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)] : 0
export function baselineReport(records) {
  const baseline = records.filter((record) => record.source === "baseline")
  const tasks = new Map(), commands = new Map(), seen = new Set()
  let duplicates = 0, necessary = 0
  for (const record of baseline) {
    const task = tasks.get(record.task) ?? { wait: 0, smoke: 0 }
    task.wait += record.durationMs
    if (["sandbox-smoke", "tui-smoke"].includes(record.mode)) task.smoke++
    tasks.set(record.task, task)
    const group = commands.get(record.mode) ?? { durations: [], wait: 0, bytes: 0, runs: 0 }
    group.durations.push(record.durationMs); group.wait += record.durationMs; group.bytes += record.stdoutBytes + record.stderrBytes; group.runs++
    commands.set(record.mode, group)
    const key = `${record.task}:${record.mode}:${record.inputRevision}:${record.installed}`
    if (seen.has(key)) duplicates++
    else if ([...seen].some((previous) => previous.startsWith(`${record.task}:${record.mode}:`))) necessary++
    seen.add(key)
  }
  const assigned = [...tasks.keys()].filter((task) => task !== "unassigned").length
  const days = new Set(baseline.map((record) => record.startedAt.slice(0, 10))).size
  const span = baseline.length ? (Math.max(...baseline.map((r) => Date.parse(r.startedAt))) - Math.min(...baseline.map((r) => Date.parse(r.startedAt)))) / 86400000 : 0
  const covered = ["npm-test", "sandbox-test", "sandbox-smoke", "tui-smoke"].every((mode) => commands.has(mode))
  const ready = covered && !tasks.has("unassigned") && (assigned >= 10 || (span >= 6 && days >= 7))
  const lines = [`Baseline: ${ready ? "observation threshold met; review duplicate candidates" : "PENDING_OBSERVATION"}; ${assigned}/10 assigned tasks; ${days} active days; ${baseline.length} runs`,
    "Command | Runs | p50 ms | p95 ms | Total wait ms | Output bytes",
    ...[...commands].sort().map(([name, group]) => `${name} | ${group.runs} | ${percentile(group.durations, .5)} | ${percentile(group.durations, .95)} | ${group.wait} | ${group.bytes}`),
    "Task | Total wait ms | Smoke runs", ...[...tasks].sort().map(([name, task]) => `${name} | ${task.wait} | ${task.smoke}`),
    `Duplicate candidates (same observed code input): ${duplicates}/${baseline.length} (${baseline.length ? (duplicates / baseline.length * 100).toFixed(1) : "0.0"}%); reruns after observed input change: ${necessary}`,
    "Runtime, installed library, environment and volumes are unverified: candidates require manual review; never used for caching.",
    `Top 3 wait: ${[...commands].sort((a, b) => b[1].wait - a[1].wait).slice(0, 3).map(([name, group]) => `${name}=${group.wait}ms`).join(", ") || "no data"}`,
    `Top 3 output: ${[...commands].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 3).map(([name, group]) => `${name}=${group.bytes}B`).join(", ") || "no data"}`]
  return lines.join("\n")
}
