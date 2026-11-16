# Output compaction và logs

## Phạm vi

Server xử lý after-hook cho `bash`, `read`, `grep`, `glob`, `list`; native `skill` và
custom tools được giữ nguyên. Không thay title/metadata hoặc suy ra exit code.

Các parser: test/build/linter/git-diff và file-inspection guard. Format không nhận diện
được dùng generic fallback. Không rewrite shell commands, thêm `--silent` hay chặn file access.

## Dữ liệu đi đâu?

```text
Host observed text → pure compaction
                  → text thay đổi: save original observed text
                  → log reference/markers + final cap → model context
```

Text không đổi không tạo log. Bản gốc là output tại hook, không bảo đảm raw process stdout:
host có thể đã truncate trước đó. Log được flush trước khi publish bản compact, nhưng không
được lưu trước pure parsing. Không có telemetry/usage store hoặc background metrics exporter.

## Markers

- `observed output log <path>`: save thành công, có thể đọc lại khi cần.
- `LOG_WRITE_FAILED`: không lưu được bản gốc; không có guarantee truy xuất lại.
- `GOVERNOR_FAILED`: parser không hoạt động, đã dùng bounded fallback.
- `HARD_CAP_APPLIED`: final result vượt 50.000 UTF-8 byte nên bị clip.
- Omission markers mô tả thông tin bị cắt; không biến tool failure thành success.

Generic compaction target 32.000 byte; final cap 50.000 byte gồm markers/reference.
Đây không phải giới hạn toàn prompt, provider context hoặc native skill instructions.

## Privacy và retention

Path: `<projectRoot>/.openarms/logs/output-<uuid>.log`.
File exclusive 0600; `.openarms` và `logs` phải private, không symlink. Nếu thư mục cũ
không đáp ứng, save fail rõ ràng; OpenArms không tự đổi permissions hoặc sửa `.gitignore`.
Owner có thể review và chỉnh thư mục riêng tư thủ công trước khi thử lại.

Retention best-effort chỉ cho output files có tên mới: 7 ngày / 100 file / 64 MiB.
Không xóa file vừa save hoặc files dưới 60 giây tuổi; có thể vượt quota với output lớn/concurrent.
Không tự dọn legacy logs, handoff, usage, state hoặc DB OpenCode.

Raw logs có thể chứa tokens/credentials/source nhạy cảm; không có redaction trong MVP.
Không share/commit logs. Chủ project tự review và thêm `.openarms/logs/` vào ignore policy;
repo OpenArms đã ignore `.openarms/`, không suy ra các project khác cũng vậy.
Logs có thể hết hạn trước khi conversation reference hết hạn: path missing không chứng minh
save ban đầu thất bại. Chạy lại command chỉ khi phù hợp task, không tự retry side effects.

## Checklist khi gặp lỗi

- [ ] Xem markers, title và host failure metadata trước khi kết luận tool thành công.
- [ ] Đọc log nếu cần chi tiết mà compactor bỏ qua.
- [ ] Nếu mất log, kiểm tra permissions, disk và retention; không tìm trong DB host.
- [ ] Ghi minimal reproduction đã loại secret khi báo lỗi parser.
- [ ] Không claim cost/token savings chỉ dựa trên reduction bytes.
