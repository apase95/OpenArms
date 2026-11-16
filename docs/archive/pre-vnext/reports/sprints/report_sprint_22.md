# Báo cáo Sprint 2.2 — verified loader core độc lập

Ngày 11/10/2026. Shared-skills/Ponytail full, TSK-205–210. Runtime/plugin vẫn v1;
không live skill reads/migration, không activation Sprint 2.3, không TUI rollout.
[Contract/API/state/transaction/budget/recovery](../../testing/how_to_test/Sprint_22.md).

| Task | Core implementation | Nghiệm thu |
|---|---|---|
| TSK-205 | Strict shared validator/schema, TS contract, IDs/hash/estimate, sanitized error envelope | Core fixtures; tool host chưa đăng ký |
| TSK-206 | Metadata authorization trước content I/O; once/session/project revision-bound grants | In-memory seam; persisted/restore integration pending |
| TSK-207 | Raw buffer SHA256, UTF8 round-trip, generation và file identity/bytes revalidation | Deterministic fixture races; hostile OS CAS không claim |
| TSK-208 | Reuse một resolver Sprint 2.1, snapshot option; regular/no-follow physical roots | Linux fixtures, không portable fallback |
| TSK-209 | Interface default, interface + explicit workflow/reference, không implicit load | Synthetic content, installed interface migration pending |
| TSK-210 | Versioned response JSON bytes audit, categories, hard/report-only, stable contributors | Heuristic không có tokenizer uncertainty bound; owner live budgets pending |

Checkbox acceptance giữ pending. Hash khớp không chứng nhận nội dung an toàn hoặc
đúng; operator source/revision approval riêng. Host filesystem/shell/network là
boundary khác. API không thêm internal path; nội dung do operator review không
bị scrub/compact. Audit sink best-effort, không durable journal.

## Checks thực tế

RED canonical exact-file `node scripts/arms-test.mjs related --task sprint-2.2
--file tests/verified-loader.test.mjs`: 0/1, 109 ms, stub chưa triển khai.
Log `.openarms/logs/related-63512111b2672f0378fc92ef-633248b0-fe99-43fb-9b27-54087f6e4910.log`.
Chẩn đoán từ summary `Verified loader not implemented`; scoped instruction cấm
raw log inspection, không lách quyền và không retry unchanged failure.
GREEN cuối nằm trong full bắt buộc dưới đây, không kế thừa full116 cũ và không
chạy related/full lặp trên revision đã đạt. File cô lập có 10 tests mới; RED
109 ms dưới mục tiêu 2 giây, không có lượt GREEN cô lập riêng vì full bao phủ.

Một `node scripts/arms-test.mjs verify --plan --task sprint-2.2` cấp **24** path
bằng `--file` lặp (danh sách exact trong handoff): syntax recommended, full required,
related COVERED_BY_FULL, static/runtime/TUI NOT_AFFECTED, không needs-review.
Sau syntax đạt, input code/test không đổi: hoàn tất bằng mode full còn lại,
không lặp T0 qua combined verify.

| Lệnh từ root | Kết quả | Thời lượng |
|---|---|---:|
| `node scripts/arms-test.mjs syntax --task sprint-2.2` + 24 `--file` | 6/6 parse/import checks | 349 ms |
| `node scripts/arms-test.mjs full --task sprint-2.2` + cùng 24 `--file` | **126/126 GREEN**, gồm 10 new core tests | **13.184 ms** |
| `time npm run test:policy` | 0 findings, report-only | 136 ms wall |

Logs exact:
- Syntax: `.openarms/logs/syntax-63512111b2672f0378fc92ef-ba0ad886-13fb-48d8-bf7e-27446999693b.log`.
- Full: `.openarms/logs/full-63512111b2672f0378fc92ef-35ce7225-0c7b-4e31-8dc1-eadf21438f11.log`.

Không failure ngoài intentional RED; không raw log inspection theo scoped instruction.
Log chịu local retention, không artifact vĩnh viễn. Syntax không semantic TS
typecheck. Docs validation là manual contract/current-claim/link review theo 31
named paths, không automated Markdown render/whole-tree link scan. Sau GREEN chỉ
chỉnh docs/evidence, không thay code/test hoặc lặp checks unchanged.

Full được root AGENTS bắt buộc do shared core/resolver và test map/policy changes,
không phải chạy suite-wide trong vòng phát triển. Named test inputs đã inspect:
content I/O là authored temp fixtures; non-smoke fingerprint không đọc library thật.
Smoke chỉ theo classifier; standalone core không thay plugin/runtime/sandbox.
Không claim smoke/host/live-source acceptance bằng fixture tests.

## Docs audit toàn inventory (31 ordinary docs được liệt kê)

Đã đọc cả 31 path controller liệt kê, không discovery hoặc đọc skill files.
Handoff ghi nhãn “32 paths” nhưng danh sách thực có 31; audit bao phủ toàn bộ
danh sách đó và hai guide/report Sprint22 mới, không tự tìm thêm file ngoài scope.
Sửa current facts/navigation: docs README, hai architecture docs, roadmap Phase 2,
testing/testing và overview, smoke-contract, Sandbox, Sprint21 guide và hai phase
reviews. Thêm Sprint22 guide/report; overview OpenArms/v2/v3 thêm reference hiện
hành, giữ nguyên historical data/proposals. Roadmap Phase0 sửa report link sai;
không đổi historical test counts hoặc acceptance.

Giữ nguyên sau audit: roadmap Phase1/3 (scope tương lai/host readiness không đổi),
overview v1 (đã nhãn historical), reports sprints 01_02_03/04/11/12/13/21 (evidence
lịch sử không rewrite), guides Sprint01/02/03/04/11/12/13 (runner/governor/host
contracts không đổi; links testing overview dẫn tới Sprint22 mới). Roadmap Phase0
ngoài report link giữ unchanged. Hai JSON schema examples và logo SVG không đổi:
registry schema v2 không đổi, chỉ thêm core API contract và snapshot read option.

## Remaining gates / giới hạn

Fresh independent scoped security review, explicit operator source approval và
live migration/integrity, host tool registration, persisted grant/state migration,
legacy-loader consumer conversion, task-boundary integration, TUI và Phase2
acceptance chưa làm. Không remote CI/provider/e2e/semantic TS typecheck, không
dependency install/global configuration/commit/push. Historical runner smoke block
Sprint2.1 vẫn chưa được đóng; không dùng evidence này để đóng gate khác.
