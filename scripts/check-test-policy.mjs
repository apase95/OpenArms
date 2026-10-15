import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { changedFiles, policy, root } from "./test-policy.mjs"

export function detectBypass(content) {
  const patterns = [/\bnpm\s+(?:run\s+)?test(?=\s|$|[;&"'])/g, /\b(?:npm\s+run\s+sandbox\s+--\s+|node\s+sandbox\/manage\.mjs\s+)(?:test|smoke|tui-smoke)\b/g, /\bdocker\s+compose\b/g, /\bnode\b[^\n]*\s--test\b/g, /\b(?:node|python3?)\s+sandbox\/(?:smoke\.mjs|tui-smoke\.py)\b/g, /\b(?:npm\s+run\s+test:raw|node\s+scripts\/arms-test\.mjs\s+baseline)\b/g]
  return content.split("\n").flatMap((line, index) => {
    if (/^\s*#/.test(line)) return []
    return patterns.some((pattern) => { pattern.lastIndex = 0; return pattern.test(line) }) ? [index + 1] : []
  })
}
export function check(files) {
  const reports = []
  for (const file of files) {
    if (policy.bypassOwners.includes(file)) continue
    if (!/^(\.github\/workflows\/.*\.ya?ml|(?:scripts|automation)\/.*\.(?:sh|ya?ml|json|[cm]?js|ts)|Makefile|package\.json)$/.test(file) || !existsSync(path.join(root, file))) continue
    let content = readFileSync(path.join(root, file), "utf8")
    if (file === "package.json") {
      const scripts = JSON.parse(content).scripts ?? {}
      // These explicit diagnostic escape hatches are intentional, not automation.
      content = Object.entries(scripts).filter(([name]) => !["test:raw", "sandbox", "test:baseline"].includes(name)).map(([name, command]) => `${name}: ${command}`).join("\n")
    }
    for (const line of detectBypass(content)) reports.push({ file, line, reason: "TEST_POLICY_BYPASS" })
  }
  return reports
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const reports = check(changedFiles({ files: [], explicitFiles: false }))
    for (const report of reports) console.log(`REPORT_ONLY: ${report.file}:${report.line} ${report.reason}; use arms-test verify`)
    console.log(`Policy bypass report: ${reports.length} finding(s); report-only, no workflow blocked`)
  } catch (error) { console.error(`Policy report unavailable: ${error.message}`); process.exitCode = 2 }
}
