# Hướng dẫn kiểm thử — Sprint 0.1

[Hướng dẫn chung](../how_to_test_overview.md) · [Bảng lệnh](../testing.md) · [Toàn bộ ca sandbox](Sandbox.md)

## Chọn cách thử

Tooling integrity mới xem [Sprint 2.1](Sprint_21.md); các ca runner dưới đây vẫn
giữ scope Phase 0. Non-smoke code/fixtures không chứng minh live library.

- Các ví dụ `--plan` có thể thử trực tiếp và không mở Docker.
- Script kiểm tra logic: `node scripts/arms-test.mjs related --file tests/test-runner.test.mjs`.
  Nếu đã chạy lượt Phase 0 hoặc full suite theo guide chung, mở log của lượt đó.
- Đây là checklist xác nhận tính năng; không cần chạy cả danh sách sau mọi edit.

## TSK-001 — Ghi nhận chi phí kiểm tra

**Vấn đề cần nhìn thấy:** kiểm tra tốn bao lâu, in bao nhiêu nội dung và có chạy lặp không.

1. Chọn ID cho một công việc thật, ví dụ `review-server-01`.
2. Khi công việc thực sự cần full tests, ghi nhận bằng:

   ```bash
   npm run test:baseline -- --command npm-test --task review-server-01
   npm run test:report
   ```

3. Với các lần kiểm tra sandbox thực sự cần chạy, chọn `sandbox-test`,
   `sandbox-smoke` hoặc `tui-smoke` ở bảng lệnh. Chuẩn bị image đúng code trước
   khi đo sandbox; wrapper đo không tự build. Không chạy đủ bốn loại cho mọi task.
4. Xem report và `.openarms/test-runs.jsonl`.

**Đạt ở mức công cụ:** report có task ID, thời gian, số lần chạy và dung lượng
output; bản ghi có command và kết quả. **Đạt cả task:** đủ 10 công việc hoặc một
tuần hoạt động, có dữ liệu của cả bốn command và đã xem lại các lần có thể trùng.
`PENDING_OBSERVATION` khi thiếu mẫu là trạng thái đúng, không phải lỗi.

## TSK-002 — Chọn đúng loại kiểm tra

**Vấn đề cần nhìn thấy:** sửa nhỏ không kéo theo các kiểm tra đắt tiền không liên quan.

Chọn ví dụ cần đối chiếu:

```bash
node scripts/arms-test.mjs verify --file docs/testing/testing.md --plan
node scripts/arms-test.mjs verify --file plugins/server-core.ts --plan
node scripts/arms-test.mjs verify --file plugins/skill-router-tui.tsx --plan
node scripts/arms-test.mjs verify --file src/state-store.ts --plan
```

**Đạt:** tài liệu skip code tests; server facade chọn related và skip smoke;
TUI adapter chọn static + TUI; shared state chọn full, không mặc định TUI smoke.
Trong bảng, `required` là cần chạy, `recommended` là bước nhanh được đề xuất,
`skipped` là bỏ qua và `blocked` là chưa thể chạy.

## TSK-003 — Một runner chung

**Vấn đề cần nhìn thấy:** lệnh hợp lệ chạy đúng bước; lệnh sai dừng rõ ràng.

```bash
npm run test:syntax -- --file src/commands.ts
node scripts/arms-test.mjs verify --khong-hop-le
```

**Đạt:** lệnh đầu trả `PASS: syntax` kèm log; lệnh thứ hai báo `CONFIG_ERROR` và
`Unknown argument`, không chạy tests/Docker. Chạy từ root repository.
Script `test-runner.test.mjs` còn kiểm tra mã thoát và timeout bằng chương trình thử.

## TSK-004 — Chọn tests liên quan

**Vấn đề cần nhìn thấy:** file được chọn dẫn tới đúng bài test, không bị nhân đôi.

```bash
node scripts/arms-test.mjs related --file src/state-store.ts --file registry.json --plan
node scripts/arms-test.mjs related --file tests/core.test.ts --plan
```

**Đạt:** state/registry liên quan `core.test.ts` và `server.test.ts`; test file chọn
chính nó. Muốn xác nhận loại bỏ trùng, xem bài `related tests are stable,
deduplicated and include changed tests themselves` trong log script.

Thử file chưa có mapping bằng tên giả, chỉ dùng để xem kế hoạch:

```bash
node scripts/arms-test.mjs verify --file src/manual-unmapped-probe.ts --plan
```

**Đạt:** báo `needs-review` / `NEEDS_REVIEW`, không âm thầm bỏ qua hoặc chạy toàn
bộ tests. Ví dụ này không cần tạo file thật.

## TSK-005 — Xem trước kế hoạch

**Vấn đề cần nhìn thấy:** biết bước nào sẽ chạy trước khi chờ tests hoặc Docker.

```bash
node scripts/arms-test.mjs verify --file sandbox/config/opencode.json --plan
```

1. Xem tên file, loại thay đổi, status, reason, dependency và cache trong bảng.
2. So lại với phần server config: cần static + runtime, không cần TUI.
3. Nếu cần xác nhận tính ổn định, dùng bài `dry-run output is deterministic and
   verify schedules each smoke once` trong script, thay vì mở OpenCode lặp lại.

**Đạt:** chỉ xuất bảng kế hoạch, không có tiến trình build/startup mới. Host thiếu
Docker có thể báo `blocked`; đó là thông tin điều kiện chạy, không phải tự chạy Docker.

## TSK-006 — Báo lệnh đi ngoài policy

**Vấn đề cần nhìn thấy:** automation gọi trực tiếp lệnh cũ được nhắc nhở, không bị khóa workflow.

1. Trong bản sao thử, tạo một file mới `automation/manual-policy-probe.sh`
   chứa một dòng `npm test`. Không ghi đè file có sẵn; chọn tên khác nếu cần.
2. Chạy `npm run test:policy`.
3. Đổi dòng đó thành `node scripts/arms-test.mjs verify`, rồi chạy lại báo cáo.
4. Xóa đúng file probe vừa tạo sau khi kiểm tra.

**Đạt:** lần đầu có `REPORT_ONLY` và `TEST_POLICY_BYPASS` chỉ tới probe; lần sau
finding của probe biến mất. Báo cáo không tự thực thi file shell hoặc cài Git hook.
Các finding khác, nếu có, cần được đọc theo file mà báo cáo chỉ tới.
