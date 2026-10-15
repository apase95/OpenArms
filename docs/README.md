# Trung tâm Tài liệu OpenArms (Documentation Portal)

Chào mừng bạn đến với trung tâm tài liệu của **OpenArms** — tiện ích mở rộng (plugin) điều hướng thư viện skill cục bộ, quản trị ngữ cảnh và kiểm soát ngân sách chạy trong nền tảng **OpenCode**.

---

## 🚀 Dành cho Contributor Mới (Quick Start & Onboarding)

Nếu bạn mới tham gia đóng góp cho dự án, hãy tham khảo các tài liệu nhập môn theo thứ tự sau:

1. 📖 [**Hướng dẫn Nhập môn (Getting Started Guide)**](contributing/GETTING_STARTED.md): Hướng dẫn từng bước từ cài đặt môi trường, cấu trúc mã nguồn, quy trình viết code đến kiểm thử nghiệm thu.
2. 🧠 [**Sơ đồ Tư duy Kiến trúc (Architecture Cheat Sheet)**](contributing/architecture-cheat-sheet.md): Hiểu nhanh ranh giới 3 lớp (OpenCode Host vs Plugin Adapters vs Core Runtime) và an toàn dữ liệu chỉ trong 3 phút.
3. ⚡ [**Quy chuẩn & Bảng lệnh Kiểm thử (Testing Guide)**](testing/testing.md): Nắm rõ phân tầng kiểm thử T0–T3, ma trận `test-policy.json` và unified runner `arms-test.mjs`.
4. 📝 [**Biểu mẫu Tài liệu Chuẩn (Reusable Templates)**](templates/README.md): Khung mẫu có sẵn cho ADR, Feature Spec, Test Runbook và Sprint Report.

---

## 🗺️ Bản đồ Thư mục Tài liệu (Documentation Structure)

Hệ thống tài liệu được tổ chức phân tầng rõ ràng theo từng mục đích sử dụng:

```text
docs/
├── README.md                      # [Trang hiện tại] Bản đồ điều hướng tài liệu tổng thể
├── budget-ux.md                   # Hướng dẫn nhanh tính năng /usage & /budget (symlink -> guides/)
│
├── contributing/                  # 🤝 Dành cho Lập trình viên & Contributor
│   ├── GETTING_STARTED.md         # Hướng dẫn nhập môn chi tiết từng bước
│   ├── architecture-cheat-sheet.md# Sơ đồ tư duy nhanh về luồng dữ liệu và ranh giới hệ thống
│   └── documentation-guide.md     # Quy chuẩn viết, đặt tên và quản lý liên kết tài liệu
│
├── templates/                     # 📋 Biểu mẫu Tái sử dụng (Reusable Templates)
│   ├── README.md                  # Hướng dẫn chọn và sử dụng template
│   ├── adr-template.md            # Mẫu ghi nhận quyết định kiến trúc (ADR)
│   ├── feature-spec-template.md   # Mẫu tài liệu đặc tả tính năng / UX Contract
│   ├── sprint-test-guide-template.md # Mẫu kịch bản kiểm thử nghiệm thu (Test Runbook)
│   └── sprint-report-template.md  # Mẫu báo cáo hoàn thành sprint / cột mốc
│
├── architecture/                  # 🏛️ Kiến trúc & Thiết kế Hệ thống
│   ├── README.md                  # Giới thiệu phân tầng kiến trúc
│   ├── openarms-overview.md       # Tổng quan hiện trạng và định hướng hệ thống
│   └── Architecture.md            # Bản đồ kiến trúc toàn diện (Mermaid, permission, safe paths)
│
├── guides/                        # 🛠️ Hướng dẫn Vận hành & Tính năng Thực tế
│   ├── README.md                  # Danh mục hướng dẫn
│   └── budget-ux.md               # Chi tiết giao diện lệnh /usage, /budget và cảnh báo ngưỡng
│
├── testing/                       # 🧪 Kiểm thử, Đo lường & Quy chuẩn Chất lượng
│   ├── README.md                  # Cẩm nang chọn bài kiểm tra phù hợp
│   ├── testing.md                 # Bảng tra cứu lệnh, phân tầng T0-T3, policy và timeout
│   ├── how_to_test_overview.md    # Hướng dẫn tự kiểm tra và đọc log kết quả
│   ├── manual-testing.md          # Checklist kịch bản thao tác thủ công trên TUI/terminal
│   ├── smoke-contract.md          # Hợp đồng smoke test, Docker container và cache pass-only
│   └── how_to_test/               # Kịch bản kiểm thử chi tiết theo từng sprint & tính năng
│       ├── Single_Library.md      # Contract kiểm thử vận hành thư viện cục bộ hiện hành
│       ├── Sandbox.md             # Kịch bản chạy kiểm thử hộp cát Docker offline
│       └── Sprint_01.md ... Sprint_32.md # Runbooks kiểm thử từ Sprint 0.1 đến Sprint 3.2
│
├── roadmap/                       # 🗺️ Lộ trình Phát triển theo Giai đoạn (Phases)
│   ├── README.md                  # Tổng quan lộ trình từ Phase 0 đến Phase 5
│   ├── Tasklist_Phase_0.md        # Phase 0: Kiểm soát chi phí test & phản hồi nhanh
│   ├── Tasklist_Phase_1.md        # Phase 1: Output Governor & giảm nhiễu ngữ cảnh
│   ├── Tasklist_Phase_2.md        # Phase 2: Thư viện cục bộ & Verified Loader
│   ├── Tasklist_Phase_3.md        # Phase 3: Quản lý ngân sách & Usage Telemetry
│   ├── Tasklist_Phase_3_v2.md     # Phase 3 v2: Domain-Aware Context Compactor
│   ├── Tasklist_Phase_4.md        # Phase 4: Intelligent Skill Package Manager
│   └── Tasklist_Phase_5.md        # Phase 5: Multi-agent Session Handoff & Lifecycle
│
├── reports/                       # 📊 Báo cáo Kỹ thuật & Bằng chứng Nghiệm thu
│   ├── README.md                  # Phân định báo cáo hiện hành vs lịch sử tiến hóa
│   ├── phase0-review.md           # Đánh giá hoàn thành Phase 0
│   ├── phase1-review.md           # Đánh giá hoàn thành Phase 1
│   ├── skill-library-redesign.md  # Báo cáo tái thiết kế thư viện skill tinh gọn
│   ├── sandbox-user-bugs.md       # Phân tích lỗi người dùng trên môi trường sandbox
│   ├── overview/                  # Báo cáo tổng thể môi trường & phân tích tối ưu chi phí (v1, v2, v3)
│   └── sprints/                   # Toàn bộ 11+ báo cáo nghiệm thu chi tiết từng sprint
│
└── assets/                        # 🎨 Tài nguyên đồ họa
    └── openarms-logo.svg          # Logo nhận diện thương hiệu OpenArms
```

