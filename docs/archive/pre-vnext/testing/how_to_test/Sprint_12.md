# Hướng dẫn kiểm thử Sprint 1.2

Phạm vi: TSK-107–112. Không bao gồm rollout hoặc quan sát bảy ngày Sprint 1.3.
[Tổng quan](../how_to_test_overview.md) · [Ca sandbox và giới hạn bằng chứng](Sandbox.md) · [Báo cáo](../../reports/sprints/report_sprint_12.md).

## Các kiểm tra

Budget integrity tooling [Sprint 2.1](Sprint_21.md) dùng owner `maxTokens` và
estimator version riêng; không đổi governor cap. Runtime hiện tại theo
[Sprint 2.3](Sprint_23.md): sole verified tool, v1 content fail-closed; các bằng
chứng Sprint 1.2 bên dưới giữ scope lịch sử, không chứng minh live migration.

Chạy từ repository root, Node 22+:

```sh
node scripts/arms-test.mjs related --file tests/sprint12.test.ts --task sprint-1.2
```

File test chỉ chạy chính nó: làm sạch/Unicode/OSC, lược bỏ tất định, cap khi
parser lỗi, lỗi log, preset, shadow, telemetry và after-hook SDK. Regression state
loader quá cỡ ở `tests/server.test.ts`. Không chạy lại related nếu full đã bao
phủ revision đó. Phạm vi core/shared cần full; server adapter cần static/runtime
smoke theo bộ phân loại. Dùng `verify --plan` đủ file task rồi `verify` một lần;
không kéo TUI khi không sửa ranh giới TUI.

## Giá trị mặc định và giới hạn của host

- Giới hạn output mềm 32,000 byte UTF8; payload cuối tối đa 50,000 byte gồm cảnh
  báo và tham chiếu log. Adapter không đổi exit/metadata/title.
- After-hook SDK chỉ cấp text gộp, không raw stdout/stderr/exit riêng. “Raw log”
  ở đây là text host đưa vào hook, không phải luồng process ban đầu.
- Log/telemetry ở `<state directory>/governance`, ngoài conversation. File 0600,
  tạo độc quyền và sync; thư mục mới 0700; retention best effort bảy ngày,
  200 file/256 MiB, giữ file mới ít nhất 60 giây. Raw log có thể chứa secret;
  không upload, không dùng telemetry thay raw log.
- Verified response dùng budget trên JSON thực trả trước ghi history/lock; normal
  verified output giữ nguyên, không strip/compact. Quá budget không commit hoặc
  trả nội dung từng phần; contract source hiện tại ở Sprint 2.3/Sprint 2.2.
- Adapter policy file luôn shadow, không đổi tham số read, không giả permission
  engine. Evaluator thuần hỗ trợ off/shadow/active; active chỉ khi
  `hostEnforcement=true`, `activeRules` chỉ rõ rule và không override. Lockfile
  không bị deny theo loại cả ở active. Adapter SDK không cấp config active vì
  chưa có tích hợp enforcement được hỗ trợ.
- Generated/minified/map/binary ghi would-deny; kích thước/dòng/log lớn ghi
  would-ask. Ngưỡng evaluator: 100,000 byte/5,000 dòng. Host không cấp kích thước/
  số dòng toàn file trước read: adapter dùng byte và dòng output quan sát
  (CRLF/CR/LF, dấu kết thúc cuối không tạo dòng rỗng), gồm wrapper/range của host;
  không suy ra toàn file. 6,000 dòng ngắn dưới ngưỡng byte ghi LINES.
- messageID tùy chọn, không được tự tạo; hook SDK chỉ cấp sessionID/callID.
  Telemetry validation type theo allowlist v1; path chỉ lưu SHA256 của path chuẩn
  hóa, không raw path/nội dung/env/command. Loại trùng sessionID+callID trong vòng
  đời plugin; công bố JSON atomic bằng hard link độc quyền theo định danh băm,
  giữ loại trùng qua restart trong retention. Định danh dùng JSON tuple
  `[sessionID, callID]`, không nối dấu colon gây collision. Lỗi sink không làm tool fail.
- Tổng hợp tỷ lệ tiết kiệm và tập would-action cần review; không tự gán false positive.

## Khả năng tương thích của preset

| Chương trình thực thi | Lệnh con | Preset |
|---|---|---|
| npm | install, ci, test, run | CI=1, NO_COLOR=1, TERM=dumb |
| pnpm | install, test, run | cùng env |
| yarn | install, test, run | cùng env |
| pip | install, download, list | cùng env |
| git | status, diff, log, show, fetch, clone | cùng env |
| Chương trình lạ/path/shell string | Mọi trường hợp | Giữ nguyên |

Preset chỉ áp cho executable/argv có cấu trúc nhận diện chắc chắn; không thêm
flag, không silent toàn cục, không đổi stderr/exit. CI có thể đổi hành vi script
nên caller cấu trúc phải opt in bằng `runProcess(command, args, timeout, cwd,
{ noisePresets: true, environment })` trong `scripts/test-process.mjs`. Mặc định
không đổi env; helper dùng chung `src/noise-preset.mjs` được re-export từ
tool-policy, không nhân đôi bảng tương thích. Bash SDK chỉ có shell string và
shell.env không cho executable/argv: không tự áp preset toàn cục/viết lại shell.

## Tìm kiếm và đọc đoạn lockfile

Review dependency/audit/CI trước install là ca sử dụng hợp lệ. Tìm tên dependency
trước, đọc đoạn quanh kết quả khi đủ; cần toàn file thì đọc bình thường. Không
yêu cầu lịch sử install hoặc ba tool call. Lockfile lớn chỉ shadow-ask, không
chặn đọc. Token là ước tính byte/4, không tokenizer tính phí.

Kiểm tra read thực bằng fixture hook (text/metadata không đổi) và log quá cỡ
bằng đọc lại file được tham chiếu; không lấy riêng HTTP health làm bằng chứng execution.
