# Hướng dẫn kiểm thử — Sprint 0.3

[Hướng dẫn chung](../how_to_test_overview.md) · [Bảng lệnh](../testing.md) · [Sandbox: lỗi, cache và cleanup](Sandbox.md)

## Chọn cách thử

Registry operator transactions/exit codes/recovery mới nằm ở [Sprint 2.1](Sprint_21.md),
không phải retry/cache runner hoặc OpenCode smoke được hướng dẫn dưới đây.

Script cho log, lỗi và cleanup:

```bash
node scripts/arms-test.mjs related --file tests/test-process.test.mjs
```

Nếu đã chạy lượt Phase 0/full suite, dùng log của lượt đó. Những bài này tự tạo
tình huống thử trong thư mục tạm rồi dọn; không cần làm đầy ổ đĩa, đổi quyền thư
mục thật hoặc làm hỏng OpenCode đang dùng để tái hiện lỗi.

## TSK-014 — Summary ngắn và vẫn đọc được lỗi

**Vấn đề cần nhìn thấy:** một lần pass dễ đọc; một lần fail đủ biết cần xem gì tiếp.

1. Quan sát summary của lượt script đã chạy: `PASS: related` phải nằm trên một
   dòng, có số tests, duration, cache status và log path.
2. Mở log và tìm bài `TAP summary preserves failed test, counts and bounded
   failure diagnostics`: bài này kiểm tra tên test lỗi, thông tin lỗi, giới hạn
   30 dòng chẩn đoán và lỗi cleanup.
3. Tìm `unparseable output has explicit bounded head/tail fallback`: kiểm tra
   rằng nội dung lạ vẫn giữ đầu/cuối và nhãn `UNPARSEABLE_OUTPUT`.
4. Nếu gặp fail thật, mở đường dẫn `Full log:` và so với tên bài/bước trên summary.

**Đạt:** các bài script là `ok`; summary không đổ toàn bộ reporter ra terminal.
Giới hạn 30 dòng áp dụng cho phần chẩn đoán, ngoài dòng tiêu đề và đường dẫn log.

## TSK-015 — Log đầy đủ, lỗi ghi log và dọn log cũ

**Bằng mắt:** mở log được in trên summary. Có nội dung chi tiết của lần chạy,
trong khi terminal chỉ có bản tóm tắt. File mỗi lần chạy có tên riêng.

**Bằng script:** tìm các bài sau trong log:

| Bài test | Điều cần xác nhận |
|---|---|
| `raw stdout/stderr bytes are logged completely with exclusive owner-only files` | Đủ cả hai luồng output, file không bị ghi đè và chỉ owner có quyền đọc/ghi |
| `raw log write precedes output parsing and summary sampling` | Raw log được ghi trước bước rút gọn |
| `log failure is explicit and retains bounded diagnostics instead of claiming a saved log` | Có `LOG_WRITE_FAILED`, vẫn giữ lỗi cần đọc và không nói đã lưu log |
| `retention applies age/count/size while preserving active and current logs` | Dọn theo tuổi/số lượng/dung lượng, giữ file đang dùng |

**Đạt:** các bài đều `ok`. Script thử dọn log bằng thời gian/tệp giả, không phải
chờ 7 ngày. Policy thật là 7 ngày, 200 files, 256 MiB; file đang ghi/vừa chạy và
file mới dưới 60 giây được bảo vệ nên có thể tạm vượt giới hạn.

## TSK-016 — Output lớn vẫn được kiểm soát

**Vấn đề cần nhìn thấy:** output lớn không tràn terminal, tiếng Việt không bị hỏng
và log vẫn giữ lỗi đầu/cuối.

1. Trong log script, tìm `256 MiB single-line fixture keeps bounded memory and
   full head/tail log`.
2. Bài này phát 256 MiB, kiểm tra kích thước raw log, buffer tối đa 64 KiB và mức
   tăng RAM giữa hai phần thử. Terminal của lượt script vẫn chỉ có summary ngắn.
3. Tìm `UTF-8 split boundaries and interleaved streams retain first compiler
   and last Docker error`: kiểm tra tiếng Việt, hai luồng output và lỗi đầu/cuối.

**Đạt:** cả hai bài `ok`. Raw log 256 MiB của fixture được script kiểm tra rồi
xóa cùng thư mục tạm; log của lượt test chỉ ghi kết quả các bài, không giữ file
stress đó để người dùng phải đọc thủ công.

## TSK-017 — Ngăn thử lại cùng lỗi quá nhiều lần

**Vấn đề cần nhìn thấy:** hai lần lỗi giống nhau không dẫn tới vòng thử vô hạn.

Trong log script, tìm:

- `retry guard blocks third identical failure, requires force reason and resets
  on changed inputs/errors`.
- `signature normalizes volatile paths/time but distinguishes actual assertion errors`.
- `concurrent failure invocations atomically count two runs and block the third`.

**Đạt:** các bài `ok`; script xác nhận lần thứ ba không thực thi, thiếu reason
không override được, thay đầu vào/lỗi thì count được reset. Đây là cách chủ động
thử giới hạn mà không phải gây ba lỗi thật trên dự án.

**Nếu đã gặp lỗi thật:**

1. Mở log, ghi nhận nguyên nhân trước khi chạy lại.
2. Sửa phần liên quan rồi kiểm tra lại; nếu đã chẩn đoán được thay đổi bên ngoài
   nhưng đầu vào runner vẫn giống, dùng mode phù hợp, ví dụ:

   ```bash
   npm run test:smoke-runtime -- --force --reason "đã khắc phục Docker daemon"
   ```

3. `RETRY_BLOCKED` ở lần thứ ba, hoặc `RETRY_OVERRIDE_REASON_REQUIRED` khi thiếu
   reason, là dấu hiệu cơ chế bảo vệ đang hoạt động. Không xóa history để lách giới hạn.

## TSK-018 — Timeout, hủy và dọn dẹp

**Bằng script:** tìm `timeout kills a grandchild that ignores SIGTERM and releases
its port` và `forwarded SIGINT cleans up the child group and keeps exit 130`.
Hai bài kiểm tra chương trình bị treo được dừng, cổng dùng lại được, lần chạy
tiếp theo thành công và thao tác hủy giữ đúng kết quả.

Để kiểm tra lỗi cleanup không che lỗi gốc, dùng log lượt Phase 0/full suite hoặc:

```bash
node scripts/arms-test.mjs related --file tests/smoke-runner.test.mjs
```

Tìm `CLI cleanup failure preserves the smoke error and third retry blocks before
startup`. **Đạt:** bài là `ok`; lỗi smoke 7 được giữ dù cleanup trả lỗi 9.

**Quan sát cleanup của OpenCode thật:** sau runtime/TUI smoke, mở log và chạy:

```bash
docker ps -a --filter name=openarms-smoke --format '{{.Names}}'
docker volume ls --filter name=openarms-smoke --format '{{.Name}}'
```

**Đạt:** hai danh sách rỗng khi không còn runner-managed smoke khác đang chạy.
Nếu tự thử hủy, chạy một lần runtime bằng `--force`, chờ bước build xong và
OpenCode bắt đầu chạy (có thể xem trong terminal khác bằng lệnh `docker ps` ở
trên), rồi nhấn Ctrl+C. Chờ lệnh trả về và kiểm tra cleanup; lần này bị hủy nên
không được ghi như một pass mới. Container sandbox thủ công có tên khác và giữ
dữ liệu riêng. Không cần cố ý gây timeout 600 giây: dùng fixture timeout để thử.
