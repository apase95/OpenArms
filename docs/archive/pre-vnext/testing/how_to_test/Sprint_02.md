# Hướng dẫn kiểm thử — Sprint 0.2

[Hướng dẫn chung](../how_to_test_overview.md) · [Bảng lệnh](../testing.md) · [Toàn bộ ca sandbox](Sandbox.md)

## Chọn cách thử

[Sprint 2.1](Sprint_21.md) bổ sung synthetic integrity gate, không thay smoke,
library fingerprint hoặc các ca cache/build bên dưới.

- Script: `node scripts/arms-test.mjs related --file tests/smoke-runner.test.mjs`.
  Có thể dùng log của lượt Phase 0/full suite đã chạy thay vì chạy lại.
- Static smoke dùng host; runtime/TUI smoke cần Docker, TUI còn cần Python 3.
- Các kiểm tra cố ý đổi file chỉ thực hiện trên bản sao/nhánh thử rồi hoàn lại.

## TSK-007 — Phân rõ cấu hình, máy chủ và giao diện

**Vấn đề cần nhìn thấy:** mỗi phần có nơi kiểm tra phù hợp, dễ biết lỗi ở đâu.

1. Đọc bảng đầu [hợp đồng smoke](../smoke-contract.md) và ca S1–S8/R1–R5/T1–T4 trong [hướng dẫn sandbox](Sandbox.md).
2. Đối chiếu: JSON/đường dẫn nằm ở static; máy chủ khởi động/đăng ký tool nằm ở
   runtime; menu/bàn phím/hover nằm ở TUI.
3. Nếu muốn thử một phần, chọn lệnh tương ứng ở bảng lệnh. Không cần mở cả ba
   chỉ để xác nhận bảng phân loại.

**Đạt:** chỉ rõ được phần nào kiểm tra điều gì. Việc kiểm tra cấu hình khai báo
và cấu hình OpenCode thực tế có thể cùng xuất hiện vì chúng kiểm tra hai tình huống khác nhau.

## TSK-008 — Dừng sớm khi cấu hình sai

**Vấn đề cần nhìn thấy:** lỗi file cấu hình được phát hiện trước build/OpenCode startup.

```bash
npm run test:smoke-static
```

**Đạt với cấu hình đúng:** `PASS: smoke-static` hoặc `SKIP` nếu đã có kết quả phù hợp.

Muốn thử lỗi bằng tay, trong bản sao thử:

1. Lưu nội dung cũ của `sandbox/config/tui.json`, rồi đổi tạm nội dung thành `{broken`.
2. Chạy `npm run test:smoke-runtime`.
3. Quan sát lỗi static; hoàn lại nội dung JSON cũ.

**Đạt với cấu hình sai:** có `STATIC_SMOKE_FAILED`, không có bước build/runtime
được thực thi. Hoặc dùng bài `CLI static failure exits before Docker probe,
build or OpenCode startup` trong script để tự tạo lỗi này trong thư mục tạm.

## TSK-009 — Chỉ kiểm tra đúng phần ảnh hưởng

```bash
node scripts/arms-test.mjs verify --file plugins/skill-router-server.ts --plan
node scripts/arms-test.mjs verify --file sandbox/config/tui.json --plan
node scripts/arms-test.mjs verify --file docs/testing/testing.md --plan
```

**Đạt:** server adapter chọn static + runtime, skip TUI; TUI config chọn static +
TUI, skip runtime; tài liệu skip cả ba. File integration chưa map phải yêu cầu review.
Script có bài `every integration rule adds static exactly once and server/core
does not add TUI` để kiểm tra nhiều trường hợp cùng lúc.

## TSK-010 — Nhận biết đầu vào đã đổi

**Vấn đề cần nhìn thấy:** dấu nhận diện của lần kiểm tra đổi đúng lúc, không đổi chỉ vì đổi thư mục máy.

Dùng log script và tìm các bài:

