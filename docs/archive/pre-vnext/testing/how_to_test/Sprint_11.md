# Hướng dẫn kiểm thử — Sprint 1.1

[Hướng dẫn chung](../how_to_test_overview.md) · [Bảng lệnh](../testing.md) · [Báo cáo](../../reports/sprints/report_sprint_11.md) · [Ca sandbox và giới hạn bằng chứng](Sandbox.md)

Chạy từ repository root, Node 22+ và dependencies đã cài. Không cần provider cho regression cô lập.

Mapping mới cho standalone registry tooling xem [Sprint 2.1](Sprint_21.md).
Các số bên dưới là lịch sử Sprint 1.1, không phải kết quả tooling v2.

```bash
node scripts/arms-test.mjs related --file tests/sprint11.test.mjs --task sprint-1.1
node scripts/test-map.mjs
npm run test:policy
```

Đợt sửa nghiệm thu dùng task `sprint-1.1-review-fix`. File kiểm thử cô lập còn
kiểm tra nhiều lỗi TAP tách nhau, loại trùng/giới hạn thu thập và từ chối symlink
ở thư mục/thành phần cấu hình cũng như file/thư mục con.
Kết quả lịch sử: RED 5/7, 171ms; GREEN 7/7, 159ms; syntax 3/3, 342ms.
Full ban đầu 87/88, 11979ms, bị chặn bởi brief chưa được phân loại.
Lượt tiếp nối cuối chỉ phân loại `.opencode/sprint11-fix.md` và
`.opencode/sprint11-review.md` thành docs; đường dẫn hành chính lạ vẫn bị chặn.
`verify` cuối theo phạm vi: syntax 5/5 (520ms), full 88/88 (13065ms), static 8/8 (458ms),
runtime 5/5 (149579ms), TUI 4/4 (57214ms); build tiên quyết đạt (138631ms).
Báo cáo policy: 0 phát hiện; manifest hợp lệ, không lệch nguồn. Không còn trở ngại.
Lặp `--file` cho `sandbox/process-output.mjs`, `scripts/test-map.mjs`,
`tests/sprint11.test.mjs`, `scripts/test-policy.json`, `tests/test-runner.test.mjs`,
hai brief hành chính và ba đường dẫn báo cáo/review/hướng dẫn của đợt đó.
Review một `verify --plan` đủ phạm vi rồi chạy `verify` một lần cho đầu vào thay đổi.
Full bao phủ related; static/runtime/TUI chỉ chạy trong verify vì bộ phân loại
yêu cầu. Lượt tiếp nối cuối không lặp lại regression sửa lỗi cô lập.

Kết quả mong đợi: regression PASS một dòng có `<passed>/<total> pass`; manifest in
`test-map: valid; no source drift`; policy báo finding thực tế, không chạy automation.
Không chạy related nếu full vừa kiểm chứng cùng revision. Manifest CLI là validation
cấu hình độc lập, không phải bypass test suite.

| Task | Bằng chứng / thao tác |
|---|---|
| TSK-101 | `src/output-governor.ts` export contract, thứ tự pipeline và ví dụ pass/fail/truncated; regression kiểm tra exit/byte metadata |
| TSK-102 | `tests/test-runner.test.mjs`, `tests/test-process.test.mjs`: strict modes, selective command arrays, exit/signal/timeout |
| TSK-103 | Ca thành công Sprint11 kiểm tra `passed`/`total`; ca biên kiểm tra cơ chế dự phòng; kiểm thử hồi quy tiến trình giữ lỗi biên dịch đầu tiên và phần cuối khi kết thúc |
| TSK-104 | Ca biên cố ý dùng thư mục log không tồn tại: mã thoát 7 giữ nguyên, đường dẫn là `undefined`, cảnh báo `LOG_WRITE_FAILED`; kiểm thử tiến trình kiểm tra byte thô/quyền 0600/thời hạn lưu giữ |
| TSK-105 | Bộ xác thực manifest độc lập, bộ phân giải tất định, tài liệu không chọn kiểm thử, kiểm thử thay đổi tự chạy, cơ chế dự phòng theo tên file, từ chối đường dẫn không an toàn |
| TSK-106 | Fixture tạo nguồn mới thiếu kiểm thử khiến kiểm tra lệch nguồn thất bại, thêm ánh xạ thì đạt; lỗi xóa/trùng lặp/sai chữ hoa-thường có hướng sửa manifest |

Kiểm thử `full` và smoke do bộ phân loại yêu cầu là bắt buộc khi thay đổi phần xử lý
tiến trình/đầu ra dùng chung. Xem kế hoạch toàn phạm vi trong báo cáo; không tự thêm
bộ chặn, chế độ quan sát hay triển khai giới hạn cứng (thuộc Sprint 1.2). Hợp đồng
là yêu cầu cho bộ điều hợp tương lai, chưa có bộ điều hợp đầu ra công cụ trên host
nào được nối vào hợp đồng.
