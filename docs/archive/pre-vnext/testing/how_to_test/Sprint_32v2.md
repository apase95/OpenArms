# Sprint 3.2 v2 — Test Runner & Linter Compactors

Phạm vi TSK-305v2–307v2. Parser mặc định đã bật trong `governOutput` và hook
hiện hành; không cần caller inject. Git/inspection đã bổ sung ở
[Sprint 3.3 v2](Sprint_33v2.md); guide này không nghiệm thu build/PTY/phase sau.

## Định dạng và chính sách

- Jest: `PASS/FAIL file.test.ts`, failure `●`, assertion nhiều dòng và summary.
- Vitest: `FAIL file > suite > case`, assertion, vị trí `❯`, summary.
- Pytest: header `FAILURES/ERRORS`, tên case trong đường gạch dưới, code context,
  dòng `E`, short summary. Progress pass bị bỏ khi nhận diện được cấu trúc.
- Go test: `=== RUN`, assertion thụt đầu dòng **trước** `--- FAIL`, package summary.
- Mocha spec reporter: `N passing/failing`, failure đánh số `1) suite case`.
- ESLint stylish: header file, `line:column error/warning message  rule`.
- flake8: `file:line:column: E/F/Wnnn message`.
- Biome pretty: `file:line:column rule ━━━`, diagnostic body và code snippet;
  warning nhận qua `WARN/WARNING` ở header hoặc dấu `⚠` trong body.

Giữ chi tiết failure đầu tiên, tối đa 5 tên failure tiếp theo, summary và tối đa
5 stack frames JS liên quan project; bỏ node_modules/internal. Không tạo frames
giả nếu log chỉ có ít frames. Không xóa dòng assertion vì chứa từ PASS/ok.
Success/progress chỉ bị bỏ theo cấu trúc nhận diện, không thay bằng lọc từ khóa.
Unsupported reporter (TAP, JSON, custom, format khác) dùng generic head/tail.
Linter gặp dòng lạ/malformed sẽ fallback cả stream, tránh partial parse làm mất
plugin crash. Chỉ các format đại diện trên được kiểm thử; không phải parser đầy đủ
cho mọi phiên bản/reporter hoặc mọi shell wrapper.

Lint gom theo file, giữ tọa độ/message/rule, tối đa 10 errors và số errors còn lại
chính xác. Total tính tất cả records nhận diện, không suy diễn từ exit code.
Warning-only giữ warnings. Khi có errors, chỉ suppress style warnings thuộc
W1xx/W2xx, ESLint indent/quotes/semi/comma-spacing/key-spacing/no-trailing-spaces
(kể cả @stylistic), Biome format hoặc lint/style; warnings khác vẫn hiện.
Suppression có marker và vẫn tính vào totals. E-codes flake8 vẫn là errors.
Marker parser dùng namespace `[compactor: ...]`, tránh giả metadata `[OPENARMS:`.

## An toàn và giới hạn trung thực

Raw được lưu trước normalize/compact; hook flush/fsync, không đổi title/metadata
hoặc exitCode. Full-log reference là nguồn chứng cứ khi bị lược. Sink lỗi hiện
`LOG_WRITE_FAILED`. Injection `compactors` **thay thế** defaults; `[]` chọn generic.
Legacy callback và authoritative skill safeguards không đổi. Parser lỗi dùng
generic fallback, cap cuối gồm metadata vẫn 50.000 UTF8 bytes.

Contract `maxBytes >=256` là số nguyên an toàn. Diagnostic quá budget có marker
`diagnostic bytes omitted; check full raw log`, cắt đúng biên UTF8. Không thể vừa
giữ toàn bộ assertion dài vô hạn vừa bảo đảm budget cố định. Tên/assertion chỉ
được giữ đầy đủ khi evidence nằm trong budget; trường hợp quá dài cần đọc raw.
Mục tiêu 300–1.000 tokens là **ước lượng bytes/4 trên fixture đại diện**, không
phải cam kết tokenizer. Log ngắn không padding; diagnostic lớn được ưu tiên tới
32KB trước cap cuối, có thể vượt mục tiêu token. Không tuyên bố tiết kiệm 95% chung.

