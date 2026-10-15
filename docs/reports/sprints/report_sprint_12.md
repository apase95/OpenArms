# Báo cáo Sprint 1.2

## Phạm vi và bằng chứng

| Task | Triển khai | Bằng chứng |
|---|---|---|
| TSK-107 | Làm sạch thuần + head/tail UTF8; escape marker dành riêng | tests/sprint12.test.ts |
| TSK-108 | Guard cuối 50,000 byte; raw log hook trước biến đổi | Fixture lỗi parser/thuộc tính/hook |
| TSK-109 | Helper preset env cấu trúc phạm vi hẹp, không viết lại shell | Fixture npm/pnpm/yarn/pip/git/chương trình lạ |
| TSK-110 | Evaluator off/shadow/active thuần; SDK chỉ shadow | Fixture tất định/shadow/override |
| TSK-111 | Không chốt quyền lockfile; hướng dẫn search/range | Fixture lockfile trước install + hướng dẫn |
| TSK-112 | Telemetry allowlist v1 đã validation + tổng hợp | Fixture redaction/loại trùng/lỗi sink |

RED: `node --experimental-strip-types --test tests/sprint12.test.ts` lỗi thiếu
export compactOutput, 70.4 ms. GREEN ban đầu cùng file cô lập: 2/2 đạt, 109.0 ms.
Regression cô lập mở rộng: 7/7 đạt, 133.85 ms. Lệnh Node trực tiếp chỉ dùng minh
chứng RED/GREEN trước đăng ký manifest; source runner xác nhận path test tường
minh giới hạn Node execution.

Giới hạn đã biết: SDK output gộp, messageID tùy chọn/có thể thiếu, loại trùng trong
retention, quyền riêng tư path băm; không host enforcement active hoặc preset
shell string. Smoke health/registration không chứng minh tool do model gọi thực
thi hook; fixture hook SDK tập trung kiểm chứng phạm vi này không mock provider/
mạng. Raw log retention best effort; telemetry không là log command/nội dung.

Xem [hướng dẫn Sprint 1.2](../../testing/how_to_test/Sprint_12.md) về mặc định,
cấu hình, override và ma trận preset; [hướng dẫn sandbox](../../testing/how_to_test/Sandbox.md)
phân biệt health/registration với execution. Không tuyên bố dữ liệu quan sát/nghiệm thu Sprint 1.3.

## Kiểm chứng bắt buộc — 2026-10-10

Một `node scripts/arms-test.mjs verify --plan --task sprint-1.2` dùng `--file`
lặp cho đủ 18 path bên dưới. Plan: syntax, full, static/runtime; full bao phủ
related; TUI không bị ảnh hưởng. Validation ban đầu dùng mode còn lại tường minh
sau T0 không đổi. Revision sau làm escape marker không đổi độ dài byte và lưu
telemetry retry record atomic. Hoàn tất chạy `verify` đúng một lần cho revision
thay đổi đó, không chạy lại suite không đổi.

| Lệnh (cùng phạm vi và task ID) | Kết quả | Thời lượng | Log dưới `.openarms/logs/` |
|---|---|---:|---|
| `node scripts/arms-test.mjs syntax` (10 file code/config/test) | 10/10 đạt | 425 ms | syntax-63512111b2672f0378fc92ef-2e68c5f8-afbe-474a-b0a6-d45312c8148c.log |
| `node scripts/arms-test.mjs full` | 96/96 đạt | 13,523 ms | full-63512111b2672f0378fc92ef-a124ec36-6d11-49a3-952b-3ef815e3059e.log |
| `node scripts/arms-test.mjs smoke-runtime` — static tiên quyết | 8/8 đạt | 401 ms | smoke-static-63512111b2672f0378fc92ef-0e5ebbad-d0b5-46e8-97f0-74ef30b19555.log |
| Cùng lệnh — build image bắt buộc | đạt | 100,940 ms | build-63512111b2672f0378fc92ef-3d4b33d0-425d-4c81-b01f-9631de5e4d8c.log |
| Cùng lệnh — runtime | 5/5 đạt | 111,059 ms | smoke-runtime-63512111b2672f0378fc92ef-49ae27e8-bf28-42c1-8a32-0411c063a087.log |
| `npm run test:policy` | 0 phát hiện | Công cụ không báo thời lượng | Đầu ra terminal |

Hướng dẫn repository yêu cầu full cho shared/core và mapping thay đổi; bộ phân
loại yêu cầu runtime cho loader/adapter thay đổi. Runtime smoke xác minh binary/
config/registration, không tool execution do model. Không đổi provider.

Phạm vi chính xác: `src/output-governor.ts`, `src/package-loader.ts`, `src/tool-policy.ts`,
`src/governance-telemetry.ts`, `src/governance-hooks.ts`,
`plugins/skill-router-server.ts`, `tests/sprint12.test.ts`, `tests/server.test.ts`,
`scripts/test-map.json`, `scripts/test-policy.json`, `docs/README.md`,
`docs/architecture/Architecture.md`, `docs/roadmap/Tasklist_Phase_1.md`,
`docs/testing/testing.md`, `docs/testing/how_to_test_overview.md`,
`docs/testing/how_to_test/Sprint_12.md`, `docs/reports/report_sprint_12.md`,
`docs/reports/phase1--ponytail-review.md`.

Bỏ qua: TUI không bị ảnh hưởng, related/full lặp đã bao phủ, mở rộng tích hợp cần
model/provider và quan sát Sprint 1.3. Không thiếu capability bắt buộc. Không
tuyên bố nghiệm thu độc lập; còn chờ controller review mới.

