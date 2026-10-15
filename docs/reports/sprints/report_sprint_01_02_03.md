# Báo cáo Sprint 0.1, 0.2 và 0.3

**Ngày:** 07/10/2026. **Mục tiêu chung:** kiểm tra đúng phần cần thiết, giảm thời
gian chờ và giúp người dùng dễ hiểu kết quả khi có lỗi.
Nguồn công việc: [Danh sách task Phase 0](../../roadmap/Tasklist_Phase_0.md).

## 1. Ba sprint đã làm được gì?

| Sprint | Thay đổi dễ nhận thấy | Trạng thái |
|---|---|---|
| 0.1 — Chọn đúng bài kiểm tra | Một lệnh chung tự chọn các kiểm tra phù hợp với file đã sửa | TSK-002–006 hoàn tất; TSK-001 còn chờ dữ liệu thực tế |
| 0.2 — Tránh kiểm tra lặp | Tận dụng kết quả đã đạt nếu code và cấu hình liên quan vẫn giống nhau | TSK-007–013 hoàn tất |
| 0.3 — Đọc lỗi và xử lý lần chạy hỏng | Kết quả ngắn hơn, có bản ghi đầy đủ, ngăn thử lại cùng lỗi quá nhiều lần | TSK-014–018 hoàn tất |

## 2. Sprint 0.1 — Chọn đúng bài kiểm tra

- `npm test` là lệnh chính. Nó xem phần đã thay đổi rồi chọn bài kiểm tra, thay
  vì luôn kiểm tra toàn bộ dự án.
- Có thể xem trước bằng `--plan`. Ví dụ: sửa tài liệu sẽ bỏ qua kiểm tra code;
  sửa giao diện sẽ chọn kiểm tra giao diện.
- `--file` chỉ định file muốn kiểm tra; `--base` so sánh với một mốc Git.
- File mới chưa được khai báo sẽ báo `needs-review`: cần xác định cách kiểm tra
  cho file đó trước khi tiếp tục.
- Đã có công cụ ghi thời gian chờ và số lần chạy để so sánh về sau. Phần này
  chưa đủ mẫu: cần ít nhất 10 công việc thật hoặc một tuần hoạt động, có dữ liệu
  của bốn loại lệnh yêu cầu. Vì vậy TSK-001 vẫn chưa được đánh dấu hoàn tất.

## 3. Sprint 0.2 — Tránh làm lại việc đã kiểm tra

- Tách kiểm tra thành ba phần: cấu hình/file, máy chủ OpenCode và giao diện
  terminal. Phần cấu hình chạy trước; nếu lỗi thì dừng trước khi mở OpenCode.
- Sửa riêng phần máy chủ không tự động kéo theo kiểm tra giao diện. Tương tự,
  sửa riêng giao diện không làm mất kết quả máy chủ đã đạt.
- Mỗi phần có một “dấu nhận diện” tạo từ code, cấu hình và các đầu vào liên quan.
  Nếu dấu này còn giống lần đã đạt, runner trả `SKIP` và dùng lại kết quả.
- Chỉ kết quả thành công mới được dùng lại. Kết quả lỗi, bị hủy hoặc hết thời
  gian không được giữ như một lần kiểm tra đã đạt.
- Docker dùng lại bản môi trường thử nếu vẫn đúng code/cấu hình. `--force` chạy
  lại kiểm tra; `--rebuild` còn yêu cầu dựng lại môi trường.
- Mỗi lần kiểm tra OpenCode dùng dữ liệu thử riêng và dọn sau khi xong. Chế độ
  thư viện trong repository và thư viện đã cài trên máy được phân biệt rõ.

## 4. Sprint 0.3 — Kết quả ngắn nhưng vẫn tìm được lỗi

- Khi đạt, mỗi bước chỉ in một dòng gồm tên bước, số kiểm tra và thời gian.
- Khi lỗi, màn hình giữ tên bài/bước bị lỗi, thông tin cần thiết trong tối đa
  30 dòng và đường dẫn tới **log** — file ghi đầy đủ những gì chương trình đã in.
- Log được ghi trước khi rút gọn nội dung. Nếu không ghi được, runner báo
  `LOG_WRITE_FAILED`, thay vì nói rằng bản ghi đầy đủ đã được lưu.
- Dù chương trình in rất nhiều nội dung, runner chỉ giữ một phần đầu/cuối trong
  RAM. Bản đầy đủ nằm trong file để xem lại khi cần.
- Sau hai lần gặp cùng lỗi trên cùng đầu vào, lần thứ ba bị chặn. Người dùng cần
  đọc log, sửa nguyên nhân hoặc dùng `--force --reason "lý do chạy lại"`.
- Mỗi bước có thời gian chờ tối đa. Nếu bị treo hoặc người dùng hủy, runner dừng
  các chương trình liên quan và dọn môi trường thử; lỗi dọn dẹp không che lỗi gốc.
- Log cũ được dọn theo giới hạn 7 ngày, 200 file, 256 MiB. File đang ghi, file
  của lần vừa chạy và file mới dưới 60 giây được bảo vệ nên có thể tạm vượt giới hạn.

## 5. Kết quả đã ghi nhận

Các số dưới đây được ghi lúc hoàn tất từng sprint, không phải kết quả đo dài hạn.

| Sprint | Kết quả kiểm tra tự động | Kiểm tra OpenCode thật |
|---|---|---|
| 0.1 | 42/42 bài đạt; kiểm tra trong sandbox 30/30 đạt | Máy chủ và giao diện đạt |
| 0.2 | 58/58 bài đạt; gọi lại dùng kết quả cũ, không mở OpenCode thêm | Cấu hình, máy chủ và giao diện đạt |
| 0.3 | **72/72 bài đạt**; kiểm tra lỗi, log, thử lại và dọn dẹp đạt | Cấu hình, máy chủ và giao diện đạt |

Đã thử chương trình cố ý in **256 MiB** để kiểm tra việc lưu đầy đủ và giới hạn RAM;
thử chương trình bị treo để xác nhận cổng được giải phóng và lần chạy sau vẫn được.
Cũng đã kiểm tra lỗi dọn dẹp không thay thế lỗi ban đầu. Các thử nghiệm này dùng
tình huống tạo sẵn, giúp kiểm tra lỗi mà không cần làm hỏng môi trường đang dùng.

## 6. Tra cứu và việc còn lại

- [Danh sách lệnh](../../testing/testing.md): lệnh kiểm tra, skill, sandbox và chọn phạm vi.
- [Cách tự kiểm tra](../../testing/how_to_test_overview.md): từng task cần làm gì và nhìn kết quả ở đâu.
- [Chi tiết kiểm tra OpenCode](../../testing/smoke-contract.md): dành cho người cần xem sâu.
- [Toàn bộ ca sandbox](../../testing/how_to_test/Sandbox.md): static/runtime/TUI, thủ công và giới hạn bằng chứng.

Sprint 0.4 sẽ tập trung vào sử dụng thực tế và đo hiệu quả. Hiện chưa đủ dữ liệu
để khẳng định thời gian chờ hay số lần mở OpenCode đã giảm bao nhiêu phần trăm.
