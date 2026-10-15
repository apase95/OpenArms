# Sprint 3.5 v2 — Output governance: kiểm tra và kết quả cuối

## Phạm vi và trạng thái

TSK315–319 đã hoàn tất trong phạm vi representative fixtures và Docker/OpenCode
host dùng local synthetic model transport. Kết quả cuối ngày **15/10/2026**:
syntax **24/24**, full **241/241**, runtime **5/5**, PTY **1/1**, policy **0 findings**.
Đây là bằng chứng đã ghi nhận cho revision code cuối, không phải lần chạy mới
trong đợt chỉnh tài liệu. Không có live-provider/real-library acceptance.

- TSK315: production `tool.execute.after`, raw sink và safety boundary.
- TSK316: negative/property tests cho parser lỗi và hard cap 50.000 bytes UTF-8.
- TSK317: telemetry domain/bytes/ratio, tương thích legacy; `/usage` và `/budget`
  hiển thị savings ước lượng.
- TSK318: workflow test fail, git diff, build fail qua PTY host thật.
- TSK319: measurements, failure metadata, provenance và giới hạn có bằng chứng.

## Hành vi và raw sink

Hook lưu chuỗi raw quan sát được trước parser/detector, kể cả output ngắn hoặc
chứa NUL/ANSI. Sink là `<projectRoot>/.openarms/logs`; telemetry vẫn ở
state/governance. File dùng opaque hash+UUID, exclusive creation, mode **0600**;
thư mục mới **0700**. Write và `FileHandle.sync()` hoàn tất trước parsing.
Reject sink symlink, non-directory và thư mục group/world-writable.
Threat model là project do owner kiểm soát, không chống concurrent hostile
directory replacement. Raw logs có thể chứa secrets: không commit/chia sẻ tùy tiện.
Retention **7 ngày / 200 files / 256MiB**, best effort; không phải archive vĩnh viễn.

Chỉ successful sink mới có `logPath`/provenance thành công. Disk save fail phát
`LOG_WRITE_FAILED`, không tạo provenance giả, không đổi exit metadata. Sync không
bảo đảm chống mọi lỗi disk/power loss. Không thể phục hồi output host đã truncate
trước hook: “full raw” chỉ là chuỗi hook thực sự nhận và lưu thành công.

Boundary bắt match/compact throw, snapshot/validate getters và parser result;
text phải là string, omission counters là safe integer không âm. Parser lỗi dùng
generic fallback kèm `GOVERNOR_FAILED`; output cuối gồm refs/warnings bị giới hạn
**50000 UTF8 bytes**. Có kiểm tra multibyte, malformed/oversized results và limits nhỏ.
Authoritative oversized không trả fragment skill; authoritative ngắn trong hook
được lưu nhưng trả nguyên văn, không chèn provenance. Legacy API giữ compatibility.
Format không hỗ trợ dùng fallback; xem [build grammar](Sprint_34v2.md).

## Telemetry, usage và budget

Hook ghi `domain`, `rawBytes`, `compactedBytes`, `savingsRatio`:

- Domain: `test`, `git-diff`, `build`, `linter`, `generic`.
- `compactedBytes` là **final visible context**, gồm provenance/warnings/cap,
  không phải payload trước wrapper.
- Ratio = `(rawBytes - compactedBytes) / rawBytes`; raw=0 dùng **0**.
  Expansion có ratio âm hợp lệ, không che giấu trong telemetry.
- Validators loại số âm/nonfinite/unsafe, ratio không nhất quán, unknown keys,
  accessors và domain lạ. Không ghi command, nội dung hoặc log path vào telemetry.
- Aggregation dùng weighted byte totals; tổng vượt safe integer trả unknown.
  Legacy records vẫn đọc được, không tự gán domain/savings còn thiếu.

`/usage session`, `/usage project`, `/budget` dùng net byte savings / **4**,
clamp không âm **sau khi** cộng cả expansion. Đây là approximate context-token
estimate, không phải tokenizer count, billing credit hay bảo đảm giảm chi phí.
Today/session/project lifetime theo retained local records, project isolation và
Home không active session giữ nguyên semantics. Raw sink không phải usage ledger.

## Điều kiện và kiểm tra focused/manual

Chạy từ repository root với dependencies hiện có. Docker daemon/Compose, Python
và PTY phải khả dụng cho sandbox; thiếu prerequisites là blocked, không phải pass.
Synthetic mode không cần credentials hoặc đọc library thật. Dùng runner, không
gọi runtime/static/TUI script trực tiếp. Cho smoke tool timeout ít nhất **600000ms**.

Focused examples (mỗi lệnh chọn mapped tests; không chạy cả hai rồi full trên
cùng revision chỉ để lặp lại bằng chứng):

```sh
node scripts/arms-test.mjs related --task sprint-34-35v2 --file tests/sprint35v2.test.ts --file tests/usage-budget-ux.test.ts
node scripts/arms-test.mjs related --task sprint-34-35v2 --file tests/synthetic-context.test.mjs --file tests/sprint35v2.test.ts
```

Manual trong host đã bật plugin: chạy test fail, diff lớn và compiler fail bằng
bash tool; kiểm tra diagnostics còn đọc được, exit không đổi, raw reference mở
được trong project và `/usage session`/`/budget` ghi rõ estimated savings.
Workflow tự động bên dưới kiểm tra production hook, không gọi governor trực tiếp.

## Tái hiện verification toàn scope

Manifest công khai dưới đây liệt kê code/tests/config/docs của task; không cần
private handoff làm đầu vào. Dùng Bash từ root, review plan trước khi chạy modes.
Full phù hợp ở task này vì shared core và synthetic test infrastructure thay đổi.

