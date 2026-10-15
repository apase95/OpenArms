import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { integrity, resultFailed, readRegular, parseJSON } from './registry-v2.mjs'
import { migrate, selectedHashes, serialize, transaction } from './registry-v2-operations.mjs'

export function main(args = process.argv.slice(2)) {
  try {
    const command = args.shift(), options = {}, ids = []
    if (!['integrity', 'migrate', 'hash'].includes(command)) throw new Error('Command required: integrity|migrate|hash')
    while (args.length) {
      const flag = args.shift()
      if (['--check', '--write', '--dry-run', '--diff'].includes(flag)) {
        if (options[flag]) throw new Error(`Duplicate ${flag}`)
        options[flag] = true
      } else if (['--root', '--registry', '--decisions', '--skill'].includes(flag)) {
        const value = args.shift()
        if (!value || value.startsWith('--')) throw new Error(`Missing ${flag}`)
        if (flag === '--skill') ids.push(value)
        else { if (options[flag]) throw new Error(`Duplicate ${flag}`); options[flag] = value }
      } else throw new Error(`Unknown option ${flag}`)
    }
    if (!options['--root'] || !options['--registry']) throw new Error('Explicit --root and --registry required')
    if (options['--write'] && (options['--check'] || options['--dry-run'])) throw new Error('Conflicting write/check/dry-run')
    if (command === 'integrity' && (ids.length || options['--write'] || options['--decisions'] || options['--diff'])) throw new Error('Integrity is read-only')
    if (command === 'hash' && (options['--decisions'] || options['--diff'])) throw new Error('Hash accepts explicit skill IDs only')
    if (command === 'migrate' && (ids.length || options['--check'] || !options['--decisions'])) throw new Error('Migration requires --decisions, not --skill/--check')
    if (command === 'integrity') {
      const results = integrity(parseJSON(readRegular(options['--registry']).toString('utf8')), options['--root'])
      console.log(JSON.stringify(results, null, 2))
      return results.some(resultFailed) ? 1 : 0
    }
    const decisions = command === 'migrate' ? parseJSON(readRegular(options['--decisions']).toString('utf8')) : null
    const result = transaction(options['--registry'], source => {
      if (command === 'migrate') {
        const output = migrate(source, options['--root'], decisions)
        return { output, report: options['--diff'] ? { before: source, after: output } : output,
          revalidate: () => { if (serialize(migrate(source, options['--root'], decisions)) !== serialize(output)) throw new Error('Concurrent source file change') } }
      }
      const report = selectedHashes(source, options['--root'], ids), output = structuredClone(source)
      for (const row of report) output.skills[row.id].contentHash = row.newHash
      return { output, report, revalidate: () => { if (JSON.stringify(selectedHashes(source, options['--root'], ids)) !== JSON.stringify(report)) throw new Error('Concurrent source file change') } }
    }, { write: Boolean(options['--write']), backup: command === 'migrate' })
    console.log(JSON.stringify(result.report, null, 2))
    return command === 'hash' && !options['--write'] && result.report.some(row => row.oldHash !== row.newHash) ? 1 : 0
  } catch (error) {
    console.error(JSON.stringify(error.result ?? { id: 'registry', rule: 'operation', expected: 'valid safe transaction', actual: error.code ?? error.message }))
    return 2
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()
