# Quy chuẩn Viết & Quản lý Tài liệu (Documentation Guidelines)

Tài liệu là một phần cốt lõi của dự án OpenArms. Mọi tính năng, thay đổi kiến trúc hoặc kiểm thử đều cần được ghi nhận minh bạch để giúp cộng đồng và các contributors mới dễ dàng tiếp cận và mở rộng hệ thống.

---

## 1. Cấu trúc Phân tầng của `docs/`

```text
docs/
├── README.md               # Trung tâm điều hướng tổng thể (Master Portal)
├── contributing/           # Tài liệu hướng dẫn dành riêng cho Contributor
├── templates/              # Biểu mẫu tài liệu chuẩn (ADR, Feature Spec, Sprint Runbook, Report)
├── architecture/           # Bản vẽ kiến trúc, ranh giới host/plugin, thiết kế luồng dữ liệu
├── guides/                 # Hướng dẫn sử dụng & vận hành tính năng thực tế
├── testing/                # Bảng lệnh kiểm thử, chính sách phân loại, kịch bản test
│   └── how_to_test/        # Runbooks kiểm thử chi tiết theo từng sprint/tính năng
├── roadmap/                # Kế hoạch phát triển tổng thể theo Phase (Phase 0 đến Phase 5)
└── reports/                # Báo cáo đánh giá hoàn thành, phân tích tối ưu & lịch sử sprint
    ├── overview/           # Báo cáo tổng quan môi trường & tối ưu hóa chi phí
    └── sprints/            # Báo cáo kết quả chi tiết từng sprint
```

---

## 2. Quy tắc Đặt tên File & Thư mục

- **Chữ thường và gạch ngang (kebab-case):** Luôn dùng chữ thường phân cách bởi dấu `-` (ví dụ: `my-new-guide.md`, `openarms-overview.md`).
- **Tuyệt đối không dùng dấu cách (No whitespace):** Dấu cách gây lỗi mã hóa `%20` trên trình duyệt và các công cụ dòng lệnh markdown.
- **Tiền tố rõ ràng:**
  - Kịch bản test: `Sprint_XX.md` hoặc `feature-name.md` trong `docs/testing/how_to_test/`.
  - Báo cáo sprint: `report_sprint_XX.md` trong `docs/reports/sprints/`.

---

## 3. Quy tắc Liên kết Tương đối (Relative Links)

Khi tạo liên kết giữa các tài liệu markdown, luôn tuân theo các nguyên tắc sau:
1. **Sử dụng đường dẫn tương đối (Relative paths):** Không dùng đường dẫn tuyệt đối của máy cá nhân (như `/home/user/...`) trong markdown công khai.
2. **Kiểm tra độ sâu thư mục (Directory depth):**
   - Từ `docs/testing/how_to_test/Sprint_01.md` liên kết sang `docs/reports/sprints/`: cần dùng `../../reports/sprints/report_sprint_01.md`.
   - Từ `docs/architecture/` liên kết sang `docs/testing/`: cần dùng `../testing/testing.md`.
3. **Cập nhật mục lục:** Sau khi thêm file mới, luôn bổ sung liên kết tương ứng vào [`docs/README.md`](../README.md) hoặc README của thư mục con.

---

## 4. Tái sử dụng Templates Chuẩn

Không cần tự viết từ đầu! Khi cần tạo tài liệu mới, hãy copy khung sườn có sẵn trong [`docs/templates/`](../templates/README.md):

- Khi ghi nhận quyết định kiến trúc: Sử dụng [`adr-template.md`](../templates/adr-template.md).
- Khi viết hướng dẫn tính năng mới: Sử dụng [`feature-spec-template.md`](../templates/feature-spec-template.md).
- Khi tạo hướng dẫn test nghiệm thu: Sử dụng [`sprint-test-guide-template.md`](../templates/sprint-test-guide-template.md).
- Khi viết báo cáo tổng kết sprint: Sử dụng [`sprint-report-template.md`](../templates/sprint-report-template.md).

---

## 5. Ngôn ngữ & Phong cách Viết

- **Ngôn ngữ chính:** Tiếng Việt rõ ràng, chuẩn mực kỹ thuật, kết hợp với các thuật ngữ tiếng Anh chuyên ngành (như *Single Library, Safe Path, Atomic Write, Fail-closed, Context Window*).
- **Rõ ràng và minh bạch:** Nêu rõ những gì **đã hoạt động trong source** và những gì **chỉ là đề xuất tương lai trong roadmap** để người đọc không bị nhầm lẫn.
