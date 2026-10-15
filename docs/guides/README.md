# Hướng dẫn Vận hành & Tính năng (Operational & Feature Guides)

Thư mục này chứa các tài liệu hướng dẫn chi tiết về tính năng, trải nghiệm người dùng (UX) và quy trình vận hành thực tế của OpenArms.

---

## 📚 Danh mục Hướng dẫn

| Hướng dẫn | Mục đích | Đối tượng |
|---|---|---|
| [**Local Usage & Budget UX**](budget-ux.md) | Cách dùng `/usage` và `/budget`, cấu hình ngưỡng cảnh báo, chỉnh sửa ngân sách project | Developer, Tester, User |
| [**Single Library Runtime Guide**](../testing/how_to_test/Single_Library.md) | Quy chuẩn chọn thư viện cục bộ (local library root), cơ chế nạp skill (`load_skill`), trạng thái Selected/Loaded/Missing | Developer, Integrator |
| [**Manual Testing Checklist**](../testing/manual-testing.md) | Kịch bản thao tác thủ công kiểm thử TUI, dialog, modal và kiểm tra lề giao diện | QA, Contributor |
| [**Sandbox Environment Guide**](../testing/how_to_test/Sandbox.md) | Thiết lập môi trường Docker sandbox cô lập để test server và TUI | DevOps, Tester |

---

## 💡 Hướng dẫn thêm tài liệu mới vào `guides/`

Khi phát triển một tính năng mới hoặc thay đổi hành vi tương tác người dùng:
1. Sử dụng biểu mẫu chuẩn tại [Feature Specification Template](../templates/feature-spec-template.md).
2. Mô tả rõ: Phạm vi tác động, giao diện lệnh/phím tắt, xử lý ngoại lệ và ranh giới bảo mật.
3. Cập nhật liên kết vào file [README.md này](README.md) và [docs/README.md](../README.md).
