# Sprint 3.1: budget data foundation

## Implementation and task status

| Task | Delivered source | Acceptance status |
|---|---|---|
| TSK-301 | Evidence checklist and report-only gates below | Blocked: real-host/provider/owner evidence missing |
| TSK-302 | Validated versioned policy, explicit global/project/session merging and runtime configuration loading | Implemented; ask/enforce rejected, live configuration acceptance pending |
| TSK-303 | Latest message/tool records, JSONL transactions, timezone/dimensional rebuild, private atomic aggregate cache | Fixture implementation; streaming host revisions and live reconciliation pending |
| TSK-304 | Stable version-1 query JSON, missing/partial/estimated metrics, context maximum, measured tool contributors and shared text | Fixture implementation; live task and skill attribution unavailable |
| TSK-305 | Crossings ledger in source transactions, exclusive local-filesystem writer lock, restart/correction dedup | Fixture implementation; warnings remain read-only report events, no host toast delivery claimed |
| TSK-306 | Shared query/formatter, TUI `/usage` and `/budget`, server `openarms_usage` tool | Source integration; picker PTY acceptance passed, usage/budget renderer/live-host acceptance pending |

No task with pending acceptance is marked complete in the roadmap. No Sprint
3.2–3.4 executor, rotation, handoff, cancellation, dialog enforcement or child
propagation was added. Existing loader response-budget behavior is untouched.

## Policy and configuration

`src/budget-policy.ts` defines schemaVersion 1, a policy `version`, USD currency,
Intl-supported IANA reset timezone, `off|observe|warn` modes, strictly increasing
warning percentages in (0,100], and independent day/session/task metric maps.
Defaults are observe, UTC, 50/80/100%, and no limits. Cache reads are diagnostic
and cannot be hard limits. Positive finite limits are required; context fractions
are at most 1. Unknown keys, invalid complete bases, currencies/timezones,
ask/enforce and spoofed capabilities fail validation. Hard flags describe limits;
they never perform cancellation. Even warn currently records report-only events.

Runtime precedence: defaults < `<state-directory>/budget-policy.json` (global)
< `<project-root>/.openarms/budget-policy.json` (project) < explicit library
session override. Session overrides are API-only, not inferred from host state.
Metric rules replace wholesale, maps merge, arrays replace; inputs are cloned.
Only a missing file means no override. Malformed/invalid configuration returns
`INVALID_BUDGET_POLICY` in read-only views and disables capture, without silently
falling back or blocking requests. Bump policy version when changing limits,
warnings or timezone: ledger identity includes the version, not a config hash.

## Persistence, aggregates and concurrency

`<state-directory>/usage/source.jsonl` is the source of truth. Each version-1
transaction contains one validated numeric-only record plus its newly crossed
warning events. IDs are scoped by project/session/kind/id. Higher revisions replace
the latest snapshot rather than adding deltas; completed records reject regression
to partial records. Equal revisions with conflicting measurements are rejected.
Tool retries retain the first observed timestamp because tool hooks have no
message ID or monotonic revision. Project identity is SHA-256 of project root,
not a persisted absolute path. Library callers must supply safe opaque IDs.

An exclusive mkdir lock serializes independent writers. JSONL is rewritten using
an exclusive mode-0600 temporary file, file sync, atomic rename and directory
sync; directory creation uses mode 0700. Warning ledger publication and record
publication are one transaction, so a crash cannot publish one without the other.
The derived `aggregate.json` is separately atomic and always recomputed from source
for queries; stale but structurally valid caches never drive totals. Malformed
cache/source yields `corrupt`, not zero. `UsageStore.rebuild(policy)` repairs a
cache from valid source; corrupt source requires operator recovery, not deletion.

Safety boundary: local filesystem with atomic rename/mkdir semantics only; no NFS
or distributed-writer claim. Busy locks time out after roughly 500 ms, never get
stolen. After a crash, confirm no writer is alive before manually removing
`usage/.writer-lock`. No automatic retention/compaction of the usage source or
warning ledger is performed. MVP rewrites/rebuilds are O(history), not a measured
scalability result. No KPI, latency or cost-reduction claim is made.

