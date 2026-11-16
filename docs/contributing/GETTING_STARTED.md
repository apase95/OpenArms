# Contributor guide — OpenArms 0.2

## Setup

```bash
npm ci
npm run test:plan -- --task my-task
npm run check
npm test
```

Node version theo `package.json`. OpenCode cung cấp TUI runtime; không cài emulator,
Docker hoặc PTY dependencies để chạy unit tests. Các optional OpenTUI peers của SDK
không cần cho small host suite; live TUI vẫn cần host phù hợp.

## Cấu trúc

```text
plugins/   # Server/TUI entries, giữ đường dẫn cũ
src/       # Native catalog/browser + output parsers/hooks/logs
skills/    # Sample skill content có license riêng; không tự đăng ký/chạy
scripts/   # Thin check runner
tests/     # Small offline unit suite
docs/      # Active guides + archive có nhãn lịch sử
```

## Quy tắc maintain

- Scope sản phẩm chỉ skill browser + output compactor.
- Ưu tiên host native API, không viết loader/permission/state engine thứ hai.
- Không reintroduce installers, usage/budget, workflow hay session lifecycle vì archived spec.
- Không sửa global config/installed runtime trong task source trừ yêu cầu explicit.
- Test failure paths/UTF-8 và giữ metadata; không claim live acceptance từ mocks.
- Save original observed output trước publish transformed text; không write `.gitignore` âm thầm.
- Không tự thay model, submit draft, clear editor hoặc xóa conversation.
- Runtime modules chỉ dùng built-in APIs; SDK dùng làm type contract, host lo execution.

[AGENTS.md](../../AGENTS.md) quy định checks, [testing](../testing/testing.md) có manual checklist,
[architecture](../architecture/Architecture.md) giải thích route. Breaking change cần cập nhật
[migration](../guides/migration.md), không tự migrate dữ liệu người dùng.
