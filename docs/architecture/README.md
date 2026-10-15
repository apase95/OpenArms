# Kiến trúc Hệ thống OpenArms (System Architecture)

Thư mục này chứa các tài liệu kiến trúc chính thức mô tả nguyên lý thiết kế, ranh giới hệ thống và các mô hình quản trị dữ liệu của OpenArms.

---

## 🏛️ Tài liệu Kiến trúc

| Tài liệu | Nội dung trọng tâm | Đối tượng |
|---|---|---|
| [**Tổng quan Hệ thống (System Overview)**](openarms-overview.md) | Hiện trạng kiến trúc Single Local Library, mô hình nạp skill, và định hướng mở rộng runtime. | Contributor mới, Developer |
| [**Bản đồ Kiến trúc Chi tiết (Architecture Deep Dive)**](Architecture.md) | Sơ đồ Mermaid đầy đủ, ranh giới 3 lớp (Host / Adapter / Core), mô hình phân quyền, an toàn dữ liệu và các bất biến kiến trúc. | System Architect, Core Dev |

---

## 🔑 Nguyên lý Kiến trúc Cốt lõi

1. **Ranh giới Host rõ ràng:** OpenArms chỉ quản lý danh mục skill, trạng thái nạp và quản trị ngân sách/output. Toàn bộ quyền thao tác file, lệnh shell và thực thi mô hình LLM thuộc về **OpenCode Host**.
2. **Single Local Library:** Mỗi dự án tự chọn duy nhất 1 thư mục thư viện skill (`library root`). Không tự động quét ngoài thư mục hoặc merge từ nhiều nguồn không rõ ràng.
3. **An toàn dữ liệu (Safe Paths & Containment):** Nạp skill chỉ thông qua `load_skill({skill})` với định danh chính xác, không dùng đường dẫn động để chống tấn công Path Traversal.
4. **Ghi đĩa Nguyên tử (Atomic Operations):** Mọi cấu hình project trong `.openarms/` đều được bảo vệ bởi writer lock và ghi nguyên tử qua file tạm.
