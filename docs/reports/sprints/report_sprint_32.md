# Sprint 3.2: rotation and session lifecycle

## Source and acceptance scope

| Task | Source implementation | Acceptance / remaining gate |
|---|---|---|
| TSK-307 | Pure deterministic none/suggest/ask evaluator; explicit task-completed boundary; sourced missing metrics omitted; configurable 60% context default | Fixture implemented; deployed host has no proven task-completed + active edit/test boundary. No idle/message-complete inference |
| TSK-308 | Seven-section deterministic <=30-line writer with atomic private projection, journal and CAS | Local cooperating filesystem fixtures; no hostile concurrent filesystem-mutator or distributed-filesystem guarantee |
| TSK-309 | Every field sanitized before compaction; common secret/absolute-path/raw-output rules; unknown/tool content replaced; rule-ID audit | Conservative fixture detector, not universal secret detection; owner privacy review remains required |
| TSK-310 | Prepared/claimed/acknowledged/archived metadata, explicit matching target+ID+hash, journal recovery and retained archive | Fixture lifecycle; session creation is intentionally external and has no deletion effect |
| TSK-311 | Production server/TUI child fallback, zero selection, separate task, parent/project grants excluded; explicit optional loader grant | Disabled bridge is the delivered branch; exact-ID nonce bridge remains blocked on host evidence |
| TSK-312 | Restore after server pre-creation; No zero, Yes reconciled selection; grants never recreated from selection; existing project grant validity checked | Adapter/service fixtures; actual deployed restore renderer and restart acceptance remain open |
| TSK-313 | Separate evaluator/action, observe/shadow allow-only audit, durable crossing dedup and offline version replay; chat.params and capture integration | Request/tool fixture integration; live cohort/provider/owner evidence remains open. No enforcement |

Roadmap checkboxes stay unchecked until acceptance. Sprint 3.1's historical
156/156 and smoke passes are not Sprint 3.2 evidence. No KPI or provider
reconciliation claim follows from local fixtures.

## Architecture and integration

`session-rotation.ts` takes an explicit completion snapshot. Context >=0.6,
session budget ratio >=1, cumulative tool bytes >=1 MiB, and sourced relatedness
<0.25 are advisory reasons; multiple primary reasons or exhausted budget return
ask. Ask is a value, not a dialog. Cache trend >1 only explains another reason.
Invalid/missing signals are omitted. Active edit/test or any other boundary
returns none. Threshold options are validated. No closing/creation API exists.

`createUsageRuntime.taskCompleted(session, snapshot, options)` exposes the trusted
boundary seam. It currently emits numeric would_rotate only for an actual sourced
context crossing; relatedness-only decisions have no invented numeric usage
sample. The host does not currently expose a proven explicit task boundary, so
the server does not automatically call this seam. This is an unresolved host
integration gate, not simulated acceptance.

`session-handoff.ts` owns project-contained `.openarms/handoff.json` (authoritative
metadata/body/rule IDs) and `.openarms/progress.md` (atomic reusable projection).
Headings are exactly Objective, Completed, Active, Decisions, Verification,
Relevant Files, Next Step. Item quotas 2/5/3/3/3/5/2 reserve Next Step. All fields
are sanitized first, duplicates removed in source order and safe text limited to
140 characters. Missing sections receive a safe placeholder. Inputs must come
from trusted task/runtime/owner records; tool or unknown provenance is omitted.
Common credentials, bearer/private keys, environment assignments, absolute paths,
stack traces, code fences/diff and uncertain long tokens are omitted. This does
not prove arbitrary text is secret-free; callers must not relabel raw output as
trusted task status. Errors and audit never include matched content.

