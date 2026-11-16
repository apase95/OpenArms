# Sprint 4.5 — partial delivery

## Bounded review repair — KPI model identity

Provider/model openai/gpt-6.1-sol; agent ID unavailable; no delegation or integration
changes. `src/sprint45.ts` now rejects more than one provider/model identity across
both sessions (`MODEL_MISMATCH`), including matching mixed-model sets with different
allocations. Existing single-model happy path remains covered. Regression added in
`tests/sprint45.test.ts`; protocol clarified in `Sprint_45.md`.

Install model choice is manual explicit entry, NOT automatic inheritance of the
host-selected model. No default/fallback is implemented; preservation of the current
host model is not proven. TSK419 autonomy, real50 KPI and index acceptance remain
unclaimed; prior integration evidence above/below is not rerun evidence for this repair.

Exact scope for plan, syntax and verify:
`--task sprint-45 --file src/sprint45.ts --file tests/sprint45.test.ts --file docs/testing/how_to_test/Sprint_45.md --file docs/reports/sprints/report_sprint_45.md`.
Commands use `node scripts/arms-test.mjs`:

- `verify --plan <scope>`: reviewed once; related required, full and all integration
  modes NOT_AFFECTED for this bounded repair.
- RED `related --task sprint-45 --file tests/sprint45.test.ts`: 2 pass/1 fail,
  missing expected exception, 134ms; log
  `.openarms/logs/related-63512111b2672f0378fc92ef-0aa697f0-185b-4d64-9632-9e3d12476e79.log`.
- `syntax <scope>`: 2/2 pass, 342ms; log
  `.openarms/logs/syntax-63512111b2672f0378fc92ef-e9e62bf6-bf67-41de-918c-2eddd58ab674.log`.
- Final `verify <scope>` once: syntax 2/2 pass, 319ms, related GREEN 3/3 pass,
  127ms; logs `.openarms/logs/syntax-63512111b2672f0378fc92ef-d856a9d8-5ded-4832-ae83-84e132ba87be.log`
  and `.openarms/logs/related-63512111b2672f0378fc92ef-5478dc4f-b681-4216-9b01-5e1224bc774e.log`.
  Runner repeated syntax despite prior T0; no additional passing related run.

Only this report evidence was appended after verification; no code/test changes.
Full/Docker/PTY skipped per scoped plan; no live/paid calls or host library writes.

## Lượt tiếp theo — install integration (supersedes reporting-only status below)

Provider/model openai/gpt-6.1-sol; general agent ID không được cung cấp. Không
delegation/skills/commit/push; giữ nguyên KPI seam và inherited work.

| Criterion | Implementation / evidence |
|---|---|
| TSK418 | Production dispatcher/menu + explicit model entry; audited download/extract/decompile/register; separate send/write/switch consent; progress, deny/cancel/failure handling |
| TSK419 deterministic install | PASS Docker PTY fixture shared production UI, local/global, cancel/HIGH/provider failure, explicit selection và real hash-checked core/topic load |
| TSK419 autonomous routing | Không claim: authored model adapter; exact runtime topic load, không model autonomy |
| TSK420 | Prior reporting seam preserved; real50 / savings gate chưa đạt |
| TSK421 | Partial: implementation/tests/docs; deferred index và missing real benchmark vẫn blocked |

Manifest mở rộng: `src/skill-install-pipeline.ts`, `tests/skill-install-pipeline.test.ts`,
`plugins/skill-router-tui.tsx`, `sandbox/tui-fixture.ts`, `sandbox/tui-smoke.py`,
`scripts/synthetic-context.mjs`, `scripts/test-map.json`, `scripts/test-policy.json`,
`README.md`, `docs/README.md`, `docs/testing/testing.md`,
`docs/testing/how_to_test/Sprint_45.md`, `docs/reports/sprints/report_sprint_45.md`,
`docs/roadmap/Tasklist_Phase_4.md`; giữ `src/sprint45.ts`, `tests/sprint45.test.ts`.

RED isolated `node scripts/arms-test.mjs related --task sprint-45 --file tests/skill-install-pipeline.test.ts`:
2 failures missing module, 111ms, log
`.openarms/logs/related-63512111b2672f0378fc92ef-69a26d80-6c4e-42f6-b30b-cdc4ac25ffd6.log`.
GREEN cùng command: 2/2 passed, 193ms, log
`.openarms/logs/related-63512111b2672f0378fc92ef-eaa9a4c7-6769-4fa4-9a37-1ec039a44811.log`.
Chỉ mock HTTP/DNS/model; audit/validation/writer thật.

### Expanded final verification

