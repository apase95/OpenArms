import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { discoverPackages } from '../src/package-catalog.ts'

test('discovers minimal per-package manifests without reading skill content', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'openarms-catalog-'))
  try {
    await mkdir(path.join(root, 'writing'))
    await writeFile(path.join(root, 'writing', 'package.json'), JSON.stringify({ skills: { edit: 'edit.md' } }))
    const result = await discoverPackages(root)
    assert.deepEqual(result.packages, [{ id: 'writing', skills: [{ id: 'writing/edit', path: path.join(root, 'writing', 'edit.md') }] }])
    assert.deepEqual(result.errors, [])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('rejects escaping paths and symlinked manifests while retaining valid packages', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'openarms-catalog-'))
  try {
    for (const name of ['good', 'escape', 'linked']) await mkdir(path.join(root, name))
    await writeFile(path.join(root, 'good', 'package.json'), JSON.stringify({ skills: { edit: 'edit.md' } }))
    await writeFile(path.join(root, 'escape', 'package.json'), JSON.stringify({ skills: { edit: '../outside.md' } }))
    await symlink(path.join(root, 'good', 'package.json'), path.join(root, 'linked', 'package.json'))
    const result = await discoverPackages(root)
    assert.deepEqual(result.packages.map(item => item.id), ['good'])
    assert.deepEqual(result.errors.map(item => item.package), ['escape', 'linked'])
  } finally { await rm(root, { recursive: true, force: true }) }
})
