# Skills — browser cho native OpenCode

## Contract

Tất cả skill hợp lệ mà OpenCode trả trong catalog đều có thể được xem/request.
Không ON/OFF, package bulk toggle, grant/approval, selection restore hoặc auto-injection.
OpenArms không parse frontmatter hay scan filesystem; host là nguồn discovery duy nhất.

## Tạo một skill

Ví dụ project path `.opencode/skills/writing/SKILL.md`:

```markdown
---
name: writing
description: Improve clarity while preserving the original meaning.
---
Use short sentences. Explain important edits.
```

Thêm thư viện ngoài bằng cách merge host config, không thay toàn file:

```json
{
  "skills": { "paths": ["/absolute/path/to/your/library"] }
}
```

Host version/config quyết định cách resolve paths, scope và refresh. Không có runtime path
picker hoặc OpenArms library state nữa. Bundled `skills/` không tự được thêm vào catalog;
nếu muốn dùng, thêm absolute path của nó vào `skills.paths` và review license/nội dung.

## `/skills`

1. Mở browser, gõ để lọc tên/description bằng host UI.
2. Chọn skill → **Inspect** xem location và body preview.
3. **Request in draft** refresh catalog và append instruction gọi native `skill` tool.
4. Review draft, chắc chắn đang normal mode, bổ sung task rồi tự gửi.

Request không phải execution acknowledgement. OpenArms không tạo session, không submit,
không đổi model và không đánh dấu “Loaded”. Existing draft không bị reset; request được
append có newline. Native skill tool sẽ hỏi/chặn theo host permissions nếu cần.
Không có bảo đảm atomic single-client targeting của host append endpoint.

## ERROR và troubleshooting

- Response thiếu trường/name không hợp lệ/tên trùng: ERROR, không có Request action.
- Không có `app.skills` hoặc mất kết nối: báo lỗi; không chuyển sang scanner riêng.
- Catalog rỗng: kiểm tra native directories/`skills.paths` và refresh/restart host.
- Skill file lỗi không hiện: xem host diagnostics; host có thể bỏ file trước khi trả catalog.
- Tên trùng đã bị host override trước response: OpenArms không phát hiện được bản bị che.
- Gọi skill bị deny: review host permission, đặc biệt rules OpenArms cũ.

Không bypass permissions bằng đọc file trực tiếp khi host đã deny.
Xem [migration](migration.md) trước khi dùng thư viện manifests cũ; arbitrary `.md`
không tự chuyển thành `SKILL.md` hợp lệ.

## Nguồn API khảo sát

- [OpenCode native skill implementation v1.19.3](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/skill/index.ts)
- [Native skill tool v1.19.3](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/tool/skill.ts)

Live TUI/provider acceptance phải được kiểm tra riêng trên host của người dùng.
