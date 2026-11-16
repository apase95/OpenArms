# Archive — trước OpenArms 0.2

**Chỉ đọc để tham khảo lịch sử. Không phải docs vận hành, test instructions hoặc roadmap
hiện hành. Không chạy các lệnh trong snapshot với bản mới.**

`pre-vnext/` giữ nguyên cây docs và những ghi chép nghiên cứu đã có trước redesign,
bao gồm các sửa đổi chưa commit từ task tài liệu trước. Chúng không bị viết lại để
trông như tính năng cũ vẫn tồn tại hoặc nghiệm thu mới đã diễn ra.

Nhiều đường dẫn/lệnh tương đối có thể không còn đúng sau chuyển archive hoặc vì
source/scripts đã gỡ. Snapshot không thuộc active link checks; tìm revision Git cũ
nếu cần tái dựng môi trường lịch sử. Những từ “current”, “done” hoặc checkbox trong
snapshot chỉ áp dụng tại thời điểm của nó, không có hiệu lực với 0.2.

## Ba bản tổng hợp nghiên cứu trước redesign

- [Audit source/installed runtime](pre-vnext/reports/overview/openarms-remediation-audit.md).
- [Kiến trúc và điểm hay của các harness](pre-vnext/reports/overview/agent-harness-architecture-survey.md).
- [Feature proposals control-plane](pre-vnext/reports/overview/openarms-feature-proposals.md).

Đề xuất traces/task protocol/context planner/recovery trong những bản này **đã được
thay bằng quyết định thu gọn**: native skill browser + output compactor. Không tiếp tục
implement FIX/F IDs cũ một cách tự động. Audit installed-only auto-prune vẫn là cảnh báo
vận hành cần review khi deploy, không phải feature của code mới.

## Nội dung được giữ

Architecture variants, phase tasklists, sprint evidence/runbooks, test infrastructure docs,
usage/budget, library grants/loaders, ingestion/install và handoff/workflow history.
Giữ snapshot không có nghĩa tiếp tục bảo trì code tương ứng.

Đọc [docs hiện hành](../README.md), [migration](../guides/migration.md) và
[architecture 0.2](../architecture/Architecture.md) để dùng sản phẩm mới.
