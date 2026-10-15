import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { hashBytes } from './registry-v2.mjs'
import { serialize } from './registry-v2-operations.mjs'

const root = mkdtempSync(path.join(os.tmpdir(), 'arms-integrity-ci-'))
try {
  mkdirSync(path.join(root, 'example'))
  const bytes = Buffer.from('synthetic CI data\r\n')
  const file = path.join(root, 'example/data.txt'), registryPath = path.join(root, 'registry.json')
  const registry = { schemaVersion: 2, packages: { sample: { core: ['example'], optional: [], detect: { files: [], extensions: [], dependencies: [] } } }, skills: { example: { owner: 'sample', kind: 'core', path: 'example/data.txt', contentHash: hashBytes(bytes), maxTokens: 100, defaultPermission: 'deny', workflows: {}, references: {} } } }
  const run = expected => {
    const result = spawnSync(process.execPath, ['scripts/registry-v2-cli.mjs', 'integrity', '--root', root, '--registry', registryPath], { encoding: 'utf8', timeout: 2000 })
    assert.equal(result.status, expected, result.stderr)
    console.log(`production integrity CLI: expected=${expected}, actual=${result.status}`)
  }
  writeFileSync(file, bytes); writeFileSync(registryPath, serialize(registry)); run(0)
  writeFileSync(file, Buffer.concat([bytes, Buffer.from('!')])); run(1)
  rmSync(file); symlinkSync(registryPath, file); run(1)
  rmSync(file); writeFileSync(file, bytes)
  registry.packages.sample.optional.push('example'); writeFileSync(registryPath, serialize(registry)); run(2)
} finally { rmSync(root, { recursive: true, force: true }) }
