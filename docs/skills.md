# Skills — xem và gọi khi cần

[← Mục lục](README.md)

OpenArms hiển thị catalog do OpenCode cung cấp. Không có ON/OFF, cài skill, custom
loader hoặc quyền skill riêng; host quyết định discovery, loading và permissions.

<a id="library"></a>
## 1. Chuẩn bị thư viện

Tạo `.opencode/skills/writing/SKILL.md` trong project:

```markdown
---
name: writing
description: Improve clarity while preserving the author's meaning.
---
Use short sentences. Explain important edits.
```

Để dùng thư viện ngoài hoặc thư mục `skills/` mẫu của repository, merge cấu hình
native dưới đây vào `opencode.json`, giữ nguyên settings khác:

```json
{
  "skills": { "paths": ["/absolute/path/to/your/library"] }
}
```

Host version/config quyết định cách resolve và refresh thư viện. OpenArms không tự
thêm bundled skills, parse frontmatter hoặc đọc manifest `package.json` cũ. Nội dung
mẫu giữ license riêng; review trước khi đưa vào host.

## 2. Dùng browser

1. Refresh/restart host sau khi đổi library theo phiên bản OpenCode.
2. Mở `/skills` trong home hoặc session prompt, gõ để lọc danh sách.
3. Chọn **Inspect** để xem location và content preview. Preview giữ paragraphs,
   newline/tab của code; chuẩn hóa CRLF, loại ANSI/control và giới hạn khoảng
   12.000 UTF-8 byte trước marker. Labels trong danh sách vẫn là một dòng.
4. Chọn **Request in draft** để append yêu cầu dùng native `skill` tool.
5. Review draft ở **normal mode**, bổ sung task rồi tự gửi.

Request không xóa draft, không auto-submit, đổi model hoặc tự mở quyền. Đưa request
vào draft **không phải** bằng chứng skill đã được nạp hay model đã tuân thủ instruction.
Catalog body có thể được host trả về cho preview, nhưng OpenArms không tự inject body
hoặc catalog vào system prompt.

<a id="draft-safety"></a>
## 3. An toàn khi chuyển session

Browser ghi nhớ directory và home/session ban đầu. Khi chọn skill hoặc refresh trước
append, target phải còn trùng; đổi session ngay trong cùng directory cũng bị chặn.
Callbacks cũ sau dispose không còn tác dụng.

Host append API không có session ID hoặc compare-and-append. Vì vậy guard phía client
không loại bỏ được mọi race trong RPC hoặc chuyển đi rồi quay lại giữa hai lần kiểm tra.
Nếu append đã gửi và target đổi/lời gọi thất bại, kết quả là **chưa xác nhận**: không báo
success, clear dialog hoặc tự retry. Kiểm tra drafts trước khi thử lại vì host có thể đã
nhận request. Chưa có bảo đảm atomic targeting giữa nhiều TUI clients.

## 4. Tra lỗi

| Dấu hiệu / code | Cách xử lý |
|---|---|
| `ERROR` ở một dòng | Metadata không hợp lệ/tên trùng trong response; Inspect để xem và sửa library. Không thể request dòng lỗi. |
| `CATALOG_UNSUPPORTED` | Host thiếu `app.skills`; kiểm tra/nâng phiên bản OpenCode. |
| `CATALOG_CONNECTION_FAILED` | Catalog call throw/thất bại; kiểm tra kết nối và host. Không suy ra chắc chắn nguyên nhân mạng. |
| `CATALOG_REJECTED` | Host trả error; xem host configuration/diagnostics. |
| `CATALOG_INVALID_RESPONSE` | Response shape không hợp lệ; kiểm tra tương thích host/SDK. |
| `DRAFT_TARGET_UNAVAILABLE` | Mở home hoặc session có prompt hợp lệ. |
| `DRAFT_TARGET_CHANGED` | Mở lại `/skills` trong prompt muốn dùng; không bắt đầu append mới từ context cũ. |
| `SKILL_CHANGED` | Skill không còn hợp lệ hoặc location/name đã thay đổi; refresh catalog. |
| `APPEND_UNSUPPORTED` | Host thiếu `tui.appendPrompt`; kiểm tra/nâng phiên bản host. |
| `APPEND_UNCONFIRMED` | Kiểm tra drafts trước retry; không coi đây là xác nhận append thất bại. |
| Catalog rỗng / skill bị thiếu | Kiểm tra native directories, `skills.paths` và host diagnostics; refresh/restart host. |
| Native tool bị deny | Review host permission; nếu nâng từ bản cũ, làm theo [Migration](migration.md). |

Thông báo dùng code/messages cố định, không hiển thị raw exception/response body và
không fallback sang scanner riêng. Host có thể bỏ file lỗi hoặc resolve tên trùng trước
khi trả catalog; OpenArms không phát hiện được nội dung không xuất hiện trong response.
Không bypass host deny bằng cách đọc skill trực tiếp.

**Tiếp theo:** [Output và logs](output.md). Khi kiểm tra bàn giao, dùng [Verification](verification.md).