Đã review một integration-scope plan mới theo handoff, rồi chạy verify đúng một lần:

```sh
node scripts/arms-test.mjs verify --plan --synthetic --task sprint-45 --file src/sprint45.ts --file tests/sprint45.test.ts --file src/skill-install-pipeline.ts --file tests/skill-install-pipeline.test.ts --file plugins/skill-router-tui.tsx --file sandbox/tui-fixture.ts --file sandbox/tui-smoke.py --file scripts/synthetic-context.mjs --file scripts/test-map.json --file scripts/test-policy.json --file README.md --file docs/README.md --file docs/testing/testing.md --file docs/testing/how_to_test/Sprint_45.md --file docs/reports/sprints/report_sprint_45.md --file docs/roadmap/Tasklist_Phase_4.md
```

Command thực thi giống hệt, bỏ `--plan`. Full do user yêu cầu và mapping shared/
test-infra; integration do TUI/synthetic-context classifier. Không chạy suite-wide
ngoài runner, không đọc/hash real library, không gọi paid/live provider.

| Mode | Result | Duration | Log dưới `.openarms/logs/` |
|---|---|---:|---|
| syntax | 9/9 PASS | 387ms | `syntax-63512111b2672f0378fc92ef-cf465c24-60fa-4c02-a032-2150b55e1dc9.log` |
| full | 297/297 PASS | 14,101ms | `full-63512111b2672f0378fc92ef-c2f6131b-8942-4389-83d5-bdf651fc7a03.log` |
| smoke-static | cached PASS | reused | fingerprint `ae95f5f4ed42` |
| build | PASS | 13,188ms | `build-63512111b2672f0378fc92ef-0f7d30f4-17b3-46a8-a4f4-3debb1b22937.log` |
| smoke-runtime | 5/5 PASS | 44,154ms | `smoke-runtime-63512111b2672f0378fc92ef-d6b97c50-3f45-4b3f-a2fa-cb3ed3550ecd.log` |
| tui-smoke | PASS | 189,920ms | `tui-smoke-63512111b2672f0378fc92ef-486003ef-8974-4006-a1c1-2419869bc27c.log` |

`npm run test:policy`: exit0, 0 findings; `git diff --check -- <expanded changed
paths>`: exit0. Tool không capture duration riêng cho hai lệnh này. T1 của final
plan skipped vì full bao phủ; isolated GREEN không lặp, final full được yêu cầu
cho expanded UI/harness revision. Static stamp được runner tái dùng, không bỏ
integration. Build image fingerprint `fb7c41de93b8`; runtime/PTY dùng lại cùng image.
Runner thực thi cleanup volumes và policy-owned image retention.

Post-verification scoped review phát hiện result metadata dùng nhầm tên report
field (`coreTokens` thay vì `coreEstimate`). Sửa thành `coreEstimate` + explicit
`estimator` và thêm assertions, không thay validator hoặc billing semantics.
Đây là revision code/test mới, có unresolved metadata defect cụ thể, nên không
tái dùng full/smoke cũ làm evidence cho latest revision. Không chạy lại verify hoặc
review plan lần hai; chạy các modes của cùng plan với **cùng toàn bộ `--file` và
`--task` ở trên**:

```text
node scripts/arms-test.mjs syntax <same scope>
node scripts/arms-test.mjs full <same scope>
node scripts/arms-test.mjs smoke-runtime --synthetic <same scope>
node scripts/arms-test.mjs tui-smoke --synthetic <same scope>
```

| Latest revision mode | Result | Duration | Log dưới `.openarms/logs/` |
|---|---|---:|---|
| syntax | 9/9 PASS | 383ms | `syntax-63512111b2672f0378fc92ef-cf1494b3-e7b3-4b2f-ba65-34539e75cf3d.log` |
| full | 297/297 PASS | 13,416ms | `full-63512111b2672f0378fc92ef-e2b0c0f0-77f9-4342-8693-f66f1a1e387d.log` |
| static | cached PASS | reused | `ae95f5f4ed42` |
| build | PASS | 11,007ms | `build-63512111b2672f0378fc92ef-8632f362-eeae-46a0-86c8-c918d4ee0548.log` |
| runtime | 5/5 PASS | 45,247ms | `smoke-runtime-63512111b2672f0378fc92ef-e9535bbb-d08d-47aa-aeca-70b2e6831aac.log` |
| Docker PTY | PASS | 192,996ms | `tui-smoke-63512111b2672f0378fc92ef-91ff3118-2dab-4364-bcb0-dde3b0efd035.log` |

Latest image `5c80c90769f9`; cleanup/retention passed. Không lặp isolated T1 hoặc
unchanged full. Sau lượt này chỉ cập nhật report docs; không đổi code/test inputs.

