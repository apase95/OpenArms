# ADR-[Số thứ tự]: [Tiêu đề Quyết định Kiến trúc ngắn gọn]

* **Trạng thái:** [Đề xuất (Proposed) | Chấp thuận (Accepted) | Bị thay thế bởi ADR-XXX (Superseded) | Bác bỏ (Rejected)]
* **Tác giả:** [Tên người đề xuất / Contributor]
* **Ngày:** [YYYY-MM-DD]
* **Liên quan:** [Link tới task, PR, issue, hoặc tài liệu liên quan]

---

## 1. Bối cảnh (Context & Problem Statement)

Mô tả ngắn gọn bối cảnh và vấn đề kỹ thuật cần giải quyết:
- Hiện trạng hệ thống đang như thế nào?
- Đâu là điểm nghẽn, rủi ro bảo mật, hoặc hạn chế cần cải tiến?
- Tại sao giải pháp hiện tại không còn phù hợp?

---

## 2. Tiêu chí Đánh giá (Decision Drivers)

Các yếu tố quan trọng quyết định sự lựa chọn:
- [ ] Tính cô lập và bảo mật (VD: không truy cập filesystem tùy tiện)
- [ ] Hiệu năng & chi phí kiểm thử (VD: thời gian chạy test, cache sha256)
- [ ] Trải nghiệm người dùng (VD: TUI mượt mà, phản hồi rõ ràng)
- [ ] Độ tương thích ngược với OpenCode host

---

## 3. Các Phương án đã Cân nhắc (Considered Options)

### Phương án A: [Tên phương án]
- **Mô tả:** [Tóm tắt cơ chế hoạt động]
- **Ưu điểm:** [Điểm mạnh]
- **Nhược điểm:** [Điểm yếu, rủi ro phát sinh]

### Phương án B: [Tên phương án]
- **Mô tả:** [Tóm tắt cơ chế hoạt động]
- **Ưu điểm:** [Điểm mạnh]
- **Nhược điểm:** [Điểm yếu, rủi ro phát sinh]

---

## 4. Quyết định (Decision Outcome)

**Phương án được chọn:** [Phương án A/B/...]

### Lý do lựa chọn:
[Giải thích ngắn gọn tại sao phương án này được ưu tiên dựa trên các tiêu chí ở Mục 2].

### Chi tiết giải pháp kỹ thuật:
- Cấu trúc dữ liệu / Schema:
- Module / File bị ảnh hưởng:
- Cơ chế xử lý lỗi (Fail-safe / Fail-closed):

---

## 5. Hệ quả & Rủi ro (Consequences)

### Tác động tích cực (Positive Consequences):
- [Những cải tiến đạt được]

### Tác động tiêu cực hoặc ràng buộc mới (Negative / Neutral Consequences):
- [Những giới hạn mới phát sinh, tài liệu cần cập nhật, migration cần làm]

---

## 6. Kế hoạch Kiểm chứng (Verification Plan)

- [ ] Unit / Integration tests cần thêm: `tests/[test-name].test.ts`
- [ ] Phân loại trong `scripts/test-policy.json`: `[class-name]`
- [ ] Kịch bản kiểm thử thủ công hoặc sandbox: [Link tới runbook]
