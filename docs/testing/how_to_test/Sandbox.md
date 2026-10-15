# Hướng dẫn kiểm thử sandbox đầy đủ

[Tổng quan](../how_to_test_overview.md) · [Bảng lệnh](../testing.md) · [Hợp đồng smoke](../smoke-contract.md) · [Vận hành sandbox](../../../sandbox/README.md)

Hướng dẫn này đối chiếu các kiểm tra đang có trong mã nguồn, không phải biên bản
chạy sandbox. Các số **8 nhóm static, 5 kiểm tra runtime, 4 kiểm tra TUI** là số
harness báo cáo, không phải tổng số assertion riêng lẻ. Tám ca thủ công bên dưới
bổ sung phần trải nghiệm và gọi model mà smoke không chứng minh.

## 1. Điều kiện và chọn phạm vi

Contract hiện hành: [Single Library](Single_Library.md). Mỗi canonical project
ban đầu chưa chọn root. Status editor ở đầu khi selection rỗng, cuối khi populated;
nhập root tuyệt đối chứa `registry.json` và `skills/`. Không env default/merge.
Metadata v1/v2 không cần migrate/hash approval/Grant/Revoke. Sole server tool là
`load_skill({skill})` cho exact selected IDs. Selected không phải Loaded; Missing
và library error cần chẩn đoán, không fallback.

Đổi root mặc định Cancel; hủy giữ nguyên, confirm xóa prior source state toàn
project và nên `/new` vì context cũ không thể thu hồi. Restore mặc định No,
selection cùng library thôi, không grants. Quyền shell/read của host độc lập.
Sprint 2.1–2.4 lưu tooling/evidence lịch sử; không là setup bắt buộc hiện tại.
Full/smoke redesign còn chờ controller; các counts/harness chi tiết dưới đây là
baseline trước redesign, không phải bằng chứng mới hay inventory picker mới.

Chạy terminal từ root repository. Cần Node 22+ và dependencies (`npm ci`).
Static chỉ cần host; runtime cần Docker Engine/Compose v2; TUI cần thêm Python 3,
Linux/macOS và PTY hoạt động. Build/khởi tạo OpenCode có thể cần mạng để tải
binary, dependencies và metadata. Chỉ các ca gọi model mới cần provider/auth.
Không copy auth, database, SSH key hay cấu hình thật chứa credential vào sandbox.

Đường kiểm chứng bình thường là **một kế hoạch, một lượt verify** với toàn bộ
phạm vi task; lặp `--file` cho từng đường dẫn thật, kể cả file mới/xóa:

```bash
node scripts/arms-test.mjs verify --plan --task <task-id> --file <file-a> --file <file-b>
node scripts/arms-test.mjs verify --task <task-id> --file <file-a> --file <file-b>
```

Với thay đổi đã commit, có thể dùng `--base <revision>` thay `--file`. Không
thêm mọi bài sandbox cho mọi task: docs-only bỏ code tests; server-only không
kéo TUI; full bao phủ related. `needs-review` cần mapping được review, không được
bỏ file hoặc chạy tất cả để che lỗi phân loại. Thiếu phụ thuộc bắt buộc là blocked.

Các lệnh sau dành cho **chủ động kiểm chứng một boundary/chẩn đoán**, không phải
chuỗi mặc định sau mỗi edit. Nếu verify đã bao phủ thì dùng lại bằng chứng đó:

```bash
npm run test:smoke-static
npm run test:smoke-runtime
npm run test:tui-smoke
```

`npm run test:smoke` chỉ là alias runtime. `sandbox/smoke.mjs` chỉ import
`smoke-runtime.mjs`, không phải suite thứ tư. Runner truyền đúng danh sách
`plan.related` cho Node ở mode related; full mới lấy toàn bộ tests. Smoke có
harness cố định, `--file` chọn phạm vi policy chứ không lọc assertion bên trong.

## 2. Hai chế độ, snapshot và dữ liệu

