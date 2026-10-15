# Báo cáo Sprint 2.3 — source GREEN, live acceptance còn gates

## Current retired-family correction

Authoritative restore/clear now share task-family retirement with prompt reset:
all direct flattened aliases receive the new boundary and lose active lock/used/once
evidence atomically. Selections retain their existing restore/clear semantics;
session/project grants and historical records survive retirement (including clear).
Alias operations do not rotate the authority boundary. Regression variants cover
restore, clear and prompt reset followed by rebind/restart, no resurrected conflict
or merged used IDs, and retained session/project approvals. Earlier lock, ancestry
and migrated-boundary fixes remain covered. Fresh scoped review, not acceptance.

Analogous seams inspected: resetTaskLock is now the same helper with existing alias
and duplicate-boundary guards; independent inheritance resets only a detached child
and rejects shared descendants; migration is independent of an existing family;
registry/selection reconciliation is not an authoritative task-boundary rotation.
No broad lifecycle redesign or guessed old-v2 ancestry was introduced.

Validation for task `sprint-2.3-family-reset-fix`, six explicit paths in the current
handoff: one `verify --plan` exit0 (syntax/full; related covered; smoke NOT_AFFECTED),
`syntax` exit0 **2/2, 400ms**, `full` exit0 **132/132, 14364ms**, cache disabled.
Exact logs:
- `.openarms/logs/syntax-63512111b2672f0378fc92ef-f167be79-97d7-4dbb-9033-38a3a0448e4b.log`
- `.openarms/logs/full-63512111b2672f0378fc92ef-2d0c74df-6a53-4151-aa16-3c8157ddcb01.log`
Meaningful isolated pre-fix RED: related, 14/16, exit1, 723ms; restore/clear boundary
assertions fail, prompt reset passes. Log
`.openarms/logs/related-63512111b2672f0378fc92ef-cb082761-a274-4e7c-a813-021b051ec4b1.log`.
Raw-log diagnosis belongs to controller scout; no unchanged failing retry. Full
required by shared-core policy and user request, includes all 16 Sprint23 cases.
No duplicate GREEN/related; policy skipped (no automation edits), no semantic TS,
remote CI/e2e/live host/migration. Historical live gates remain pending. Docs checked
manually against the contract; tracked diff checks do not cover untracked inputs.
Historical ancestry/full results below are not current proof.

Current ancestry correction: `src/state-store.ts` now flattens existing descendants
atomically when an authority is rebound. Compatible locks/used IDs are reconciled;
conflicting owners/revisions and used-ID overflow reject without publication.
Session grants/history remain scoped and retained; current once grants track the
new boundary. Canonical schema validates every publication before rename. Tests
cover out-of-order ancestry with restart, once grant/history, competing owner and
parent reset, plus conflicting-lock rejection preserving exact bytes/self rejection.
Earlier shared-task and migrated-boundary corrections are preserved. No old-v2
ancestry guessing, live reads, commits or acceptance claim. Evidence follows below.

Ancestry validation uses task `sprint-2.3-ancestry-fix`, repeated `--file` for the
six exact paths in the handoff current ancestry section. One `verify --plan`: exit0,
syntax/full required or recommended, related covered by full, all smoke NOT_AFFECTED.
`syntax`: exit0, 2/2, 484ms;
`.openarms/logs/syntax-63512111b2672f0378fc92ef-b838673e-d5ff-44a9-b37a-83adf63dcf37.log`.
`full`: exit0, 129/129, 14859ms;
`.openarms/logs/full-63512111b2672f0378fc92ef-f222ef8e-1e32-4551-a087-20d310f8087d.log`.
Meaningful pre-fix isolated `related --file tests/sprint23.test.ts`: exit1, 11/13,
717ms; `.openarms/logs/related-63512111b2672f0378fc92ef-b2560f51-2f6d-4bde-9a04-46e0539c5f0d.log`.
No raw log inspected; controller scout diagnosis requested, no unchanged retry.
GREEN in required full includes all 13 Sprint23 cases and previous regression checks.
No automation edits/policy rerun; semantic TS/remote CI/live host/e2e/migration skipped.
Historical live acceptance gates remain pending despite narrow scope smoke skips.

