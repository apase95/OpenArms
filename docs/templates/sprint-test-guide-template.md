# Kịch bản Kiểm thử Chấp nhận: Sprint [XX] / [Tên Tính năng]

> **Mục đích:** Hướng dẫn chi tiết từng bước kiểm thử chấp nhận (acceptance testing) cho các tính năng được phát triển trong Sprint [XX]. Tài liệu này dành cho developer, tester và reviewer độc lập để xác minh tính đúng đắn trước khi bàn giao.

* **Sprint:** [XX]
* **Các task liên quan:** [TSK-XXX, TSK-YYY]
* **Báo cáo hoàn thành liên quan:** [`report_sprint_XX.md`](../reports/sprints/README.md) *(Thay bằng link tới báo cáo sprint tương ứng)*

---

## 1. Điều kiện Tiên quyết (Preconditions & Environment)

Trước khi thực hiện các bài kiểm tra, đảm bảo môi trường đáp ứng:
- [ ] Node.js: `v18+` (kiểm tra bằng `node -v`)
- [ ] Dependencies đã cài đặt đủ: `npm install`
- [ ] Trạng thái git sạch hoặc nằm trên nhánh phát triển của tính năng: `git status`
- [ ] Docker daemon đang chạy (nếu bài test yêu cầu chạy sandbox): `docker info`

---

## 2. Kế hoạch Kiểm tra Nhanh Tự động (Automated Verification)

Chạy kế hoạch kiểm tra phân tầng theo quy chuẩn dự án:

```bash
# 1. Kiểm tra kế hoạch tác động (Verification Plan)
node scripts/arms-test.mjs verify --plan --file <danh_sách_file_thay_đổi>

# 2. Chạy cú pháp và type-check (T0)
node scripts/arms-test.mjs syntax

# 3. Chạy các unit/integration test liên quan (T1)
node scripts/arms-test.mjs related
```

---

## 3. Ma trận Ca Kiểm thử (Test Cases Matrix)

| ID | Tên ca kiểm thử | Môi trường | Dữ liệu đầu vào | Kết quả mong đợi | Trạng thái |
|---|---|---|---|---|---|
| TC-01 | [Khởi tạo trạng thái mặc định] | CLI / Unit | Dự án mới chưa cấu hình | Trả về `unset`, không lỗi runtime | 🟩 PASS |
| TC-02 | [Thao tác Hủy (Cancel)] | TUI Interactive | Bấm Esc hoặc chọn Cancel | Giữ nguyên trạng thái cũ, không ghi đĩa | 🟩 PASS |
| TC-03 | [Xác nhận ghi (Confirm)] | TUI Interactive | Điền giá trị hợp lệ -> Confirm | File config được ghi nguyên tử | 🟩 PASS |
| TC-04 | [Dữ liệu đầu vào không hợp lệ] | TUI / API | Chuỗi âm, ký tự đặc biệt | Hiển thị lỗi rõ ràng, chặn ghi file | 🟩 PASS |

---

## 4. Các Bước Thao tác Chi tiết (Step-by-step Manual Walkthrough)

### Ca 1: [Tên ca thao tác cụ thể]
1. Khởi động môi trường:
   ```bash
   [lệnh khởi động]
   ```
2. Thao tác trên giao diện:
   - Gõ lệnh: `/[command]`
   - Quan sát màn hình hiển thị: [...]
3. Kỳ vọng:
   - Mục `Status` hiển thị đúng giá trị.
   - Không xuất hiện log lỗi hoặc crash process.

---

## 5. Xử lý Sự cố & Khôi phục (Troubleshooting & Recovery)

Nếu xảy ra lỗi không mong muốn trong quá trình kiểm thử:
- **Xóa trạng thái tạm thời:**
  ```bash
  rm -rf <project>/.openarms/state.json
  ```
- **Kiểm tra log chi tiết:**
  Xem log đầy đủ tại `.openarms/logs/` hoặc thư mục log runner `tests/artifacts/`.
