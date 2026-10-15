import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Controller-reviewed exact inventory. Never enumerate the repository or copy its registry/skills.
export const contextInputs = [
  ...'budget-executor.ts budget-policy.ts commands.ts governance-hooks.ts governance-telemetry.ts local-library.ts noise-preset.mjs output-governor.ts package-loader.ts project.ts registry-v2-types.ts registry.ts runtime.ts session-handoff.ts session-rotation.ts skills-service.ts state-schema.ts state-store.ts tool-policy.ts types.ts usage-query.ts usage-runtime.ts usage-store.ts verified-loader.mjs'.split(' ').map(f => `src/${f}`),
  ...'server-core.ts shared.ts skill-router-server.ts skill-router-tui.tsx tui-core.ts'.split(' ').map(f => `plugins/${f}`),
  ...'entrypoint.mjs manage.mjs process-output.mjs smoke.mjs smoke-runtime.mjs smoke-static.mjs tui-fixture-launch.mjs tui-fixture.ts tui-smoke.py config/opencode.json config/tui.json fixtures/empty-project/.gitkeep fixtures/docs-project/README.md Dockerfile compose.yaml compose.installed.yaml'.split(' ').map(f => `sandbox/${f}`),
  'scripts/registry-v2.mjs', 'package.json', 'package-lock.json', 'LICENSE', '.dockerignore',
]
export const syntheticFixture = {
  'registry.json': JSON.stringify({ version: 1, packages: { docs: { core: ['example'], optional: ['docs-editor'], detect: {} } }, skills: { example: 'skills/example.md', 'docs-editor': 'skills/editor.md' } }),
  'skills/example.md': 'Synthetic sandbox example; ordinary test data.',
  'skills/editor.md': 'Synthetic sandbox editor; ordinary test data.',
}
export function contextBytes(directory, io = fs, fixture = syntheticFixture) {
  const entries = new Map()
  for (const file of contextInputs) {
    const parts = file.split('/')
    for (let i = 1; i <= parts.length; i++) {
      const stat = io.lstatSync(path.join(directory, ...parts.slice(0, i)))
      if (stat.isSymbolicLink() || (i === parts.length ? !stat.isFile() : !stat.isDirectory())) throw Error(`Unsafe synthetic input: ${file}`)
    }
    const fd = io.openSync(path.join(directory, file), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    try { entries.set(file, io.readFileSync(fd)) } finally { io.closeSync(fd) }
  }
  for (const [file, content] of Object.entries(fixture)) entries.set(file, Buffer.from(content))
  return entries
}
export function syntheticDigest(entries, metadata) {
  const hash = createHash('sha256').update(JSON.stringify(metadata))
  for (const [file, bytes] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(JSON.stringify([file, bytes.length])).update(bytes)
  }
  return hash.digest('hex')
}
export function prepareSyntheticContext(directory) {
  const entries = contextBytes(directory)
  const context = fs.mkdtempSync(path.join(os.tmpdir(), 'openarms-synthetic-'))
  try {
    for (const [file, bytes] of entries) {
      const target = path.join(context, file)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, bytes)
    }
  } catch (error) { fs.rmSync(context, { recursive: true, force: true }); throw error }
  return { context, cleanup: () => fs.rmSync(context, { recursive: true, force: true }) }
}
