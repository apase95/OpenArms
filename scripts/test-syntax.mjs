import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import { root, syntaxInputs } from "./test-policy.mjs"

let checks = 0
for (const file of syntaxInputs(process.argv.slice(2))) {
  const source = readFileSync(path.join(root, file), "utf8")
  if (file.endsWith(".json")) JSON.parse(source)
  else {
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS)
    if (parsed.parseDiagnostics.length) {
      console.error(ts.formatDiagnosticsWithColorAndContext(parsed.parseDiagnostics, { getCurrentDirectory: () => root, getCanonicalFileName: (name) => name, getNewLine: () => "\n" }))
      process.exitCode = 1
    }
    for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
      if (!imported.fileName.startsWith(".")) continue
      const target = path.resolve(root, path.dirname(file), imported.fileName)
      if (![target, ...[".ts", ".tsx", ".mjs", ".js", "/index.ts"].map((suffix) => target + suffix)].some(existsSync)) {
        console.error(`IMPORT_NOT_FOUND: ${file} -> ${imported.fileName}`)
        process.exitCode = 1
      }
    }
  }
  checks++
}
console.log(`syntax: ${checks} files checked (syntax + local imports; not semantic typechecking)`)
