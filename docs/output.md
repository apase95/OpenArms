# Output compaction và logs

[← Mục lục](README.md)

## 1. Output nào được xử lý?

Server xử lý text từ `bash`, `read`, `grep`, `glob`, `list`. Có parser cho test,
build/compiler, linter, git diff và guard file-inspection; format không nhận diện
được đi qua generic fallback. Không rewrite command, thêm `--silent` hoặc chặn file.

Native `skill` và custom tool results bypass hoàn toàn. Title/metadata không bị sửa;
OpenArms không suy ra hay thay exit code từ combined text.

## 2. Pipeline và giới hạn

```text
Host-observed text → pure normalize/classify/compact
                   → nếu text thay đổi: save observed original
                   → markers + log reference + final cap → model context
```

- Text không đổi không tạo artifact. Text gốc được flush trước khi publish bản đã đổi,
  không phải trước pure parsing.
- Generic target: **32.000 UTF-8 byte**. Final cap: **50.000 byte**, gồm markers/reference.
- Đây không phải giới hạn toàn prompt, memory, provider context hoặc native skill.
- “Original” là output nhìn thấy tại hook; không phục hồi được phần host đã truncate.
- Compaction có thể bỏ chi tiết. Giảm byte không tự chứng minh giảm chi phí hoặc giữ
  nguyên chất lượng task; không có savings dashboard hay telemetry database.

## 3. Đọc markers

| Marker | Ý nghĩa / hành động |
|---|---|
| `observed output log <path>` | Save thành công; đọc file này khi cần evidence đầy đủ hơn. |
| `LOG_WRITE_FAILED` | Không lưu được original; không có bảo đảm đọc lại phần bị bỏ. Kiểm tra storage. |
| `GOVERNOR_FAILED` | Parser lỗi/malformed result; đã dùng bounded generic fallback. |
| `HARD_CAP_APPLIED` | Final result vượt cap và đã bị clip. |
| Omitted bytes/lines/diagnostics | Có thông tin bị bỏ; xem original khi quyết định cần thêm evidence. |

Tool failure vẫn phải được đánh giá bằng host status/metadata và diagnostics; output
ngắn không có nghĩa command đã pass. Không tự chạy lại side effects chỉ vì log bị thiếu.

<a id="storage"></a>
## 4. Storage, privacy và retention

Artifact: `<projectRoot>/.openarms/logs/output-<uuid>.log`.
Project root là `worktree` khác `/` nếu có, nếu không dùng server `directory`.

Save dùng exclusive create **0600** và fsync; `.openarms`/`logs` phải private, không có
group/world permission bits và không là symlink. Thư mục không phù hợp làm save fail;
OpenArms không tự chmod hoặc sửa `.gitignore`. Đây là local owner-controlled workspace,
không phải bảo đảm trước hostile concurrent filesystem mutation.

Retention best-effort chỉ quản lý file có mẫu tên output mới:

- Tối đa mục tiêu **7 ngày / 100 file / 64 MiB**.
- Không xóa file vừa save hoặc file dưới 60 giây tuổi.
- Output lớn/recent concurrency có thể tạm vượt quota.
- Không tự dọn legacy logs/state hoặc database OpenCode.

Raw artifacts có thể chứa secrets/source nhạy cảm; permissions không thay redaction.
Không share/commit logs. Chủ project tự review ignore policy; OpenArms repository đã
ignore `.openarms/`, nhưng project khác không nhất thiết có rule đó. Conversation reference
có thể sống lâu hơn log: file hết hạn không chứng minh save ban đầu thất bại.

## 5. Khi cần báo lỗi

- [ ] Xem title, host metadata và marker trước khi kết luận.
- [ ] Đọc original nếu còn tồn tại; kiểm tra permissions/disk/retention nếu thiếu.
- [ ] Ghi command, parser domain, input/output tối thiểu và revision; loại secrets trước chia sẻ.
- [ ] Thêm regression nếu parser làm mất evidence quan trọng; không khẳng định hỗ trợ mọi format.

**Tiếp theo:** cần hiểu code, đọc [Architecture](architecture.md); cần kiểm tra thực tế, đọc
[Verification](verification.md).
