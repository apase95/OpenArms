# Cách tự kiểm tra các task đã triển khai

Tài liệu này dành cho người muốn tự thao tác, quan sát màn hình hoặc chạy script
để xác nhận một tính năng hoạt động đúng. Tra cứu lệnh tại [testing.md](testing.md).

## 1. Chọn hướng dẫn theo công việc

| Hướng dẫn | Task | Bạn sẽ kiểm tra được gì? |
|---|---|---|
| [Sprint 4.3](how_to_test/Sprint_43.md) | TSK409–413 API-only | Schema/service/SDK mocks, compact/audit, independent transactional writer; không registry/load/install |
| [Sprint 4.2](how_to_test/Sprint_42.md) | TSK-405–408 | Offline corpus/scanner, staged-only TUI audit; xem riêng trạng thái PTY |
| [Sprint 4.1](how_to_test/Sprint_41.md) | TSK-401–404 | Staged scope/GitHub/tar.gz API, offline security; chưa TUI/end-to-end install |
| [Sprint 3.4 v2](how_to_test/Sprint_34v2.md) | TSK-312v2–314v2 | Build formats, snippets, fallback và fixture 30KB→<1KB; không live compiler proof |
| [Sprint 3.5 v2](how_to_test/Sprint_35v2.md) | TSK-315v2–319v2 | Safety, project raw sink, telemetry/usage; Docker PTY real tools + synthetic model transport |
| [Sprint 3.3 v2](how_to_test/Sprint_33v2.md) | TSK-308v2–311v2 | Git diff priorities/summary, bounded excerpts, observed read/cat detection; không build/phase acceptance |
| [Sprint 2.4](how_to_test/Sprint_24.md) | TSK-216–219 | Finite error/property matrix, production action-contract fixture, docs audit và operator gates; không renderer/PTY proof |
| [Sprint 2.1](how_to_test/Sprint_21.md) | TSK-201–204 | Schema/migration/hash/integrity CLI, synthetic CI; không chứng thực library thật |
| [Sprint 2.2](how_to_test/Sprint_22.md) | TSK-205–210 | Core strict API/grants/hash/race/budget fixtures; chưa kích hoạt host loader |
| [Sprint 2.3](how_to_test/Sprint_23.md) | TSK-211–215 | Persisted grants/task transaction, sole verified tool, synthetic SDK/config; live v1 fail-closed |
| [Sandbox đầy đủ](how_to_test/Sandbox.md) | Các boundary sandbox | 8 nhóm static, 5 runtime, 4 TUI, 8 ca thủ công, offline container và cleanup; nêu rõ phần chưa chứng minh |
| [Sprint 0.1](how_to_test/Sprint_01.md) | TSK-001–006 | Thu thập số liệu, chọn đúng tests, xem kế hoạch và phát hiện lệnh đi ngoài policy |
| [Sprint 0.2](how_to_test/Sprint_02.md) | TSK-007–013 | Kiểm tra cấu hình/OpenCode, dùng lại kết quả và điều hướng giao diện |
| [Sprint 0.3](how_to_test/Sprint_03.md) | TSK-014–018 | Kết quả ngắn, full logs, output lớn, lỗi lặp, hủy và dọn lần chạy bị treo |
| [Sprint 0.4](how_to_test/Sprint_04.md) | TSK-019–023 | Orchestration, pre-push/CI và đo nghiệm thu |
| [Sprint 1.1](how_to_test/Sprint_11.md) | TSK-101–106 | Shared contract, passed/total, log failure và manifest drift |
| [Sprint 1.2](how_to_test/Sprint_12.md) | TSK-107–112 | Governor cap, shadow rules, telemetry và giới hạn SDK |
| [Sprint 1.3](how_to_test/Sprint_13.md) | TSK-113–116 | Fixture process/SDK cục bộ và quy trình review host thật/bảy ngày hoạt động |

Phạm vi gồm Phase 0 và fixture cục bộ Sprint 1.1–1.3/2.1–2.3; rollout Sprint 1.3, live migration và host integration Phase 2 chưa được nghiệm thu. TSK-001 có công
cụ thu thập nhưng còn chờ đủ dữ liệu; TSK-023 cũng còn chờ rollout thực tế.

## 2. Chuẩn bị một lần

1. Mở terminal ở root repository, nơi có `package.json`.
2. Chạy `node --version`; cần Node 22 trở lên. Chạy `npm ci` nếu chưa cài dependencies.
3. Chỉ khi kiểm tra OpenCode trong sandbox: kiểm tra `docker version` và
   `docker compose version`. TUI smoke cần thêm Python 3 trên Linux/macOS.
4. Các ví dụ có `<file>`, `<task-id>` hoặc `<package>` cần thay bằng giá trị thật.
5. Những bước cố ý sửa cấu hình/tạo lỗi nên làm trong bản sao hoặc nhánh thử;
   lưu nội dung cũ và hoàn lại đúng phần mình đã đổi trước khi thử trường hợp khác.

