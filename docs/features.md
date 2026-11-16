# OpenArms 0.2 — tính năng

## Giữ lại

### 1. Native skill browser

- `/skills` lấy catalog qua `app.skills({directory})` của OpenCode.
- Lọc bằng host selection dialog, xem tên/description/location/content preview.
- Tất cả skill host trả về hợp lệ đều khả dụng, không ON/OFF và không persisted selection.
- Metadata lỗi/tên trùng trong response được gắn ERROR và không thể request.
- Request in draft append một chỉ dẫn gọi native skill tool; không inject body,
  reset draft, auto-submit, đổi model hoặc thay host permissions.
- Không scan filesystem, parse frontmatter hay cài library thay cho host.

### 2. Output compactor

- Supported host tools: `bash`, `read`, `grep`, `glob`, `list`.
- Domain compactors: test, build/compiler, linter, git diff; file-inspection guard.
- Generic head/tail fallback, UTF-8-safe clipping và cap cuối 50.000 byte.
- Giữ nguyên title/metadata; không suy đoán hoặc ghi đè exit code.
- Native `skill` và custom tool output bypass hoàn toàn.

### 3. Logs tối thiểu để truy xuất

- Chỉ save khi kết quả bị biến đổi; lưu observed original trước khi publish text mới.
- `.openarms/logs/output-<uuid>.log`, file 0600, thư mục private, không symlink redirect.
- Không telemetry database, usage aggregate, policy ledger hay savings dashboard.
- Retention best-effort chỉ cho tên output artifacts mới; legacy data không tự bị dọn.
- Lưu lỗi → marker `LOG_WRITE_FAILED`; không quảng bá path đã lưu thành công.

## Đã gỡ khỏi runtime/codebase active

Usage/budget/context meter; audit/download/decompile/install skill; registry/hash approvals;
grants, task locks, project toggles; automatic skill injection; handoff/rotation/lifecycle;
controller/scout/implementer workflow; telemetry/shadow/file-access policy engine;
sandbox/PTY và multi-tier testing platform; registry-integrity CI.

Bundled `skills/` giữ nguyên nội dung/license, không tự chạy scripts hay tự đăng ký.
Old runtime data, global OpenCode config và installed code không bị tự sửa/xóa.

## Chưa cam kết

- Host báo được mọi invalid file: native discovery có thể bỏ qua file lỗi/resolve trùng trước API.
- Model thực sự gọi/tuân thủ skill chỉ vì request đã append.
- Native append endpoint có atomic ownership giữa nhiều TUI clients.
- Output cap kiểm soát toàn context/native skill, hoặc compaction giữ mọi diagnostic.
- Logs không chứa secret; sanitizer/redaction không có trong MVP này.
- Live-host/TUI/provider acceptance: phải ghi kết quả manual riêng.

Tham khảo [architecture](architecture/Architecture.md),
[migration](guides/migration.md), [output](guides/output-compaction.md).