CURRENT independent-review corrections are recorded at the end; prior full123
evidence below is historical and does not validate those corrections.

Ngày 11/10/2026; shared-skills/Ponytail task lock, không workflow Superpower.
[API/state/task/recovery/host limits](../../testing/how_to_test/Sprint_23.md).

| Task | Triển khai source | Acceptance |
|---|---|---|
| TSK-211 | State v2 migration, persisted scoped/owner/revision grants, bounded history, reconcile/restore; startup persisted reconciliation | GREEN trong full 123/123; migration/restart/restore/corruption fixtures, live operational recovery pending |
| TSK-212 | Lock boundary/package/revision/used IDs; state lock qua core verification, once chỉ consume success | GREEN: instances/processes/multi-skill/idempotent reset và deterministic old/new boundary; cooperative/private-dir contract only |
| TSK-213 | Filesystem config riêng, SDK/config synthetic fixture, không thêm allow bypass | GREEN ordered glob fixture + real SDK 1.18.34; không live OpenCode permission-engine proof |
| TSK-214 | Sole verified registered tool, concise package/skill router, v1 fail-closed, explicit trusted v2 approval | GREEN source/core/SDK/prompt fixtures; live tool registration/operational validation pending |
| TSK-215 | Gỡ registered legacy tool/package-wide content API; named source/test/sandbox/docs inventory complete | GREEN regression, không speculative compatibility loader; fresh independent security review pending |

Checkbox roadmap giữ pending; không Phase2 self-approval, live library migration,
dependency install, global config, commit/push hoặc skill content acquisition.
Existing dirty previous-phase work được giữ, source edits apply_patch.

## Preliminary RED evidence (historical; diagnosis resolved)

Isolated meaningful RED:
`node scripts/arms-test.mjs related --task sprint-2.3 --file tests/sprint23.test.ts`
**4/6**, exit 1, **486 ms** (Node TAP 442.865 ms). Bounded summary chỉ ra stale
persisted grants sau revision reconciliation, và SDK/config assertion thứ hai.
Log `.openarms/logs/related-63512111b2672f0378fc92ef-109c30b6-a118-41a4-acc6-2ba55bb2e52c.log`.
Controller/scout đã đọc exact full RED log: stale grants assertion :63 và former
ordered glob assertion :131 expected allow/actual ask. Current handoff xác nhận
diagnosis resolved; corrections persisted reconcile và matchBase chờ GREEN đã
được full cuối kiểm chứng. Implementer không đọc raw log/không spawn scout.

Canonical plan/syntax/static/policy và independent unaffected test evidence sẽ
ghi trong final handoff; không kế thừa syntax/full/smoke Sprint22 như pass mới.
Full bắt buộc do shared/runtime/test infrastructure; runtime/TUI required nhưng
fingerprint đọc actual skills nên không được chạy. Không sửa harness để claim pass.

## Inventory / docs audit

Named source consumers: runtime, package-loader (instruction-only), server-core,
server adapter, governance authoritative output đã chuyển. Registry adapter
project v1-shaped metadata cho UI commands, không content fallback. StateStore
legacy metadata-only record APIs còn là cleanup debt (không content loader).
Tests core/server chuyển sang explicit synthetic verified requests; isolated
Sprint23 tests gọi core/runtime và SDK thật. Runtime/static sandbox tool contract
đổi; Docker copy shared validator và YAML runtime dependency, không live build.
TUI facade/picker và entrypoint không gọi loader cũ; giữ selection UI.

Current docs đã đọc và sync: README, docs index, architecture/Overview, roadmap2,
testing/testing/overview/smoke contract, Sandbox, sandbox README và guides21/22.
Architecture diagrams package-wide được nhãn baseline trước 2.3 để giữ bối cảnh,
không trình bày như actual loader. Phase0/1 reviews và roadmaps0/1/3 đã đọc,
unchanged: historical evidence/readiness/observation gates không đổi.
Final continuation đã đọc toàn bộ ordinary inventory được brief nêu; disposition
bên dưới supersedes preliminary incomplete-audit status. Không automated Markdown links.

## Remaining gates

