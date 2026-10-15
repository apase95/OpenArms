# Báo cáo Kỹ thuật & Lịch sử Tiến hóa (Technical Reports & History)

Thư mục này lưu trữ các báo cáo nghiên cứu, đánh giá cột mốc và kết quả thực hiện qua các giai đoạn phát triển của dự án OpenArms.

> [!NOTE]
> **Phân biệt Hiện tại và Lịch sử:**
> - **Kiến trúc hiện hành:** Là mô hình **Single Local Library** (mỗi dự án chọn 1 thư viện cục bộ, nạp qua `load_skill({skill})`, trạng thái Selected/Loaded/Missing - xem [`Single_Library.md`](../testing/how_to_test/Single_Library.md)).
> - **Các báo cáo Sprint cũ (Phase 0 đến Sprint 2.3):** Ghi lại quá trình thử nghiệm, đo đạc dữ liệu và các mô hình trước đó (như phê duyệt mã băm SHA256, transaction grants phức tạp). Đây là tài liệu bằng chứng lịch sử, không phải hướng dẫn cài đặt hiện tại.

---

## 📑 Danh mục Báo cáo

### 1. Đánh giá Tổng thể Giai đoạn (Phase Reviews)
- [**Phase 0 Review — Kiểm soát Chi phí Kiểm thử**](phase0-review.md): Đánh giá phân tầng test T0-T3, giảm thời gian phản hồi, cache pass-only và cô lập smoke sandbox.
- [**Phase 1 Review — Runtime Governance & Output Control**](phase1-review.md): Đánh giá output governor, đo lường telemetry và ranh giới với OpenCode host.

### 2. Báo cáo Chuyên đề & Thiết kế (Topic & Design Reports)
- [**Thiết kế lại Thư viện Skill (Skill Library Redesign)**](skill-library-redesign.md): Báo cáo bước chuyển đổi sang mô hình Single Local Library tinh gọn.
- [**Báo cáo Sự cố Người dùng Sandbox (Sandbox User Bugs)**](sandbox-user-bugs.md): Phân tích các lỗi tương tác TUI, dialog và xử lý terminal.
- [**Báo cáo Môi trường OpenArms**](overview/OpenArms.md): Báo cáo phân tích môi trường router ban đầu.
- [**Báo cáo Tối ưu hóa Task v1, v2, v3**](overview/Task_Optimization_Report_v3.md):
  - [Bản v1](overview/Task_Optimization_Report_v1.md) · [Bản v2](overview/Task_Optimization_Report_v2.md) · [Bản v3](overview/Task_Optimization_Report_v3.md): Tiến trình phân tích chi phí ngữ cảnh và chiến lược quản trị runtime.

### 3. Báo cáo Chi tiết theo Sprint (Sprint Reports)

Các báo cáo được lưu trữ tại [`sprints/`](sprints/):

| Sprint | Báo cáo | Trọng tâm chính | Kịch bản kiểm thử |
|---|---|---|---|
| **Sprint 0.1–0.3** | [report_sprint_01_02_03.md](sprints/report_sprint_01_02_03.md) | Phân tầng test T0-T3, fingerprint cache, runner thống nhất | [Sprint 0.1](../testing/how_to_test/Sprint_01.md)–[0.3](../testing/how_to_test/Sprint_03.md) |
| **Sprint 0.4** | [report_sprint_04.md](sprints/report_sprint_04.md) | Rollout quan sát thực tế và baseline | [Sprint 0.4](../testing/how_to_test/Sprint_04.md) |
| **Sprint 1.1** | [report_sprint_11.md](sprints/report_sprint_11.md) | Manifest kiểm thử và bằng chứng thực tế | [Sprint 1.1](../testing/how_to_test/Sprint_11.md) |
| **Sprint 1.2** | [report_sprint_12.md](sprints/report_sprint_12.md) | Output Governor, tool policy và giới hạn host | [Sprint 1.2](../testing/how_to_test/Sprint_12.md) |
| **Sprint 1.3** | [report_sprint_13.md](sprints/report_sprint_13.md) | Kiểm chứng cục bộ & rollout | [Sprint 1.3](../testing/how_to_test/Sprint_13.md) |
| **Sprint 2.1** | [report_sprint_21.md](sprints/report_sprint_21.md) | Tooling kiểm tra tính toàn vẹn registry | [Sprint 2.1](../testing/how_to_test/Sprint_21.md) |
| **Sprint 2.2** | [report_sprint_22.md](sprints/report_sprint_22.md) | Core Verified API & budget response | [Sprint 2.2](../testing/how_to_test/Sprint_22.md) |
| **Sprint 2.3** | [report_sprint_23.md](sprints/report_sprint_23.md) | Tích hợp verified tool & persisted state v2 | [Sprint 2.3](../testing/how_to_test/Sprint_23.md) |
| **Sprint 2.4** | [report_sprint_24.md](sprints/report_sprint_24.md) | TUI contract & runbook matrix | [Sprint 2.4](../testing/how_to_test/Sprint_24.md) |
| **Sprint 3.1** | [report_sprint_31.md](sprints/report_sprint_31.md) | Budget/Usage store & TUI picker | [Sprint 3.1](../testing/how_to_test/Sprint_31.md) |
| **Sprint 3.2** | [report_sprint_32.md](sprints/report_sprint_32.md) | Proactive warnings & writer locks | [Sprint 3.2](../testing/how_to_test/Sprint_32.md) |