Directory/target symlinks and nonregular targets are rejected; no caller-supplied
output filename exists. Exclusive mkdir lock and expected content hash serialize
cooperating writers. A new handoff requires the prior one archived, a matching
expected hash and a later creation time. Same-ID/content/time retry is idempotent.
Journal is synced/renamed before progress projection; recovery repairs a crash
between them. Target claim is exclusive; read or failed external session creation
never changes lifecycle. Archive requires explicit matching acknowledgement.
Archive is a retained logical state, not file deletion; before replacing it the
prior full envelope is retained in `.openarms/handoff-archive/`. No automatic
retention eviction: stale unacknowledged handoffs and archives remain until owner
review/backup. Locks are never stolen. Recovery requires stopping all writers
before manually removing an abandoned `.handoff-lock`. Local atomic rename/mkdir
semantics and a trusted project directory are required; hostile directory-swap
races, NFS/distributed writers and automatic crash-lock recovery are not claimed.

Child creation uses `startChildSession`, not ancestry as authority. Compatibility
`inheritSession` now also selects this disabled-bridge branch. Parent stays
unchanged; no packages, mismatch approval, history, task lock/used markers or
grants copied. Parent project grants are deliberately excluded for fallback
children, which require explicit optional selection plus once/session loader
approval even when the optional registry entry normally allows loading. Project
grant UI actions on children fail closed; filesystem/shell permissions remain
host-owned. Duplicate child events retain explicit child work. Old saved child
ancestry is reset when a proven child event/TUI parent ID is received; a saved
state with no host parent metadata is not independently attested as a child.

Restore uses a persisted selectionReady marker so server-created blank sessions
still receive the TUI choice; dismissed/default No chooses zero. Existing explicit
home-picker selection transfers selection only, including an explicit empty
selection; no once/session grant or active task state transfers. Runtime registry
reconciliation precedes the dialog/service. Yes is not approval. Project grants
must retain exact project/revision (which covers source hashes/policy metadata),
owner and permitted policy. Once is consumed only after successful verified load;
session grants stay at origin. Restore clears locks/used/mismatch/once, preserving
only same-origin session grants and inspect-only history. Source hashes are
rechecked on every load; changing registry policy invalidates stale grants.

