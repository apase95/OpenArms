# Tổng kết Phase 1 — Output governor và policy quan sát

## Kết quả chung

Phase 1 đã triển khai nền tảng kiểm thử, output governor, policy evaluator, preset giảm noise và telemetry cục bộ. Sprint 1.3 đã hoàn thành **TSK-113** với kiểm thử và validation bắt buộc. **Toàn Phase 1 chưa được nghiệm thu**: bằng chứng host hook thật, cohort bảy ngày hoạt động và quyết định nghiệm thu còn thiếu.

## Những gì đã đạt được

### 1. Nền tảng và contract — Sprint 1.1

- Contract TypeScript chung xác định input/output, metadata, thứ tự lưu raw log trước compact và fallback; không đổi exit code để biến thất bại thành thành công.
- Tái sử dụng runner `syntax|related|full`; parser trả số pass/total, giữ lỗi đầu và tối đa 16 tên failure TAP không trùng trong giới hạn 30 dòng chẩn đoán.
- Log sink dùng định danh băm và tên chống collision, quyền owner-only, flush/fsync trước khi công bố path. Lỗi ghi/flush/close không được quảng cáo đã có full log.
- Manifest có version và resolver/validator độc lập; kiểm tra đường dẫn, casing, entry trùng, file mất và drift trong thư mục nguồn cấu hình. Symlink được phát hiện, không bị traversal âm thầm.

### 2. Governor, policy và telemetry — Sprint 1.2

- Pipeline compact thuần, tất định: chuẩn hóa xuống dòng, loại ANSI/OSC/control, head/tail theo UTF-8, bảo toàn ranh giới code point và metadata byte/dòng lược bỏ; marker dành riêng được escape.
- Guard cuối giới hạn text **50.000 byte UTF-8**, kể cả khi parser lỗi và khi thêm cảnh báo/log reference. Raw output được gửi tới log sink trước biến đổi.
- Preset environment theo executable/subcommand allowlist được áp dụng opt-in cho process có cấu trúc; command lạ/default giữ nguyên, không rewrite shell string và không thêm `--silent` toàn cục. Stderr và exit code được bảo toàn.
- Evaluator thuần hỗ trợ `off|shadow|active`; adapter SDK chỉ quan sát shadow, không có active enforcement trên host. Rule theo loại file, size/line và override có regression; lockfile không bị deny mặc định và vẫn có đường search/range hoặc đọc theo nhu cầu trước install.
- Telemetry v1 dùng trường allowlist, validation, định danh tuple và dedup retry trong retention; aggregate phục vụ đo bytes/caps/decisions. Không lưu raw output, nội dung file, environment hay command chưa redaction; lỗi sink không làm tool call thất bại.

### 3. Kiểm chứng cục bộ và hỗ trợ rollout — Sprint 1.3

- TSK-113 bao phủ ANSI/OSC, CRLF, Unicode, empty/binary-like output, marker và metadata chính xác, tính tất định, cap tuyệt đối, parser/log failure và thứ tự lưu raw input.
- Fixture process thật trong repository tạm kiểm tra selection syntax/related/full, assertion/compile failure, timeout/signal, exit code, log, concurrency và cleanup. Fixture SDK after-hook kiểm tra raw log, metadata và shadow read không bị chặn; đây không phải bằng chứng host gọi hook thật.
- `reviewShadow` hỗ trợ tổng hợp cohort/policy cố định, ngày hoạt động, rule/action/false-positive review, bytes, cap, lỗi log và full runs/task; loại fixture và xử lý duplicate/conflict. Helper không chứng thực nhãn quan sát hoặc tự phê duyệt active.
- Đã sửa lỗi đếm full runs lịch sử khi task trùng tên: chỉ tính record có UTC hợp lệ, khớp policy/cohort và cặp task/ngày hoạt động; giữ run thất bại đã thực thi, loại invocation bị blocked.

## Bằng chứng kiểm thử đã ghi nhận

Đây là **kết quả lịch sử trong báo cáo sprint**, không phải kiểm thử lại của lần thay tài liệu này.

| Phạm vi cuối được ghi nhận | Kết quả | Thời lượng chính |
|---|---|---|
| Sửa review Sprint 1.1 | Syntax 5/5; full **88/88**; static 8/8; runtime 5/5; TUI 4/4; bypass 0; manifest hợp lệ, không drift | Syntax 520 ms; full 13.065 ms |
| Sửa review Sprint 1.2 | Syntax 7/7; full **99/99**; static 8/8; runtime 5/5; TUI 4/4; bypass 0 | Syntax 460 ms; full 13.535 ms |
| Sửa review Sprint 1.3 | Syntax **2/2**; full **104/104** | Syntax 441 ms; full 12.349 ms |

Regression riêng Sprint 1.3 cho lỗi inclusion đã thể hiện RED 4/5 (1.672 ms), rồi GREEN 5/5 (1.717 ms); validation cuối bao gồm assertion timestamp bổ sung. Smoke không bị ảnh hưởng trong phạm vi sửa Sprint 1.3 nên không chạy. Syntax xác minh parse/import, không thay thế semantic TypeScript typecheck.

Review độc lập cục bộ sau sửa đã xác nhận finding mức medium được đóng và không thấy lỗi mới rõ ràng trong phạm vi được xem. **Kết quả review sạch này không phải nghiệm thu Phase 1**, cũng không chứng minh host hook hoặc rollout thực tế.

## Điều kiện còn lại và giới hạn

| Gate | Bằng chứng còn thiếu |
|---|---|
| **TSK-114** | OpenCode host thực sự gọi after-hook cho read/bash do model thực hiện, có correlation log/telemetry, title/metadata giữ nguyên và shadow read không chặn |
| **TSK-115 — PENDING_OBSERVATION** | Ít nhất bảy ngày hoạt động thật, cohort/policy cố định, baseline so sánh được và sample size; review would-deny/would-ask, user action, false positive và incident |
| **TSK-116 — PENDING_ACCEPTANCE** | Tổng hợp fixture và telemetry thật, owner duyệt threshold theo rule, không còn lỗi nghiêm trọng/data loss; xác nhận enforcement và override trước khi chuyển active |

SDK nhận text đã được host buffer và gộp, không cung cấp chắc chắn stdout/stderr riêng hay exit status; không suy diễn metadata thiếu. Raw log vẫn có thể chứa secret dù owner-only; retention là best effort và có thể mất evidence. Telemetry thiếu timestamp/task/user action cần envelope quan sát riêng; record vắng mặt không chứng minh sink không lỗi. Chưa có dữ liệu thật để kết luận mức tiết kiệm hoặc false-positive rate; ngày fixture không được tính là rollout.

## Tài liệu liên quan

[Sprint 2.1 tooling độc lập](sprints/report_sprint_21.md) không hoàn tất host,
bảy ngày hoạt động hoặc owner gates Phase 1; các số lịch sử bên trên giữ nguyên.

[Sprint 2.2 verified core](sprints/report_sprint_22.md) thêm response budget/hash
trên fixtures, không chứng minh host after-hook hoặc chuyển active policy.

- [Roadmap Phase 1](../roadmap/Tasklist_Phase_1.md)
- [Báo cáo Sprint 1.1](sprints/report_sprint_11.md)
- [Báo cáo Sprint 1.2](sprints/report_sprint_12.md)
- [Báo cáo Sprint 1.3 và correction](sprints/report_sprint_13.md)
- [Hướng dẫn rollout Sprint 1.3](../testing/how_to_test/Sprint_13.md)
- [Hướng dẫn kiểm thử thống nhất](../testing/testing.md)
