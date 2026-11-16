# Sprint 3.3 v2 — Git Diff & File Inspection

**Cập nhật continuation 15/10/2026:** blocker runtime bên dưới là lịch sử.
SSE host báo thiếu `test-output-compactor.ts` trong synthetic context allowlist;
đã thêm đủ 5 compactors, runtime register loader và PTY OpenArms đều pass.
Chuỗi test/diff/g++ thật qua synthetic model transport đạt; xem
[Sprint35 evidence](Sprint_35v2.md). Không suy ra live-library/provider acceptance.

Phạm vi TSK-308v2–311v2; không nghiệm thu build parser, telemetry domain/savings,
live provider hoặc Phase 3.5. Giữ nguyên thay đổi Sprint 3.2 kế thừa.

## Chạy từ repository root

```sh
node scripts/arms-test.mjs related --task sprint-33v2 --file tests/sprint33v2.test.ts
```

Runner truyền đúng file test, không chạy suite-wide. Mong đợi 8 tests đạt: fixture
5 source + lock ~200KB, boundary 4000/4001 UTF8 bytes, priority/context, quoted
paths/rename/delete/new/binary, malformed fallback, huge stats, injection, sink
ordering, read/cat và hook metadata/authoritative/cap. Không chạy lại related nếu
full đã bao phủ cùng revision. Core/hooks/map đổi cần full; review đúng một plan
đủ scope rồi syntax và các mode còn lại. Runtime smoke theo policy, không TUI.

## Contract và ví dụ thủ công

- Mặc định governor đăng ký test/linter/git-diff. `compactors` thay thế defaults,
  `[]` chọn generic-only cho domain parsers; inspection safety độc lập với injection.
- Diff normalized ≤4000 UTF8 bytes giữ nguyên (trừ provenance/marker escaping của
  governor). API trực tiếp với budget nhỏ hơn input vẫn phải tuân `maxBytes`.
- Lớn hơn ngưỡng: summary theo từng file với **số dòng thêm/bớt thực sự quan sát**,
  source/config ưu tiên cao, docs/data/styles trung bình, lock/generated/min/map/
  SVG/binary thấp. Binary có +0/-0 observed textual changes, không suy diễn size.
- Khi đủ budget, source diff giữ nguyên từng byte normalized. Khi thiếu, giảm
  context trước; giữ tọa độ và function context của hunk. Excerpt thiếu context/
  changes đánh dấu **NOT an applicable patch**. Quá budget nữa thì bỏ cả file với
  số lượng rõ ràng. Stat lớn có số file rows omitted; không hứa mọi path đều hiện.
- Ví dụ `git diff`: 5 `src/a0.ts`…`a4.ts` đổi `old` thành `new` và package lock
  200KB: context có đầy đủ 5 source diffs, lock chỉ summary `+1/-1 (omitted...)`.
  `git show`/`git log -p` có commit preamble được giữ khi đủ budget, nếu không có
  marker riêng. Đường dẫn spaces/C-quoted UTF8, rename/new/delete được hỗ trợ.
- Malformed/truncated hunk (counts sai), format lạ, combined diff và `GIT binary
  patch` encoded payload dùng generic fallback có raw log. Không cố đoán patch.
  Preamble không bắt đầu bằng commit header cũng fallback. Không phải shell/git
  parser đầy đủ; wrapper/global flags phức tạp có thể dùng stream signature.

Inspection chỉ dùng output đã quan sát: `read` truyền toolName/path; exact `cat`
invocation (absolute path, quoted args và flags đơn giản), không chạy probes/
reread. `echo cat ...`, pipelines, command substitution không kích hoạt cat rule.
NUL hoặc wrapper binary rõ ràng → binary; line >5000 code units → long-line;
JS syntax dày đặc hoặc `.min.js` + code → minified. Prefix `N: ` của read và `N\t`
của cat -n được bóc chỉ để nhận diện. Markdown/prose dài không bị gọi là minified,
nhưng vẫn có long-line summary. Heuristic không nhận mọi bundle/binary encoding;
không suy diễn whole-file size từ wrapper/range/truncated read.

Ví dụ đọc output `1: var a=1;...` trên 5000 ký tự: summary ghi `minified bundle`,
`observed output size: ... UTF8 bytes (not whole-file size)` và hướng dẫn
`Use targeted range read or grep`. Đọc prose một dòng dài: reason `line longer
than 5000 characters`. Output bình thường giữ compatibility; nhắc tới “binary
file” trong tài liệu không đủ để coi là binary.

## An toàn và giới hạn

