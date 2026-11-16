# Báo cáo Sprint 0.4 — Triển khai thực tế, đo lường và nghiệm thu

## Phần triển khai

- TSK-019: kiểm thử runner/cache/process hiện có, bổ sung tests pre-push/báo cáo.
- TSK-020: fixture CLI static/build/runtime/cleanup/stamp/cache; kiểm tra force,
  mất hiệu lực khi server đổi, ổn định khi docs đổi và CI bỏ cache.
- TSK-021: `test:pre-push` chủ động chọn full + smoke chọn lọc trong một lượt;
  không tự cài hook; CI đặt `CI=true`, thiếu khả năng bắt buộc thì blocked.
- TSK-022: bảng quyết định, hướng dẫn lập trình viên và
  [Sprint_04.md](../../testing/how_to_test/Sprint_04.md).
- TSK-023: đã có `test:acceptance` và mẫu review; **PENDING_OBSERVATION**.

## Kết quả kiểm chứng

Phạm vi validation Sprint 0.4 đã đạt: T0 7 file; full **75/75** tests;
static **8**, runtime **5**, TUI **4** kiểm tra. Build một lần (~155 giây),
TUI dùng lại image phù hợp. Container/volume `openarms-smoke` sau chạy đều rỗng.
Báo cáo bypass **0 phát hiện**. Không dùng fixture làm cohort rollout.

Full log: `.openarms/logs/full-c1bd63d0abed-f5930436-404d-407f-916e-4916e62a616c.log`.
Runtime log: `.openarms/logs/smoke-runtime-fd9f448065c6-df563d15-c314-4f73-b653-15797abf5a51.log`.
TUI log: `.openarms/logs/tui-smoke-14dcb0fdcca5-a5daf3e0-5f49-4190-b62d-471a7e94689c.log`.
Log cục bộ chịu thời hạn lưu, không phải artifact vĩnh viễn.

Báo cáo tại mốc đó có baseline **1 task/1 run**, rollout **4 task**; baseline chỉ có
sandbox-test, chưa có smoke nên chưa tính được tỷ lệ giảm. Không so trực tiếp
wait của hai cohort khác scope để kết luận hiệu quả.

## Nghiệm thu Phase 0

Chưa có baseline/rollout đại diện đủ dữ liệu để công nhận giảm >=50%.
Báo cáo không tự công nhận nghiệm thu. Review output vào context, khả năng chẩn
đoán đúng, regression lọt qua và coverage ranh giới theo Sprint_04. Xem số liệu bằng
`npm run test:acceptance`; không tạo 10 task giả.

[Toàn bộ ca sandbox và giới hạn bằng chứng](../../testing/how_to_test/Sandbox.md).
