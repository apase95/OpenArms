# Migration OpenArms 0.1 → 0.2

Đây là breaking redesign. Chỉ source checkout được thay đổi trong task này;
`~/.config/opencode/openarms-runtime`, global config, host DB và dữ liệu cũ không tự cập nhật.
Không tự chạy migration, cleanup, deploy hay rollback dữ liệu.

## 1. Những phần đã gỡ

- Usage/budget/context meter và commands/tools tương ứng.
- Remote ingestion, audit/decompiler/install, registry/hash approvals.
- Skill ON/OFF, grants, task/package locks, persistent selection và system injection.
- Handoff/progress/session rotation/lifecycle và state-machine helpers.
- Controller/scout/implementer prompts/profiles và config examples.
- Governance telemetry/shadow/file-access rules/noise presets.
- Sandbox/Docker/PTY, CI registry integrity và test mapping/cache/acceptance platform.

Giữ domain compactors, output logs tối thiểu và native catalog browser.
Thin test entrypoint giữ tên `scripts/arms-test.mjs` nhưng chỉ còn syntax/verify/full/policy
và scope diagnostics; không hỗ trợ smoke/baseline/report/pre-push hay acceptance ledgers.

## 2. Trước deploy

- [ ] Dừng/đóng các phiên/client có thể đang dùng runtime cũ.
- [ ] Backup runtime, host config và dữ liệu riêng trước thao tác vận hành.
- [ ] Xác định effective config: global `.json`/`.jsonc`, project overrides, TUI config.
- [ ] Xác nhận server/TUI plugin URLs thực sự trỏ tới nơi sẽ deploy.
- [ ] Review installed-only changes; đừng copy đè library/state/credential cùng code.
- [ ] Nếu bản installed có `auto-prune.ts`/server hook xóa DB host, gỡ khỏi bản triển khai
  mới sau review. Restart checkout không vô hiệu hóa code installed khác đường dẫn.

Không có lệnh deploy tự động trong v0.2. User/admin chọn cách thay runtime code;
không copy toàn thư mục chứa config/credentials. Không dùng SQL cleanup làm migration.

## 3. Chuyển thư viện sang native discovery

- [ ] Inventory skill content; giữ nguyên license và backing reference files.
- [ ] Skill cần `SKILL.md` + frontmatter hợp lệ theo host, không chỉ package manifest.
- [ ] Với `.openarms/packages`, arbitrary filenames phải được review/chuyển thành native
  skill layout thủ công; `package.json` mappings không còn được OpenArms đọc.
- [ ] Thêm native project directory hoặc merge `skills.paths` trỏ library sẵn có.
- [ ] Giải quyết tên trùng và kiểm tra catalog sau refresh/restart.

```json
{
  "skills": { "paths": ["/absolute/path/to/library"] }
}
```

Tất cả skill host trả hợp lệ đều available, không chuyển trạng thái ON/OFF. Không cần
central registry, `OPENARMS_LIBRARY_ROOT` hay approved registry hash; các env/settings cũ
không có tác dụng với OpenArms mới.

## 4. Review rules và profiles cũ

Chỉ gỡ những settings bạn xác định do OpenArms cũ thêm và không còn muốn giữ:

- `permission.skill` deny toàn bộ native skills.
- Read/Bash rules chặn `SKILL.md` chỉ nhằm ép custom loader.
- `openarms_usage`, `/usage`, `/budget` integrations.
- Controller/scout/implementer agents và prompt paths đã gỡ.
- Custom workflow tools, commands hoặc instructions yêu cầu load tool/ON/OFF cũ.

Không reset permission chung của người dùng, không auto-allow filesystem/network.
Có thể giữ host permission theo nhu cầu riêng. Chỉ “bỏ quyền OpenArms” không khiến host
permission tự mất. Trong TUI mới, Request chỉ stage draft; native tool tiếp tục có thể hỏi/deny.

## 5. Bảo toàn dữ liệu

Không xóa tự động:

- `$XDG_STATE_HOME/openarms` hoặc `~/.local/state/openarms` (usage/governance/state cũ).
- `.openarms/progress.md`, handoff journal/drafts, budget policy và logs cũ.
- Host database, conversation hoặc authentication.

Code mới không đọc state/budget/handoff cũ. Logs retention chỉ quản lý tên `output-<uuid>.log`
mới, không dọn artifacts legacy. Nếu muốn archive/delete dữ liệu cũ, làm riêng sau backup,
kiểm tra không còn runtime cũ ghi và review privacy. Đây không phải requirement để chạy 0.2.

## 6. Sau deploy

- [ ] Server/TUI cùng revision; restart đúng host/runtime location.
- [ ] `/skills` hiển thị native catalog; không còn ON/OFF, install hoặc usage UI.
- [ ] Inspect đúng skill; Request append mà không mất draft hoặc tự submit.
- [ ] Dùng normal prompt mode; gửi task thử và kiểm tra native skill tool/host permission.
- [ ] Tool output lỗi giữ title/metadata; compact có original artifact nếu cần.
- [ ] Native skill output không bị OpenArms cap/rewrite.
- [ ] Không có state/usage/handoff file mới hoặc write vào DB host từ OpenArms.

Offline checks: `npm run check`, `npm test`, `npm run test:policy`.
Manual host acceptance chưa được thay thế bởi tests. Rollback code phải đi cùng config phù hợp;
không rollback/xóa dữ liệu bằng cách chạy lại cleanup cũ.