| Chế độ | Nguồn và dữ liệu | Giới hạn kết luận |
|---|---|---|
| Repository (mặc định) | Code/registry/skills trong snapshot image; project thủ công `openarms-sandbox` | Chỉ xác minh snapshot đã build |
| Installed (`--installed`) | **Code repository hiện tại**, registry/skills ngoài repository được mount chỉ đọc vào `/opt/installed-router`; project thủ công `openarms-sandbox-installed` | Không chứng minh plugin/package đã phát hành; thư viện có thể đổi trên host |

Chọn `/opt/openarms` cho repository, `/opt/installed-router` cho installed, hoặc
thư mục project hợp lệ trong Status. Mount không tự chọn library; đường dẫn host
không truy cập trong container nếu chưa mount. Installed cần thư viện có sẵn.
Mặc định host mount `ROUTER_LIBRARY` trỏ tới
`/home/hodangthaiduy/.local/share/opencode-skill-router`; có thể đặt đường dẫn khác.
Mount `registry.json` và `skills` dùng `create_host_path: false`: thiếu nguồn phải
báo lỗi, không tự tạo thư mục. Không cần/không được đọc skill trực tiếp để thử.

```bash
npm run test:smoke-runtime -- --installed
npm run test:tui-smoke -- --installed
ROUTER_LIBRARY=/absolute/path/to/router npm run sandbox -- config --installed
```

Các lệnh trên là lựa chọn thay thế khi cần installed, không phải yêu cầu chạy cả
hai chế độ. Repository/installed có state và fingerprint riêng. Runner smoke tạo
Compose project `openarms-smoke-...` tạm, volume sạch rồi dọn `down --volumes`;
không dùng volume của `sandbox start` thủ công.

## 3. Static — tám nhóm hợp đồng, không Docker

**Nguồn:** [smoke-static.mjs](../../../sandbox/smoke-static.mjs).
**Bước:** chạy `npm run test:smoke-static`, đọc summary/log được chỉ tới.
**Đạt:** `PASS: smoke-static` với 8 nhóm, hoặc `SKIP` của lần pass còn hiệu lực.

| Mã | Điều kiện được kiểm tra |
|---|---|
| S1 | Đọc settings và parse JSON server/TUI; cấu hình phải hợp lệ |
| S2 | Mỗi plugin URL khớp chính xác `file:///opt/openarms/plugins/skill-router-server.ts` hoặc `file:///opt/openarms/plugins/skill-router-tui.tsx`; target tồn tại |
| S3 | Server khai báo `permission.skill["*"]` và `permission.read["*SKILL.md"]` là `deny` |
| S4 | Compose `cli`/`smoke`: context `..`, Dockerfile `sandbox/Dockerfile`, target `runtime`; đủ năm volume config/state/data/cache/project; smoke command đúng harness runtime |
| S5 | Installed `cli`/`smoke`: target `/opt/installed-router` registry/skills đúng, mount chỉ đọc và không tạo host path; mount không tự chọn nguồn |
| S6 | Dockerfile có bốn XDG path và các dấu hợp đồng `NODE_VERSION`, `OPENCODE_VERSION`, `OPENARMS_BUILD_FINGERPRINT`, `org.openarms.build-fingerprint` |
| S7 | Tất cả COPY source và fixture được chọn bởi `SANDBOX_FIXTURE` tồn tại |
| S8 | `.dockerignore` giữ runtime và shared validator, loại secrets/cache; source có sole `load_skill` và tham số `skill` |

**Ca biên quan trọng:** chỉ trong bản sao thử, lưu JSON cũ của
`sandbox/config/tui.json`, thay tạm bằng `{broken`, chạy
`npm run test:smoke-runtime`, rồi hoàn lại đúng edit. Mong đợi
`STATIC_SMOKE_FAILED`, không build hoặc khởi động OpenCode. Có thể dùng fixture
`CLI static failure exits before Docker probe, build or OpenCode startup` trong
`tests/smoke-runner.test.mjs` thay cho phá cấu hình thật.

**Chẩn đoán:** đọc lỗi parse/path/mount/COPY được nêu và full log trước retry.
**Chưa chứng minh:** binary cài thật, quyền host thực thi, tool đã đăng ký, render
TUI, mọi tính năng an toàn Compose. S4 kiểm tra khai báo volume/build/command,
không phải kiểm chứng runtime root read-only/capabilities/network.