### Acceptance boundaries

- Production typed `/skills install --local <url>` được PTY kiểm model-entry rồi
  Escape; full install dùng host fixture command gọi shared production UI với
  external HTTP/model seams. Không claim live GitHub hoặc installed host library.
- Local/global transactions và subsequent exact selected core/topic load được
  kiểm trong container thật. Synthetic adapter không phải real model routing.
- HIGH rejection và existing MEDIUM/HIGH/CRITICAL staged regression đã pass;
  không phải chứng minh scanner bắt mọi injection ngoài authored corpus.
- TSK418 checkbox checked; TSK419 giữ partial do autonomous routing criterion;
  TSK420/421 và deferred TSK415 vẫn unchecked. Không có fake real50 hoặc savings.
- Cooperative owner-controlled writer không crash/hostile-filesystem guarantee.
  Không active mid-commit cancellation; download bounded 30s, model calls 30s;
  review Cancel/Esc/timeout và lifecycle abort fail closed trước write.

## Lịch sử lượt reporting-only (giữ để phân biệt phạm vi)

Provider/model: openai/gpt-6.1-sol; general implementer ID không được cung cấp.
Giữ task lock Sprint4.5, không skills/child tasks/commit/push. Inherited dirty work
không reset. Đây không phải báo cáo hoàn thành toàn sprint.

| Task / criterion | Trạng thái | Evidence / blocker |
|---|---|---|
| TSK418 install TUI/local/global | Chưa triển khai | Dispatcher vẫn chưa nối full pipeline; không claim install |
| TSK419 actual install PTY | Chưa triển khai | Không thêm install fixture; prior PTY không chứng minh install |
| TSK420 paired reporting | Partial | `src/sprint45.ts`, `tests/sprint45.test.ts`, [protocol](../../testing/how_to_test/Sprint_45.md) |
| TSK420 50 real comparisons / >=60% | Blocked | Không có live data/consent; synthetic không thay thế |
| TSK421 local/global install | Pending | Chưa end-to-end |
| TSK421 scanner / wiki / hashes | Prior API evidence only | [Sprint44](report_sprint_44.md); chưa tái xác minh install flow |
| TSK421 autonomous index/topic routing | Blocked | TSK415 deferred, không triển khai Routing Index |
| TSK421 docs/handoff | Partial | Protocol/report/README; chưa Phase 4 acceptance |

## Manifest của lượt này

- Added: `src/sprint45.ts`, `tests/sprint45.test.ts`, runbook/report Sprint45.
- Modified: `scripts/test-map.json`, `scripts/test-policy.json`, root README và
  `docs/README.md` (chỉ thêm nội dung, giữ inherited edits).
- Không sửa TUI/server/sandbox hoặc bật Routing Index. Roadmap checkboxes giữ unchecked.

## Verification

RED: isolated related command ở runbook thất bại trước khi module được tạo,
122ms, log `.openarms/logs/related-63512111b2672f0378fc92ef-af73c9e5-6813-4d24-bf3c-7aa5f5c58412.log`.
GREEN: full 295/295 passed, 12,683ms, log
`.openarms/logs/full-63512111b2672f0378fc92ef-2d4c8e4f-f4ba-4075-abe1-79807872e9d0.log`.
Full bao phủ hai cases mới; không lặp isolated passing run.
Syntax 4/4 passed, 355ms, log
`.openarms/logs/syntax-63512111b2672f0378fc92ef-b4bfbf45-0ef1-4853-a222-4ec65ea54a4e.log`.
`npm run test:policy`: exit0, 0 findings (duration không được tool capture).

Đã review đúng một `verify --plan`, rồi chạy `syntax` và mode còn lại `full`
theo quy tắc không lặp T0. Các lệnh đều có `--task sprint-45` và explicit scope:

```text
--file src/sprint45.ts --file tests/sprint45.test.ts
--file scripts/test-map.json --file scripts/test-policy.json
--file README.md --file docs/README.md
--file docs/testing/how_to_test/Sprint_45.md
--file docs/reports/sprints/report_sprint_45.md
```

Plan chọn full, skipped related (covered by full), static/runtime/PTY NOT_AFFECTED
vì scope thực sự chỉ data-only reporting và mapping/docs, không sửa adapter.
Không có Docker/PTY execution của lượt này; full không chứng minh integration.
Không claim đã triển khai toàn bộ safely feasible scope: install UI và install PTY
vẫn là công việc implementation chưa hoàn thành, không phải environmental blocker.
Không thực hiện paid/live calls hoặc ghi destructive host library.
