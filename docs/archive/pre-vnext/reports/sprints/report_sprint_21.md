# Báo cáo Sprint 2.1 — schema/migration/hash/integrity tooling

## Phạm vi 11/10/2026

Tooling standalone đã được viết cho TSK-201–204, cùng fixture tests và CI gate
gọi production CLI. Runtime/registry repository vẫn v1; không chạy migration hoặc
hash trên library thật, không triển khai Sprint 2.2/2.3. Nghiệm thu owner/library
và review concurrency vẫn còn chờ; không công nhận toàn Phase 2.

| Task | Deliverable | Giới hạn nghiệm thu |
|---|---|---|
| TSK-201 | TS types, strict runtime validator, valid/invalid JSON | Types cần validator để kiểm tra hash/positive integer |
| TSK-202 | Explicit decisions, dry-run/diff, raw hashes, backup/atomic/snapshot | Migration thật pending; cooperative writers/private parent |
| TSK-203 | Existing explicit ID CLI, old/new, check/drift, no-follow | Linux only; hostile writer bỏ qua lock không được bảo đảm |
| TSK-204 | Stable integrity/budget results, production CLI fixture CI gate | Không phải live source approval; CI remote chưa chạy |

Contract, lệnh, prerequisites, exit codes và recovery:
[hướng dẫn Sprint 2.1](../../testing/how_to_test/Sprint_21.md).
`verified` là source/revision operator chấp nhận + matching bytes, không chứng
nhận nội dung an toàn. Source metadata repository không thay installed library.

## Bằng chứng

RED canonical related: migration chưa triển khai, 2/3 đạt, 116 ms;
log `.openarms/logs/related-63512111b2672f0378fc92ef-185abe5c-d300-4fcf-9c78-20aba54c04f2.log`.
Lượt trước RED bị CONFIG_ERROR do map tham chiếu file chưa tạo; đã sửa manifest
bằng tạo đúng file scope, không bỏ file. Host từ chối đọc `.log`, nên chẩn đoán
dựa vào failure summary (Migration not implemented); không lách quyền đọc log.
Regression duplicate JSON keys có RED thật: CLI bỏ qua key trùng và trả 0 thay
vì 2; 7/8 đạt, 396 ms, log
`.openarms/logs/related-63512111b2672f0378fc92ef-b83e9128-1029-4129-a76e-74532efc8864.log`.
Đã sửa strict parser bằng dependency `yaml` có sẵn sau JSON syntax check, không
thêm dependency. GREEN cuối nằm trong full bắt buộc, không related/full trùng
trên cùng revision. Tám tests mới dùng fixtures tác giả tự tạo; YAML job cũng
được parse và kiểm tra gate nằm trước canonical runtime full.

Một complete-scope plan `verify --plan --task sprint-2.1-tooling` cấp 31 path
bằng `--file` lặp (danh sách chính xác trong handoff): syntax + full, related
`COVERED_BY_FULL`, smoke `NOT_AFFECTED` cho **subtask tooling riêng**. Không đổi
phân loại runner prerequisite hoặc giảm smoke impact. Full bắt buộc do mapping/
hạ tầng kiểm thử/CI mới; đã inspect named tests/direct manifest imports trước full,
không có live skill reads trong test execution.

| Lệnh | Kết quả thực tế | Thời lượng |
|---|---|---:|
| `syntax` ban đầu đủ scope | 10/10 | 377 ms |
| `full` ban đầu đủ scope | 114/114 | 13.091 ms |
| `verify` một lần sau sửa detection/idempotence/CI YAML | syntax 10/10; full 115/115 | 384 ms; 12.984 ms |
| `syntax` revision strict JSON cuối, cùng scope/task | 10/10 | 331 ms |
| `full` revision strict JSON cuối, cùng scope/task | **116/116** | **12.858 ms** |
| `node scripts/registry-v2-ci.mjs` standalone | production CLI exits 0/1/1/2 đúng | 174 ms |
| `npm run test:policy` revision cuối | **0 findings**, report-only | 151 ms |

Không repeat full unchanged: mỗi lượt sau có code/test revision mới (preserve
`detect.always`/omitted arrays, byte-stable v2 no-op, CI wiring và duplicate-key
regression). Invocation full dùng shell array ở call khác bị CONFIG_ERROR empty
argument trước execution; đã chẩn đoán shell variables không giữ qua calls và
dùng command đủ literal scope, không retry test fail.