```bash
files=(
  src/build-output-compactor.ts src/output-governor.ts src/governance-hooks.ts
  src/governance-telemetry.ts src/usage-query.ts src/usage-store.ts
  src/test-output-compactor.ts src/linter-output-compactor.ts
  src/git-diff-output-compactor.ts src/file-inspection-compactor.ts
  tests/sprint32v2.test.ts tests/sprint33v2.test.ts tests/sprint34v2.test.ts
  tests/sprint35v2.test.ts tests/usage-budget-ux.test.ts tests/sprint13.test.ts
  tests/sprint31v2.test.ts tests/synthetic-context.test.mjs
  scripts/test-map.json scripts/test-policy.json scripts/synthetic-context.mjs
  sandbox/Dockerfile sandbox/smoke-runtime.mjs sandbox/tui-fixture.ts
  sandbox/tui-fixture-launch.mjs sandbox/tui-smoke.py
  docs/guides/budget-ux.md docs/architecture/openarms-overview.md
  docs/roadmap/Tasklist_Phase_3_v2.md docs/testing/how_to_test/Sprint_31v2.md
  docs/testing/how_to_test/Sprint_32v2.md docs/testing/how_to_test/Sprint_33v2.md
  docs/testing/how_to_test/Sprint_34v2.md docs/testing/how_to_test/Sprint_35v2.md
  docs/testing/testing.md docs/testing/how_to_test_overview.md
)
args=(); for file in "${files[@]}"; do args+=(--file "$file"); done
node scripts/arms-test.mjs verify --plan --synthetic --task sprint-34-35v2 "${args[@]}"
node scripts/arms-test.mjs syntax --task sprint-34-35v2 "${args[@]}"
node scripts/arms-test.mjs full --task sprint-34-35v2 "${args[@]}"
npm run test:policy
```

Không thêm `--synthetic` vào syntax/full. Historical reviewed plan gồm 39 paths
(thêm 3 local handoff artifacts); manifest tái hiện ở đây chỉ gồm 36 published
task inputs. Không chạy related rồi full cho cùng revision, hoặc rerun passing
code checks chỉ vì sửa docs.

Remaining Docker modes dùng đủ 7 integration paths để classifier chọn đúng scope:

```bash
integration=(sandbox/tui-fixture.ts sandbox/tui-fixture-launch.mjs sandbox/tui-smoke.py
  sandbox/Dockerfile sandbox/smoke-runtime.mjs scripts/synthetic-context.mjs src/governance-hooks.ts)
args=(); for file in "${integration[@]}"; do args+=(--file "$file"); done
node scripts/arms-test.mjs smoke-runtime --synthetic --task sprint-34-35v2 "${args[@]}"
node scripts/arms-test.mjs tui-smoke --synthetic --task sprint-34-35v2 "${args[@]}"
```

## Acceptance và bằng chứng cuối

PTY chạy OpenCode **1.18.35** trong Docker. Slash command kích hoạt normal host
`session.prompt` và bash tool calls từ HTTP loopback synthetic model transport.
Model transport và Jest-like reporter là tổng hợp; **Node assertion thực sự fail**,
`git diff` và `g++` là binaries thật. Production tools/hooks được chạy qua host PTY.

| Host tool | Domain | Exit | Raw bytes | Final context bytes | Reduction |
|---|---|---:|---:|---:|---:|
| `npm test` | test | 7 | 18341 | 394 | 97.85% |
| `git diff` | git-diff | 0 | 22372 | 478 | 97.86% |
| `g++ -Wall -fsyntax-only acceptance.cpp` | build | 1 | 12439 | 295 | 97.63% |

Assertions kiểm tra known diagnostic/source evidence, exits, cap≤50000, project
raw refs/evidence/0600 và telemetry domain/raw/context bytes, reduction>90%.
Exact raw equality gồm NUL/ANSI được kiểm tra riêng ở isolated hook test.
Mức 90–98% chỉ đại diện noisy logs, không phổ quát; log ngắn có thể expansion.

Final syntax **24/24, 559ms**; full **241/241, 15808ms**; policy **0 findings**
(không ghi duration riêng). Runtime **5/5, 25363ms**; PTY **1/1, 116794ms**,
giữ cả UI regressions và ba domains. Static pass `41097c3ebfe3` được reuse;
build **9252ms**, matching image được PTY reuse.
Final logs dưới `.openarms/logs/`:

- Syntax: `syntax-63512111b2672f0378fc92ef-2ccd172d-1ea8-448f-9217-cd5bf551bbb6.log`
- Full: `full-63512111b2672f0378fc92ef-440919a8-f568-412b-bd6f-faab43b0f441.log`
- Runtime: `smoke-runtime-63512111b2672f0378fc92ef-46578998-98ee-4d4e-93f9-fe36607738cc.log`
- PTY: `tui-smoke-63512111b2672f0378fc92ef-ae5bc266-cc7f-4d0f-948b-7302a0a48be4.log`

## Chẩn đoán đã giải quyết và giới hạn

Writable npm cache loại bỏ EROFS nhưng không phải nguyên nhân missing loader.
SSE `/global/event` trước bootstrap xác định synthetic inventory thiếu compactor
modules (`Cannot find module './test-output-compactor.ts'`). Đã thêm đủ **5**
entries, giữ nguyên `load_skill` assertion; không rewrite plugin API để ép pass.
Lịch sử chi tiết nằm trong local handoff/logs, không phải trạng thái lỗi hiện tại.

Không có blocker trong synthetic acceptance scope đã nêu. Chưa kiểm tra live
provider, real library, installed mode hoặc rollout; không bảo đảm billing,
mọi format compiler, mọi log savings hay raw persistence khi disk save thất bại.