Fresh scoped security review. Live
source/budget decisions, operator migration/hash/integrity và sandbox actual host
registration/read/native/Bash acceptance. Runtime/TUI library fingerprint authority
blocked, không inherited smoke pass. Semantic TS typecheck, remote CI/provider/e2e,
Markdown renderer/whole-tree link scan chưa chạy. No hostile OS CAS claim;
cooperative private state/root contract, 30-second stale-lock handling inherited.

## Prior continuation evidence (historical partial result)

The supplied brief says no previous edits/checks, but the checkout already contains
this report and `tests/sprint23.test.ts`, including the RED log above. Preserve those
inputs; do not interpret the brief's routing instructions as a root-cause diagnosis.
Controller question: provide RootCause/Evidence/ActionPlan/Verification for
`node scripts/arms-test.mjs related --task sprint-2.3 --file tests/sprint23.test.ts`
and `.openarms/logs/related-63512111b2672f0378fc92ef-109c30b6-a118-41a4-acc6-2ba55bb2e52c.log`.
No raw log inspection or nested scout by this implementer; full/isolated GREEN
remain blocked until that answer. Independent implementation continued:
runtime calls `reconcileVerifiedRegistry`, selection/verification derive from one
parsed registry snapshot, and a scheduling-gated test delegates to the real
persisted transaction to prove an old request cannot publish across prompt reset.
The fixture also tests new-boundary success and duplicate prompt retaining its lock.

One canonical plan reviewed with 38 explicit task paths: syntax recommended, full
required, related covered by full, static/runtime/TUI required, no needs-review.
Runtime/TUI not run: fingerprint traverses actual library skills (authority block),
even though plan capability detection did not report missing Docker/Python.
Static is independent and library:false; explicit remaining mode is not a bypass.

- Initial continuation syntax: 22/22, 413 ms, log
  `.openarms/logs/syntax-63512111b2672f0378fc92ef-5d506e12-056c-4fb8-9dfc-5c0dde6eda50.log`.
  This preceded the final single-snapshot edit; final syntax is recorded in handoff.
- Static: 8/8 groups, 354 ms, cache miss, log
  `.openarms/logs/smoke-static-63512111b2672f0378fc92ef-3012f835-db4b-4cde-957b-c029ae1ca663.log`.
- `time npm run test:policy`: 0 findings, report-only, 150 ms wall.
- One syntax invocation rejected an empty shell-array argument at CLI parsing
  (`CONFIG_ERROR: Unknown argument:`), before execution/log creation; corrected by
  supplying explicit arguments. No repeated failing test run.

This continuation changed only runtime, registry projection, Sprint23 test,
Sprint23 report/guide and current handoff. No files removed. Legacy registered tool
and package-wide loader removals were already present; not attributed to this turn.
Named source reads confirm facade exports/selection presentation, sole server tool,
authoritative governor output and sandbox registration checks; metadata-only
StateStore `lockTask`/`recordPackageLoad` remain, not a second content loader.
Whole named legacy-consumer inventory and whole ordinary docs audit are NOT newly
completed here. Earlier claimed current-doc coverage above is inherited evidence,
not independent verification. Acceptance and full feasible completion cannot be
claimed without controller log diagnosis and remaining audit/security review.

## CURRENT final continuation — 11/10/2026

This section supersedes the historical NEEDS_CONTEXT/full/audit blockers above.
Preserved all source/test corrections and previous-phase dirty work. No new code,
test, dependency or harness revision; only ordinary docs/report/handoff edits.
No skill package acquisition, real skill content reads/hash, raw-log inspection,
nested agents, live migration, installs, commit/push or global config changes.

### Exact validation

Full was explicitly requested and required by shared-core/test-infrastructure
scope. Inspected canonical `commandFor`: full deliberately uses `allTests()`,
related passes only mapped filenames; non-smoke fingerprint excludes live skills.
Used the already-reviewed 38-path scope from handoff, each as `--file <path>`:

