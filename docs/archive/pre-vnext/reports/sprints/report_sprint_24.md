# Báo cáo Sprint 2.4 — scope triển khai, chưa nghiệm thu Phase 2

Ngày 11/10/2026. Giữ prior phases và lifecycle corrections Sprint23. Không skill
acquisition/library bytes/live source approval/migration, install, commit hoặc push.
[Hướng dẫn fixture/TUI/recovery](../../testing/how_to_test/Sprint_24.md).

## Scope chính xác của lượt này

### Security correction `sprint-2.4-review-fix`

Hai MEDIUM finding được sửa độc lập, không rewrite prior evidence. Scope correction
9 paths: src/runtime.ts; plugins/tui-core.ts; plugins/skill-router-tui.tsx;
plugins/skill-router-server.ts; tests/sprint23.test.ts;
docs/testing/how_to_test/Sprint_24.md; docs/reports/sprints/report_sprint_24.md;
docs/roadmap/Tasklist_Phase_2.md; .opencode/handoff.md. Không new/removal/automation.

Ticket tách core authorization khỏi displayed integrity advisory; hai production
grant gates dùng authorization. Repair/revoke/regrant hoạt động mà không clear
warning hoặc bỏ load hash/source checks. Runtime normalize outer registry I/O,
malformed registry và state I/O thành path-free result; existing session capture
không republish state trước failed transaction. Ticket remains one-shot; store giữ
corrupt bytes và native recovery details nội bộ, TUI fallback không error.message,
registered tool có defensive safe envelope. Matrix thêm bốn runtime/boundary codes.

RED isolated canonical related: 24/26 pass, exit1,887ms; stale regrant undefined
thay true, outer I/O regression fail. Log:
`.openarms/logs/related-63512111b2672f0378fc92ef-4fc1e641-3e23-4d5d-9cdf-1b7440733e75.log`.
Controller/scout owns raw-log diagnosis; implementer không đọc/rerun unchanged.
Correction validation hiện ghi trong handoff; historical146 không current proof.

Correction canonical commands: `node scripts/arms-test.mjs <mode> --task
sprint-2.4-review-fix`, repeated `--file` cho toàn bộ 9 paths correction trên
(RED related chỉ tests/sprint23.test.ts). Một verify --plan exit0: full/static/
runtime/TUI required, related covered, không needs-review/capability block.
First full149/150,13779ms: new fixture cleanup `rm` sau missing registry thiếu
force; summary/source đủ chẩn đoán, sửa test trước retry changed revision.
Log `.openarms/logs/full-63512111b2672f0378fc92ef-6564a0f3-f224-42a1-9679-596384cec399.log`
cần controller/scout full-log review; không implementer raw read.

Final revision:
- syntax5/5,exit0,427ms:
  `.openarms/logs/syntax-63512111b2672f0378fc92ef-ef24bffe-f146-4a0b-bf59-29e8a5dd89a4.log`.
- full150/150,exit0,14774ms (mandatory shared-runtime correction, không duplicate
  related GREEN):
  `.openarms/logs/full-63512111b2672f0378fc92ef-d10c0e4c-34be-4335-80e6-8e30180d6713.log`.
- smoke-static8/8,exit0,502ms,cache miss:
  `.openarms/logs/smoke-static-63512111b2672f0378fc92ef-67f2e9c3-e60c-40fc-bdf2-389e4ac2b0b9.log`.
Runtime/TUI required nhưng không chạy: actual-library fingerprint ngoài authority.
Policy bypass check không cần vì correction không automation edits. Semantic TS,
renderer/PTY/live/remote CI/e2e/automated docs links chưa kiểm chứng. Final docs-only
evidence không đổi code/tests; fresh independent review và operational gates còn mở.

Phần bên dưới giữ historical partial141. **Completion subtask hiện tại**:
`sprint-2.4-completion`, bổ sung matrix, production action-contract callback fixture
và toàn ordinary-doc audit. Renderer/PTY vẫn operational authority-blocked, không
missing SDK declaration gate; không claim SDK1.18.34/1.18.35 equivalent đã test.

