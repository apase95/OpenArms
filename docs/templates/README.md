# Biểu mẫu Tài liệu Chuẩn (Reusable Documentation Templates)

Thư mục này cung cấp các khung tài liệu chuẩn hóa nhằm giúp các contributors nhanh chóng tạo mới tài liệu chất lượng cao, đồng nhất về cấu trúc và dễ bảo trì trong suốt vòng đời dự án OpenArms.

---

## 📋 Danh sách Templates

| Template | File | Khi nào sử dụng? |
|---|---|---|
| **ADR (Architecture Decision Record)** | [`adr-template.md`](adr-template.md) | Khi đưa ra một quyết định kiến trúc quan trọng, đổi thư viện, hoặc thay đổi thiết kế cốt lõi. |
| **Feature / UX Specification** | [`feature-spec-template.md`](feature-spec-template.md) | Khi thiết kế hoặc ghi nhận một tính năng mới (ví dụ: giao diện TUI, API mới, logic governor). |
| **Sprint Test Guide (Runbook)** | [`sprint-test-guide-template.md`](sprint-test-guide-template.md) | Khi viết hướng dẫn kiểm thử chấp nhận (acceptance test guide) cho một sprint hoặc tính năng lớn. |
| **Sprint / Milestone Report** | [`sprint-report-template.md`](sprint-report-template.md) | Khi tổng kết kết quả thực hiện sprint, phân tích metric và ghi nhận các giới hạn kỹ thuật. |

---

## 🛠️ Quy tắc sử dụng

1. **Sao chép (Copy & Fill)**: Copy nội dung template sang thư mục đích tương ứng:
   - Quyết định kiến trúc mới: `docs/architecture/`
   - Đặc tả tính năng / Hướng dẫn: `docs/guides/`
   - Kịch bản test mới: `docs/testing/how_to_test/`
   - Báo cáo hoàn thành: `docs/reports/sprints/`
2. **Quy tắc đặt tên file**:
   - Dùng chữ thường, phân tách bằng dấu gạch ngang (kebab-case): `feature-name.md`, `report-sprint-XX.md`.
   - **Tuyệt đối không dùng dấu cách** trong tên file để tránh lỗi URL encoding (`%20`).
3. **Liên kết tương đối (Relative Links)**:
   - Luôn kiểm tra đường dẫn tương đối khi liên kết giữa các thư mục.
   - Tránh link tới các file tuyệt đối ngoài workspace.
4. **Cập nhật Index**:
   - Thêm tài liệu mới vào [docs/README.md](../README.md) hoặc README tương ứng của thư mục con.
