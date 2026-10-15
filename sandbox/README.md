# OpenArms sandbox

Trước push dùng `npm run test:pre-push -- --base <revision>` từ root: full và
smoke theo phạm vi trong một lượt. Xem trước bằng `--plan`. CI đặt `CI=true`
để không tin local stamps; thiếu Docker/Python/PTY bắt buộc thì blocked.
Xem [bảng quyết định](../docs/testing/testing.md) và
[Sprint 0.4](../docs/testing/how_to_test/Sprint_04.md).
Toàn bộ ca static/runtime/TUI, tám ca thủ công, offline container, điều kiện,
kết quả mong đợi và cleanup nằm trong [hướng dẫn sandbox đầy đủ](../docs/testing/how_to_test/Sandbox.md).

Docker Compose tái tạo môi trường hiện tại: Node **24.12.0**, OpenCode
**1.18.35**, plugin SDK **1.18.34** từ lockfile của dự án. Server plugin dùng
`opencode.json`; TUI plugin dùng **`tui.json` riêng**, giống cài đặt trên máy.

## Khởi động

Contract hiện tại: [Single Library](../docs/testing/how_to_test/Single_Library.md).
Project mới bắt đầu chưa chọn library; project đã cấu hình giữ state hiện có.
Không coi evidence Sprint 2.4 cũ là renderer/PTY acceptance của flow hiện tại.

Yêu cầu Docker Engine và Compose v2 trở lên. Chạy từ repository:

```bash
npm run sandbox -- start
```

Bộ chạy thống nhất chỉ chạy smoke khi policy yêu cầu: static offline trước, dùng
lại stamp pass nếu đầu vào không đổi, kiểm tra nhãn fingerprint để dùng lại/build
image. Khi cần, chỉ build runtime image một lần trong lượt gọi. Smoke dùng project
tạm với volume sạch và cleanup riêng, không dùng state của `start` thủ công.
Không chạy tuần tự mọi sandbox test sau mỗi edit. Xem
[test policy](../docs/testing/testing.md) và dùng `npm run test:smoke` hoặc
`npm run test:tui-smoke` để override tường minh. Các command `sandbox -- build`,
`test`, `smoke`, `tui-smoke` vẫn dùng được khi chẩn đoán cấp thấp.

`npm run test:smoke-static` không cần Docker. Thêm `-- --force` để bỏ qua smoke
pass stamp; `-- --rebuild` cũng buộc build lại. Static/runtime/TUI fingerprints
độc lập, nên TUI-only edit không invalidate server pass. Installed library bytes
được fingerprint, không dùng chung stamp/image mode với repository. Xem
[smoke contract](../docs/testing/smoke-contract.md) để biết inputs và log locations.

Image chứa snapshot code tại thời điểm build. Sau khi sửa source, build riêng
runtime bằng `npm run sandbox -- build cli` (installed:
`npm run sandbox -- build --installed cli`), rồi start. Image đã build thì chỉ
cần start để tiếp tục thử; không cần cài lại, reset auth hay full/smoke.
Build không ghi đè template config đã tồn tại trong volume; kiểm tra/sửa config
có chủ đích khi template thay đổi. Lần chạy OpenCode đầu tiên có thể cần tải dependency và
metadata; smoke test cho phép tối đa 120 giây cho mỗi request khởi tạo.

`test` chạy core/server tests offline, không có volume runtime, không phải full
suite host. `smoke`/`smoke-runtime` khởi động server nội bộ, kiểm tra binary,
XDG paths, cấu hình server, server plugin và sole tool `load_skill`.
Không cần đăng nhập/model để chạy hai kiểm tra này. Smoke test không kiểm chứng
render/bàn phím TUI hay gọi model.

`tui-smoke` cần **Python 3 trên host Linux/macOS**, mở terminal giả lập, gõ
`/skills`, kiểm tra picker `Select Action`, cuộn/vòng danh sách bằng phím xuống
và lên qua lần mở lại dialog. Test gửi cả sự kiện hover chuột trên danh sách
để kiểm tra hover không giành lựa chọn của bàn phím. Container kiểm
tra được dừng/xóa sau khi chạy; volume được giữ. Lệnh này không gửi prompt đến
model. Có thể thêm `--installed` để kiểm tra TUI với thư viện cài đặt.

