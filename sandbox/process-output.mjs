import { StringDecoder } from "node:string_decoder"
import { stripVTControlCharacters } from "node:util"

export const clean = (text) => stripVTControlCharacters(text).replace(/\r/g, "").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
export const clip = (text, limit = 512) => {
  const characters = Array.from(text)
  return characters.length <= limit ? text : `${characters.slice(0, Math.floor(limit / 2)).join("")} … ${characters.slice(-Math.floor(limit / 2) + 3).join("")}`
}
function utf8(buffer, tail = false) {
  let offset = 0
  if (tail) while (offset < buffer.length && (buffer[offset] & 0xc0) === 0x80) offset++
  return new StringDecoder("utf8").write(buffer.subarray(offset))
}
export class BoundedOutput {
  constructor({ headBytes = 16384, tailBytes = 49152, onStage } = {}) {
    this.headLimit = headBytes; this.tailLimit = tailBytes; this.onStage = onStage
    this.head = Buffer.alloc(0); this.tail = Buffer.alloc(0)
    this.streams = new Map(); this.firstDiagnostic = []; this.contextLeft = 0
    this.failureNames = new Map()
    this.tests = undefined; this.checks = undefined; this.failedTest = undefined; this.stage = undefined
    this.maxRetainedBytes = 0
  }
  push(chunk, stream = "stdout") {
    if (!Buffer.isBuffer(chunk)) chunk = Buffer.from(chunk)
    const remaining = this.headLimit - this.head.length
    if (remaining > 0) this.head = Buffer.concat([this.head, chunk.subarray(0, remaining)])
    // Never retain a slice backed by a large incoming allocation.
    this.tail = chunk.length >= this.tailLimit ? Buffer.from(chunk.subarray(chunk.length - this.tailLimit)) : Buffer.concat([this.tail.subarray(Math.max(0, this.tail.length + chunk.length - this.tailLimit)), chunk])
    this.maxRetainedBytes = Math.max(this.maxRetainedBytes, this.head.length + this.tail.length)
    let state = this.streams.get(stream)
    if (!state) { state = { decoder: new StringDecoder("utf8"), prefix: "", truncated: false }; this.streams.set(stream, state) }
    for (let offset = 0; offset < chunk.length; offset += 16384) this.consume(state, state.decoder.write(chunk.subarray(offset, offset + 16384)))
  }
  consume(state, text) {
    let offset = 0
    while (offset < text.length) {
      const end = text.indexOf("\n", offset)
      const part = text.slice(offset, end === -1 ? text.length : end)
      const available = 2048 - state.prefix.length
      state.prefix += part.slice(0, Math.max(0, available))
      if (part.length > available) state.truncated = true
      if (end === -1) break
      this.line(state.prefix + (state.truncated ? " [LINE_TRUNCATED]" : ""))
      state.prefix = ""; state.truncated = false; offset = end + 1
    }
  }
  line(raw) {
    const line = clean(raw).trim()
    if (!line) return
    const stage = line.match(/^STAGE:\s*([^\s]+)$/)?.[1]
    if (stage) { this.stage = clip(stage, 160); this.onStage?.(this.stage); return }
    const tests = line.match(/^# tests (\d+)$/)
    if (tests) this.tests = Number(tests[1])
    const passed = line.match(/^# pass (\d+)$/)
    if (passed) this.passed = Number(passed[1])
    const checks = line.match(/(?:syntax:\s*(\d+) files|smoke-static\s+(\d+) contract groups|checks=(\d+))/)
    if (checks) this.checks = Number(checks[1] ?? checks[2] ?? checks[3])
    const failed = line.match(/^not ok\s+\d+\s*-\s*(.+)/)
    if (failed && !this.failedTest) this.failedTest = clip(failed[1], 160)
    if (failed) {
      const name = clip(failed[1], 160)
      if (!this.failureNames.has(name) && this.failureNames.size < 16) this.failureNames.set(name, clip(line))
    }
    const relevant = failed || /(?:\b(?:[A-Za-z]*Error|ERROR|FAIL|TIMEOUT|STATIC_SMOKE_FAILED|CLEANUP_FAILED):|error TS\d+|^error:|failed to solve|Error response from daemon|cannot connect to the Docker daemon)/i.test(line)
    if (relevant && !this.firstDiagnostic.length) { this.firstDiagnostic.push(clip(line)); this.contextLeft = 11 }
    else if (this.contextLeft > 0 && !/^# (?:duration_ms|tests|pass|fail|suites)/.test(line)) { this.firstDiagnostic.push(clip(line)); this.contextLeft-- }
  }
  finish() {
    for (const state of this.streams.values()) {
      this.consume(state, state.decoder.end())
      if (state.prefix) this.line(state.prefix + (state.truncated ? " [LINE_TRUNCATED]" : ""))
      state.prefix = ""
    }
  }
  sample() { return clean(utf8(this.head)) + "\n[bounded head/tail]\n" + clean(utf8(this.tail, true)) }
  diagnostics() {
    const tail = clean(utf8(this.tail, true)).split("\n").map((line) => clip(line.trim())).filter(Boolean).slice(-14)
    const head = clean(utf8(this.head)).split("\n").map((line) => clip(line.trim())).filter(Boolean).slice(0, 14)
    return [...new Set(this.firstDiagnostic.length ? [this.firstDiagnostic[0], ...this.failureNames.values(), ...this.firstDiagnostic.slice(1), ...tail] : ["UNPARSEABLE_TEST_OUTPUT", ...head, ...tail])].slice(0, 30)
  }
}
export function formatSummary(mode, result, cache = "miss") {
  const duration = `${result.durationMs ?? 0}ms`
  const count = result.tests !== undefined ? `${result.passed ?? "?"}/${result.tests} pass tests=${result.tests}` : `${result.checks ?? 1}/${result.checks ?? 1} pass checks=${result.checks ?? 1}`
  const issues = [result.logError ? "LOG_WRITE_FAILED" : "", result.inputChanged ? "INPUT_CHANGED_DURING_RUN" : ""].filter(Boolean).join(" ")
  if (!result.exitCode && !result.signal && !result.timedOut && !result.logError && !result.cleanupErrors?.length) return `PASS: ${mode} ${count} duration=${duration} cache=${result.inputChanged ? "not-stored-input-change" : cache} log=${result.logPath ?? "unavailable"}${result.retentionError ? " retention=failed" : ""}`
  const status = result.blocked ? "BLOCKED" : "FAIL"
  const header = `${status}: ${mode} exit=${result.exitCode}${result.signal ? ` signal=${result.signal}` : ""} stage=${clip(result.failedTest ? `test:${result.failedTest}` : result.stage ?? mode, 180)} duration=${duration}${result.timedOut ? " TIMEOUT" : ""}${issues ? ` ${issues}` : ""}`
  const extra = [...(result.cleanupErrors ?? []), ...(result.logError ? [`LOG_WRITE_FAILED: ${clip(result.logError)}`] : [])].map((line) => clip(line)).slice(0, 5)
  const primary = [...new Set(result.diagnostics ?? [])]
  const capacity = 30 - extra.length
  const kept = primary.length <= capacity ? primary : [...primary.slice(0, Math.ceil(capacity / 2)), ...primary.slice(-Math.floor(capacity / 2))]
  return [header, ...kept, ...extra, `Full log: ${result.logError ? "unavailable" : result.logPath ?? "unavailable"}`].join("\n")
}
