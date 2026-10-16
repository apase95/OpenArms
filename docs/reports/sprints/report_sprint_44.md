# Sprint 4.4 — Implementation evidence

Profile openai/gpt-6.1-sol/general; không delegation/model switch/skills/commit.
Implementer session ID không được environment cung cấp. Scout IDs trong controller
handoff không thay đổi. [Contract/runbook](../../testing/how_to_test/Sprint_44.md).

API registration tích hợp writer transaction; cùng schema v2, exclusive registry
lock, byte-derived SHA256, rollback trước publication. Loader giữ metadata cùng
selection snapshot, verify raw buffer, topic containment và existing authority,
revision/history/cap checks. TSK415 unchecked/deferred, requirements và Sprint4.5
index acceptance giữ nguyên. Không TUI install hoặc live-provider acceptance.

## Scope manifest

src/local-library.ts; src/skill-decompiler-writer.ts; src/skill-scope-resolver.ts;
plugins/skill-router-server.ts; tests/local-library.test.ts; tests/sprint44.test.ts;
scripts/test-map.json; docs/README.md; docs/testing/how_to_test/Single_Library.md;
docs/testing/how_to_test/Sprint_44.md; docs/reports/sprints/report_sprint_44.md;
docs/roadmap/Tasklist_Phase_4.md. Không gồm inherited dirty changes.

## Evidence

Runner inspected: related truyền exact test filename vào Node --test.
RED: `node scripts/arms-test.mjs related --task sprint-44-red --file tests/sprint44.test.ts`,
0/1, exit1,162ms: topic trả core thay vì Detail. Chẩn đoán từ assertion và source,
không raw log inspection (scoped role cấm).
GREEN: cùng isolated file `--task sprint-44-green`,2/2,312ms. Bao gồm v2
core/topic/tamper/auth/IDs/symlink và registration cả scopes/concurrency/rollback/
invalid registry. Sau GREEN bổ sung registry-staged fault và concurrent scope mkdir
handling; final validation bên dưới mới áp dụng revision hoàn tất.

## Final verification

Một reviewed `verify --plan --synthetic --task sprint-44` với repeated `--file`
cho đủ 12 paths manifest: syntax recommended; full/static/runtime required;
related covered by full; TUI NOT_AFFECTED; không needs-review.

`syntax --synthetic` ban đầu CONFIG_ERROR vì flag chỉ dùng verify/runtime;
không test chạy. Sửa command: syntax7/7,319ms. Full đầu292/293,12524ms:
existing Sprint41 classifier test yêu cầu exact skill-install mapping. Bỏ riêng
mapping Sprint44 thêm vào scope resolver; tests Sprint44 vẫn explicit trong
manifest và mapped qua local-library/writer. Không thay existing regression test.
Chẩn đoán từ assertion summary, không đọc raw log theo scoped-role restriction.

Final `node scripts/arms-test.mjs verify --synthetic --task sprint-44` cùng repeated
manifest files (sau mapping fix, không unchanged retry):

| Check | Kết quả | Duration |
|---|---|---:|
| syntax | 7/7 PASS |345ms|
| full |293/293 PASS|12438ms|
| smoke-static |8/8 PASS|327ms|
| synthetic image build |PASS|41602ms|
| smoke-runtime |5/5 PASS|75040ms|
| `npm run test:policy` |0 findings|không đo riêng|

Logs cuối: `.openarms/logs/` với IDs syntax
`2b3202a7-56a4-4775-8e44-c667c48d7c22`, full
`0c6dad6b-c034-41d1-9046-1649be2ec881`, smoke-static
`a85fadeb-b81d-4acb-8af6-807455278959`, build
`f79bcc00-0dfa-4a3e-965b-c9301837a656`, runtime
`114de564-2bbc-4e2f-bf95-683083ffa914` (prefix mode +
`-63512111b2672f0378fc92ef-`, suffix `.log`). Runner retention removed1 old
owned image, keep2/mode; no manual Docker pruning. Full bắt buộc theo repository
shared runtime/test-map policy, không phải isolated <2s target.

Không code/test changes sau final pass; chỉ cập nhật report/roadmap evidence.
TUI smoke skipped NOT_AFFECTED; không e2e install/live-provider/real-library tests.
Runtime smoke5/5 là existing synthetic host regression, không tự chứng minh model
tự chọn topic. Chưa có dedicated server-tool topic execution test, explicit
cross-skill path metadata test, hoặc actual fsync I/O error simulation; core
allowlist/containment/hash tests và publication fault injection không được diễn
giải là proof cho mọi hostile filesystem/durability failure.

Không coi isolated GREEN là full/smoke acceptance.
V1 existing regression tests được giữ; fixture v2 zero hash được sửa thành hash
thật vì local v2 nay enforce integrity. Limits: owner-controlled FS; no crash
recovery, no hostile-FS guarantee, no live provider/corpus or actual TUI install.
