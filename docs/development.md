# Development — sửa nhỏ, kiểm chứng rõ

[← Mục lục](README.md)

## 1. Chuẩn bị

Đọc [Architecture](architecture.md) trước. Clone/setup plugin theo [README](../README.md),
dùng Node đáp ứng `package.json` engines rồi cài dependencies bằng `npm ci`.
SDK và OpenTUI/Solid UI type dependencies được pin trong dev dependencies; npm ci cần
cài chúng để typecheck footer JSX. Offline unit tests inject frame adapter, không tạo
renderer/TTY; live TUI vẫn cần host tương thích và runtime shared do host cung cấp.

```text
plugins/   # Hai entry adapters
src/       # Browser + output hooks/parsers/logs
skills/    # Nội dung mẫu; không phải runtime code
scripts/   # Thin check runner
tests/     # Small offline unit suite
docs/      # Tài liệu hiện hành, mỗi chủ đề một trang
```

## 2. Làm một task

1. Xác định module active, input/output cần đổi và phạm vi file, gồm cả removed paths.
2. Review plan theo [Verification](verification.md#host-checks). Scope chỉ chẩn đoán;
   suite nhỏ được chạy đầy đủ, không test mapping database.
3. Viết regression cho behavior/failure path thay đổi; giữ implementation nhỏ và thuần khi có thể.
4. Chạy syntax sau sửa code đáng kể; cuối task chạy phần kiểm tra còn thiếu theo plan.
   Không lặp suite trên cùng inputs chỉ để lấy thêm output; đọc log và diagnose trước retry.
5. Sửa đúng trang docs sở hữu contract; nếu breaking change thì thêm migration notes.
6. Bàn giao diff, commands/results, skipped checks và live acceptance còn thiếu.

Lệnh cụ thể, test coverage và release gates chỉ nằm ở [Verification](verification.md),
không duy trì bản sao ở trang này. Quy tắc cho coding agents ở [AGENTS.md](../AGENTS.md).

## 3. Invariants cần giữ

- Native skills do host discovery/load/authorize. Project switches chỉ lưu deny-only opt-outs,
  thêm native config denies và guard skill calls; không grants, custom loader hay legacy state engine.
  ON không grant hoặc bỏ host deny. Global config không bị ghi bởi switches.
- Không reset/auto-submit draft, thay Prompt component hoặc tự đổi model.
- Skill/custom tool output bypass; supported tool title/metadata không bị sửa hoặc suy ra exit code.
- Parsers không có I/O; save original observed text trước publish transformed result.
- Logs không sửa `.gitignore`, chmod repo hoặc dọn host DB/legacy state âm thầm.
- Không sửa `~/.config/opencode`, deploy hoặc cài Git hooks khi chưa có yêu cầu explicit.
- Không tái đưa usage/budget, installers, handoff/workflow vào chỉ để giống harness khác.
  Mở rộng phạm vi cần một quyết định riêng có lý do và chi phí maintain.

## 4. Quy tắc tài liệu

- [Mục lục](README.md) xác định trang sở hữu mỗi chủ đề; sửa tại đó thay vì tạo overview/report mới.
- Không thêm sprint folders, file theo tên người hay status reports lặp lại spec.
- Tài liệu sản phẩm mô tả behavior; evidence ghi commands, revision, môi trường và phạm vi thật.
- Mocks, synthetic transport, live host và live provider là các cấp bằng chứng khác nhau.
- Link nội bộ tương đối tới file hiện hành; đặt explicit anchor nếu được tham chiếu xuyên trang.
- Nội dung cũ tra bằng Git history; không dựng lại archive trong docs. Nguồn tham khảo bên ngoài
  chỉ thêm vào [Harness notes](harnesses.md), không tự biến chúng thành roadmap.

**Tiếp theo:** [Verification](verification.md) để kiểm tra và bàn giao thay đổi.