Log syntax cuối:
`.openarms/logs/syntax-63512111b2672f0378fc92ef-1320a46b-5411-49cc-b733-1ba3727c14ac.log`.
Log full cuối:
`.openarms/logs/full-63512111b2672f0378fc92ef-84ca927e-7b99-464e-839c-390b66ec1dc9.log`.
Standalone CI command ở revision trước strict-parser; **gate cùng CLI revision
cuối đã chạy lại trong test full 116/116**, không claim remote GitHub job chạy.
Local logs chịu retention, không phải artifact vĩnh viễn. Syntax chỉ parse/import,
không semantic typecheck. Sau GREEN chỉ cập nhật docs/handoff evidence.

Runner prerequisite trước task này: full 108/108 là evidence lịch sử unchanged,
không phải proof tooling mới. Required smoke tổng task vẫn blocked do authority
không cho đọc/hash actual skills. Không giảm classifier/cache/fingerprint smoke,
không coi fixture CI/full là smoke pass. Phase 0/1 host/active-days/owner gates
vẫn pending và historical reports giữ nguyên số liệu.

## Rủi ro và bước còn chờ

### Independent review correction — 11/10/2026

Review tìm một Medium: non-smoke fingerprint thiếu đúng hai JSON examples và CI
workflow mà registry-v2 tests đọc; sửa bytes không reset retry guard/observation.
Đã thêm đúng `docs/testing/registry-v2-valid.json`,
`docs/testing/registry-v2-invalid.json`, `.github/workflows/registry-integrity.yml`
vào inputs, không broad traversal và không thay smoke/build/library hashes.
Regression thay từng byte cùng kích thước dưới guard library I/O; các ca symlink
và smoke/build synthetic-byte invalidation vẫn giữ. Các vùng review khác sạch
trong contract cooperative/private Linux đã công bố, không claim hostile CAS.

Một plan correction `verify --plan --task sprint-2.1-review-fix`, sáu paths:
`scripts/smoke-inputs.mjs`, `tests/non-smoke-inputs.test.mjs`, báo cáo này,
`docs/testing/how_to_test/Sprint_21.md`, `docs/roadmap/Tasklist_Phase_2.md`,
`.opencode/handoff.md`. Syntax/full và static/runtime/TUI smoke required;
related covered by full. Runner inspected: related với exact test path chỉ chạy
file đó; full bắt buộc bởi thay đổi shared test infrastructure.

| Lệnh (cùng task; syntax/full cấp cả sáu `--file`) | Kết quả | Thời lượng |
|---|---|---:|
| `related --file tests/non-smoke-inputs.test.mjs` trước sửa production | RED 3/4, missing byte invalidation | 503 ms |
| `syntax` sau sửa | 2/2 | 381 ms |
| `full` sau sửa, một lần | GREEN 116/116, gồm cả 4 regression cases | 13.973 ms |
| `npm run test:policy` | 0 findings, report-only | 160 ms |

Logs exact:
- RED: `.openarms/logs/related-63512111b2672f0378fc92ef-5108bd15-307d-4036-be68-27ef60629a01.log`.
- Syntax: `.openarms/logs/syntax-63512111b2672f0378fc92ef-6376479b-7b27-4fe7-9c45-e8f552a8c42a.log`.
- Full: `.openarms/logs/full-63512111b2672f0378fc92ef-96de01b1-3ddd-4df8-bc29-8c85a7c81a99.log`.

RED chẩn đoán từ failure summary/assertion; scoped assignment cấm raw log
inspection, không rerun failing unchanged input. Required smoke/combined verify
vẫn không chạy vì authority cấm actual library hash; không giảm mapping/cache.
Không chạy live migration/integrity, remote CI hoặc semantic typecheck. Sau GREEN
chỉ cập nhật docs/evidence. Correction không phải nghiệm thu; checkbox vẫn pending.

Không triển khai grant/loader/state/API Sprint 2.2–2.3, không chạy live migration,
live hash/integrity, Docker/OpenCode/TUI/provider/e2e, remote CI hay semantic
typecheck. Linux descriptor-relative reads/writes từ chối symlinks và pin directory;
cooperative lock + snapshots chống supported writers đồng thời, nhưng writer
bỏ qua lock/actor sửa directory nằm ngoài bảo đảm (Node không có CAS rename).
Owner cần private quiescent registry parent và fresh independent security review
trước operational migration. Estimator byte/4 không có bound sai số tokenizer.
Không tick task acceptance trước review; implementation tooling không bỏ dở vì smoke block.