### Revision cuối — một verify hoàn tất

`node scripts/arms-test.mjs verify --task sprint-1.2` với đúng phạm vi `--file`
lặp ở trên:

| Bước | Kết quả | Thời lượng | Log dưới `.openarms/logs/` |
|---|---|---:|---|
| syntax | 10/10 đạt | 417 ms | syntax-63512111b2672f0378fc92ef-651e635c-28f0-4b8c-bb3e-1e1788b75136.log |
| full | 96/96 đạt | 13,949 ms | full-63512111b2672f0378fc92ef-6a440a89-e777-4a9b-b0ce-e6e93622a439.log |
| smoke-static | Kết quả đạt được lưu đệm hợp lệ, fingerprint f36fa40c5342 | 0 ms | Log static ban đầu ở trên |
| build | đạt | 72,208 ms | build-63512111b2672f0378fc92ef-2558853d-9f43-4f1b-97c1-0792bb22eda2.log |
| smoke-runtime | 5/5 đạt | 83,638 ms | smoke-runtime-63512111b2672f0378fc92ef-62ff8780-db83-4e6a-8fa4-821953d819e7.log |

Không kiểm tra bắt buộc nào fail. Input automation policy không đổi sau báo cáo
bypass 0 phát hiện. Full cuối bao gồm fixture telemetry retry qua vòng đời plugin
và regression loader quá cỡ bảo toàn lock/history trước đó.

## Sửa theo review — sprint-1.2-review-fix

Phạm vi sửa: src/governance-hooks.ts, src/tool-policy.ts, src/noise-preset.mjs,
scripts/test-process.mjs, scripts/test-map.json, scripts/test-policy.json,
tests/sprint12.test.ts và tài liệu báo cáo/hướng dẫn/review/kiến trúc.
Giữ hành vi TSK107/108/111 trước; TSK109 áp opt-in cho process con cấu trúc thật;
TSK110 quan sát dòng, có regression chuyển off; TSK112 dùng JSON tuple cho định
danh đĩa nhất quán với loại trùng bộ nhớ.

Chẩn đoán cô lập RED/GREEN: `node --experimental-strip-types --test tests/sprint12.test.ts`
(`commandFor` xác nhận path Node chính xác giới hạn execution). RED 8/10,
206.67 ms: collision đĩa và env preset process con fail. Phát hiện off đã sửa
trong source được cấp: regression giữ config đạt trước edit; không tạo RED giả.
GREEN 10/10, 258.45 ms, gồm LINES 6,000 dòng ngắn, hai định danh lưu, env process
con fixture, unknown/default không đổi và bảo toàn stderr/exit. Giữ RED cũ bên
trên. Full/smoke bắt buộc do classifier cho process dùng chung thay đổi, không
phải mở rộng Sprint13 tùy chọn. Kết quả hoàn tất bên dưới.

Một `verify --plan --task sprint-1.2-review-fix` cấp đủ 11 path thay đổi trên bằng
`--file` lặp. Không needs-review. Sau syntax đạt mà input không đổi, hoàn tất dùng
mode còn lại theo AGENTS thay lặp T0 qua verify. Mọi lệnh dưới cùng phạm vi 11
path/task ID; `npm run test:policy` là ngoại lệ báo cáo bypass toàn repository bắt buộc.

| Lệnh | Kết quả | Thời lượng | Log dưới `.openarms/logs/` |
|---|---|---:|---|
| `node scripts/arms-test.mjs syntax` | 7/7 đạt | 460 ms | syntax-63512111b2672f0378fc92ef-f4f8593a-41a5-4f7c-a785-7f43ab6c4760.log |
| `node scripts/arms-test.mjs full` | 99/99 đạt | 13,535 ms | full-63512111b2672f0378fc92ef-d4e281ab-5011-42d2-ad4d-008e950e8f48.log |
| `node scripts/arms-test.mjs smoke-runtime` — kiểm tra tĩnh tiên quyết | 8/8 đạt | 501 ms | smoke-static-63512111b2672f0378fc92ef-a9520c08-06d9-4a52-af25-f87d654d5a0e.log |
| Cùng lệnh — dựng ảnh container | đạt | 74,871 ms | build-63512111b2672f0378fc92ef-8be77f2d-9039-4bef-a539-86a0cc40422f.log |
| Cùng lệnh — kiểm tra khi chạy | 5/5 đạt | 84,014 ms | smoke-runtime-63512111b2672f0378fc92ef-9bfcb674-6b68-42e3-b0a7-18456a50b6d4.log |
| `node scripts/arms-test.mjs tui-smoke` | 4/4 đạt | 56,276 ms | tui-smoke-63512111b2672f0378fc92ef-d5865dd8-138a-4400-a118-6dee0544d524.log |
| `npm run test:policy` | 0 phát hiện | Không báo thời lượng | Terminal |

TUI dùng lại static pass fingerprint `9dd9fda837ea` và image build phù hợp
`e7bae9e76aef`; không build/static trùng. Full bao phủ related. Không lỗi/trở ngại
bắt buộc hoặc failure log cần đọc trong lượt sửa này. Git diff đúng phạm vi rỗng
vì các file là nội dung workspace untracked có sẵn; không reset, stage, commit
hay push. Chỉ bổ sung tài liệu bằng chứng sau kiểm tra; không test lại code đã
đạt mà không đổi.