## Hai chế độ mount, một library được chọn

Mount không tự chọn nguồn. Trong `/skills` → Status nhập root chứa `registry.json`
+ `skills/`; editor ở đầu khi selection rỗng, cuối khi đã chọn. Không merge nguồn
hoặc implicit env default. Metadata local v1/v2 hỗ trợ, không cần migration/hash
approval/Grant/Revoke. Có thể chọn thư mục project hợp lệ thay hai mount dưới.
Đường dẫn host không truy cập được trong container nếu chưa mount.

### Repository — mặc định

Dùng snapshot code, registry và thư viện được đóng gói từ repository.
Compose project: `openarms-sandbox`. Chọn root `/opt/openarms` trong Status;
không tự chọn chỉ vì image có library. Packages/IDs lấy từ metadata nguồn đã chọn.

### Installed — thư viện router hiện tại

```bash
npm run test:smoke -- --installed
npm run sandbox -- start --installed
```

Dùng **code mới từ repository** với registry/skills của cài đặt hiện tại.
Chỉ mount read-only:

- `/home/hodangthaiduy/.local/share/opencode-skill-router/registry.json`
- `/home/hodangthaiduy/.local/share/opencode-skill-router/skills/`

Không dùng plugin cũ, `node_modules`, backup hay state cũ. Mount nằm tại
`/opt/installed-router`; chọn rõ root này trong Status, không lấy environment làm
selection mặc định.
Nếu đường dẫn không tồn tại, Compose báo lỗi thay vì tạo thư mục host.

Compose project riêng `openarms-sandbox-installed` giữ volume riêng, tránh
trộn runtime data với chế độ repository. Mounted library
phản ánh thay đổi trên host; đây không phải snapshot bất biến.

Có thể đổi đường dẫn/phiên bản bằng `sandbox/.env`, dựa trên `.env.example`.
Không ghi credential vào file đó. Ví dụ override cho một lần chạy:

```bash
ROUTER_LIBRARY=/absolute/path/to/router npm run sandbox -- start --installed
```

## Dữ liệu và quyền

Container chạy user `node` (UID 1000), root filesystem read-only, bỏ Linux
capabilities và không cấp quyền Docker socket. Không publish port ra host.
Runtime `/tmp` dùng tmpfs với `exec`: OpenTUI giải nén và load thư viện native
`.so` tại đây. Dùng `noexec` sẽ khiến server vẫn chạy nhưng TUI không khởi động.
Bun install cache cũng nằm trong volume cache để chạy được với root filesystem
read-only. Adapter dùng command `prompt.submit` của OpenCode 1.18.35 để chặn
`/skills` trước native skill picker.

| Volume | Container path | Nội dung |
|---|---|---|
| `config` | `/home/node/.config` | OpenCode config và dependency cấu hình |
| `state` | `/home/node/.local/state` | OpenArms/OpenCode state |
| `data` | `/home/node/.local/share` | Database, đăng nhập và session sandbox |
| `cache` | `/home/node/.cache` | Cache, binary phụ trợ |
| `project` | `/workspace/project` | Project thử có thể sửa |

OpenArms state: `/home/node/.local/state/openarms/state.json`.
OpenCode data: `/home/node/.local/share/opencode`.

Không mount/copy `~/.local/share/opencode` thật, auth, database, lịch sử session,
SSH key, Git credential hoặc config provider thật. Build context có allowlist
trong `.dockerignore`. Runtime `cli`/`smoke` có network để OpenCode tải dependency
và kết nối provider; `test` có `network_mode: none`.

## Đăng nhập và provider

Đăng nhập riêng trong sandbox:

```bash
npm run sandbox -- auth login
# Hoặc với bộ volume installed:
npm run sandbox -- auth --installed login
```

Credential được lưu trong volume `data` của chế độ tương ứng. Với OAuth, URL
đăng nhập có thể mở bằng browser trên host. Provider cần callback localhost có
thể cần cấu hình port riêng; Compose mặc định không expose callback.

Muốn chỉnh provider/config, mở shell và sửa file trong volume config bằng công
cụ riêng hoặc `node`; không copy toàn bộ cấu hình thật chứa credential:

```bash
npm run sandbox -- shell
npm run sandbox -- doctor
```

