<p align="center">
  <img src="docs/assets/openarms-logo.svg" alt="OpenArms logo" width="560">
</p>

# OpenArms

**Native skill browser + output compactor cho OpenCode.**

OpenArms 0.2 thu gọn về hai chức năng. OpenCode sở hữu model, agent loop, native
skill loading, tools, permissions và conversation. Không còn project skill toggles,
automatic skill injection, registry/grants, usage/budget, skill installer, handoff,
rotation hoặc workflow nhiều agent.

## Chức năng

| Phần | Hành vi |
|---|---|
| `/skills` | Lấy catalog từ host, lọc, xem location/content và đưa yêu cầu dùng skill vào draft |
| Native loading | Model gọi native `skill` tool của OpenCode khi cần; host thực thi permissions |
| Output compaction | Test/build/linter/git-diff, file inspection và generic fallback |
| Output artifacts | Lưu bản gốc quan sát được khi output thay đổi; private files và retention tối thiểu |

Không ON/OFF, không state database riêng. Catalog có thể có dòng ERROR cho metadata
không hợp lệ/tên trùng mà host trả về. Skill không xuất hiện trong catalog phải được
chẩn đoán ở host; OpenArms không tự scan/fix/install nó.

## Cài đặt

Cần OpenCode có TUI plugin API và `app.skills`/`tui.appendPrompt`, Node.js phù hợp
`engines` trong `package.json` khi chạy development checks. Dependency declarations
được pin; không có cam kết tương thích mọi phiên bản host.

```bash
git clone https://github.com/apase95/OpenArms.git
cd OpenArms
npm ci
```

Merge server entry vào `opencode.json` của bạn, giữ nguyên các settings/plugins khác:

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

Hai entry paths được giữ để giảm thay đổi cấu hình khi upgrade. Thay absolute paths
đúng checkout/runtime đã triển khai. Restart chỉ reload path đó, không tự deploy code.
Không có script tự ghi đè config, copy credentials hoặc dọn database của OpenCode.

## Thêm skill

Dùng cơ chế native OpenCode, ví dụ `.opencode/skills/writing/SKILL.md` trong project:

```markdown
---
name: writing
description: Edit text for clarity while preserving meaning.
---
Use short sentences. Preserve the author's intent.
```

Hoặc merge một thư viện sẵn có qua host config:

```json
{
  "skills": { "paths": ["/absolute/path/to/library"] }
}
```

Root cần chứa các file `SKILL.md` có frontmatter hợp lệ. Không còn đọc `package.json`
manifests của `.openarms/packages`. Đường dẫn đó vẫn có thể dùng làm thư viện native
nếu thêm vào `skills.paths` và có `SKILL.md` đúng format; không tự chuyển đổi file.

## Sử dụng

1. Restart/refresh host sau thay đổi library theo phiên bản OpenCode.
2. Mở `/skills`, chọn skill rồi **Inspect** hoặc **Request in draft**.
3. Request được append, không xóa draft và không auto-submit. Kiểm tra normal mode,
   nội dung và model đang dùng trước khi gửi.
4. Native `skill` tool xử lý việc nạp; model tuân thủ instruction không được bảo đảm.

Skill tool và custom tools không bị output governor rewrite. OpenArms không inject
catalog hoặc toàn bộ skill instructions vào system prompt; host quyết định native descriptions.

## Development

```bash
npm run test:plan -- --task my-task
npm run check
npm test
npm run test:policy
```

Thin runner: TypeScript/local imports/active doc links + small Node unit suite. Không
Docker, Python, PTY, smoke cache, test mapping database hay Git hooks. Offline tests
không chứng minh live TUI/provider acceptance.

## Giới hạn và privacy

- Logs có thể chứa secret; private permissions không phải redaction. Không share logs tùy tiện.
- Bản gốc là **observed output** tại hook, có thể đã bị host truncate trước đó.
- Cap 50.000 UTF-8 byte chỉ áp dụng output đi qua governor, không toàn prompt/native skill.
- Retention best-effort 7 ngày / 100 file / 64 MiB cho output logs mới; recent files được bảo vệ.
- Không khẳng định mức tiết kiệm token/chi phí hoặc task success khi chưa đo.
- Phiên bản installed cũ không tự thay đổi. Đọc migration trước khi upgrade.

## Tài liệu

- [Mục lục](docs/README.md)
- [Migration 0.1 → 0.2 và xử lý bản cài cũ](docs/guides/migration.md)
- [Skills](docs/guides/skill-management.md)
- [Output/logs](docs/guides/output-compaction.md)
- [Architecture](docs/architecture/Architecture.md)
- [Testing/manual checklist](docs/testing/testing.md)
- [Tài liệu lịch sử](docs/archive/README.md) — không phải contract hiện hành

## License

Engine MIT; bundled `skills/` giữ license riêng. Thư viện mẫu không tự đăng ký vào host.
