# Báo cáo Sprint 1.1 — Nền tảng kiểm thử và hợp đồng

## Sửa theo nghiệm thu — sprint-1.1-review-fix (trạng thái tại mốc báo cáo: GREEN)

Phần sửa tác động tới `sandbox/process-output.mjs`, `scripts/test-map.mjs`,
`tests/sprint11.test.mjs`, `scripts/test-policy.json`, `tests/test-runner.test.mjs`,
và ba tài liệu báo cáo/hướng dẫn của đợt đó. Brief hành chính được phân loại,
không sửa. Bộ thu output giữ tối đa 16 tên lỗi TAP không trùng, ưu tiên lỗi đầu,
giới hạn chẩn đoán 30 dòng. Kiểm tra lệch nguồn từ chối thành phần symlink cấu
hình, báo symlink con mà không đi theo chúng.

Mọi lệnh runner dùng `--task sprint-1.1-review-fix`. Plan lặp `--file` cho đủ sáu
path trên: bắt buộc full và static/runtime/TUI; full bao phủ related. RED/GREEN
cô lập chỉ dùng `--file tests/sprint11.test.mjs`.

| Lệnh | Kết quả | Thời lượng |
|---|---|---:|
| `node scripts/arms-test.mjs verify --plan …` | Đã review; không trở ngại classifier trong phạm vi | Không ghi nhận |
| `node scripts/arms-test.mjs related --file tests/sprint11.test.mjs …` RED | 5/7 đạt, hai regression mới fail | 171ms |
| Cùng lệnh cô lập GREEN sau sửa | 7/7 đạt | 159ms |
| `node scripts/arms-test.mjs syntax …` | 3/3 kiểm tra đạt | 342ms |
| `npm run test:policy` | 0 phát hiện, chỉ báo cáo | Không ghi nhận |
| `node scripts/arms-test.mjs full …` | 87/88 đạt; exit 1 | 11979ms |

Lỗi full lịch sử: `Unmapped repository file: .opencode/sprint11-fix.md` trong test
kiểm kê classifier toàn repository. Lượt tiếp nối cuối cho phép tường minh mapping
docs chính xác của brief đó và `.opencode/sprint11-review.md`. Không retry full
với input không đổi. Failure log
`.openarms/logs/full-63512111b2672f0378fc92ef-8f5aad75-b309-4187-a482-2af46925469b.log`
và việc đọc log RED bị quy tắc quyền log từ chối; không tìm cách bypass. Các lệnh
static/runtime/TUI nối sau không chạy vì full fail. T0 đã GREEN nên mode còn lại
được gọi tường minh, không lặp syntax qua verify hoàn tất. Tại mốc đó validation
bắt buộc chưa đầy đủ. GREEN cũ bên dưới là lịch sử, không bằng chứng cho đợt sửa
này. Không commit, đổi provider hoặc governor host runtime.

### Tiếp nối validation cuối — GREEN

Chỉ thêm hai mapping docs hành chính chính xác. Regression classifier hiện có
kiểm tra cả hai quyết định docs-only và giữ `.opencode/unknown.md` bị chặn. Không
chạy lại regression cô lập: RED/GREEN sửa lỗi giữ bên trên; thay đổi cấu hình được
validation bằng full bắt buộc, gồm tests mapping.

Review một `node scripts/arms-test.mjs verify --plan`, rồi chạy `verify` một lần;
cả hai dùng `--task sprint-1.1-review-fix` và `--file` lặp cho mười path:
`sandbox/process-output.mjs`, `scripts/test-map.mjs`, `tests/sprint11.test.mjs`,
`scripts/test-policy.json`, `tests/test-runner.test.mjs`, `.opencode/sprint11-fix.md`,
`.opencode/sprint11-review.md` và ba tài liệu báo cáo/review/hướng dẫn.
Input policy/test mới cần T0 mới. Full bao phủ related; classifier output dùng
chung yêu cầu smoke. Không gọi smoke độc lập hoặc buộc chạy lại.

| Lệnh / bước verify | Kết quả | Thời lượng |
|---|---|---:|
| `node scripts/arms-test.mjs verify --plan` đủ phạm vi trên | Đã review; không trở ngại | Không ghi nhận |
| `node scripts/arms-test.mjs verify` đủ phạm vi trên: syntax | PASS 5/5 | 520ms |
| Cùng verify: full | PASS 88/88 | 13065ms |
| Cùng verify: smoke-static | PASS 8/8 | 458ms |
| Cùng verify: build tiên quyết | PASS | 138631ms |
| Cùng verify: smoke-runtime | PASS 5/5 | 149579ms |
| Cùng verify: tui-smoke | PASS 4/4 | 57214ms |
| `npm run test:policy` | 0 phát hiện; chỉ báo cáo | Không ghi nhận |
| `node scripts/test-map.mjs` | Hợp lệ; không lệch nguồn | Không ghi nhận |

