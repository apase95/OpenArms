# Báo cáo Sprint 4.3 — API-only decompiler/writer

Ngày 2026-10-16; profile `openai/gpt-6.1-sol/general`. Không agents/skills,
real content/provider requests, commit/push. [Runbook](../../testing/how_to_test/Sprint_43.md).

## Kết quả triển khai

Strict versioned contract/parser/prompt; bounded caller-selected model service,
concrete SDK v2 adapter với structured output/tools denied/session cleanup;
ordered chunk/merge/compact; literal constraints/heading/link validator;
independent raw/draft/assets/output validation và fresh audit trong writer;
separate consent, exclusive lock, private staging/fsync/rename, overwrite rollback,
awaited cleanup, SHA256 file manifest. Output unregistered, không registry/runtime
hay loader/TUI install changes; giữ nguyên TSK415/416.

Không universal semantic/security/host-isolation guarantee. Caller host configuration
đáng tin; owner-controlled filesystem, không hostile external rename race-proof.
SDK không suppress toàn bộ host-added context hoặc cap provider billing/output
tokens; local bounds không provider-resource guarantee. Chi tiết trong runbook.

## Verification manifest

Repeated `--file` cho toàn bộ manifest dưới đây; `--task sprint-43-final`.
Không gồm inherited Sprint32–42 changes.

```text
src/skill-decompiler.ts
src/skill-decompiler-service.ts
src/skill-model-adapter.ts
src/skill-decompiler-writer.ts
tests/skill-decompiler.test.ts
tests/skill-decompiler-service.test.ts
tests/skill-model-adapter.test.ts
tests/skill-decompiler-writer.test.ts
tests/test-runner.test.mjs
scripts/test-map.json
scripts/test-policy.json
docs/testing/how_to_test/Sprint_43.md
docs/reports/sprints/report_sprint_43.md
docs/testing/README.md
docs/testing/how_to_test_overview.md
docs/testing/testing.md
docs/README.md
docs/reports/sprints/README.md
docs/architecture/openarms-overview.md
docs/roadmap/Tasklist_Phase_4.md
```

Manifest công khai gồm 20 paths. Plan lịch sử gồm thêm hai local handoff artifacts
(22 paths tổng cộng); không cần các file nội bộ đó để tái hiện verification code.

Runner inspected: related passes exact plan.related paths to Node --test.
Writer RED before implementation: `node scripts/arms-test.mjs related --task sprint-43-writer-red --file tests/skill-decompiler-writer.test.ts`,
exit1, 0/1,146ms, module absent; summary not a passing assertion.
Writer initial GREEN same file `--task sprint-43-writer-green`:1/1,205ms;
log `.openarms/logs/related-63512111b2672f0378fc92ef-da83378a-1a49-46b4-bd65-adff0e78e121.log`.
Expanded integrated fixtures/fault tests included in final full. Full required by test-infrastructure
mapping edits, not arbitrary full-suite selection. No Docker/PTY: API-only scope.

## Synthetic metrics

Original authored schema fixtures: workflow2628→89 (96.61%), cloud-review2632→93
(96.47%), technical-writing2637→98 (96.28%) UTF8 byte estimates. Additional integrated
workflow/cloud/docs fixture tests run mocked service→writer, assert core<800 and
raw→first-load reduction≥60%, binary byte equality and private permissions. These
are hand-authored mocked outputs, not real model quality, tokenizer or cost claims.
References are intentionally short, never padded to a target token count.

## Final verification evidence

One complete manifest plan: syntax recommended, full required, related covered;
all smoke NOT_AFFECTED, no needs-review. `verify --task sprint-43-final` with repeated
manifest files ran syntax11/11 (416ms), then full290/291 (15802ms): new opaque `.bin`
fixture was correctly HIGH blocked by scanner. Diagnosed from summary and named
scanner source (raw logs forbidden by scoped-role instruction); changed fixture to
opaque `.png` MEDIUM-reviewed data, not scanner policy. One earlier invocation with
an empty shell argument failed CONFIG_ERROR before any checks; rebuilt explicit args.

Final corrected code/test revision, same complete manifest:

| Command | Result | Duration | Log |
|---|---|---:|---|
| `node scripts/arms-test.mjs syntax --task sprint-43-final` + manifest | PASS11/11 | 483ms | `.openarms/logs/syntax-63512111b2672f0378fc92ef-21b77f44-4557-4d23-a49e-dcd8992da466.log` |
| `node scripts/arms-test.mjs full --task sprint-43-final` + manifest | PASS291/291 | 14415ms | `.openarms/logs/full-63512111b2672f0378fc92ef-b6742f03-a63b-4252-a207-8bb498112d22.log` |
| `npm run test:policy` | 0 findings | not separately measured | report-only |

No code/test changes after these checks. Documentation/portal/evidence edits only.
Scoped diff check exposed newly modified roadmap trailing spaces (409–413), removed;
pre-existing user415/416 whitespace intentionally preserved. No repeated unchanged
passing suite, no Docker/PTY/e2e/live provider tests; classifier says unaffected.
Full is mandatory repository regression verification, not the <2s isolated smoke target.
Final scoped `git diff --check -- <manifest>` exit2 reports only inherited TSK415
and TSK416 trailing spaces (roadmap lines230/243); no claim of a clean overall diff.
Duration not separately measured. These user-owned lines were not edited.