Daily rows use policy timezone and retain project/session/task/provider/model/
agent dimensions. Query filters use latest records, not sums of cached totals.
Additive token/cost/byte metrics retain null/missing/partial/estimated state;
context utilization is a maximum sample, not a sum. Captured message count is
not a verified count of user turns. Skill token estimates remain missing unless
explicitly supplied by a library caller; presence is `correlation only`, never
causal attribution. Missing provider/model/agent/task dimensions are not invented.

## Warnings and views

Ledger keys include policy version, project, scope type/ID, metric and each crossed
percentage. A jump emits the highest crossing with all crossed levels. Corrections
below a prior level do not unlock it, and restart/retry keeps the ledger. New day,
session/task identity or explicit new policy version begins a new budget identity.
No owner-reset UI is delivered. Numeric warning events include current/limit,
scope and safe report-only action; the view adds breakdown and suggestions.

TUI intercepts `/usage today`, `/usage session [id]`, `/usage project`,
`/usage model <id>` and `/budget` locally before model submission, displaying the
existing read-only dialog. Server clients can call `openarms_usage` with the same
command string. Both use `src/usage-query.ts` and the same formatter. No independent
UI math. `empty`, `unknown` and `corrupt` states have no trustworthy numeric totals.
Infrastructure errors show `USAGE_UNAVAILABLE`; invalid policy is explicit.

## Privacy and host integration boundaries

`governanceHooks` persists governor-measured raw/context byte counts and truncation
count, never tool args, file paths, title, prompt, output or metadata. Its legacy
governor offloaded full logs remain a **separate existing contract**; the new usage
store/query is numeric-only and does not read those logs. Tool source timestamp is
first observation; message/task link, provider/model and skill estimate are unknown.

The server adapter listens to `message.updated` and maps **completed assistant
snapshots only**, using completion time as revision and creation time for the day.
No ordering of partial streaming events is guessed. Completed same-revision
corrections are rejected rather than summed. Host token input is explicitly marked
estimated fresh input pending provider reconciliation; unavailable context samples
remain missing. Defensive field/schema checks can reject unsupported host IDs or
shapes. Fixture adapter tests are not evidence that the deployed host sends these
fields. Capture failures return false and never cancel requests; read-only views
cannot distinguish absent events from a failed capture and must not be read as a
completeness attestation.

## Readiness checklist and evidence (TSK-301)

- [x] Deterministic latest snapshot/replay/timezone fixtures and numeric privacy schema.
- [x] Production governor hook exercised with a local tool fixture; durable call retry.
- [x] Concurrent store-instance warning dedup/correction/restart fixtures.
- [ ] Real-host message IDs, completed snapshot revisions and streaming usage contract.
- [ ] Real-host tool hook delivery and restart measurement completeness.
- [ ] Owner-approved provider reconciliation tolerance and daily/session comparison.
- [ ] Integrated deployed privacy review and TUI renderer acceptance.
- [ ] Graceful `chat.params` cancellation spike with pass/fail integration evidence.
- [ ] Child-session metadata spike with pass/fail integration evidence.

Hard cancellation and child propagation remain blocked, not silently assumed to
work. Budget readiness is report-only. Permission to read runner logs was resolved
in the resumed handoff; old missing-module baseline was diagnosed, not rerun.
Current check results belong in the final execution report; see the
[test guide](../../testing/how_to_test/Sprint_31.md) for scope and acceptance cases.

## Execution evidence (11 October 2026)

All checks used the repository runner and explicit task paths. One scoped plan
required syntax/full/static/runtime/TUI; remaining modes were executed explicitly
after syntax passed, avoiding a duplicate completion verify. Final regression
scope also includes `tests/sprint23.test.ts`: its exact tool inventory now includes
the read-only usage tool while retaining the sole verified skill loader. The test
asserts budget inspection leaves loader state bytes unchanged. Known handoff docs
received explicit classifier mappings; no broader unknown-file fallback was added.

