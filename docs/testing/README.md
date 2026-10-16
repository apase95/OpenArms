# Tài liệu Kiểm thử & Chất lượng (Testing & QA)

Thư mục này chứa toàn bộ quy chuẩn, chính sách kiểm thử phân tầng, hợp đồng môi trường hộp cát (sandbox) và các kịch bản kiểm thử (runbooks) của OpenArms.

---

## 🧭 Cẩm nang Chọn Tài liệu Kiểm thử

| Bạn muốn làm gì? | Tài liệu cần đọc |
|---|---|
| **Decompiler/service/transactional writer Sprint 4.3 (API-only, unregistered)** | [Sprint 4.3](how_to_test/Sprint_43.md) |
| **Quét an toàn và staged audit (không install)** | [Sprint 4.2](how_to_test/Sprint_42.md) |
| **Kiểm thử foundation nhập skill (chưa có TUI install)** | [Sprint 4.1: offline scope/fetch/archive](how_to_test/Sprint_41.md) |
| **Xem bảng lệnh chạy test, phân tầng T0-T3 và chính sách test-policy** | [**`testing.md`**](testing.md) |
| **Hiểu cách tự kiểm tra và đọc kết quả test** | [**`how_to_test_overview.md`**](how_to_test_overview.md) |
| **Kiểm thử thủ công giao diện TUI, dialog, lề cân và modal** | [**`manual-testing.md`**](manual-testing.md) |
| **Hiểu cơ chế cache pass-only, fingerprint và Docker sandbox** | [**`smoke-contract.md`**](smoke-contract.md) |
| **Kiểm tra hợp đồng nạp thư viện cục bộ (Single Library)** | [**`how_to_test/Single_Library.md`**](how_to_test/Single_Library.md) |
| **Thiết lập và chạy môi trường Docker Sandbox** | [**`how_to_test/Sandbox.md`**](how_to_test/Sandbox.md) |
| **Xem kịch bản test của một Sprint cụ thể** | [**`how_to_test/Sprint_XX.md`**](how_to_test/) |

---

## ⚡ Các lệnh Kiểm thử Nhanh thường dùng

```bash
# 1. Xem trước kế hoạch kiểm thử theo file thay đổi
node scripts/arms-test.mjs verify --plan --file <đường_dẫn_file>

# 2. Kiểm tra cú pháp (T0)
node scripts/arms-test.mjs syntax

# 3. Chạy test liên quan đến file vừa sửa (T1)
node scripts/arms-test.mjs related

# 4. Xác minh hoàn tất trước khi commit (T0 + T1)
node scripts/arms-test.mjs verify

# 5. Chạy kiểm thử smoke hộp cát Docker (T3)
npm run test:smoke-static
npm run test:smoke-runtime
npm run test:tui-smoke
```

---

## 📁 Cấu trúc Thư mục

- `testing.md`: Tài liệu kỹ thuật chi tiết nhất về hạ tầng kiểm thử, timeout, chính sách retention và tra cứu lệnh.
- `how_to_test_overview.md`: Hướng dẫn tự kiểm tra dành cho contributor.
- `manual-testing.md`: Danh mục kịch bản thao tác thực tế bằng tay trên terminal.
- `smoke-contract.md`: Hợp đồng kỹ thuật của runner với Docker và PTY.
- `registry-v2-valid.json` & `registry-v2-invalid.json`: Fixtures dữ liệu cho unit test (Vui lòng không di chuyển hoặc xóa).
- `how_to_test/`: Thư mục chứa 15+ runbook kiểm thử chi tiết từ Sprint 0.1 đến nay.
