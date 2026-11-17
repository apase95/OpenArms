# Migration 0.1 → 0.2 — nâng cấp có review

[← Mục lục](README.md)

Đây là breaking redesign, không phải self-updater. Source checkout, installed runtime,
config/library và dữ liệu người dùng là các scope riêng. Push GitHub hoặc restart không
tự thay `~/.config/opencode/openarms-runtime`; không có script tự sửa config/dọn DB.

## 1. Điều gì thay đổi?

| Bản cũ | Bản 0.2 |
|---|---|
| Package manifests, grants/hash approvals, selection state và auto-injection | Native host catalog, REQUEST; project ON/OFF mới chỉ lưu deny-only opt-outs, không dùng legacy state |
| Usage/budget/context meter, telemetry/shadow/file rules | Không còn |
| Download/audit/decompile/install skill | Không còn; user quản lý library qua host |
| Handoff/rotation/lifecycle, controller/scout/implementer profiles | Không còn |
| Docker/PTY smoke, test mapping/cache, acceptance platform và registry CI | Small host checks; manual acceptance riêng |
| Domain compactors | Giữ, với logs tối thiểu; [contract output](output.md) |

Hai plugin entry paths/IDs được giữ. Env/settings như `OPENARMS_LIBRARY_ROOT` hoặc
approved registry hash không còn có tác dụng với code mới.

## 2. Trước deploy

- [ ] Dừng/đóng các clients có thể đang dùng runtime cũ; backup runtime/config/dữ liệu riêng.
- [ ] Xác định effective config: global `.json`/`.jsonc`, project overrides và TUI config.
- [ ] Xác minh plugin URLs thực sự trỏ tới path sẽ deploy; review installed-only changes.
- [ ] Nếu installed có `auto-prune.ts`/server hook xóa DB host, loại khỏi **bản code triển khai**
  sau review. Không chạy cleanup hoặc SQL để thử nó trên dữ liệu thật.