`--plan` chỉ xem trước. Nó không chạy tests, không build và không mở container.

## 3. Cách đọc kết quả

| Dấu hiệu | Hiểu đơn giản |
|---|---|
| `PASS` | Các điều kiện của bước đó đều đạt |
| `FAIL` | Cần đọc tên bước/test và thông tin lỗi |
| `SKIP` | Không cần chạy, hoặc đã có kết quả đạt với đầu vào giống nhau |
| `BLOCKED` / `needs-review` | Chưa đủ điều kiện hoặc chưa có cách kiểm tra cho file |
| `log=...` / `Full log: ...` | Đường dẫn tới bản ghi đầy đủ |

Mở log bằng `less <đường-dẫn-được-in>`, nhấn `/` để tìm tên bài kiểm tra và `q`
để thoát. Nếu dùng editor, mở file theo đường dẫn đó và tìm bằng Ctrl+F.

Trong test tự động, “fixture” là tình huống giả lập do script tạo để thử lỗi.
Ví dụ, script có thể cố ý làm một chương trình bị treo. Bài kiểm tra vẫn **đạt**
nếu runner dừng chương trình đó đúng cách. Dựa vào summary cuối và kết quả `ok`
của bài test; một dòng lỗi trong tình huống giả lập không tự nghĩa là task thất bại.

## 4. Chọn một cách kiểm tra phù hợp

- **Quan sát:** xem kế hoạch, summary, log hoặc thao tác trong menu OpenCode.
- **Script:** chạy tests có sẵn cho những trường hợp khó gây ra bằng tay, như
  ghi log thất bại, nhiều người gọi cùng lúc hoặc chương trình bị treo.
- **Thực tế:** chạy máy chủ/giao diện OpenCode khi muốn xác nhận tích hợp thật.

Mỗi guide ghi rõ thao tác và dấu hiệu đạt. Chọn trường hợp liên quan đến task;
không cần chạy lại tất cả chỉ để đọc hoặc sửa tài liệu.

Nếu muốn kiểm tra toàn bộ logic Phase 0 bằng scripts trong một lượt, dùng:

```bash
node scripts/arms-test.mjs related --file tests/test-runner.test.mjs --file tests/smoke-runner.test.mjs --file tests/test-process.test.mjs
```

Hoặc dùng `npm run test:full` khi cần kiểm tra cả core và server. Chọn một lượt
phù hợp; các guide bên dưới dùng lại kết quả của lượt đó, tránh chạy lặp tests
trên cùng code. Kiểm tra OpenCode thật được chọn riêng theo phần cần xác nhận.

## 5. Kiểm tra menu skill hiện có

Tám ca M1–M8 trong [hướng dẫn sandbox](how_to_test/Sandbox.md) là checklist đầy
đủ cho picker, nhận diện, enable/load/Used, gỡ core/optional, disable/clear/restore
và installed task lock/mismatch. Quy trình ngắn dưới đây không thay checklist đó.
Docs và optional skill phải có trong thư viện đang dùng; không giả định installed
có cùng package, không tìm skill trực tiếp. Nếu thiếu, ghi chưa thử/thiếu thư viện.

Đây là bước quan sát hữu ích khi thử giao diện ở Sprint 0.2:

1. Build sandbox thủ công bằng `npm run sandbox -- build` nếu cần snapshot mới,
   rồi mở `npm run sandbox -- start`.
2. Gõ `/skills`: menu phải mở trong OpenCode.
3. Gõ `/skills packages`, rồi `/skills list docs` để xem package/skill có sẵn.
4. Gõ `/skills use docs`, rồi `/skills status`: thấy package đã bật.
5. Gõ `/skills inspect` để xem trạng thái. Bật package chưa có nghĩa đã nạp nội dung.
6. Chỉ khi operator đã migrate/review/approve v2 và provider hoạt động, nhờ
   assistant nạp đúng skill ID đã chọn bằng `load_verified_skill`. V1 phải trả
   Unverified, không có content. Quan sát tool call và kiểm tra lại `inspect`.
7. Gõ `/skills disable docs`: trạng thái phải phản ánh package đã tắt.

Các lệnh menu không cần gọi model. Bước nạp nội dung qua assistant cần model hoạt
động; nếu chưa thiết lập provider, ghi bước đó là **chưa thử**, không kết luận lỗi.

## 6. Ghi lại kết quả của bạn

| Task | Lệnh/thao tác đã thử | Quan sát thực tế | Đạt / chưa đạt / chưa thử | Log hoặc ảnh |
|---|---|---|---|---|
| TSK-... | ... | ... | ... | ... |

Khi chưa đạt, giữ log và ghi bước gây lỗi. Nếu runner chặn lỗi lặp, đọc log trước
khi quyết định dùng `--force --reason "lý do chạy lại"`.