`node scripts/arms-test.mjs full --task sprint-2.3` + those 38 repeated arguments.
**Exit 0; 123/123 PASS; 12,827 ms; cache disabled.**
Log: `.openarms/logs/full-63512111b2672f0378fc92ef-3cbd8c1c-c05e-4168-9d84-4a735123ab3a.log`.
Full includes all seven current Sprint23 cases and core/server/verified-loader
regressions. No new failure; 123 is actual current count, not inherited 126.
GREEN is in mandatory full, not a second isolated <2-second run. RED remains
4/6, 486 ms from the older test revision; do not relabel it 7-case RED evidence.

Unchanged evidence retained, not rerun:
- Final syntax 22/22, 420 ms, log
  `.openarms/logs/syntax-63512111b2672f0378fc92ef-1718abe7-302a-493f-b8e4-62b0700c2cf2.log`.
- Static 8/8, 354 ms, cache miss, log
  `.openarms/logs/smoke-static-63512111b2672f0378fc92ef-3012f835-db4b-4cde-957b-c029ae1ca663.log`.
- Policy 0 findings/report-only, 150 ms wall (`time npm run test:policy`).

No fresh plan for unchanged code scope, no related/full duplication or combined
verify repeating T0/full. Required runtime/TUI smoke remain authority-blocked:
`smoke-policy.json` library:true and `smokeFingerprint` read real registry/skills.
No weakening, alternate low-level run, cache claim or invented Docker failure.
Semantic TS checking, live/remote CI/provider/e2e, Markdown rendering/automated
whole-tree links skipped. Named `tsconfig.json` read returned File not found;
no substitute/config discovery. This does not block the completed full run.

### Named legacy consumer inventory — complete within supplied list

| Exact named group | Disposition |
|---|---|
| `src/package-loader.ts`; `plugins/server-core.ts` | Instruction-only module and facade; no `createPackageLoader`, `resolveSkillPath` or content-loading API |
| `src/runtime.ts`, `src/registry.ts`, `src/verified-loader.mjs` | One parsed startup registry snapshot/projection; persisted transaction calls same core/validator/resolver, no v1 content fallback |
| `src/state-store.ts`, `src/state-schema.ts`, `src/types.ts`, `src/registry-v2-types.ts` | v2 grants/locks/records; v1 metadata migration. Legacy `lockTask`/`recordPackageLoad` APIs retain metadata-only tests/UI history compatibility, do not return content or grant verified authority |
| `src/governance-hooks.ts`, `plugins/skill-router-server.ts` | Authoritative output exemption now verified tool; sole SDK registration `load_verified_skill`, strict core validation executes behind SDK args |
| `src/skills-service.ts`, `src/commands.ts`, `src/project.ts`; `plugins/shared.ts`, `plugins/tui-core.ts`, `plugins/skill-router-tui.tsx` | Selection/detection/restore/presentation facades only; shared runtime, no alternative content loader. TUI Selected/Loaded/Used is presentation, not approval; TSK218 not implemented |
| `scripts/registry-v2.mjs`, `registry-v2-operations.mjs`, `registry-v2-cli.mjs`, `registry-v2-ci.mjs` | Operator-only validator/resolver/migration/hash/integrity, synthetic CI fixture; not model tools or compatibility loaders |
| `tests/core.test.ts`, `server.test.ts`, `sprint23.test.ts`, `verified-loader.test.mjs`, `registry-v2.test.mjs` | Authored temp fixtures, explicit skill requests; core test helper's `packageName` maps exact synthetic skill only in test caller, not production adapter. Negative legacy-name assertions intentionally retained |
| `tests/sprint11.test.mjs`, `sprint12.test.ts`, `sprint13.test.ts`, `test-runner.test.mjs`, `smoke-runner.test.mjs`, `non-smoke-inputs.test.mjs`, `test-process.test.mjs`, `phase0-report.test.mjs` | Governor/runner/process/cache/policy synthetic fixtures, no live content consumer. Smoke tests author their own opaque `skills/fixture.txt`; no real Docker/provider service mocked as production behavior |
| `scripts/arms-test.mjs`, `test-map.json`, `test-map.mjs`, `test-policy.json`, `test-policy.mjs`, `smoke-policy.json`, `smoke-inputs.mjs`, `smoke-cache.mjs`, `test-process.mjs`, `test-failure.mjs`, `test-observation.mjs`, `test-syntax.mjs`, `check-test-policy.mjs`; `sandbox/process-output.mjs` | Canonical runner/mapping/output infrastructure, no registered loader. Retry/cache/fingerprint boundaries preserved; runtime/TUI still require real library hashes |
| `sandbox/Dockerfile`, `compose.yaml`, `compose.installed.yaml`, `config/opencode.json`, `config/tui.json`, `manage.mjs`, `entrypoint.mjs` | Shared validator copied, YAML runtime dependency; separate server/TUI URLs, read-only installed mounts, isolated volumes. No second tool or filesystem allow bypass added; not live build evidence |
| `sandbox/smoke-static.mjs`, `smoke-runtime.mjs`, `smoke.mjs`, `tui-smoke.py` | Static verified declaration/legacy absence; runtime verified-only registration; smoke.mjs diagnostic import alias, not loader; TUI picker harness unchanged contract |
| `sandbox/fixtures/docs-project/README.md`, `fixtures/empty-project/.gitkeep`, `.env.example`, `sandbox/README.md` | Prompt/empty/project/settings data, no loader. docs-project review prompt requires operator-approved v2; v1 still no content. Sandbox guide states this gate |
| `registry.json`, `package.json`, `package-lock.json`, `.dockerignore`, `.gitignore`, `.github/workflows/registry-integrity.yml` | Metadata inspected only; checkout registry v1 unmigrated; plugin SDK 1.18.34/YAML 2.9.1, sandbox OpenCode target 1.18.35. CI calls operator synthetic gate before canonical full; installed host config outside named inventory not accessed |