## 4. Runtime — năm kiểm tra OpenCode thật

**Nguồn:** [smoke-runtime.mjs](../../../sandbox/smoke-runtime.mjs).
**Bước:** Docker/Compose hoạt động; chạy `npm run test:smoke-runtime`.
Runner chạy static trước, dùng image đúng fingerprint hoặc build một lần, rồi
khởi động server trong sandbox tạm. Không cần auth/model.

| Mã | Bước harness và kết quả mong đợi |
|---|---|
| R1 | `opencode --version` khớp `EXPECTED_OPENCODE_VERSION`, mặc định **1.18.35** (timeout binary 15 giây) |
| R2 | `opencode debug paths` chứa bốn XDG directory config/data/state/cache cô lập (timeout 45 giây) |
| R3 | `opencode serve --hostname 127.0.0.1` trên cổng tạm; `/global/health` thành công trong startup deadline |
| R4 | `/config` trả HTTP 200, có server plugin URL và hai quyền `deny` như S3 |
| R5 | `/experimental/tool/ids` chứa `load_skill`, không có legacy `load_verified_skill` hoặc `load_skill_package` |

Startup mặc định **60 giây**, mỗi endpoint request **120 giây**. Harness poll
health với request tối đa một giây; hai request config/tool có timeout riêng.
Runner policy cho toàn runtime/build tối đa 600 giây; đây không phải timeout
startup. **Đạt:** 5 kiểm tra PASS hoặc cache SKIP hợp lệ, cleanup không lỗi.

**Ca biên:** khi server thoát sớm hoặc không healthy, mong đợi
`STARTUP_FAILED`/`TIMEOUT: server-startup`, không stamp pass. Không cố ý gây timeout
dài trên môi trường đang dùng: fixture orchestration/timeout ở Sprint 0.3/0.4
đã cung cấp cách thử lỗi cô lập. Harness dừng server bằng SIGTERM, nâng SIGKILL
sau ba giây nếu cần; runner dọn project/volume kể cả khi lỗi/hủy.

**Chẩn đoán:** xác định stage binary/path/startup/endpoint, đọc full log. Kiểm
tra daemon/mạng/cấu hình trước retry, không chuyển lỗi thành pass bằng tăng timeout.
**Chưa chứng minh:** model gọi loader, hook `tool.execute.after` thật, quyền
read/bash thực thi mọi trường hợp, render/bàn phím TUI, nghiệm thu Phase 1.

## 5. TUI — bốn kiểm tra PTY thật

**Nguồn:** [tui-smoke.py](../../../sandbox/tui-smoke.py).
**Bước:** Docker, Python 3/PTY trên Linux/macOS; chạy `npm run test:tui-smoke`.
Harness mở `cli` trong PTY **120 cột × 32 hàng**, `TERM=xterm-256color`.

| Mã | Tương tác và dấu hiệu đạt |
|---|---|
| T1 | Container/TUI khởi động và xuất dấu `ctrl+p`; harness đợi hơn 30 giây trước gõ |
| T2 | Gõ `/skills`, chờ hai giây rồi Enter; thấy `Select Action` |
| T3 | 11 lần phím xuống xen sự kiện hover, Enter; thấy `Skill Status` sau cuộn/quay vòng |
| T4 | Enter mở lại `Select Action`; 9 lần phím lên xen hover, Enter; thấy `Skill Inspect` |

Startup **120 giây**, mỗi giai đoạn tương tác **30 giây**, vòng harness ngoài
**180 giây**. Runner timeout 600 giây còn bao gồm orchestration, không thay các
deadline harness. **Đạt:** PASS với `checks=4`, không lỗi cleanup. Log PTY giữ
bytes đầy đủ, màn hình được tái dựng từ frame vi sai; không chỉ tìm title trong
một chunk output. Harness giới hạn parser/buffer ở 131072 bytes.