Complete scope plan gồm **26 paths**, không removal, giữ cả 11 prior task paths:

```text
src/runtime.ts
src/verified-loader.mjs
src/skills-service.ts
plugins/skill-router-tui.tsx
plugins/tui-core.ts
scripts/test-map.json
tests/sprint23.test.ts
tests/registry-v2.test.mjs
tests/verified-loader.test.mjs
README.md
sandbox/README.md
docs/README.md
docs/architecture/Architecture.md
docs/architecture/OpenArms Overview.md
docs/roadmap/Tasklist_Phase_2.md
docs/testing/testing.md
docs/testing/how_to_test_overview.md
docs/testing/smoke-contract.md
docs/testing/how_to_test/Sandbox.md
docs/testing/how_to_test/Sprint_23.md
docs/testing/how_to_test/Sprint_24.md
docs/reports/overview/OpenArms.md
docs/reports/overview/Task_Optimization_Report_v2.md
docs/reports/overview/Task_Optimization_Report_v3.md
docs/reports/sprints/report_sprint_24.md
.opencode/handoff.md
```

Actual completion edits = scope này trừ ba production prior paths
`src/runtime.ts`, `src/verified-loader.mjs`, `src/skills-service.ts` (preserved).
Không new path ngoài report/guide24 đã có từ partial141; mapping TUI/facade thêm
Sprint23 fixture vào related tests, không giảm smoke/classifier/fingerprint.

## Completion acceptance matrix