No demonstrated external compatibility need was supplied/found in the named
inventory: no speculative adapter/warning/metric/deadline retained. Inventory is
bounded to named paths, not filesystem discovery or certification of every
external installation. Named `tsconfig.json` is absent as noted above.

### Ordinary-doc audit disposition

Read every path in brief's ordinary inventory plus root/sandbox README and the
Sprint23 guide/report. Manual contract/current-vs-historical review only:
- Current README/docs index/architecture/Overview/roadmap2/testing overview,
  testing commands/smoke/Sandbox and guides21/22 already point to verified-only
  source; corrected stale current statements in Architecture and testing overview.
- Overview `OpenArms.md`, v2 and v3 reports retain historical package-wide
  examples/proposals/evidence, but current prefaces now point to Sprint23 source
  integration, removed legacy loader and pending live host/library acceptance.
  v1 already explicitly historical: unchanged.
- Roadmaps0/1/3, phase0/1 reviews, sprint reports01_02_03/04/11/12/13/21/22 and
  guides01/02/03/04/11/13 retain historical evidence, future/readiness/observation
  gates: unchanged. Guide12 stale v1/current-size wording corrected and links
  current response budget contract without rewriting Sprint12 recorded runs.
- Synthetic registry-v2 JSON inputs/schema unchanged; no skill tree or logo edits.

Four unavoidable docs-only additions to the reviewed 38-path scope:
`docs/reports/overview/OpenArms.md`,
`docs/reports/overview/Task_Optimization_Report_v2.md`,
`docs/reports/overview/Task_Optimization_Report_v3.md`,
`docs/testing/how_to_test/Sprint_12.md`.
All match already-reviewed `^docs/.*\.md` DOCS_ONLY policy; no new code/tests,
mapping or smoke inputs, no fresh plan/full run needed. Final task scope is 42
explicit paths (38 in handoff plus four above), no task-owned file removal.

Actual files edited by this final continuation (nine, existing paths only):
the four additions above; `docs/architecture/Architecture.md`,
`docs/testing/how_to_test_overview.md`, `docs/testing/how_to_test/Sprint_23.md`,
`docs/reports/sprints/report_sprint_23.md`, `.opencode/handoff-sprint-23.md`.
Earlier implementation/corrections are preserved, not attributed to this turn.

Docs validation: manual review of all nine authored patches against named source,
historical labels, current contract and relative link targets already read above.
`time git diff --check --` followed by all nine exact paths: exit 0, no diagnostics,
**0.001 s wall**. This Git whitespace check covers tracked diffs only, not untracked
file contents; manual patch review covers authored text. No dummy tests or unchanged
code reruns for docs. Logs/report evidence additions do not change verified code.