Template config chỉ được copy khi file chưa tồn tại, để giữ chỉnh sửa sandbox.
Rebuild không refresh những file đã tồn tại. Kiểm tra/sửa config có chủ đích;
chỉ dùng `reset` rồi chạy lại nếu đã backup và thật sự muốn môi trường sạch,
mất auth, database, state, cache và project thử. Reset không cần cho thử bình thường.
Auth hiện có được giữ; chỉ login nếu cần. Menu/lệnh local không cần model,
nhưng load thật và thử model cần provider trong sandbox.

## Project fixture và test TUI

Mặc định seed `docs-project` vào volume project rỗng. Muốn dùng project không
được nhận diện Docs, chọn **trước lần tạo volume đầu tiên**:

```bash
SANDBOX_FIXTURE=empty-project npm run sandbox -- start
```

Fixture chỉ seed khi project rỗng; đổi biến không ghi đè project đang dùng.
Test thủ công trong TUI:

1. `/skills`: picker mở, lọc và điều hướng bằng bàn phím.
2. Status: project thử riêng chưa cấu hình phải hiện Not configured; project đã
   dùng giữ root/lựa chọn hiện có, không reset sandbox để thử lần đầu. Chọn `/opt/openarms`, `/opt/installed-router`
   nếu installed, hoặc thư mục project chứa registry và skills.
3. `/skills packages`, `/skills list <package>`: dùng exact IDs của nguồn này;
   không giả định external library có cùng package/skill như fixture.
4. Use package và optional ID; inspect thấy Selected, chưa phải Loaded.
5. Khi có authority và provider, Ask nạp đúng selected ID cho task.
6. Xác nhận call `load_skill({skill: "<selected-id>"})` thành công rồi Loaded;
   tool IDs endpoint không thay bằng chứng model load. Không đọc SKILL.md trực tiếp.
7. Đổi root: Cancel mặc định giữ root/state; confirm xóa prior source state trong
   project và nên `/new`. Model context cũ không thể thu hồi. Thử folder lỗi/Missing.
8. Phiên gốc mới tự nhận lựa chọn gần nhất của cùng project/library/revision dưới
    dạng Selected, không Loaded/grants/task locks. Home draft ưu tiên đúng một lần;
    mở lại phiên cũ giữ lựa chọn riêng, phiên phụ không kế thừa. Không có hộp Restore.
     Quyền host shell/read độc lập; tests dùng dữ liệu synthetic.
     Ngay sau `/new`, trước prompt thường, Home status preview Selected gần nhất,
     không Loaded; chỉ đọc preview không tạo draft hay request provider.
9. Gõ `/usage ` chưa Enter để mở picker; `/budget` có dashboard + editor project
    qua **e**. Các limit/cảnh báo chỉ report-only, không chặn request. Xem
    [budget UX](../docs/budget-ux.md) và checklist để thử Cancel/Save/dữ liệu thiếu.

## Vòng đời

Retention tự chạy sau build hoặc validated image reuse, không phải mọi lần start
và không chạy khi smoke stamp hit. Mặc định giữ 2 image mỗi mode, cộng image đang
chọn và mọi image container tham chiếu (kể cả đã dừng). Đây không phải quota byte,
không dọn shared BuildKit cache. Nếu muốn kiểm tra storage, review dry-run tùy chọn
trong [hướng dẫn retention](../docs/testing/testing.md#storage-và-giới-hạn-image-sandbox);
không cần tạo nhiều image lớn để thử. Checklist thử bình thường nằm ở
[manual-testing.md](../docs/testing/manual-testing.md), với mục
[Các tính năng mới — kiểm thử riêng](../docs/testing/manual-testing.md#các-tính-năng-mới--kiểm-thử-riêng)
cho lề dialog normal/narrow, Cancel/Confirm liền hàng, Home preview, usage và budget.

```bash
# Kiểm tra cấu hình và mount mà không chạy container
npm run sandbox -- config --installed

# Dừng container, giữ volume
npm run sandbox -- stop
npm run sandbox -- stop --installed

# XÓA dữ liệu sandbox tương ứng: auth, database, state, cache và project thử
npm run sandbox -- reset
npm run sandbox -- reset --installed
```

Hai lệnh reset không xóa thư viện mounted trên host. Image không bị xóa bởi reset.
Các lệnh `run --rm` xóa container sau khi thoát và giữ volume cho lần sau.