---

## 🔑 Hợp đồng Vận hành Cốt lõi Hiện tại (Living Contracts)

Để tránh nhầm lẫn giữa các đề xuất trong quá khứ và tính năng đang hoạt động trong mã nguồn hiện tại, các lập trình viên cần lưu ý các tài liệu chuẩn sau:

1. **Thư viện Skill Cục bộ (Single Local Library):**
   - Tài liệu chuẩn: [`docs/testing/how_to_test/Single_Library.md`](testing/how_to_test/Single_Library.md).
   - Mỗi canonical project tự chọn đúng một thư mục thư viện (`library root`), ban đầu ở trạng thái `unset`. Nạp skill bằng `load_skill({skill})` với safe-path validation. Không cần quy trình cấp grant phức tạp hay phê duyệt hash thủ công.
2. **Quản trị Ngân sách & Đo lường (Usage & Budget UX):**
   - Tài liệu chuẩn: [`docs/guides/budget-ux.md`](guides/budget-ux.md).
   - Lệnh `/usage` và `/budget` hoạt động ở chế độ báo cáo (report-only), không tự ý chặn request của người dùng khi chưa cấu hình. Cảnh báo ngưỡng chạy theo chu kỳ và ghi nguyên tử vào file policy của dự án.
3. **Quy chuẩn Kiểm thử Nghiêm ngặt (Unified Test Runner):**
   - Tài liệu chuẩn: [`docs/testing/testing.md`](testing/testing.md) và [`AGENTS.md`](../AGENTS.md).
   - Chạy test thông qua `node scripts/arms-test.mjs verify --plan --file <paths>`. Mọi file mới bắt buộc phải được khai báo trong [`scripts/test-policy.json`](../scripts/test-policy.json).

---

## 🧭 Lộ trình Đọc Tài liệu theo Vai trò (Role-based Pathways)

| Vai trò của bạn | Lộ trình đọc khuyến nghị |
|---|---|
| **Lập trình viên Core / Backend** | [Getting Started](contributing/GETTING_STARTED.md) ➔ [Architecture](architecture/Architecture.md) ➔ [Testing Guide](testing/testing.md) ➔ [Tasklist Phase hiện tại](roadmap/Tasklist_Phase_3_v2.md) |
| **Lập trình viên TUI / UI Adapter** | [Getting Started](contributing/GETTING_STARTED.md) ➔ [Single Library Guide](testing/how_to_test/Single_Library.md) ➔ [Budget UX](guides/budget-ux.md) ➔ [Manual Testing](testing/manual-testing.md) |
| **Kỹ sư Kiểm thử / QA & DevOps** | [Testing Guide](testing/testing.md) ➔ [Smoke Contract](testing/smoke-contract.md) ➔ [Sandbox Guide](testing/how_to_test/Sandbox.md) ➔ [Sprint Runbooks](testing/how_to_test/) |
| **Người viết Tài liệu / Tech Writer** | [Documentation Guide](contributing/documentation-guide.md) ➔ [Reusable Templates](templates/README.md) ➔ [Overview Reports](reports/README.md) |
