# Hướng dẫn kiểm thử — Sprint 0.4

[Hướng dẫn chung](../how_to_test_overview.md) · [Bảng lệnh](../testing.md) · [Toàn bộ ca sandbox](Sandbox.md)

## Chọn cách thử

CI đã có gate integrity synthetic [Sprint 2.1](Sprint_21.md) trước runtime full
qua runner. Gate không thay smoke hoặc rollout thật; evidence lịch sử giữ nguyên.

Chạy từ root. Nếu đã có full verification trên cùng code, đọc lại log đó.
Fixtures tạo bản sao tạm và Docker giả, không sửa sandbox thật.

```bash
node scripts/arms-test.mjs related --file tests/test-runner.test.mjs --file tests/smoke-runner.test.mjs --file tests/test-process.test.mjs --file tests/phase0-report.test.mjs
```

**Đạt:** `PASS: related`. Mở file sau `log=`, tìm các bài bên dưới; kết quả là `ok`.
Fixture là tình huống giả kiểm tra phần mềm, không phải task rollout thật.

## TSK-019 — Runner và policy

Xem các nhóm strict arguments, paths, configured rules, related tests,
fingerprints, stamps, concurrent invocations, summary, timeout và retention.
Các bài thử đầu vào đúng/sai; không cần Docker thật.

- `separate Node processes coordinate one owner for a fingerprint`: ba process
  gọi cùng input nhưng chỉ một process thực thi.
- `pre-push runs full once and preserves selective integration and unknown blocking`:
  full thay related, server không kéo TUI, unknown vẫn blocked.
- `test-process.test.mjs`: kiểm tra log, timeout, signal, retry guard.

**Đạt:** các bài `ok` và không có test bị bỏ qua ngoài dự kiến.

## TSK-020 — Toàn bộ đường chạy smoke

Tìm `CLI orchestration builds once, stamps pass, reuses, forces and invalidates;
CI distrusts stamps`. Bài chạy CLI trong bản sao tạm: static → build → runtime
→ cleanup → stamp; lần hai và sau edit docs skip; force, server edit và CI
chạy lại. Bộ đếm xác nhận bốn runtime executions và bốn cleanup.

**Boundary thật:** đọc log verify có smoke thật đã chạy. Nếu chưa có lượt phù hợp,
chạy một lần `npm run test:smoke-runtime` với Docker/Compose hoạt động. Mở full log
để xem server startup/tool registration. Kiểm tra cleanup:

```bash
docker ps -a --filter name=openarms-smoke --format '{{.Names}}'
docker volume ls --filter name=openarms-smoke --format '{{.Name}}'
```

**Đạt:** smoke PASS và danh sách rỗng khi không có smoke khác đang chạy.
Cache hit là dùng lại kết quả, không phải lần smoke thật mới.

## TSK-021 — Opt-in trước push / CI

Thay `origin/main` bằng mốc Git phù hợp:

```bash
npm run test:pre-push -- --base origin/main --plan
npm run test:pre-push -- --base origin/main
```

**Đạt:** full required, related `COVERED_BY_FULL`, smoke đúng boundary.
Docs-only trong loop skip code nhưng pre-push chủ động full. Không tự cài hook.
CI dùng cùng command với `CI=true`, fetch đủ history/base. Nếu cần TUI, cung cấp
Linux/macOS + Python/PTY + Docker; thiếu thì blocked. CI không tin local stamps.

**Regression fixture:** ở bản sao/nhánh thử, thêm assertion sai vào test đã map,
chạy pre-push: phải fail với tên test/full log, rồi hoàn lại đúng edit. Không cần
lặp thủ công nếu log automated tests đã xác nhận failure/exit propagation.

## TSK-022 — Người mới chọn đúng lệnh

Mở [bảng quyết định](../testing.md), chọn sau edit/cuối task/trước push và xem plan.
Server-only không kéo TUI; docs-only trong loop không code test. Không chạy tuần
tự sandbox test + runtime + TUI mặc định. Khi fail đọc log trước retry;
`--force --reason` chỉ dùng sau chẩn đoán.

## TSK-023 — Rollout và nghiệm thu

1. Giữ baseline thật đủ bốn command theo bảng lệnh; không chạy legacy mỗi task
   để tạo số đẹp. Baseline thiếu thì giữ pending.
2. Task thực tế chạy `npm test -- --task <task-id>`; ID ngắn không chứa bí mật.
3. Thu ít nhất 10 task đại diện hoặc một tuần: docs/server/TUI/core/sandbox và lỗi
   cần chẩn đoán; ghi scope và boundary bắt buộc.
4. Chạy `npm run test:acceptance`: so wait/task, smoke executions/task, raw bytes/task,
   phân biệt cache hits/override, không đếm runner và smoke-result hai lần.
   Startup fail cũng là execution; xem log để xác nhận số OpenCode starts.
5. Điền bảng dưới và cập nhật report. Context bytes là output thực gửi vào assistant,
   gồm summary và log đã mở; raw bytes không thay thế chỉ số này.

| Task / scope | Wait ms | OpenCode starts | Duplicate / force / CI | Context bytes | Chẩn đoán đúng / tổng lỗi | Regression lọt | Boundary / log |
|---|---:|---:|---|---:|---|---|---|
| task thật | ... | ... | ... | ... | ... | ... | ... |

**Đạt Phase 0:** smoke starts/task giảm >=50% so baseline, không bỏ boundary;
cùng input không lặp nếu không override, server-only không TUI, docs-only không
code test, summary bounded/full log và full validation bắt regression. So cohort
tương đương, review duplicate candidates baseline (không phải cache key).
Thiếu mẫu/chỉ số thì **PENDING_OBSERVATION**, không tick TSK-023. Nếu chưa giảm
50%, ghi rule/path gây rerun; không nới cache để đạt chỉ tiêu.
