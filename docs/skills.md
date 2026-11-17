# Skills — danh sách gọn, ON/OFF theo project

[← Mục lục](README.md)

OpenCode sở hữu catalog, loading và permissions. OpenArms dùng catalog đó để hiển thị
skills và lưu opt-out theo project. Không installer, package grouping, custom loader,
grants hoặc tự inject instructions. ON/OFF mới là quyết định mở rộng có chủ đích,
không phục hồi state/approval engine legacy.

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

Hoặc merge vào host `opencode.json`, giữ settings khác:

```json
{
  "skills": { "paths": ["/absolute/path/to/your/library"] }
}
```

Bundled `skills/` giữ license riêng; review trước khi dùng. OpenArms không tự đăng ký,
parse frontmatter hoặc đọc package manifests legacy. Host quyết định resolve/refresh.

## 2. Browser

1. Mở OpenCode global trong **project**, restart sau khi thay plugin source.
2. Gõ `/arms-skills` → **Skills management**, hoặc palette **OpenArms** rồi chọn mục đó.
   Chỉ một slash command cho menu tổng. Feature phải ON; khi OFF, browser và stale actions
   đều bị từ chối. Cách bật lại ở [Features](features.md).
3. Dialog **OpenArms skills** chỉ có tên skills, sắp xếp Alphabet; gõ để lọc.
   Skill OFF trong project hiện tại có **chữ đỏ**, kể cả khi đang chọn; ON dùng màu theme
   bình thường. Đây là lựa chọn OpenArms, không phải kết luận host đã allow/deny.
   OFF vẫn chọn được để bật ON. Sau toggle rồi Back, màu được cập nhật; mở lại catalog
   để đọc thay đổi từ client khác. Không thêm description, preview, package hoặc suffix tên.
   Tìm kiếm không phân biệt hoa/thường, hỗ trợ subsequence và giữ thứ tự Alphabet.
   Dùng ↑/↓, PageUp/PageDown, wheel hoặc click; danh sách dài render theo cửa sổ bounded.
   `/skills` vẫn thuộc host.
4. Chọn skill: title hiện tên và lựa chọn **ON/OFF**, menu luôn có ba dòng:
   **ON**, **OFF**, **REQUEST**. Phía dưới mọi dialog OpenArms (cả catalog rỗng) có
   **Back** và **Done**, không lẫn vào danh sách/filter:
   - **Back** về danh sách names; ở danh sách gốc hoặc empty state thì về menu OpenArms.
   - **Done** đóng browser, không đổi preference đã lưu hoặc draft.
   - Có thể click nút, dùng **Alt+←** cho Back, **Alt+Enter** cho Done; Esc vẫn đóng.
   Các nút chỉ thuộc OpenArms, không sửa dialog native của OpenCode.
5. **REQUEST** append yêu cầu dùng native skill tool vào draft; bạn review ở normal
   mode, thêm task rồi tự gửi. Không reset draft/attachments hoặc auto-submit.

Catalog body có thể được host trả về nhưng không được render hay tự đưa vào context.
Request trong draft không chứng minh model đã load hoặc tuân thủ skill. Metadata lỗi
hoặc trùng tên: title action có `ERROR`, mọi action bị từ chối; không fallback scan file.

<a id="project-switches"></a>
## 3. ON/OFF theo project

Phạm vi hiện tại: **TUI và server local, cùng filesystem và cùng checkout**. Không dùng
switches với remote attach/SSH tách filesystem. Cần cả hai plugin active; browser riêng
không chứng minh server đang enforce. Đây không phải sandbox trước code/plugin đối địch.

- Các quy tắc dưới đây áp dụng khi **Skills management ON**. Feature OFF ngừng browser và
  opt-out enforcement của OpenArms, giữ choices để bật lại; cached native denies cần restart.
  Đây không phải OFF từng skill; xem [Feature controls](features.md).
- Mặc định mọi skill **ON theo lựa chọn OpenArms**, không đồng nghĩa host đã allow.
- **OFF** lưu tên skill rồi server before-hook đọc lại preferences để chặn lần gọi native
  `skill` tiếp theo, kể cả session đang có permission/approval cached. Guard chỉ deny,
  không thay args, không rewrite native tool results. REQUEST của skill OFF bị từ chối.
- Khi host nạp server plugin, config hook thêm exact native `permission.skill.<name>=deny`
  và deny vào agent overrides trong effective config **in-memory**. Không sửa host config
  trên disk. Tên có wildcard/ký tự không phù hợp exact rule sẽ không đổi trạng thái.
- **ON** chỉ xóa opt-out của OpenArms, không cấp quyền mới. Nếu deny đã được config hook
  nạp vào cache, **restart client/server** để host dựng lại permissions; deny/ask nguyên có
  của người dùng vẫn giữ. ON không gỡ deny trong config cá nhân.
- OFF không hủy tool call đã qua guard, không xóa skill đã load, không thay draft cũ.
  Muốn context không còn instructions đã load cần conversation mới do người dùng chọn.
