# Migration 0.1 → 0.2 — nâng cấp có review

[← Mục lục](README.md)

Đây là breaking redesign, không phải self-updater. Source checkout, installed runtime,
config/library và dữ liệu người dùng là các scope riêng. Push GitHub hoặc restart không
tự thay `~/.config/opencode/openarms-runtime`; không có script tự sửa config/dọn DB.

## 1. Điều gì thay đổi?

| Bản cũ | Bản 0.2 |
|---|---|
| Package manifests, ON/OFF, grants/hash approvals, selection state và auto-injection | Native host catalog; request skill khi cần |
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
- [ ] Kiểm tra tất cả A1–A9 trong [Manual acceptance](verification.md#manual-acceptance), ghi evidence.
- [ ] Xác nhận UI và filesystem không còn side effects của tính năng đã gỡ.
- [ ] Nếu kết quả ambiguous hoặc rollback cần thiết, dừng automation, kiểm tra drafts/data trước retry.

Lưu commands/results vào PR/release bằng [mẫu bàn giao](verification.md#handoff-template).
Unit tests không tự đánh dấu live migration đã hoàn tất.

## Tra lịch sử

Archive/runbooks cũ đã gỡ khỏi cây docs; xem
[snapshot `75afd87`](https://github.com/apase95/OpenArms/tree/75afd87/docs/archive) khi cần
provenance. Không dùng “current/done” hoặc commands trong snapshot làm contract cho bản mới.

**Tiếp theo:** [Verification](verification.md) để nghiệm thu; [Mục lục](README.md) để quay lại lộ trình sử dụng.
