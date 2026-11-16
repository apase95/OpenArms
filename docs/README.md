# OpenArms — bắt đầu từ đây

OpenArms 0.2 có hai chức năng: **trình duyệt skill native** và **rút gọn tool output**
cho OpenCode. [README dự án](../README.md) chứa hướng dẫn cài đặt; phần dưới giúp bạn
chọn đúng tài liệu, không cần đọc toàn bộ cây thư mục.

## Chọn lộ trình

| Bạn muốn… | Đọc theo thứ tự |
|---|---|
| Sử dụng lần đầu | [Cài đặt](../README.md#cai-dat) → [Skills](skills.md) → [Output và logs](output.md) |
| Nâng cấp bản cũ | [Migration](migration.md) → [Nghiệm thu](verification.md#manual-acceptance) |
| Kiểm tra kết quả bàn giao | [Trạng thái kiểm chứng](verification.md#evidence) → [Checklist nghiệm thu](verification.md#manual-acceptance) |
| Sửa code / xây tính năng | [Kiến trúc](architecture.md) → [Development](development.md) → [Verification](verification.md) |
| Tìm ý tưởng tham khảo | [Harness notes](harnesses.md) — đọc tùy chọn, không phải roadmap |

## Mỗi chủ đề chỉ có một nơi chuẩn

| Trang | Chịu trách nhiệm | Không chứa |
|---|---|---|
| [skills.md](skills.md) | Library, browser, request và lỗi skill | Cài plugin, test commands |
| [output.md](output.md) | Compaction, giới hạn, log privacy và retention | Usage dashboard hoặc budget |
| [architecture.md](architecture.md) | Ownership, module map, luồng dữ liệu | Hướng dẫn sử dụng lặp lại |
| [development.md](development.md) | Quy trình sửa code và quy tắc maintain | Bản sao checklist nghiệm thu |
| [verification.md](verification.md) | Commands, evidence và release gates | Tuyên bố live pass không có bằng chứng |
| [migration.md](migration.md) | Config/data/deploy/rollback khi nâng cấp | Script tự sửa môi trường người dùng |
| [harnesses.md](harnesses.md) | Nguồn kiến trúc bên ngoài và bài học giới hạn | Cam kết thêm tính năng mới |

Lỗi được tra ngay trong trang tính năng tương ứng; không có một FAQ lặp lại mọi nội dung.
Mọi checkbox nghiệm thu chưa đánh dấu đều là việc **chưa được xác nhận hoàn tất**.

## Tài liệu trước cải tổ

Các phase tasklists, sprint reports và archive cũ đã được gỡ khỏi cây docs để tránh
nhầm hợp đồng lịch sử với sản phẩm hiện tại. Chúng vẫn còn trong
[snapshot Git `75afd87`](https://github.com/apase95/OpenArms/tree/75afd87/docs/archive).
Snapshot có lệnh và đường dẫn cũ; chỉ tra cứu, không chạy như hướng dẫn cho 0.2.

Ba bản nghiên cứu dài trước đây được tóm lược thành [Harness notes](harnesses.md);
quy trình nâng cấp thực tế nằm ở [Migration](migration.md), không phải audit/FIX IDs cũ.