- Chặn native `skill` không ngăn đọc cùng nội dung bằng read/Bash; không có file/network
  permission engine bổ sung. Không cam kết mọi host version; nguồn host tham khảo `1.19.3`.

### Persistence và privacy

File `<projectRoot>/.openarms/skills.json` chứa version và danh sách disabled:

```json
{
  "version": 1,
  "disabled": ["paper-writing"]
}
```

Root dùng worktree khác `/`, nếu không dùng directory (cùng quy tắc server output).
Subdirectories trong cùng worktree dùng chung lựa chọn; project khác độc lập. Không cho
đổi preferences ở filesystem root, home hoặc trong global OpenCode config directory.
TUI không gọi tool/model để đổi trạng thái; không có tool cho model tự bật lại skill.

Store tạo `.openarms` private và file **0600**, write/flush vào temp exclusive rồi rename.
Không chmod thư mục cũ hoặc sửa `.gitignore`. Thư mục/file không private, symlink, malformed
JSON, version lạ hoặc read error sẽ báo lỗi; server fail closed đối với native skill calls.
Giới hạn 256 disabled names / 64 KiB. Missing file nghĩa mặc định ON.

Writers dùng `.openarms/.skills.lock` exclusive, không auto-retry hoặc xóa stale lock.
Nếu bị ngắt giữa chừng, kiểm tra không còn writer trước khi tự xử lý lock; refresh trước
retry vì save có thể đã commit. Không sửa/xóa legacy state, DB host hoặc conversations.
Owner của workspace chịu trách nhiệm backup/ignore policy; không share artifacts tùy tiện.
Đây là owner-controlled local filesystem, không bảo đảm chống concurrent hostile mutation.

<a id="draft-safety"></a>
## 4. An toàn khi chuyển session

Browser giữ directory, worktree/root và home/session ban đầu. Trước request hoặc toggle
phải revalidate skill và target; callback stale/disposed không bắt đầu action mới.
REQUEST đọc lại preferences trước append, tránh snapshot UI cũ sau khi client khác OFF.
Back/Done/Esc invalidates callbacks của dialog cũ. Kết quả async không được mở lại browser
đã đóng hoặc clear dialog mới. Đóng browser **không hủy** save/append đã gửi; kiểm tra
preference/draft trước retry, không suy ra rollback từ việc đóng cửa sổ.

Host append API không có session ID/compare-and-append. Guard client không loại hết race:
append đã gửi mà route đổi hoặc kết quả lỗi thì **chưa xác nhận**, không success/clear/retry.
Kiểm tra drafts trước khi thử lại. Toggle đã bắt đầu save có thể hoàn tất trong project
ban đầu sau khi đổi route; không cập nhật UI của project mới hoặc chuyển write sang đó.

## 5. Tra lỗi

| Code / dấu hiệu | Hành động |
|---|---|
| `CATALOG_UNSUPPORTED` / `APPEND_UNSUPPORTED` | Kiểm tra host/SDK tương thích. |
| `CATALOG_CONNECTION_FAILED` | Catalog call thất bại; kiểm tra host/kết nối, không suy chắc là lỗi mạng. |
| `CATALOG_REJECTED` / `CATALOG_INVALID_RESPONSE` | Kiểm tra host diagnostics/config/SDK; không có scanner fallback. |
| `DRAFT_TARGET_UNAVAILABLE` | Mở home/session có prompt hợp lệ. |
| `DRAFT_TARGET_CHANGED` | Mở lại browser tại đúng project/session; write đã in-flight có thể đã lưu ở project cũ. |
| `SKILL_CHANGED` / `ERROR` | Refresh catalog, review library/metadata hoặc trùng tên. |
| `SKILL_OFF` | Chọn ON nếu muốn request, sau đó restart nếu native config còn cached deny. |
| `FEATURE_OFF` | Mở `/arms-skills` → Features → Skills management → ON. |
| `FEATURE_STATE_UNAVAILABLE` | Review `.openarms/features.json`; không tự coi feature OFF/unknown là ON. |
| `POLICY_READ_FAILED` / `SKILL_POLICY_UNAVAILABLE` | Review private storage và nội dung preferences; không tự coi lỗi là tất cả ON. |
| `POLICY_WRITE_FAILED` | Review project path, permissions, tên skill và lock; refresh trước retry. |
| `APPEND_UNCONFIRMED` | Kiểm tra drafts trước retry, không suy ra chắc append thất bại. |
| ON nhưng native tool bị deny | Restart nếu vừa bỏ OFF; review host policy, không tự bypass deny. |
| Thiếu skill | Kiểm tra native library/paths và host diagnostics; host có thể bỏ lỗi/resolve duplicates trước response. |

Thông báo UI dùng mã cố định, không hiển thị raw exception hoặc response body.

**Tiếp theo:** [Output](output.md), [Architecture](architecture.md), [Verification](verification.md).