**Ca biên:** mở lại dialog rồi cuộn ngược cùng hover chính là ca dễ regression;
đừng dùng server health thay nó. Khi stalled, ghi phase open/status/reopen/inspect,
đọc log và thử `npm run sandbox -- start` có ghi lý do chẩn đoán. `/tmp` runtime
cần `exec` để OpenTUI load `.so`; `noexec` có thể khiến server chạy nhưng TUI lỗi.
Harness stop/xóa container; ở lệnh cấp thấp volume vẫn giữ, runner mới dọn cả
volume tạm. **Chưa chứng minh:** lọc picker, mọi action, load model, task lock,
mismatch/restore hay mọi kích thước terminal; các phần đó cần ca thủ công.

## 6. Tám ca thủ công đầy đủ

### Checklist hiện tại (thay contract M2–M8 lịch sử bên dưới)

1. Mở picker, lọc, dùng phím/hover, Esc và mở lại; không suy ra inventory mới từ
   số lần phím của harness lịch sử.
2. Status Not configured; chọn đúng một root; kiểm tra editor đầu/cuối.
3. Packages/list chỉ metadata nguồn đã chọn; Use exact core/optional IDs → Selected.
4. Ask exact selected ID, xác nhận `load_skill({skill})` successful → Loaded.
   Cần authority/provider cho real load; không đọc content trực tiếp.
5. Thử unknown/unselected ID, folder unavailable và containment failure trên
   synthetic library được phép tạo; không sửa state để giả pass.
6. Cancel đổi root giữ root/selection; confirm riêng xóa prior source state toàn
   project; khuyến nghị `/new`, không claim đã thu hồi context model.
7. Restore No/dismiss mặc định zero selection, Yes chỉ selection cùng library,
   không grants; đổi library rồi chọn mới, không mang load markers nguồn cũ.
8. Xác minh quyền shell/read/external directory do host riêng; một allowed read
   không tạo skill selection. Ghi revision, thao tác, quan sát và blockers thật.

### Baseline thủ công lịch sử trước redesign

M2–M8 bên dưới và tên fixture/verified tool/grants/task lock của chúng giữ mô tả
revision cũ, **không chạy như hướng dẫn hiện tại**. Không dùng counts/pass lịch sử
làm nghiệm thu redesign. Checklist trên và Single Library là contract thay thế.

Chuẩn bị snapshot thủ công đúng code bằng `npm run sandbox -- build` nếu cần,
rồi `npm run sandbox -- start`. Đây là đường vận hành/chẩn đoán cấp thấp, không
thay verify. Fixture mặc định `docs-project` chỉ seed khi project volume rỗng.
`SANDBOX_FIXTURE=empty-project npm run sandbox -- start` chỉ có tác dụng seed
trước lần tạo volume đầu; đổi biến không ghi đè project có dữ liệu.

Các tên Docs/`docs-editor` dưới đây là ca fixture được README sandbox mô tả;
trước khi thử hãy kiểm tra `/skills packages` và `/skills list docs`. Không giả
định thư viện cài ngoài có cùng package. Nếu thiếu, ghi **chưa thử/thiếu thư viện**,
không tìm bản skill khác hay sửa registry chỉ để làm ca này pass.