Log cuối dưới `.openarms/logs/`:
- `syntax-63512111b2672f0378fc92ef-35f480a0-e306-4e11-ad35-a4078d7fcb44.log`
- `full-63512111b2672f0378fc92ef-dfff66f2-648a-4023-8365-4f713fcb0cec.log`
- `smoke-static-63512111b2672f0378fc92ef-a5e36ba9-f74e-41fd-b05e-94b6fc62f8fb.log`
- `build-63512111b2672f0378fc92ef-86bba908-03b7-403f-a078-30840b90a3ce.log`
- `smoke-runtime-63512111b2672f0378fc92ef-c1400001-26b5-4926-8c18-b5139bc72c82.log`
- `tui-smoke-63512111b2672f0378fc92ef-56ae112e-6a85-4948-9bcb-f6d1d4813663.log`

TUI dùng lại image build phù hợp. Validation bắt buộc hoàn tất; không còn trở
ngại trong phạm vi sửa. Edit báo cáo cuối chỉ ghi kết quả thật; không test lại
input code/test đã đạt mà không đổi. Kết quả cũ bên dưới vẫn là lịch sử. Không
tuyên bố nghiệm thu Sprint 1.2/1.3 hay toàn Phase 1.

## Phạm vi và bảng bằng chứng

| Task | Triển khai | Bằng chứng |
|---|---|---|
| TSK-101 | Hợp đồng TS dùng chung + ví dụ có type, đặc tả thứ tự/fallback bắt buộc | tests/sprint11.test.mjs |
| TSK-102 | Tái dùng runner syntax/related/full ổn định; tích hợp quyết định manifest | tests/test-runner.test.mjs, tests/test-process.test.mjs |
| TSK-103 | Đếm pass TAP, summary passed/total, UNPARSEABLE_TEST_OUTPUT | tests/sprint11.test.mjs, tests/test-process.test.mjs |
| TSK-104 | Định danh trace băm, fsync trước công bố path, không path khi ghi lỗi | tests/sprint11.test.mjs, tests/test-process.test.mjs |
| TSK-105 | scripts/test-map.json + validator/resolver độc lập | CLI manifest, tests/sprint11.test.mjs |
| TSK-106 | Lệch thư mục cấu hình, chẩn đoán thiếu/xóa/trùng/casing | tests/sprint11.test.mjs |

Không triển khai TSK-107–116. Không đổi package selection/task lock/provider.

## Kiểm tra thực tế

- RED: `node scripts/arms-test.mjs related --file tests/sprint11.test.mjs --task sprint-1.1`:
  exit 1, 151ms, 0/2 pass. Hai regression bắt summary thiếu passed/total và logPath
  vẫn được quảng cáo khi ghi thất bại. Log `.openarms/logs/related-c193353d639b-76642670-dacf-46df-b295-c6e3c2c59f19.log`.
- Đã yêu cầu đọc full failure log bằng read tool nhưng bị quyền `*.log` từ chối.
  Không bypass hoặc chạy lại lỗi không đổi. Summary đủ xác định hai assertion lỗi.
- Syntax lần đầu: PASS 9/9 kiểm tra, 458ms. CLI manifest PASS; policy 0 phát hiện.
- Full lần đầu: FAIL 81/86, 3827ms. Chẩn đoán từ summary/test smoke được nêu tên:
  validation manifest toàn cục chặn fixture một phần. Sửa validation chỉ phần
  chọn lọc, không nới validator hoặc giả resolver production.
- Verify cuối (một lần): syntax PASS 9/9, 507ms; full FAIL 85/86, 13136ms;
  trở ngại duy nhất summary chỉ ra: `.opencode/handoff.md` có sẵn chưa có mapping
  classifier. Log
  `.openarms/logs/full-63512111b2672f0378fc92ef-30fcaaa3-2ea2-41cc-8737-5d2f28f2ffe2.log`.
  Bổ sung mapping docs chính xác cho handoff và `process.md` đã nêu trong brief.
  Không sửa nội dung có sẵn. Regression Sprint11 đạt trong lượt này;
  chưa tuyên bố full GREEN. Smoke chưa chạy vì verify dừng khi full fail.