## Kiểm thử tự động từ root

```sh
node scripts/arms-test.mjs related --task sprint-32v2 --file tests/sprint32v2.test.ts
```

File cô lập gồm happy path và critical unknown-format edge; realistic fixtures,
generated seed cố định, ~50.000-token suite, first+next5, stack frames, warning-only,
counts, multibyte/ANSI, huge diagnostics, registration mặc định và hook metadata.
Runner `related` truyền đúng file test, không chạy cả suite. Không chạy lại related
nếu full đã bao phủ cùng revision. Full bắt buộc cho thay đổi governor core;
plan đầy đủ quyết định smoke, không tự kéo TUI/server smoke.

RED: related 1/2 đạt, 127ms, failure đúng do PASS chưa bị compact.
GREEN trước lượt bổ sung cuối: related 6/6 đạt, 210ms. Kết quả hoàn tất xem phần
evidence bên dưới và handoff; đây là fixture synthetic, không live provider.

## Ví dụ thủ công

Chạy `jest` với `PASS tests/ok.test.ts`, `FAIL tests/bad.test.ts`, `● rejects`,
`Expected: PASS ok`, `Received: broken`, `Tests: 1 failed, 1 passed`: context bỏ
PASS record nhưng giữ nguyên `Expected: PASS ok`, failure và summary, kèm raw path.

Chạy `flake8` với 52 records `src/a.py:1:2: F821 undefined user`: context nhóm
10 records, total 52 errors, marker `42 additional lint errors omitted`.
Thêm `Fatal: plugin crashed` không theo format: toàn stream fallback generic.

Không cần chạy lệnh provider/network để kiểm tra parser; input/output và raw-path
được kiểm tra bằng Node builtins, không mock hành vi production parser.

## Evidence hoàn tất

Toàn bộ scope dùng ở plan/syntax/full (lặp `--file`, không Git discovery):

```text
src/output-governor.ts
src/test-output-compactor.ts
src/linter-output-compactor.ts
tests/sprint32v2.test.ts
scripts/test-map.json
scripts/test-policy.json
docs/testing/how_to_test/Sprint_32v2.md
docs/testing/how_to_test/Sprint_31v2.md
docs/testing/testing.md
docs/roadmap/Tasklist_Phase_3_v2.md
.opencode/handoff-sprint32v2.md
```

Các lệnh thực tế: `node scripts/arms-test.mjs verify --plan --task sprint-32v2`,
`node scripts/arms-test.mjs syntax --task sprint-32v2`, và
`node scripts/arms-test.mjs full --task sprint-32v2`, mỗi lệnh kèm đủ các
`--file <path>` trên. Dùng `full` là mode còn lại của plan sau syntax, không chạy
verify lặp T0/T1 trên cùng code/test revision.

| Kiểm tra | Kết quả | Thời gian runner |
|---|---|---:|
| Plan | T0 recommended, T2 required; T1 covered by full; mọi smoke NOT_AFFECTED | — |
| Syntax | 6/6 checks pass | 503ms |
| Full (gồm 6 tests Sprint32v2 và safety/authoritative regression cũ) | 215/215 pass | 14.524ms |
| `npm run test:policy` | 0 bypass findings | không đo riêng |

Fixture lớn dùng 8.000 PASS records; đo bằng `bytes/4` trong generated test xác
nhận raw >50.000 token ước lượng, context parser <1.000 token ước lượng, gồm
assertion, 5 frames, 5 next names và summary. Đây là measurement theo khoảng,
không tokenizer thật hoặc universal savings claim.

Logs: `.openarms/logs/syntax-63512111b2672f0378fc92ef-e829b14e-8718-442e-809f-949ff312c221.log`,
`.openarms/logs/full-63512111b2672f0378fc92ef-6f4eb0c3-25f9-4b18-b98b-10f95e317225.log`.
Không chạy smoke do policy NOT_AFFECTED; không có live/provider/PTY acceptance.
Chỉ cập nhật evidence/checklist docs sau pass, không đổi code/test đã kiểm tra.