`budget-executor.ts` computes numeric/category-only would_warn at configured
crossings, would_ask at >=80% warning crossings except cache reads, and would_block
for measured hard-limit >=100% except cache reads. These are fixed hypothetical
rules, not active ask/enforce modes. observe/shadow/warn always allow. Request
`chat.params` evaluates current usage without mutating parameters; tool/message
capture evaluates after recording. Audit failure never changes request/tool
success. `.local/state/openarms/shadow/audit.json` (or configured state directory)
is a private atomic dedup ledger keyed by policy/project/scope/metric/threshold/
decision. Corrections do not unlock entries. All newly crossed shadow levels are
retained (unlike the user report's highest-crossing summary). Bump version for
policy changes. No raw prompt/tool output goes into this ledger. Replay reads
numeric usage source and compares policy versions without writes or host calls.
Locks and audit/source history are retained without automatic eviction; stop
writers before manual stale-lock recovery, back up before repairing corrupt data.
Loader response-budget/governor content contracts remain separate and unchanged.

## Verification evidence

Initial isolated RED: missing new rotation module, exit 1, 107 ms, full log
`.openarms/logs/related-63512111b2672f0378fc92ef-46e175f5-9efd-412c-b3e1-dc917faf4e52.log`.
Second changed-input run passed lifecycle/sanitizer 3/6 but failed 3 adapter cases
on malformed synthetic registry detection fields (254 ms); diagnosed full log
`.openarms/logs/related-63512111b2672f0378fc92ef-64eb6975-cde6-44c7-8961-bae5d56db80b.log`.
Corrected fixture uses the real registry contract, not mocked production behavior.
GREEN isolated 6/6, 332 ms, log
`.openarms/logs/related-63512111b2672f0378fc92ef-c138e20f-532d-454b-8ba1-d0256da634f2.log`.
Completion results are recorded after the scoped plan/checks below; the early
GREEN predates subsequent compatibility-path safety and regression changes.

Review focus: durable journal/projection crash window, CAS/lifecycle target
binding, grant scope preservation and child fallback isolation. Older inheritance
tests are intentionally updated to test isolation rather than require the
unproven shared-task bridge. No Sprint 3.3 enforcement/automatic rotation added.

### Historical completion blocker (resolved below)

The complete 23-path scoped verify plan required syntax/full/static/runtime/TUI,
skipping related as covered by full. Syntax passed 20/20 in 466 ms, log
`.openarms/logs/syntax-63512111b2672f0378fc92ef-dffe5bf7-95e1-4e02-bb41-207230304542.log`.
Full failed 161/164 in 14,896 ms, log
`.openarms/logs/full-63512111b2672f0378fc92ef-f5cc3620-ef9e-4816-8e57-d95dd0212343.log`.
The complete failure log identified one child-isolation fixture missing explicit
parent selection, one stale expected related-test inventory, and the pre-existing
unmapped `.opencode/handoff-sprint31-tui.md`. The two authorized fixture
expectations were repaired; `tests/test-runner.test.mjs` is now also a task change
and must be included as the 24th path in resumed scoped commands. The unrelated
handoff was not opened/classified or edited because it is outside the sole
authorized task brief. Controller must supply its reviewed classifier decision
(or authorize a scoped scout) before a meaningful full retry. No unchanged full
retry or silently broadened docs mapping was performed. Remaining required
static/runtime/TUI checks are not claimed passed; completion is blocked, not
accepted. The final response records any post-repair authorized checks.

Post-repair isolated Sprint 2.3 compatibility regressions passed 28/28 in
1,015 ms (`node scripts/arms-test.mjs related --task sprint-32 --file tests/sprint23.test.ts`),
log `.openarms/logs/related-63512111b2672f0378fc92ef-17dab21a-9e76-43ec-b4d5-074fa8c199b4.log`.
Final 24-path syntax passed 21/21 in 472 ms, log
`.openarms/logs/syntax-63512111b2672f0378fc92ef-780cd241-33e7-4339-9e9e-72c60950a1d5.log`.
`npm run test:policy` reported 0 bypass findings; duration not measured.
The repaired related-inventory assertion is syntax-checked but not yet rerun:
the same file's repository-wide classifier test remains context-blocked.

Exact repeated-file scope for command reproduction (shell array expansion):

```sh
SCOPE=(
  --file src/session-rotation.ts --file src/session-handoff.ts
  --file src/budget-executor.ts --file src/budget-policy.ts
  --file src/usage-runtime.ts --file src/state-store.ts
  --file src/state-schema.ts --file src/types.ts --file src/runtime.ts
  --file src/skills-service.ts --file src/verified-loader.mjs
  --file plugins/skill-router-server.ts --file plugins/skill-router-tui.tsx
  --file scripts/session-lifecycle.mjs --file scripts/test-map.json
  --file scripts/test-policy.json --file tests/sprint32.test.ts
  --file tests/core.test.ts --file tests/sprint23.test.ts
  --file tests/budget-policy.test.ts
  --file docs/roadmap/Tasklist_Phase_3.md
  --file docs/reports/sprints/report_sprint_32.md
  --file docs/testing/how_to_test/Sprint_32.md
)
# Executed before the related-inventory fixture repair:
node scripts/arms-test.mjs verify --plan --task sprint-32 "${SCOPE[@]}"
node scripts/arms-test.mjs syntax --task sprint-32 "${SCOPE[@]}"
node scripts/arms-test.mjs full --task sprint-32 "${SCOPE[@]}"
# Executed after repair, with the newly changed test included:
SCOPE+=(--file tests/test-runner.test.mjs)
node scripts/arms-test.mjs syntax --task sprint-32 "${SCOPE[@]}"
```

These expansions document the literal repeated-file commands used; the shell
array itself was not installed as repository automation. Report-only evidence
updates do not change code/test inputs. Do not repeat unchanged passing checks.

### Completion continuation: resolved and verified (11 October 2026)

Controller supplied the reviewed classification: the prior Sprint 3.1 TUI
handoff is documentation only. Added exactly
`".opencode/handoff-sprint31-tui.md": "docs"` to `scripts/test-policy.json`;
no wildcard, unrelated handoff read, or runtime mapping was added. This resolves
the historical context blocker above. The existing classifier inventory is
covered by the now-passing full run.

The final scope is the 24 paths above plus
`--file .opencode/handoff-sprint31-tui.md` (25 paths). This handoff is check
scope only, not edited by this continuation. Recreate `SCOPE` in each shell
invocation; shell variables do not survive separate tool calls here. Exact
completion commands were:

```sh
SCOPE+=(--file .opencode/handoff-sprint31-tui.md)
node scripts/arms-test.mjs syntax --task sprint-32 "${SCOPE[@]}"
node scripts/arms-test.mjs full --task sprint-32 "${SCOPE[@]}"
node scripts/arms-test.mjs smoke-static --task sprint-32 "${SCOPE[@]}"
node scripts/arms-test.mjs smoke-runtime --task sprint-32 "${SCOPE[@]}"
node scripts/arms-test.mjs tui-smoke --task sprint-32 "${SCOPE[@]}"
npm run test:policy
```

Used remaining explicit plan modes, not a second plan or duplicate completion
verify. Full is mandatory for shared/core and classifier changes; static/runtime/
TUI are mandatory from the reviewed integration plan. The changed exact mapping
justified retrying the diagnosed full failure. No unchanged isolated pass was
rerun. One initial smoke invocation had an empty scope expansion and returned
`CONFIG_ERROR: Unknown argument: `, exit 2, before checks/log creation; diagnosed
as shell-variable non-persistence and corrected by declaring the complete array
in the same invocation. Its duration was not measured.

| Check | Result | Runner duration | Log under `.openarms/logs/` |
|---|---|---:|---|
| syntax | PASS 21/21 | 547 ms | `syntax-63512111b2672f0378fc92ef-c43dbd7e-3e89-489c-99d1-0693faad98fb.log` |
| full | PASS 164/164 | 14,429 ms | `full-63512111b2672f0378fc92ef-f1ce3198-97a1-4a22-a80b-de282b3adf6f.log` |
| smoke-static | PASS 8/8 | 448 ms | `smoke-static-63512111b2672f0378fc92ef-6744b2ff-26d6-465b-9433-e9ffe2730cbb.log` |
| build | PASS 1/1 | 69,931 ms | `build-63512111b2672f0378fc92ef-170580e5-5580-4ddc-8049-dee747bd4ea0.log` |
| smoke-runtime | PASS 5/5 | 82,253 ms | `smoke-runtime-63512111b2672f0378fc92ef-11889644-ab5c-411f-b383-e9fc88313035.log` |
| tui-smoke | PASS 4/4 | 60,287 ms | `tui-smoke-63512111b2672f0378fc92ef-7dbe05a0-af69-4021-a514-b15aa3704df4.log` |
| test:policy | 0 bypass findings, report-only | not measured | console output; no log path emitted |

Runtime/TUI reused the unchanged static pass; TUI reused the matching build
image. Related was skipped because full covers it. No permission, capability or
cleanup blocker was reported. Final documentation-only evidence edits do not
change verified code/test inputs and do not justify repeating passing checks.

Scoped review inspected the supplied tracked adapter diff and named lifecycle,
state/service/runtime, verified-loader and shadow implementations. Target claim,
acknowledge and archive bind ID/hash/target before idempotent transitions; archive
cannot skip acknowledgement. Cooperating lock/CAS and authoritative journal
retain the documented filesystem limits. Child reset copies no parent authority;
runtime excludes project grants for fallback children, requires optional approval
and refuses project-scope child grant publication. Restore selection is distinct
from approval; registry revision/owner/policy reconciliation filters grants and
successful load alone consumes once. Shadow action and audit failures remain
allow-only with no dialog/cancel/session callback. No concrete new defect was
found within this review scope; this is not a hostile-filesystem or live-host
security acceptance. No production changes were needed in this continuation.

TSK-307–313 source/fixture implementations are delivered and current repository
checks pass. Acceptance remains pending exactly as in the task table and deployment
guide: explicit host completion delivery, child metadata, actual restore renderer,
provider reconciliation and owner privacy/false-positive review. Generic smoke
passes do not close these gates. No Sprint 3.3 enforcement, automatic rotation,
real cancellation, bridge enablement, KPI, commit or push is claimed.
