<p align="center">
  <img src="docs/assets/openarms-logo.svg" alt="OpenArms logo" width="560">
</p>

# OpenArms

**Native skill browser + output compactor cho OpenCode.**

- `/arms-skills`: lệnh duy nhất mở **Skills management / Output compaction / Features**.
  Vào **Features** → chọn chức năng → **ON / OFF** theo project, mặc định ON.
  Vào **Skills management** → tên skill theo Alphabet → **ON / OFF / REQUEST**.
  OFF từng skill chặn native skill calls; REQUEST chỉ append yêu cầu vào draft.
  `/skills` vẫn là lệnh native của OpenCode, không bị plugin thay thế.
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

Giữ checkout ở vị trí ổn định. In các fragments với URLs đúng checkout hiện tại:

```bash
node scripts/opencode-link.mjs
```

Lệnh chỉ kiểm tra hai entry files và in JSON, không đọc/ghi global config hoặc tự deploy.
Output có hai keys `opencode.json` và `tui.json`: lấy fragment tương ứng bên trong để
merge vào từng file, **không** dán cả object output vào một config. Không redirect output
đè global config. **Merge** server entry vào `opencode.json`, giữ plugins khác:

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

Thay absolute paths đúng checkout, rồi restart client/server đang nạp plugin. Không cần
copy runtime vào global config: sửa source → chạy checks → restart host để test trực tiếp.
Đổi branch hoặc uncommitted edits cũng đổi code nạp lần sau; không có hot reload được bảo đảm.
Không có script tự ghi config, copy credentials hay dọn database người dùng. Cách tháo nối
và làm sạch legacy có tại [Migration](docs/migration.md#checkout-link).

## Dùng ngay

1. Thêm skill native theo [Skills](docs/skills.md#library).
2. Mở `/arms-skills` → **Features** để bật/tắt cả chức năng; **Skills management** để chọn
   skill → **ON / OFF / REQUEST**. Chỉ một lệnh vào menu tổng, vẫn tôn trọng feature OFF.
   Cần server/TUI local cùng filesystem. Xem [Feature controls](docs/features.md) trước khi
   OFF quản lý skill: thao tác này ngừng opt-outs của OpenArms, không deny mọi native skill.
3. **REQUEST** → review draft ở normal mode rồi tự gửi. **ON** sau OFF có thể cần restart
   để refresh native permission cache; không tự bỏ deny của người dùng. Chi tiết ở [Skills](docs/skills.md#project-switches).
4. Khi tool output bị rút gọn, tra markers/log theo [Output](docs/output.md).

Logs có thể chứa dữ liệu nhạy cảm. Không share/commit raw artifacts; xem privacy và
retention tại trang Output trước khi sử dụng với source/credentials quan trọng.

## Đọc tiếp theo vai trò

- **Người dùng:** [Docs index](docs/README.md) → [Features](docs/features.md) → Skills → Output.
- **Người nghiệm thu:** [Verification](docs/verification.md) — evidence, phần chưa kiểm chứng, checklist.
- **Contributor:** [Architecture](docs/architecture.md) → [Development](docs/development.md).
- **Nâng cấp:** [Migration](docs/migration.md) — config, data preservation, deploy và rollback.

## License

Engine dùng [MIT](LICENSE). Repo không kèm thư viện skill; skill cài riêng giữ license riêng.