| Check | Result | Observed runner duration |
|---|---|---:|
| Isolated initial usage happy/edge file | GREEN 2/2 after constructor syntax fix | 236 ms |
| Final scoped syntax | PASS 10/10 | 574 ms |
| Final full regression | PASS 156/156 (includes four Sprint 3.1 cases) | 15,231 ms |
| Static smoke | PASS 8/8 | 469 ms |
| Runtime smoke | PASS 5/5; image build PASS | 87,857 ms; build 77,443 ms |
| TUI smoke | FAIL at `tui-interaction:status`, 30 s stage timeout | 94,274 ms |

Earlier RED checks were diagnosed from their full logs: Node strip-only rejected
a parameter property, then full tests caught stale tool-inventory assertions and
an unmapped known handoff doc. Changed inputs were repaired before retry. The
resumed missing-module baseline was not rerun unchanged.

TUI log: `.openarms/logs/tui-smoke-63512111b2672f0378fc92ef-80d6c97a-5c11-45bb-a137-64c5b44a6757.log`.
The fixture reached Skills Help rather than the expected status view; no claim
about root cause or `/usage` renderer acceptance follows from this timeout. Its
internal container-stop attempt also timed out. A subsequent exact-container
inspection reported no such object for `openarms-sandbox-tui-check-242302`, so
that named test container was no longer present. No unchanged TUI retry was made.
Generic runtime/static smoke passes do not prove provider reconciliation, message
delivery completeness, cancellation, child metadata or the new usage TUI flow.

### Scoped picker repair follow-up (11 October 2026)

The prior log's final screen is **Skills Help**, demonstrating that navigation
and Enter did reach a production action, not that the picker keyboard was broken.
The harness retained counts from before grant/revoke were added: the current
picker has twelve actions plus Done. Eleven Down presses select help (index 11),
not status; nine Up presses select revoke (index 4), not inspect. Only the harness
counts changed: thirteen Down presses wrap to status, and eleven Up presses from
the reopened status selection wrap to inspect (index 2). Mouse-hover pairs,
scrolling, dialog replacement, reopening and inspection assertions are preserved.
No production plugin or keyboard behavior was changed.

`tests/sprint31-tui-smoke.test.mjs` checks both destinations against the actual
production action inventory, including Done. Its initial extraction accidentally
included the terminal's `range(32)` screen initializer; after narrowing extraction
to key queues, RED was 0/2 (11 versus 13; revoke versus inspect), then GREEN 2/2
after the harness repair. These are source-contract tests, not renderer proof.

The scoped plan included the harness, isolated regression file and both sprint
docs; no unknown mapping or full/runtime requirement was introduced. Commands
used `node scripts/arms-test.mjs <mode> --task sprint-31` with repeated `--file`
for those four paths, and `verify --plan` once. Remaining modes were run explicitly
after syntax, avoiding duplicate T0/T1 execution on unchanged code/test inputs.

| Follow-up check | Result | Runner duration / log |
|---|---|---|
| syntax | PASS 1/1 (Node test syntax; Python exercised by PTY) | 400 ms; `.openarms/logs/syntax-63512111b2672f0378fc92ef-87e84ba9-51a4-4ee2-8100-fcd9e4797ae3.log` |
| related | GREEN 2/2 isolated regressions | 126 ms; `.openarms/logs/related-63512111b2672f0378fc92ef-4c9ff1c1-e99e-445e-a34f-e81443856577.log` |
| smoke-static | Cached prior PASS, unchanged fingerprint | `b76f43207e00`; no forced rerun |
| build | PASS | 76,507 ms; `.openarms/logs/build-63512111b2672f0378fc92ef-40501bac-1612-49a9-9c32-99455ae6e311.log` |
| tui-smoke | PASS 4/4, including cleanup | 137,545 ms; `.openarms/logs/tui-smoke-63512111b2672f0378fc92ef-e78ec653-d0bd-4649-a709-b1855cc23e28.log` |
| `npm run test:policy` | 0 bypass findings | Report-only |

Full and runtime were not rerun: production inputs were unchanged and the
follow-up classifier skipped them. The TUI mode also checked the static dependency
and reused its stamp. No permission or cleanup blocker occurred in this follow-up.
Live `/usage` and `/budget` acceptance was not added to this minimal navigation
repair; it remains an explicit deployment check below, not a claimed pass. The
readiness gates and incomplete task statuses above remain unchanged.