| Bài test | Điều nó xác nhận |
|---|---|
| `fingerprints ignore workspace/timestamps/docs but invalidate dependencies` | Đổi tài liệu/thời gian file không làm mất kết quả; đổi code liên quan thì có |
| `TUI dependencies invalidate only TUI; runtime dependencies invalidate both` | Sửa giao diện riêng không làm mất kết quả máy chủ |
| `allowlisted environment and tool versions affect keys without raw secrets` | Phiên bản/cấu hình liên quan được tính vào đầu vào |
| `installed library bytes invalidate stamps; mode and path-independent identity differ` | Thư viện installed thay đổi được nhận biết |

**Đạt:** các bài đều `ok`. Chúng tự dùng bản sao nhỏ, nên không cần sửa thư viện
skill thật hoặc tự so các chuỗi mã dài bằng mắt.

## TSK-011 — Dùng lại kết quả đã đạt

1. Chạy `npm run test:smoke-runtime`.
2. Nếu đã có kết quả cũ và muốn quan sát một lần chạy mới, chọn một lần chủ động
   bằng `npm run test:smoke-runtime -- --force`.
3. Giữ nguyên code/cấu hình, gọi lại `npm run test:smoke-runtime`.
4. Mở metadata trong `.openarms/test-runs.jsonl` hoặc bản ghi tương ứng trong
   `.openarms/test-results/smoke-runtime/`.

**Đạt:** sau một lần pass, lần gọi thường tiếp theo có `SKIP: ... unchanged
inputs, previous pass ...`, không build hoặc startup thêm. Bản ghi chỉ tới log đã lưu.

Script còn kiểm tra bốn caller cùng lúc chỉ thực thi một lần; fail/timeout/signal
không được dùng lại, và forced rerun thất bại không làm sống lại pass cũ.
Nếu runner đang chặn một lỗi lặp có sẵn, chuyển sang hướng dẫn TSK-017 để chẩn đoán.

## TSK-012 — Dùng lại môi trường Docker phù hợp

**Vấn đề cần nhìn thấy:** chạy lại kiểm tra không luôn phải build lại.

Sau khi runtime smoke đã pass, chọn trường hợp muốn quan sát:

```bash
npm run test:smoke-runtime -- --force
npm run test:smoke-runtime -- --rebuild
```

**Đạt:** `--force` chạy kiểm tra lại nhưng có `SKIP: build ... matching image`
nếu image còn phù hợp; `--rebuild` có bước build. Hai lệnh này là hai tình huống
xác nhận riêng, không phải cặp lệnh cần chạy sau mỗi edit.

Việc thay file nằm trong image làm đổi dấu nhận diện được script xác nhận bằng
bài `build fingerprint honors COPY, dockerignore, deletion and build args`.

## TSK-013 — Kiểm tra giao diện khi cần

**Bằng script:** `npm run test:tui-smoke` cần pass hoặc dùng lại pass phù hợp;
`--force` dùng khi chủ động muốn xem harness thực thi lại.

**Bằng mắt và bàn phím:**

1. Chuẩn bị image thủ công đúng code bằng `npm run sandbox -- build` nếu cần.
2. Mở `npm run sandbox -- start`, gõ `/skills`.
3. Dùng phím lên/xuống đi qua đầu/cuối danh sách; kiểm tra cuộn và quay vòng lựa chọn.
4. Di chuột trên một hàng trong khi dùng phím: hover không được giành lựa chọn
   bàn phím một cách bất ngờ.
5. Mở Status, quay lại menu, rồi mở Inspect; việc mở lại vẫn điều hướng được.

**Đạt:** menu/render/điều hướng làm đúng như quan sát trên; server-only plan skip
TUI. Có thể dùng `start --installed` hoặc `test:tui-smoke -- --installed` khi đã
có thư viện installed phù hợp. Thiếu Python/PTY phải được báo rõ, không đổi thành
server smoke và coi đó là đã kiểm tra giao diện.