| Mã | Điều kiện, thao tác | Kết quả mong đợi / ca biên |
|---|---|---|
| M1 — Picker | Không cần model. Gõ `/skills`, gõ để lọc action; dùng ↑/↓, Enter, Esc; đi qua đầu/cuối danh sách | Picker mở, lọc/điều hướng được; cuộn/quay vòng không kẹt, Esc đóng; hover không giành lựa chọn bàn phím. T3/T4 không thay kiểm tra lọc này |
| M2 — Nhận diện | Trong `docs-project`, gõ `/skills packages`, `/skills list docs` | Docs được nhận diện; danh sách core/optional phù hợp thư viện. Với `empty-project`, không tự khẳng định Docs được detect; xem mismatch M8 |
| M3 — Bật | Có package/optional hợp lệ; `/skills use docs docs-editor`, `/skills status` | Bật core và optional; dùng lại không nhân đôi selection; bật không đồng nghĩa nội dung đã vào context |
| M4 — Trước load | Session/task mới chưa load; `/skills inspect` | Available/APPROVAL_REQUIRED với approved ask; Unverified với source chưa approved; selection không cấp grant |
| M5 — Prompt review | Operator-approved v2 + provider; yêu cầu đúng skill docs-editor | Sole verified loader trước review; v1 phải Unverified/no content, không fallback |
| M6 — Sau load | Theo dõi call thực M5, rồi inspect | `load_verified_skill(skill="docs-editor")`, Used chỉ khi commit thành công; HTTP tool IDs không đủ chứng minh load |
| M7 — Gỡ/tắt/xóa/khôi phục | `/skills remove docs docs-editor`; thử `/skills remove docs technical-writing` **chỉ nếu đó là core thực được list**; bật lại optional rồi thử disable qua picker và clear, cả xác nhận/hủy; đóng/mở session, thử restore `Yes` và `No` trên hai lần riêng | Optional được gỡ, core bị từ chối; disable chỉ tắt package đó, clear xóa selection; hủy không đổi. `Yes` khôi phục selection theo hành vi hiện tại, `No` bắt đầu không skill. Clear giữ lịch sử project để restore; không lấy đề xuất v1/v2 làm hành vi đã triển khai |
| M8 — Nhiều package/khóa/mismatch | Installed có nhiều package phù hợp. Trong project không detect package đã chọn, dùng `/skills use <package>` và thử `Allow`/`Cancel`. Trong cùng task, yêu cầu load package A rồi B; prompt task mới thử B | Cancel không cấp phép; Allow chỉ duyệt mismatch session. B bị khóa sau A trong cùng task; task mới reset khóa. Shared-Skills cũng chịu khóa. Không gửi cả hai trong hai prompt rồi gọi đó là thử cùng-task |

**Ghi kết quả mỗi ca:** chế độ, fixture, revision/snapshot, OpenCode/library
version, thao tác, quan sát, đạt/chưa đạt/chưa thử và log/ảnh không chứa secret.
Menu không cần model; ca load cần bằng chứng tool call. Không suy diễn khả năng
released package từ installed vì installed vẫn chạy code repository.

## 7. Offline container và quản lý môi trường

Offline container test **khác static**: Dockerfile target `test` chạy đúng
`tests/core.test.ts` và `tests/server.test.ts` bằng Node, `network_mode: none`,
không volume runtime, không OpenCode/model. Nó không chạy toàn bộ runner tests
hay runtime/TUI. Chỉ dùng đường cấp thấp này khi chẩn đoán contract trong image
hoặc đo baseline được yêu cầu, ghi rõ lý do:

```bash
npm run sandbox -- build test
npm run sandbox -- test
```

| Lệnh quản lý từ root | Mục đích và lưu ý |
|---|---|
| `npm run sandbox -- build` | Build snapshot thủ công/legacy; không phải test pass |
| `npm run sandbox -- config` / `config --installed` | Xem Compose/mount, không chạy container |
| `npm run sandbox -- doctor` | Chạy `opencode debug paths`; không phải runtime suite |
| `npm run sandbox -- shell` | Shell chẩn đoán trong sandbox, không mount Docker socket |
| `npm run sandbox -- auth login` / `auth --installed login` | Auth riêng lưu trong data volume; OAuth callback localhost có thể cần port riêng vì Compose không publish port |
| `npm run sandbox -- start` / `start --installed` | TUI thủ công với volume giữ qua các lần chạy |
| `npm run sandbox -- smoke-runtime` / `smoke` | Chẩn đoán runtime trực tiếp, alias cùng suite; không có toàn orchestration/cache runner |
| `npm run sandbox -- tui-smoke` | Harness TUI trực tiếp; không thay verify/cache/cleanup project của runner |
| `npm run sandbox -- stop` / `stop --installed` | Dừng project, giữ volume |
| `npm run sandbox -- reset` / `reset --installed` | **Xóa auth/database/state/cache/project thử của chế độ đó**; không xóa image hay thư viện host mounted |