## CURRENT independent-review correction — 11/10/2026

HIGH inherited lock divergence corrected with persisted `taskSession` root identity.
Child-before-parent and child-first transactions restore the root's authoritative
lock, translate only lock session identity for the unchanged verified core, and
publish root lock/used markers in the same cooperative persisted transaction.
Grants/records remain requesting-session scoped; no Phase3 grant bridge. Child
prompt reset cannot reset the shared task; child clear/restore retain the root
identity/boundary. Parent reset remains idempotent and clears related once/used
markers. Home template selection inheritance explicitly creates independent tasks.

MEDIUM migrated missing-boundary race corrected: `startSession` initializes missing
boundary under the persisted lock before request capture; unconditional comparison
rejects old load AND trusted grant across reset without publication. Four new
synthetic regression cases use real runtime/core/transaction; only scheduling is
gated. Existing happy/hash/once/restart/process and other source work preserved.

Exact correction scope (10 paths; no new/deleted paths):
`src/types.ts`, `src/state-schema.ts`, `src/state-store.ts`, `src/runtime.ts`,
`plugins/skill-router-server.ts`, `tests/sprint23.test.ts`,
`docs/reports/sprints/report_sprint_23.md`, `docs/testing/how_to_test/Sprint_23.md`,
`docs/roadmap/Tasklist_Phase_2.md`, `.opencode/handoff-sprint-23.md`.

Canonical commands from repository root:
- RED `node scripts/arms-test.mjs related --task sprint-2.3-review-fix --file tests/sprint23.test.ts`:
  exit1, 7/11 pass, all four new cases fail, 714 ms;
  `.openarms/logs/related-63512111b2672f0378fc92ef-802059ef-1235-41a8-9259-d4ea6cbb0ebb.log`.
- `node scripts/arms-test.mjs verify --plan --task sprint-2.3-review-fix` plus
  repeated `--file` for all 10 paths above: exit0; syntax/full/static/runtime,
  related covered by full; TUI NOT_AFFECTED, no needs-review.
- `node scripts/arms-test.mjs syntax --task sprint-2.3-review-fix` plus same scope:
  exit0, 6/6, 410 ms;
  `.openarms/logs/syntax-63512111b2672f0378fc92ef-fac6565c-8c32-45f9-83e2-f83c6d61c650.log`.
- `node scripts/arms-test.mjs full --task sprint-2.3-review-fix` plus same scope:
  exit0, 127/127, 13,770 ms;
  `.openarms/logs/full-63512111b2672f0378fc92ef-03129068-5639-4cc4-8e6d-516c2d1f558b.log`.
- `node scripts/arms-test.mjs smoke-static --task sprint-2.3-review-fix` plus same scope:
  exit0, 8/8, 443 ms, cache miss;
  `.openarms/logs/smoke-static-63512111b2672f0378fc92ef-92096e13-3fc8-43f9-9db6-1d50aed23123.log`.

Full explicitly required for shared core; no related+full on unchanged revision,
no separate GREEN isolated run duplicating mandatory full. RED was isolated under
2 seconds. Runner commandFor and exact test mapping inspected. Raw RED log not
read: controller/scout diagnosis remains requested under implementer restrictions;
no unchanged failing retry. Required runtime smoke still authority-blocked because
fingerprint reads real skill content. Correction classifier skips TUI; prior whole
Sprint23 TUI acceptance remains blocked/pending. No automation edit: policy command
not rerun. Semantic TS/live host/CI/provider/e2e checks not run. Fresh independent
security review, live source/budget/migration and Phase2 acceptance remain pending.

Docs/patch validation: `git diff --check --` followed by the ten correction paths
above, exit0/no diagnostics (duration not measured; tracked diffs only); authored
patches manually checked against named contracts. Pre-correction v2 records have
no persisted parent identity; this correction does not guess relationships from
coincidentally equal boundary strings. Hosts must establish inheritance through
`inheritSession`; retroactive reconstruction of old child relationships is not
claimed. This limitation is supplied for independent review.
