# Tổng kết session — OpenArms

## Phạm vi
- Dùng `graphify` lưu sơ đồ project hiện tại.
- Dùng `ponytail` rà soát và sửa các vấn đề đến hết phase-0.
- Ưu tiên thay đổi nhỏ, tái dùng code và không thêm dependency.

## Công việc đã hoàn thành
- Tạo graph tương tác, dữ liệu JSON và báo cáo cấu trúc project.
- Thêm `.graphifyignore` để loại skill library, runtime state và output sinh tự động.
- Ignore `graphify-out/` trong Git và bổ sung mapping artifact vào test policy.
- Lưu review tại `docs/reports/phase0-ponytail-review.md`.
- Sửa acceptance report: lượt `blocked` không còn tính là smoke execution.
- Tách metadata phân loại khỏi smoke fingerprint; giữ execution settings liên quan.
- Đổi input hashing sang buffer 64 KiB, giữ byte framing và kiểm tra symlink.
- Giữ post-run fingerprint để phát hiện input thay đổi trong lúc chạy.
- Truyền cancellation tới smoke/build/failure lock; trả exit 130/143 khi hủy.
- Thêm regression tests cho retry accounting, invalidation, cancellation và memory.

## Kết quả kiểm tra
- Lượt verify sau sửa pass: syntax 14 inputs và full 81/81 tests.
- Static smoke 8 checks, OpenCode runtime 5 checks, PTY TUI 4 checks đều pass.
- Build một image và tái dùng cho TUI; policy bypass có 0 finding.
- Test bộ nhớ bao phủ hashing 128 MiB; test lock dùng hai tiến trình thật.

## Output và phần còn thiếu
- Graph cập nhật: 419 node, 908 cạnh, 28 nhóm; file tree: `graphify-out/GRAPH_TREE.html`.
- Graph hợp nhất có 0 dangling/missing endpoint, còn 3 self-loop; token usage chưa đo được.
- TSK-001/023 vẫn pending: baseline chỉ 1 task/1 ngày, chưa có mẫu smoke để chứng minh giảm ≥50%.
- Ghi nhận task thật `phase0-ponytail-fixes`; chưa commit hoặc push trong session này.