Mọi action hỗ trợ `--installed`; riêng offline `test` không mount thư viện
installed. Template config chỉ copy khi file chưa tồn tại; build lại không ghi
đè config volume. Muốn môi trường sạch áp template mới, chỉ reset sau khi đồng ý
mất dữ liệu. Runtime chạy user `node` UID 1000, root filesystem chỉ đọc,
capabilities bị bỏ, không mount auth/DB host; cli/smoke vẫn có mạng. Các thao tác
quản lý và đặc điểm isolation không được tính thành số test đã đạt.

## 8. Cache, lỗi, cleanup và giới hạn bằng chứng

Chỉ pass smoke được stamp theo fingerprint riêng static/runtime/TUI. `SKIP` là
tái sử dụng, không phải execution mới. `--force` chạy lại smoke nhưng vẫn dùng
image phù hợp; `--rebuild` chạy lại và buộc build, một lần trong invocation.
`CI=true` không tin local stamps. Failure/timeout/signal/cleanup/log failure hoặc
input đổi khi chạy không tạo pass hợp lệ. T0/T1/T2 không cache.

Khi fail, đọc full log mà summary chỉ tới trước; không chạy lại để lấy output.
Hai lỗi giống nhau trên cùng input chặn lần ba. Chỉ sau chẩn đoán mới override:

```bash
npm run test:smoke-runtime -- --force --reason "đã khắc phục Docker daemon"
```

Sau runtime/TUI runner-managed, kiểm tra khi không còn smoke khác đang chạy:

```bash
docker ps -a --filter name=openarms-smoke --format '{{.Names}}'
docker volume ls --filter name=openarms-smoke --format '{{.Name}}'
```

Mong đợi hai danh sách rỗng. Nếu còn sót, xác định **đúng project tạm từ log**,
không xóa mọi volume hay sandbox thủ công:

```bash
OPENARMS_SMOKE_PROJECT=<project-tạm-từ-log> npm run sandbox -- stop --volumes --remove-orphans
```

Thêm `--installed` nếu lượt lỗi dùng installed. Lệnh cleanup này là chẩn đoán có
chủ đích. Log local giữ tốt nhất 7 ngày/200 file/256 MiB, bảo vệ log đang ghi/vừa
tạo; không là artifact vĩnh viễn. Lỗi cleanup không được che lỗi gốc.

## 9. Bảng đối chiếu phạm vi và điều kiện nghiệm thu

| Nhóm | Nguồn | Hướng dẫn liên quan | Không thay thế |
|---|---|---|---|
| S1–S8 | `sandbox/smoke-static.mjs` | [Sprint 0.2](Sprint_02.md), [hợp đồng smoke](../smoke-contract.md) | R1–R5, T1–T4 |
| R1–R5 | `sandbox/smoke-runtime.mjs` | [Sprint 0.4](Sprint_04.md), [Sprint 1.1](Sprint_11.md), [Sprint 1.2](Sprint_12.md) | Model gọi loader/hook |
| T1–T4 | `sandbox/tui-smoke.py` | [Sprint 0.2](Sprint_02.md) | M1–M8 đầy đủ |
| M1–M8 | `sandbox/README.md` | Mục 6 ở đây | Unit tests, chứng thực toàn policy |
| Offline core/server | `sandbox/Dockerfile`, `sandbox/compose.yaml` | Mục 7 | Full host suite, OpenCode |
| Cache/retry/cleanup | `scripts/arms-test.mjs`, policy | [Sprint 0.1](Sprint_01.md), [Sprint 0.3](Sprint_03.md), [Sprint 0.4](Sprint_04.md) | Rollout thật |
| Host/shadow/owner | Quy trình quan sát | [Sprint 1.3](Sprint_13.md) | Không được thay bằng HTTP health hay SDK fixture |

Phase 0 vẫn cần baseline đại diện chứng minh giảm smoke runs/task **>=50%** mà
không mất coverage. Phase 1 vẫn cần host gọi hook do model thật, **bảy ngày hoạt
động thật** và owner nghiệm thu. Kết quả lịch sử Phase 0 75/75 + 8/5/4 và Phase 1
cuối 104/104, syntax 2/2 xem [Phase 0](../../reports/phase0-review.md) và
[Phase 1](../../reports/phase1-review.md); không phải kết quả lần viết guide này.