### Revision cuối — GREEN

Các mode còn lại chạy tường minh sau sửa classifier, không lặp `verify` và không
chạy related thêm trên revision đã được full bao phủ. Mỗi lệnh runner dùng
`--task sprint-1.1` và `--file` lặp cho đủ 14 path ở phần phạm vi.

| Lệnh/mode | Kết quả thực tế | Thời lượng | Log dưới `.openarms/logs/` |
|---|---|---:|---|
| `node scripts/arms-test.mjs syntax …` | PASS 9/9 checks | 450ms | `syntax-63512111b2672f0378fc92ef-a40429cf-68ff-4cb3-a3a7-f35586d130d5.log` |
| `node scripts/arms-test.mjs full …` | PASS 86/86 tests | 13134ms | `full-63512111b2672f0378fc92ef-ca24ccf5-e9df-4954-96a4-dc04596e5af5.log` |
| `node scripts/arms-test.mjs smoke-runtime …` — static tiên quyết | PASS 8/8 kiểm tra | 410ms | `smoke-static-63512111b2672f0378fc92ef-ccd7fafa-8bc3-44f2-96cc-aa3b8b066557.log` |
| Build tiên quyết runtime | PASS | 69752ms | `build-63512111b2672f0378fc92ef-b7c894b3-9321-4dbd-922b-357cad2071a6.log` |
| Smoke runtime | PASS 5/5 kiểm tra | 79045ms | `smoke-runtime-63512111b2672f0378fc92ef-04252dcf-ebe0-459c-81f4-782978809a74.log` |
| `node scripts/arms-test.mjs tui-smoke …` | PASS 4/4 checks | 56250ms | `tui-smoke-63512111b2672f0378fc92ef-8aa90488-d325-41c8-8db1-df3348f58369.log` |
| `npm run test:policy` cuối | 0 phát hiện, chỉ báo cáo | Không ghi nhận thời lượng | stdout |
| `node scripts/test-map.mjs` | Hợp lệ, không lệch nguồn | Không ghi nhận thời lượng | stdout |

Lượt TUI dùng lại static pass/image phù hợp, không build/static thừa. Docker/
Python/PTY có sẵn, không trở ngại capability tích hợp. Chạy tích hợp vì classifier
shared-output/process yêu cầu, không vì sprint thêm governor hook host. RED cô
lập 151ms; bằng chứng GREEN regression nằm trong full bắt buộc (13.134s), không
phải lượt cô lập thứ hai dưới 2s.

### File thay đổi (14)

`src/output-governor.ts`; `scripts/test-map.mjs`; `scripts/test-map.json`;
`scripts/test-policy.mjs`; `scripts/test-policy.json`; `scripts/test-process.mjs`;
`sandbox/process-output.mjs`; `tests/sprint11.test.mjs`; `tests/test-process.test.mjs`;
`docs/reports/report_sprint_11.md`; `docs/reports/phase1--ponytail-review.md`;
`docs/testing/how_to_test/Sprint_11.md`; `docs/README.md`;
`docs/testing/how_to_test_overview.md`.

Trạng thái triển khai/regression TSK-101–106: đã kiểm chứng trong phạm vi nền tảng
trên. Giữ checkbox roadmap; báo cáo cung cấp bằng chứng, không tuyên bố nghiệm
thu toàn Phase 1. Edit sau kiểm tra chỉ ghi kết quả thật trong tài liệu; input
code/test không đổi và không lặp tests đã đạt.

## Lệnh

[Hướng dẫn kiểm thử](../../testing/how_to_test/Sprint_11.md) · [Tổng kết Phase 1](../phase1-review.md) · [Ca sandbox](../../testing/how_to_test/Sandbox.md).
Phạm vi task gồm hợp đồng, manifest/resolver, policy, process/output, hai file
test, báo cáo/review/hướng dẫn và hai mục lục. Full bắt buộc do hạ tầng dùng chung/
kiểm thử; runtime/TUI smoke chỉ do classifier quy định cho process/output dùng chung.

## Giới hạn

Hợp đồng nền tảng không có hook runtime. Giới hạn cứng, bộ compact và rollout
shadow chưa được kiểm chứng trong sprint này. Raw log có thể chứa secret trong
nội dung, không dùng secret trong filename mặc định. Không tuyên bố tích hợp/an
toàn đã đạt khi chưa chạy.