| Task | Feasible deliverable / evidence | Gate riêng |
|---|---|---|
| TSK-216 | [29-code error matrix + finite property groups](../../testing/how_to_test/Sprint_24.md#finite-error-matrix), existing tests reused; thêm all-required fields/child IDs, malformed context và unsupported-platform environment branch; correction bổ sung 4 outer boundary codes | READ_ERROR actual chmod conditional non-root; platform branch không native Windows proof |
| TSK-217 | Giữ production migrated synthetic graphify SDK fixture; returned bytes hashes/minimal interface+one child/tamper/symlink/revision/restart exact-state preservation | Installed host read/native/Bash engine, không glob-model proof |
| TSK-218 | Export production confirmation/action seam; TUI gọi chính seam; mock UI callbacks, real persisted runtime; cancel/reset/happy + strict true/dismiss/default Cancel; full docs audit/sync/runbook | Actual host renderer/PTY operational authority-blocked; không fabricated SDK gate |
| TSK-219 | Finite implementation/fixture acceptance có canonical validation bên dưới, exact scope cho fresh review | Fresh security review, owner/live source/migration/host/smoke/final acceptance |

## Completion ordinary-doc audit — toàn inventory

Đọc trực tiếp **35 ordinary docs** được handoff liệt kê + root/sandbox README +
report/guide24 = **39 Markdown paths**; thêm hai synthetic JSON examples. Không
discovery/grep hoặc inherited Sprint23 audit làm proof. Manual current/historical
claim/link review, không automated whole-tree Markdown renderer/link scanner.

| Exact named group | Disposition |
|---|---|
| docs/README.md; architecture/Architecture.md và OpenArms Overview.md | Sync current TUI/core status/action seam + matrix/runbook links; baseline diagrams vẫn historical |
| roadmap Tasklist_Phase_0/1/2/3.md | Phase2 sync fixture vs operational; 0/1/3 unchanged: observation/host/readiness/future scope không đổi |
| reports/overview OpenArms.md và Task_Optimization_Report_v1/v2/v3.md | OpenArms/v2/v3 current prefaces dẫn24, v1 historical unchanged; không rewrite proposal/schema/usage/cài v1 |
| reports/phase0-review.md; phase1-review.md | Unchanged: historical counts và observation/host/owner gates không đóng bởi Sprint24 |
| reports/sprints report_sprint_01_02_03/04/11/12/13/21/22/23.md | Unchanged historical evidence/contract corrections; current evidence ở report24, không thay số cũ |
| testing/how_to_test_overview.md; testing.md; smoke-contract.md | Sync navigation/approval/core status và action contract khác renderer/PTY |
| testing/how_to_test Sandbox.md và Sprint_01/02/03/04/11/12/13/21/22/23.md | Sandbox M4 current status sửa; Sprint23 thêm historical TSK218 caveat/link24; guides0/1/21/22 unchanged, mốc lịch sử/runner/tooling/limits giữ |
| README.md; sandbox/README.md; report/guide24 | Current delivery/status/approval/runbook/matrices; no screenshot fabricated |
| testing/registry-v2-valid.json; registry-v2-invalid.json | Read unchanged schema examples; placeholder hash không integrity proof; logo không đổi |

Docs audit current claims đã sync trong phạm vi named inventory; historical texts
không được diễn giải làm current deployment. Manual links của authored patches
trỏ exact named paths đã đọc. Full/whitespace checks không thay manual docs review.

## Completion validation evidence

RED canonical `node scripts/arms-test.mjs related --task sprint-2.4-completion --file tests/sprint23.test.ts`:
exit1, **22/23**, **931ms**, missing `runVerifiedAction` export trong assertion
summary. Log `.openarms/logs/related-63512111b2672f0378fc92ef-a1b3efdf-874d-4856-8a2c-cb0cd56514b9.log`.
Implementer không đọc raw log; controller scout owns exact full-log diagnosis.
Không unchanged retry; production seam/test revision đã đổi trước GREEN.
Canonical commands từ root: `node scripts/arms-test.mjs <mode> --task sprint-2.4-completion`
với repeated `--file <path>` cho **tất cả 26 paths** phía trên. `commandFor` đã đọc:
related truyền mapped filenames, full allTests cố ý theo mandatory shared/test-map
policy và user completion request. Không related GREEN lặp lại; full bao phủ.

| Command / mode | Result | Duration / log |
|---|---|---|
| verify --plan | exit0, một plan, syntax recommended; full/static/runtime/TUI required; related covered; no needs-review/capability block | không đo wall; không execution log |
| syntax | exit0, 9/9 | 451ms; `.openarms/logs/syntax-63512111b2672f0378fc92ef-c46573fa-21a1-4132-aa7c-972dece4d471.log` |
| full | exit0, **146/146**, gồm 5 new cases; prior141 giữ | **13535ms**; `.openarms/logs/full-63512111b2672f0378fc92ef-db90e2f5-9e8c-413f-b212-01fa23bab8f8.log` |
| smoke-static | exit0, SKIP unchanged previous pass 3a5ec02e0f15 | không new execution/count/duration/log |
| time npm run test:policy | exit0, 0 findings/report-only; bắt buộc do mapping edit | 0.165s wall; stdout |
| node -e environment metadata | linux, UID1000, Node v24.12.0 | READ_ERROR chmod branch thực chạy trong full, không conditional skip trên root |

RED 931ms đạt isolated target <2s; GREEN là required full13.535s, không claim
isolated GREEN timing. No tests unchanged rerun; sau GREEN chỉ docs/evidence.
Runtime/TUI **không chạy** vì library:true đọc actual skill bytes, operational
authority-blocked; không missing declarations/Docker/Python inference. Actual
renderer/PTY/installed engine không được chứng minh bằng callback fixture.
Skipped semantic TS, Markdown renderer/automated whole-tree links, remote CI,
provider/e2e/live source approval/migration/hash/integrity. Fresh independent scoped
review và owner operational acceptance còn chờ, không unspecified feasible work.
Raw intentional RED full-log diagnosis route controller scout (exact path trên);
không retry unchanged failing command, không đọc raw logs hoặc nested agents.
Final `time git diff --check --` với tất cả26 exact paths: exit0/no diagnostics,
0.004s wall. Tracked diffs only, không automated validation untracked contents;
authored patches manually reviewed. Evidence-only edits sau GREEN không rerun tests.

## Historical partial141 (không current revision proof)

Existing paths sửa: `src/runtime.ts`, `src/verified-loader.mjs`,
`src/skills-service.ts`, `plugins/skill-router-tui.tsx`, `tests/sprint23.test.ts`,
`tests/registry-v2.test.mjs`, `tests/verified-loader.test.mjs`,
`docs/roadmap/Tasklist_Phase_2.md`, `.opencode/handoff.md`.
New paths: report này và `docs/testing/how_to_test/Sprint_24.md`. Không removal.
Không thay test infrastructure/mapping/approval defaults/library/config.

## Requirement / acceptance evidence

| Task | Deliverable của lượt này | Acceptance còn thiếu |
|---|---|---|
| TSK-216 | Unknown fields matrix 4 locations × 4 fields; malformed/duplicate JSON; Unicode path/content; estimator byte boundaries 0–32; migration idempotence/rollback; stable request/context/state/grant errors; reuse existing scopes/hash/path/concurrency tests | Chưa full error/property acceptance audit, unsupported-platform execution chưa có |
| TSK-217 | Production migration transaction/backup + real registered SDK execute trên synthetic graphify; interface/one child, hashes trên returned bytes, no absolute path, tamper/symlink failure giữ exact state bytes/once, concurrent revision deny, restart invalidates grant; sibling metadata escape rejects adapter startup before state mutation | Chưa live host engine read/native/Bash |
| TSK-218 | Real picker grant/revoke với once/session/project; identity-bound ticket chốt boundary trước dialog; core status projection/service render; advisory failure projection giữa runtime instances; successful Loaded/Used không override deny | Chưa actual SDK TUI/PTY acceptance, full ordinary docs audit/sync |
| TSK-219 | Automated migrated synthetic registry acceptance qua SDK adapter thật, không second content loader trong adapter | Fresh independent review, remaining implementation acceptance và live rollout gates chưa đóng |

Core error coverage đã trực tiếp đọc: `INVALID_REQUEST`, `INVALID_CONTEXT`,
`UNKNOWN_SKILL`, `DISABLED`, `APPROVAL_REQUIRED`, `UNVERIFIED`, `DENIED`,
`INVALID_WORKFLOW`, `INVALID_REFERENCE`, `TASK_CONFLICT`, `HASH_MISMATCH`,
`INVALID_ENCODING`, `FILE_MISSING`, `NON_REGULAR_FILE`, `UNSAFE_PATH`,
`CONCURRENT_FILE_CHANGE`, `CONCURRENT_REGISTRY_CHANGE`, `CONCURRENT_LOAD`,
`BUDGET_EXCEEDED`; READ_ERROR test conditional non-root. Trusted API exceptions
`INVALID_GRANT`, `INVALID_STATE`, `INVALID_BUDGET_POLICY` có assertions.
`UNSUPPORTED_PLATFORM` chưa chạy trên non-Linux, không mock production platform để
claim proof. Runtime `TASK_CHANGED` và invalid/copied ticket có regression.
Danh sách này là coverage source audit, không khẳng định every-error acceptance.

## TUI security design / giới hạn

Source approval chỉ operator approved registry object hash, độc lập skill grants.
WeakMap ticket không là model JSON, dùng một lần, request snapshot riêng. Boundary
capture trước dialog và check trong same persisted transaction; stale registry disk
snapshot fail-closed. Grant/revoke reuse core, không duplicated hash/path verification.
Revoke bind project/session/task và exact scope; không xóa successful records/locks.
Picker cancel không commit; mismatch/selection không grant. Core status không đọc
content để "verify" background. Sidecar advisory metadata chia sẻ giữa server/TUI
private state directory, bind revision/boundary và safe integrity reason code; không
grant/source approval, không thay failed-load state/lock/history/once. Under same
state lock, successful load xóa old failure; grant/revoke không xóa failure. Corrupt
telemetry ignored; test hai real runtime instances, chưa live TUI process proof.
AUTHORIZED chỉ authorization, không current bytes chưa được load/tamper-detect.
Không claim hardened OS boundary, hostile writers CAS hoặc tokenizer accuracy.

## Canonical evidence

RED trước APIs: `node scripts/arms-test.mjs related --task sprint-2.4 --file tests/sprint23.test.ts`,
exit1, **16/18**, **826ms**; hai new approval tests lỗi
`runtime.prepareVerifiedGrant is not a function` trong canonical summary.
Log `.openarms/logs/related-63512111b2672f0378fc92ef-a6d0ca8a-15fa-49cc-b88b-cedc031c954f.log`.
Không đọc raw log hoặc retry unchanged revision; controller cần scout đọc exact
log cho independent RED diagnosis. GREEN trên changed revision ở dưới.

Complete scope = 11 paths ở trên. Commands canonical dùng repeated `--file` cho
toàn bộ scope, task `sprint-2.4`: `verify --plan`, `syntax`, remaining `full`.
Full bắt buộc do shared runtime/core và user yêu cầu canonical checks. Required
runtime/TUI modes không được fingerprint real library khi chưa được authority.
Không claim Docker/Python missing nếu chưa thấy capability report.

Results trên cùng final code/test revision (không related GREEN lặp lại):
- `verify --plan`: exit0; syntax recommended, full/static/runtime/TUI required,
  related covered by full; không needs-review hoặc reported capability block.
- `syntax`: exit0, **7/7**, **432ms**, cache disabled;
  `.openarms/logs/syntax-63512111b2672f0378fc92ef-613c2f6d-b007-409d-85aa-92fa8da99996.log`.
- `full`: exit0, **141/141**, **14385ms**, cache disabled;
  `.openarms/logs/full-63512111b2672f0378fc92ef-0324ef98-2d16-4a49-8b29-6be7de9da18f.log`.
  Có 9 test mới, bao gồm 6 cases trong Sprint23 isolated file; RED/old16 cases giữ.
- `smoke-static`: exit0, **SKIP unchanged fingerprint previous pass** `3a5ec02e0f15`;
  không new execution/duration/test count, không inherited live smoke acceptance.
- `smoke-runtime`, `tui-smoke`: không chạy vì `smoke-policy.json` library:true
  fingerprint đọc real skills, ngoài authority. Không fabricated capability failure.

Policy bypass check skipped: không automation edits. Semantic TS typecheck, remote
CI/provider, live e2e/PTY/screenshots, actual installed migration và whole docs link
scan chưa chạy. Source checks không đóng các gate này. Final docs-only evidence
không đổi passing code/test inputs; không rerun unchanged T0/full.
`time git diff --check --` với toàn bộ 11 paths: exit0/no diagnostics, **0.002s**;
tracked diffs only, không validation untracked file contents. New report/guide và
handoff patches được đọc/review thủ công; không automated full-doc link claim.

## Docs audit và remaining gates

Đã đọc trực tiếp handoff/root AGENTS/roadmap2/report23/guide23 và patch report/guide24.
**Chưa hoàn thành full ordinary-doc inventory audit** của handoff; không kế thừa
Sprint23 audit làm bằng chứng Sprint24. Các tài liệu lịch sử không rewrite.
Source-only tests không thay acceptance review hoặc rendered TUI screenshot.

Remaining implementation gates: full stable-error/acceptance matrix; whole named ordinary docs sync/audit;
fresh security review. Remaining operational gates sau đó: operator source/budget
decisions và live migrate/integrity/reapproval; installed host permission-engine
proof; required runtime/TUI smoke với authorized real-library fingerprints; owner
Phase2 acceptance. Commands/limits ở linked guide và Sprint23 recovery runbook.
