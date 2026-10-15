import path from "node:path"

export type PolicyMode = "off" | "shadow" | "active"
export type FileRule = "LOCKFILE" | "MINIFIED" | "SOURCE_MAP" | "GENERATED" | "BINARY" | "LARGE_LOG" | "SIZE" | "LINES" | "NONE"
export type FilePolicy = { mode: PolicyMode; maxBytes?: number; maxLines?: number; activeRules?: FileRule[]; hostEnforcement?: boolean }
export function evaluateFile(request: { path: string; size?: number; lines?: number; binary?: boolean; override?: boolean }, policy: FilePolicy) {
  const normalizedPath = path.posix.normalize(request.path.replaceAll("\\", "/"))
  const name = path.posix.basename(normalizedPath)
  const large = (request.size ?? 0) > (policy.maxBytes ?? 100000)
  const rule: FileRule = /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|Pipfile\.lock|go\.sum)$/.test(name) ? "LOCKFILE"
    : /\.min\.(js|css)$/.test(name) ? "MINIFIED"
    : /\.map$/.test(name) ? "SOURCE_MAP"
    : /(^|\/)(dist|build|generated)(\/|$)/.test(normalizedPath) ? "GENERATED"
    : request.binary || /\.(png|jpg|jpeg|gif|pdf|zip|gz|exe|wasm)$/.test(name) ? "BINARY"
    : /\.log$/.test(name) && large ? "LARGE_LOG"
    : large ? "SIZE" : (request.lines ?? 0) > (policy.maxLines ?? 5000) ? "LINES" : "NONE"
  const action = rule === "NONE" || (rule === "LOCKFILE" && !large) ? "ALLOW" : rule === "LOCKFILE" || rule === "SIZE" || rule === "LINES" || rule === "LARGE_LOG" ? "ASK" : "DENY"
  const enforce = policy.mode === "active" && policy.hostEnforcement && policy.activeRules?.includes(rule) && !request.override && rule !== "LOCKFILE"
  const decision = policy.mode === "off" || request.override ? "ALLOW" : action === "ALLOW" ? "ALLOW" : enforce ? action : `SHADOW_${action}`
  return { normalizedPath, rule, decision, allowed: !enforce || action === "ALLOW", mode: policy.mode }
}

export { noisePreset } from "./noise-preset.mjs"
