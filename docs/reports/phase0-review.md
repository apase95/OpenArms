# Tổng kết Phase 0 — Phản hồi nhanh và kiểm soát chi phí kiểm thử

## Kết quả chung

Phase 0 đã xây dựng đường kiểm thử thống nhất, chọn phạm vi theo thay đổi, tái sử dụng smoke còn hiệu lực và giới hạn output đưa vào context nhưng vẫn giữ log chẩn đoán. Phần triển khai TSK-002–022 đã được kiểm chứng; **nghiệm thu toàn Phase 0 vẫn chờ quan sát thực tế** ở TSK-001 và TSK-023.

## Những gì đã đạt được

### 1. Một runner và chính sách kiểm thử rõ ràng

- `scripts/arms-test.mjs` thống nhất các tầng syntax, related, full và smoke; `verify --plan` giải thích phạm vi, lý do chạy/bỏ qua và điều kiện phụ thuộc trước khi thực thi.
- Mapping theo file chọn related tests ổn định, loại trùng; docs-only không chạy code test, server-only không mặc định chạy TUI. File chưa được phân loại trả `needs-review`, không âm thầm bỏ kiểm tra hoặc chạy tất cả.
- Guidance và báo cáo bypass đưa workflow về một điểm vào; pre-push/CI là opt-in, không tự cài hook hay sửa cấu hình toàn cục.

### 2. Smoke chọn lọc và tái sử dụng an toàn

- Tách static/offline, runtime OpenCode và TUI theo boundary; static chạy trước để phát hiện lỗi cấu hình sớm.
- Fingerprint theo nội dung và input liên quan tách riêng từng mode, có phân biệt thư viện repository/installed. Chỉ kết quả pass được lưu atomic và tái sử dụng; lock theo fingerprint chống chạy đồng thời trùng lặp.
- Build image có fingerprint/labels để tái sử dụng đúng input; `--force`, `--rebuild` và quy tắc CI giữ đường kiểm chứng tường minh. Smoke dùng project/volume tạm và có cleanup.

### 3. Output ngắn, log đầy đủ và kiểm soát thất bại

- Kết quả pass được tóm tắt một dòng; failure giữ lỗi đầu, tên test/stage và phần chẩn đoán hữu ích trong giới hạn 30 dòng, kèm full-log path hoặc lỗi ghi log minh bạch.
- Raw stdout/stderr được lưu trước parser; buffer và xử lý UTF-8/dòng có giới hạn bộ nhớ, retention bảo vệ log đang hoạt động.
- Failure signature chặn lần thử thứ ba của cùng lỗi trên cùng input; timeout/signal có termination và cleanup nhất quán cho process, container và port.

### 4. Công cụ rollout và đo lường

- Bổ sung kiểm thử runner/cache/process, fixture orchestration từ plan đến cached skip, cùng kiểm tra force, invalidation và CI bypass.
- Có `test:acceptance`, observation wrapper và mẫu review để so sánh baseline/rollout. Công cụ không tự công nhận nghiệm thu và không dùng fixture làm task quan sát thật.

## Bằng chứng kiểm thử đã ghi nhận

Các số dưới đây là **kết quả lịch sử của phạm vi triển khai**, không phải lượt chạy lại trong lần sửa tài liệu này.

| Mốc | Kết quả được ghi nhận |
|---|---|
| Sprint 0.1 | T0: 9 file; full: 42 test; build, server smoke và TUI smoke đạt; bypass: 0 |
| Sprint 0.2 | T0: 14 file; full: 58/58; static/runtime/TUI thật đạt; cached skip không start/build |
| Sprint 0.3 | T0: 11 file; full: 72/72; stress output 256 MiB, log integrity, retry, timeout/signal/cleanup đạt |
| Sprint 0.4 | T0: 7 file; full: **75/75**; static: **8**, runtime: **5**, TUI: **4** kiểm tra đạt; bypass: **0** |

Sprint 0.4 build một lần, TUI dùng lại image phù hợp; sau chạy không còn container/volume smoke tạm. Log local chịu retention, không phải artifact lưu vĩnh viễn.

## Điều kiện còn lại trước nghiệm thu

**TSK-023: `PENDING_OBSERVATION`; TSK-001 vẫn thiếu baseline đại diện.** Báo cáo Sprint 0.4 ghi baseline 1 task/1 run và rollout 4 task tại thời điểm đó; baseline chỉ có sandbox-test, chưa có mẫu smoke nên không tính được mức giảm smoke. Đây không phải số liệu cập nhật của phiên hiện tại.

Cần cohort task thật đủ đại diện theo roadmap, baseline đủ bốn command và review các boundary bắt buộc. Chỉ nghiệm thu khi chứng minh smoke runs/task giảm **ít nhất 50%**, không mất coverage, đồng thời đánh giá thời gian chờ, duplicate runs, context output, khả năng chẩn đoán và regression lọt qua. Không suy diễn tiết kiệm context từ số byte raw output, không so hai cohort khác phạm vi hoặc tạo task giả để đạt ngưỡng.

## Tài liệu liên quan

Sprint 2.1 thêm [tooling integrity/CI fixture](sprints/report_sprint_21.md), không
thay bằng chứng lịch sử hoặc nghiệm thu observation Phase 0 bên trên.

[Sprint 2.2 core độc lập](sprints/report_sprint_22.md) cũng không thay baseline,
rollout hay evidence smoke Phase 0; giữ các observation gates hiện tại.

- [Roadmap Phase 0](../roadmap/Tasklist_Phase_0.md)
- [Báo cáo Sprint 0.4](sprints/report_sprint_04.md)
- [Hướng dẫn kiểm thử thống nhất](../testing/testing.md)
- [Smoke contract](../testing/smoke-contract.md)
- [Hướng dẫn kiểm thử Sprint 0.4](../testing/how_to_test/Sprint_04.md)
