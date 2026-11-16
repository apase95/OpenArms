<p align="center">
  <img src="docs/assets/openarms-logo.svg" alt="OpenArms logo" width="560">
</p>

# OpenArms

**Native skill browser + output compactor cho OpenCode.**

- `/skills`: xem catalog của host, preview skill và đưa yêu cầu dùng skill vào draft.
- Output compactor: rút gọn tool text, giữ đường truy xuất original khi output thay đổi.

OpenCode vẫn sở hữu model, agent loop, loading và permissions. OpenArms không tự gửi
prompt, đổi model hay quản lý conversation. Request trong draft không chứng minh model
đã load/tuân thủ skill. Phạm vi và giới hạn được mô tả tại [docs](docs/README.md).

<a id="cai-dat"></a>
## Cài đặt

Cần OpenCode có public TUI/native-skill APIs tương thích và Node đáp ứng
[`package.json` engines](package.json) cho development checks. Dependency được pin;
không có cam kết tương thích mọi host version. Nếu đang dùng 0.1, đọc
[Migration](docs/migration.md) trước khi thay runtime.

```bash
git clone https://github.com/apase95/OpenArms.git
cd OpenArms
npm ci
```

Giữ checkout/runtime ở vị trí ổn định. **Merge** server entry vào `opencode.json`,
không thay toàn bộ config hoặc xóa plugins khác:

```json
{
  "plugin": [
    "file:///absolute/path/to/OpenArms/plugins/skill-router-server.ts"
  ]
}
```

Merge TUI entry vào `tui.json` riêng:

```json
{
  "plugin": [
    "file:///absolute/path/to/OpenArms/plugins/skill-router-tui.tsx"
  ]
}
```

Thay absolute paths đúng nơi triển khai, rồi restart host. Restart chỉ reload path đó,
không đồng bộ checkout với installed runtime. Không có script tự ghi config, copy
credentials hay dọn database người dùng.

## Dùng ngay

1. Thêm skill native theo [Skills](docs/skills.md#library).
2. Mở `/skills` → **Inspect** hoặc **Request in draft**.
3. Review draft ở normal mode rồi tự gửi; OpenCode quyết định native tool/permission.
4. Khi tool output bị rút gọn, tra markers/log theo [Output](docs/output.md).

Logs có thể chứa dữ liệu nhạy cảm. Không share/commit raw artifacts; xem privacy và
retention tại trang Output trước khi sử dụng với source/credentials quan trọng.

## Đọc tiếp theo vai trò

- **Người dùng:** [Docs index](docs/README.md) → Skills → Output.
- **Người nghiệm thu:** [Verification](docs/verification.md) — evidence, phần chưa kiểm chứng, checklist.
- **Contributor:** [Architecture](docs/architecture.md) → [Development](docs/development.md).
- **Nâng cấp:** [Migration](docs/migration.md) — config, data preservation, deploy và rollback.

## License

Engine dùng [MIT](LICENSE). Bundled `skills/` giữ license riêng và không tự đăng ký/chạy.