Await raw sink trước detector (kể cả binary ngắn), normalization và parser; hook
flush/fsync owner-only. `LOG_WRITE_FAILED` không mint log path. Không đổi title,
metadata hoặc exitCode; telemetry downstream không thêm path/command nhạy cảm.
Authoritative load_skill/load_verified_skill/load_skill_package bypass detector;
quá 50000 bytes trả refusal, không skill fragment. Cap cuối 50000 UTF8 bytes gồm
refs/warnings, reserved marker escaping và generic fallback vẫn giữ nguyên.

Mục tiêu ≤1500 tokens chỉ là **bytes/4 ước lượng trên fixture đại diện 5 source
nhỏ + lock ~200KB**, không tokenizer thật. Không thể cam kết vừa mọi source dài
vô hạn giữ 100% vừa ≤1500 tokens. Source lớn dùng budget/marked omissions/raw log;
không cam kết universal 95% savings hoặc acceptance provider/real library.

## Evidence

RED: exact isolated file 1/2 pass, 121ms; thiếu lock collapse như dự kiến.
GREEN trước hardening binary-prose/cat-prefix: exact file 8/8 pass, 266ms.

Scope đầy đủ (mỗi dòng thành một `--file <path>` cho các lệnh dưới):

```text
.opencode/handoff-sprint33v2.md
src/git-diff-output-compactor.ts
src/file-inspection-compactor.ts
src/output-governor.ts
src/governance-hooks.ts
src/test-output-compactor.ts
src/linter-output-compactor.ts
tests/sprint33v2.test.ts
tests/sprint32v2.test.ts
scripts/test-map.json
scripts/test-policy.json
docs/testing/how_to_test/Sprint_33v2.md
docs/testing/how_to_test/Sprint_32v2.md
docs/testing/how_to_test/Sprint_31v2.md
docs/testing/testing.md
docs/testing/how_to_test_overview.md
docs/roadmap/Tasklist_Phase_3_v2.md
```

Lệnh thực tế: `node scripts/arms-test.mjs verify --plan --task sprint-33v2`,
`syntax --task sprint-33v2`, `full --task sprint-33v2`,
`smoke-static --task sprint-33v2`, `smoke-runtime --synthetic --task sprint-33v2`
(các mode sau cũng qua `node scripts/arms-test.mjs`, kèm đủ 17 `--file` trên).
Plan: syntax recommended; full/static/runtime required; related covered by full,
TUI NOT_AFFECTED. Full do core/hooks + mappings; smoke chỉ theo policy.
Isolated GREEN trước hardening binary prose/cat prefix; full bao phủ revision cuối,
không lặp related+full trên code/test revision không đổi.

| Check | Kết quả | Duration runner |
|---|---|---:|
| RED isolated | 1/2 pass, thiếu lock collapse | 121ms |
| GREEN isolated trước hardening | 8/8 pass | 266ms |
| Syntax | 10/10 pass | 456ms |
| Full cuối (gồm 8 tests Sprint33v2) | 223/223 pass | 16650ms |
| Static smoke | cache hit `e8448f6120cc`, không chạy mới | cached |
| Synthetic build | pass, retention removed=1 theo runner policy | 12189ms |
| Synthetic runtime | FAIL `/experimental/tool/ids`, chưa register `load_skill` | 21288ms |
| `npm run test:policy` | 0 bypass findings | không đo riêng |
| `git diff --check` | pass tracked diff; file mới được syntax/tests kiểm tra | không đo riêng |

Runtime log có dependency install failure `EROFS` khi tạo `/home/node/.npm`.
Đã đọc full named log; chưa đủ chứng cứ kết luận đây là nguyên nhân duy nhất.
Không retry input không đổi, không sửa sandbox ngoài scope. Runtime release
validation **còn blocker**; build/unit pass không chứng minh plugin đã load.
Không chạy TUI/provider/live library/Phase 3.5 acceptance. Có một syntax invocation
CONFIG_ERROR trước execution vì biến shell scope không tồn tại giữa tool calls;
đã sửa bằng explicit file arguments, không phải lỗi source/test.

Logs dưới `.openarms/logs/`:

```text
related-63512111b2672f0378fc92ef-8fc07e69-03ac-44d6-b8a8-1fd755b040fd.log (RED)
related-63512111b2672f0378fc92ef-a17227d0-6a8d-4d0a-bb55-3d304a24f57b.log (GREEN)
syntax-63512111b2672f0378fc92ef-c18763a5-0bbd-4b06-a2df-5a7a9c0a4b1b.log
full-63512111b2672f0378fc92ef-cd3c325e-976e-4b9b-b2be-5850c522a1b7.log
build-63512111b2672f0378fc92ef-5b70e12c-cae8-48f6-a16f-5586429b6c79.log
smoke-runtime-63512111b2672f0378fc92ef-d67af457-ed69-4c1b-8183-688ec9795b2c.log
```

Sau verification chỉ cập nhật checklist/evidence/docs/handoff, không đổi code/tests.
