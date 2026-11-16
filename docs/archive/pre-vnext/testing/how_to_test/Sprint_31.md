# Sprint 3.1 usage/budget testing

> Current skill routing: [Single Library](Single_Library.md), explicit project
> root and only `load_skill({skill})`, no grants/hash approval requirement.
> Usage/budget instructions are separate. Picker counts and pass evidence below
> describe the recorded historical revision, not the redesigned picker inventory
> or a new smoke pass. Combined redesign verification remains pending.

Run from repository root through `node scripts/arms-test.mjs`. The runner's
`related` mode passes exactly mapped paths to Node's test runner; a test-only
`--file tests/sprint31.test.ts` isolates that file. No network or service mocks
replace production behavior: fixtures call the real policy, store, query and
governance hook. Temporary directories are cleaned up.

```sh
node scripts/arms-test.mjs related --task sprint-31 --file tests/sprint31.test.ts
```

This is the isolated development smoke, not completion validation. At completion
review one `verify --plan --task sprint-31` using repeated `--file` arguments for
the complete task scope (source, adapters, mapping/config, tests and docs). Run
`syntax` after significant edits. Shared source/test-map changes mandate full;
server adapter changes require runtime smoke and TUI changes require TUI smoke
under AGENTS.md and `scripts/test-policy.json`. Do not run related plus full on
unchanged test/code inputs. If syntax already passed unchanged, run remaining
explicit modes rather than duplicating syntax. Missing Docker/Python/PTY means
blocked integration validation, never passed. Run `npm run test:policy` when
automation mappings/configuration change. Diagnose failures from the named full
log before retrying.

## Deterministic fixtures

`tests/sprint31.test.ts` covers happy-path latest snapshot replacement, stale
completed protection, timezone day rollover, replay and shared text/query;
critical concurrent crossings with 50/80/100 jump, corrections and restart;
unsafe policy/corrupt source; real governor hook capture/retry, completed-message
normalization, privacy and invalid configuration; empty/unknown/corrupt cache
states, rebuild repair, independent day/session/task levels and off mode.
`tests/budget-policy.test.ts` covers whole-policy validation, precedence, cloned
inputs, unsupported capability claims and unsafe thresholds.

No fixture attests real-host streaming event ordering or provider agreement.
Observe/warn record report-only events; requests are never cancelled.

## Manual read-only acceptance after deployment

### Picker smoke repair evidence

The container PTY picker smoke passed 4/4 on 11 October 2026 after correcting
stale navigation counts in `sandbox/tui-smoke.py`: twelve actions plus Done
require thirteen Down presses to wrap to status and eleven Up presses to wrap
from status to inspect after reopening. Mouse hover and reopen/inspect checks
remain enabled. No production keyboard implementation changed.

The fast source-contract regression checks those counts against the production
picker inventory and guards the Done/upward-wrap edge:

```sh
node scripts/arms-test.mjs related --task sprint-31 --file tests/sprint31-tui-smoke.test.mjs
```

Observed RED 0/2, GREEN 2/2 (126 ms). This command isolates that file, not the
full suite. For the repair's complete scope, supply repeated `--file` arguments
for `sandbox/tui-smoke.py`, `tests/sprint31-tui-smoke.test.mjs`,
`docs/reports/sprints/report_sprint_31.md` and this guide. The reviewed plan
required syntax, related, static smoke and TUI smoke, skipping full/runtime.
Static reused its passing fingerprint; TUI passed in 137,545 ms with cleanup.
See the sprint report for exact log paths. This is picker navigation evidence,
**not** `/usage` or `/budget` renderer acceptance; those commands still require
the following deployed checks with actual host events.

1. Start a new session; `/usage session` should show empty/unknown, not zero costs.
2. Run a small tool, then `/usage session`: compare governor byte measurements;
   token/cost fields without completed messages must remain missing.
3. After a completed model reply, inspect `/usage today`, `/usage project`,
   `/usage model <actual-model-id>` and `/budget`. Compare shared report values
   through server `openarms_usage` with the same scope/session.
4. Configure a project session limit using `.openarms/budget-policy.json`:

```json
{"version":"local-budget-v1","mode":"observe","timezone":"Asia/Ho_Chi_Minh","scopes":{"session":{"toolOutputBytes":{"limit":10000,"hard":false}}}}
```

5. With controlled measured output, cross 50/80/100; a jump must show only the
   highest new event with its crossed levels. Restart and re-query: no duplicate.
   Requests must continue. Changing policy settings requires a new version.
6. Try invalid currency/timezone or enforce mode: view must explicitly report
   invalid configuration, never silently adopt a fallback or block the request.
7. Verify stored source and views do not contain known test-secret prompt/output/
   path/title values. Do not use real credentials. Legacy full governor logs are
   separate and may contain output; do not mistake them for numeric-only usage.
8. In a disposable fixture copy, damage `aggregate.json`: query reports corrupt;
   `UsageStore.rebuild(policy)` repairs valid source. Damage source: stop and
   recover from backup; no fallback zero. Check lock recovery only after confirming
   all writers stopped; abandoned locks are deliberately not auto-stolen.

Record deployed host/SDK revision, timezone, scope/provider/model, fixtures versus
real events, and observations. Obtain an owner-approved reconciliation tolerance
before comparing billed daily/session totals. Cancellation and child metadata
require separate real-host integration spikes; neither is an acceptance result
of these fixtures. No KPI or performance conclusion without observations.