- [ ] Chọn revision artifact, kiểm tra theo [Verification](verification.md#host-checks) và chuẩn bị rollback.

Không copy toàn config directory, credentials hoặc library/state như một cách deploy code.
Không có lệnh deploy chuẩn tự động trong 0.2; user/admin chọn và review phương thức thay runtime.

## 3. Chuyển library và cấu hình

- [ ] Inventory skill content, license và backing reference files.
- [ ] Dùng native `SKILL.md` + frontmatter và discovery/`skills.paths` theo [Skills](skills.md#library).
- [ ] Với `.openarms/packages`, `package.json` mappings không còn được đọc; arbitrary `.md`
  cần review/chuyển layout thủ công, không tự đổi tên hoặc generate instructions.
- [ ] Giải quyết duplicate names, refresh host và kiểm tra catalog.

Chỉ gỡ những rules/profiles đã xác định do OpenArms cũ thêm và không còn muốn giữ:

- `permission.skill` deny toàn bộ native skills; read/Bash denies ép custom loader qua `SKILL.md`.
- `/usage`, `/budget`, `openarms_usage` integrations.
- Controller/scout/implementer agents, prompt paths và commands/instructions yêu cầu loaders/ON/OFF cũ.

Không reset mọi permission hoặc auto-allow OS/network. Host ask/deny có thể là chính sách
riêng hợp lệ; code mới không tự bypass nó.

## 4. Dữ liệu cũ và rollback

Code mới không đọc/migrate/xóa legacy toggle/usage/budget/handoff state. Giữ nguyên:

- `$XDG_STATE_HOME/openarms` hoặc `~/.local/state/openarms`.
- Project progress/handoff journal/drafts, budget policy và logs cũ.
- Host database, conversations và authentication.

Retention mới chỉ quản lý tên output artifacts mô tả ở [Output](output.md#storage).
Cleanup legacy data là thao tác riêng sau backup và xác nhận không còn writer cũ, không phải
điều kiện để chạy 0.2. Rollback code phải đi cùng config phù hợp; không chạy cleanup cũ để rollback.

## 5. Sau deploy

- [ ] Server/TUI cùng revision; restart đúng runtime path.
- [ ] Kiểm tra tất cả A1–A15 trong [Manual acceptance](verification.md#manual-acceptance), ghi evidence.
- [ ] Xác nhận UI và filesystem không còn side effects của tính năng đã gỡ.
- [ ] Nếu kết quả ambiguous hoặc rollback cần thiết, dừng automation, kiểm tra drafts/data trước retry.

Lưu commands/results vào PR/release bằng [mẫu bàn giao](verification.md#handoff-template).
Unit tests không tự đánh dấu live migration đã hoàn tất.

<a id="checkout-link"></a>
## 6. Global nguyên bản + plugin từ checkout

Mục tiêu là bỏ OpenArms legacy, không factory-reset cấu hình cá nhân hoặc sửa binary
OpenCode. Hai file URLs là điểm ghép nối duy nhất; không copy `openarms-runtime`, không
symlink cả config directory và không đổi global Node/OpenCode trong cùng migration.

### Gỡ legacy thủ công trước khi nối lại

1. Đóng các OpenCode clients **và servers** dùng runtime cũ trước khi tạo session mới.
   Một số installed runtimes có `auto-prune.ts` được gọi từ `session.created` và có SQL
   xóa sessions cũ. Không chạy runtime đó để thử, không phục hồi hook này khi rollback.
2. Backup riêng các config sẽ sửa và runtime cần đối chiếu, vào thư mục private nằm
   **ngoài** config directories host khám phá. Backup database, nếu cần, là thao tác
   riêng sau khi dừng writers; không dùng cleanup script legacy.
3. Review cả `opencode.json` **và** `opencode.jsonc`, `tui.json` **và** `tui.jsonc`,
   `config.json` nếu có, `~/.opencode`, project overrides và các `OPENCODE_CONFIG*` /
   `OPENCODE_TUI_CONFIG` env overrides. Các nguồn merge; `{ "plugin": [] }` trong một
   file không bảo đảm gỡ plugins đến từ nguồn khác. Review cả `plugin/` và `plugins/`
   tự khám phá, không chỉ entries khai báo trong JSON.
4. Gỡ URLs trỏ vào `openarms-runtime`, prompts controller/implementer, `openarms_usage`,
   agent overrides và các denies ép custom skill loader đã xác định ở mục 3. Nếu toàn
   bộ override `build`/`explore`/`general` là legacy thì gỡ override đó để host dùng built-ins;
   gỡ custom scout/implementer agents legacy thay vì giữ permission fragments rời rạc.
5. Giữ providers/models, MCP, notifier/Herdr, instructions và permissions cá nhân không
   thuộc OpenArms. Comment shell có chữ OpenArms không chứng minh provider env thuộc
   plugin; không xóa credentials hoặc source env đang dùng chỉ theo tên/comment.
6. Sau review, chuyển code/runtime, thư viện `packages/` legacy và config backups thuộc
   OpenArms ra ngoài active config; không xóa state/handoff/conversations. Không tự
   chuyển packages cũ thành native skills. Giữ artifacts không xác định ownership để review.
7. Kiểm tra baseline không OpenArms trên workspace tạm trước khi thêm hai URLs mới.
   Ghi host version và các plugin bên thứ ba còn giữ; đây không phải baseline zero-plugin.

### Nối trực tiếp checkout

Từ checkout chạy:

```bash
node scripts/opencode-link.mjs
```

Lệnh resolve root từ vị trí script, không từ working directory; kiểm tra hai entry files
đọc được và xuất URLs đã encode. Không đọc config/credentials, không gọi host/provider,
không ghi file, cài package hay có mode `--apply`. `--help` in hướng dẫn.

Output là object chứa hai fragments. Merge giá trị key `opencode.json` vào server config,
key `tui.json` vào TUI config, giữ entries khác. **Không redirect output vào config hoặc
paste cả object vào một file.** Xóa URL legacy trước, tránh nạp hai bản plugin; host dedupe
bằng file URL không hợp nhất hai checkout khác đường dẫn.

Không thêm bundled library tự động. Khi cần, review skills rồi cấu hình native `skills.paths`
riêng theo [Skills](skills.md#library). Quyền skill vẫn do host quyết định.

### Test, tháo nối và rollback

- Sửa source → [host checks](verification.md#host-checks) → restart client/server nạp plugin.
  Source chưa commit/đổi branch cũng có hiệu lực sau restart; ghi revision và dirty state.
- Chỉ dùng `/arms-skills` (palette **OpenArms**) cho menu chính. Chọn **Skills management**
  để mở catalog hoặc **Features → ON/OFF** để đổi chức năng. Bản thử nghiệm từng có thêm
  `/arms-skill` cho menu tổng; lệnh số ít đã bỏ, không giữ alias. Các bản đầu 0.2
  đăng ký `/skills` trùng lệnh native của OpenCode `1.19.3`; tên mới tránh tranh lệnh host.
  Không cần đổi hai plugin URLs. Browser mới là **OpenArms skills**, danh sách names →
  ON/OFF/REQUEST; Inspect/preview đã bỏ. Dialog native **Skills** không xác nhận browser plugin đã load.
- ON/OFF mới lưu riêng `.openarms/skills.json` theo project. Không import trạng thái ON/OFF legacy,
  không ghi global config. Cần cả server/TUI local cùng checkout/filesystem; restart cả hai sau upgrade.
  Khi ON sau OFF đã cached vào native permissions, restart host; không tự bỏ deny của người dùng.
  Chi tiết và giới hạn tại [Project switches](skills.md#project-switches).
- Feature flags mới lưu `.openarms/features.json`, mặc định ON khi file chưa có, không
  migrate/delete `.openarms/skills.json`. Không cần sửa plugin URLs hoặc global config.
  OFF Skills management ngừng OpenArms opt-outs, không deny tất cả native skills; cached
  denies có thể cần restart. Chi tiết tại [Features](features.md).
- Kiểm tra [A1–A15](verification.md#manual-acceptance), không coi JSON fragments hoặc unit
  tests là bằng chứng plugin đã load. Không có bảo đảm hot reload hay mọi host version.
- Tháo nối: xóa **đúng hai URLs checkout** khỏi các nguồn đã thêm, restart host; giữ plugins
  khác và artifacts. Không cần uninstall, xóa DB, xóa state hoặc đổi permissions.
- Nếu cần quay lại baseline sạch, dùng config đã review không có OpenArms. Không khôi phục
  nguyên config legacy có dangerous hooks chỉ để rollback. Không xóa checkout khi còn URL
  đang trỏ tới nó.

## Tra lịch sử

Archive/runbooks cũ đã gỡ khỏi cây docs; xem
[snapshot `75afd87`](https://github.com/apase95/OpenArms/tree/75afd87/docs/archive) khi cần
provenance. Không dùng “current/done” hoặc commands trong snapshot làm contract cho bản mới.

**Tiếp theo:** [Verification](verification.md) để nghiệm thu; [Mục lục](README.md) để quay lại lộ trình sử dụng.
