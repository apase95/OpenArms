# Sprint 3.2 testing and operator recovery

> Skill routing now follows [Single Library](Single_Library.md). Historical
> fixture/pass evidence below belongs to the recorded Sprint 3.2 revision, not
> the redesign. Scoped grants are no longer current setup requirements; final
> combined redesign full/smoke verification remains pending.

Use repository root and `node scripts/arms-test.mjs`. Development isolation:

```sh
node scripts/arms-test.mjs related --task sprint-32 --file tests/sprint32.test.ts
```

Runner inspection confirms related passes exact test filenames to Node; this is
not a full suite. The isolated file covers deterministic completion vs active or
cache-only snapshots, common sanitizer fixtures and false-positive safe progress,
30-line priority retention, atomic handoff/explicit acknowledgement, stale CAS,
concurrent claims, symlink escape, crash projection recovery/retained archive,
actual server child loader fallback, parent unchanged, server-precreated restore
No/Yes, scoped grants and shadow chat/tool allow/dedup/replay. Synthetic host
events are adapter evidence, not provider/host API acceptance. All temp state is
cleaned up. No external service is required or production behavior mocked.

At completion review one `verify --plan --task sprint-32` with repeated --file
for every task source/test/docs/mapping path. Shared code/mapping changes mandate
full; server/TUI seams require classifier static/runtime/TUI smoke. After syntax
passes unchanged, use remaining explicit modes, not duplicate verify/T0/T1.
Missing Docker/Python/PTY is blocked. Run `npm run test:policy` for mappings.

Current completion evidence: [Sprint 3.2 report](../../reports/sprints/report_sprint_32.md#completion-continuation-resolved-and-verified-11-october-2026).
The 25-path scope includes the exact reviewed docs-only
`.opencode/handoff-sprint31-tui.md` classification; do not replace it with a broad
`.opencode` pattern. Syntax 21/21, full 164/164, static 8/8, runtime 5/5 and TUI
4/4 passed. These are repository/fixture checks, not the deployment acceptance
below. Recreate the report's complete shell array within each command invocation.

## Handoff commands (operator, not model tool)

```sh
node --experimental-strip-types scripts/session-lifecycle.mjs inspect /absolute/project
node --experimental-strip-types scripts/session-lifecycle.mjs prepare /absolute/project /trusted/input.json none
node --experimental-strip-types scripts/session-lifecycle.mjs claim /absolute/project HANDOFF_ID CONTENT_HASH TARGET_SESSION
node --experimental-strip-types scripts/session-lifecycle.mjs acknowledge /absolute/project HANDOFF_ID CONTENT_HASH TARGET_SESSION
node --experimental-strip-types scripts/session-lifecycle.mjs archive /absolute/project HANDOFF_ID CONTENT_HASH TARGET_SESSION
node --experimental-strip-types scripts/session-lifecycle.mjs recover /absolute/project
```

Input schema: `id`, `sourceSession`, canonical ISO `createdAt`, and `fields` keyed
by the seven exact headings; each field is an array of `{text,source}` sourced
items. source is task/runtime/owner; tool/unknown content is replaced. No raw
diff/log/output. `none` is expected hash for first publication only. To replace an
archived handoff supply its exact hash, a distinct ID and later creation time.
Read/failed session creation does not delete or claim anything. Only the explicit
target matching ID/hash may acknowledge/archive. Archive retains content; prior
archives are retained when preparing the next handoff. Inspect before acting.

For stale/crash recovery: stop all project writers, back up `.openarms` and
inspect the authoritative journal. Confirm no writer is alive before manually
removing abandoned `.openarms/.handoff-lock`; then run recover to rebuild the
projection. Recover does not release/reassign claims or acknowledge anything.
An incorrectly claimed target requires owner-reviewed backup/state repair, not
timing-based transfer. Corrupt journal requires backup recovery; never invent a
zero/default state. No automatic retention deletion is implemented. Review stale
prepared/claimed items and archives periodically; do not delete unacknowledged
handoffs to make a new one. Trusted local filesystem only, no distributed-writer
or hostile concurrent directory replacement guarantee. Sanitizer is conservative
common-pattern detection, not a universal credential/privacy guarantee.

## Shadow policy and replay

Example project `.openarms/budget-policy.json`:

```json
{"version":"owner-shadow-v1","mode":"shadow","scopes":{"session":{"toolOutputBytes":{"limit":10000,"hard":true}}}}
```

This hard flag predicts would_block; it never blocks. ask/enforce still fail
validation. Defaults remain observe with no limits. Compare numeric usage under
multiple complete validated policy objects in a JSON array:

```sh
node --experimental-strip-types scripts/session-lifecycle.mjs replay /absolute/project /absolute/state/openarms/usage /trusted/policies.json
```

Replay makes no changes. Numeric-only shadow audit is under the state-directory
`shadow/audit.json`; no automatic eviction. Its exclusive `.writer-lock` is never
stolen; stop writers/back up before manual crash-lock removal. Corrupt source or
audit is not interpreted as zero; requests still allow and audit is unavailable.
Warnings and ask/block predictions deduplicate by version/scope/metric/threshold/
decision. Corrections do not reopen events. Bump policy version for rule changes.
Observe/shadow opens no dialog, cancels no request and creates no session.

## Deployment acceptance still required

1. Verify real host session.created parent IDs and tool/message deliveries. Child
    must start without inherited source authority and require explicit selection
    plus `load_skill` for an exact selected ID; no grant step. Host shell/read
   rights must remain independent. Bridge remains disabled without a separate
   exact-ID intent/nonce/expiry spike.
2. On a new server-created blank session verify restore UI defaults No; dismiss/No
    gives zero and Yes shows selection from the same library only, never grants.
    Changing library clears prior source state throughout the project; Cancel
    preserves it. Recommend `/new` because old model context cannot be retracted.
3. Verify trusted explicit task-completed boundary + no active edit/test before
   wiring `createUsageRuntime.taskCompleted`; do not use assistant completion or
   idle as task completion. Test 60% threshold configuration and missing metrics.
4. Cross shadow limits and compare unchanged request parameters/tool execution
   with off. Inspect audit privacy, restart/concurrent dedup and offline replay.
   Audit sink failure must still allow. Real provider reconciliation and owner
   false-positive review remain Sprint 3.1/3.3 gates, not fixture KPIs.
5. Exercise journal projection crash repair and explicit target acknowledgement
   in a disposable trusted project. Do not use real credentials in test corpus.

Record host/SDK/provider revision, project policy version, real-vs-fixture evidence
and owner acceptance. No automatic session rotation or graceful cancel is claimed.
