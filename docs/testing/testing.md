# Bảng lệnh và script

Domain-aware foundation: [Sprint 3.1 v2](how_to_test/Sprint_31v2.md)
(classifier/router/fallback; chưa có specialized parsers hoặc savings acceptance).

Thao tác và kết quả mong đợi: [hướng dẫn tự kiểm tra](how_to_test_overview.md).
Governor/policy/telemetry: [Sprint 1.2](how_to_test/Sprint_12.md), gồm giới hạn host,
preset có cấu trúc, riêng tư, tìm kiếm/đọc đoạn lockfile và override evaluator.
Kiểm chứng và rollout: [Sprint 1.3](how_to_test/Sprint_13.md). `reviewShadow`
tổng hợp envelope quan sát thủ công riêng tư; host gọi hook thật, baseline, bảy
ngày hoạt động và owner nghiệm thu vẫn là các điều kiện riêng. Nó không bật active.
[Hướng dẫn sandbox đầy đủ](how_to_test/Sandbox.md) có S1–S8, R1–R5, T1–T4,
tám ca thủ công, offline container và setup/cleanup; không cần chạy tất cả cho mỗi task.
Các lệnh terminal chạy từ root repository; thay phần `<...>` bằng giá trị thực.

## 1. Chuẩn bị

### Chọn đúng một lệnh

| Khi nào | Lệnh từ root repository | Kết quả mong đợi |
|---|---|---|
| Sau sửa đáng kể | `npm run test:syntax -- --file <file>` | Phản hồi cú pháp nhanh |
| Cuối task | `npm test -- --task <task-id> --file <file-a> --file <file-b>` | Tests/smoke theo policy, đủ phạm vi thật |
| Chỉ tài liệu | `npm test -- --file docs/README.md` | Bỏ qua code tests |
| Đổi server/TUI/sandbox | `npm test` | Chỉ ranh giới cần thiết, server-only không kéo TUI |
| Trước push | `npm run test:pre-push -- --base <revision>` | Full một lần + smoke chọn lọc |
| CI chủ động chọn | `CI=true npm run test:pre-push -- --base <revision>` | Không tin stamp cục bộ |
| Chạy lại smoke | `npm run test:smoke-runtime -- --force` | Bỏ stamp, dùng lại image hợp lệ |

Xem trước bằng `--plan` (ví dụ `npm run test:pre-push -- --base origin/main --plan`).
Review một kế hoạch đủ phạm vi rồi verify một lần; `--file` lặp thay Git discovery,
phải gồm file mới/xóa. Nếu T0 đã đạt với input không đổi, gọi mode còn lại trong
plan tường minh; full bao phủ related, không chạy cả hai trên cùng revision.
`<revision>` là commit gốc cần so sánh; CI phải fetch mốc đó và đủ history.
Có thể chạy pre-push thủ công hoặc tự cấu hình hook/CI; không tự cài hook,
không chạy full ở pre-commit. `--pre-push` chỉ dùng với verify; unknown vẫn blocked.
Thiếu capability TUI thì bổ sung Linux/macOS, Python/PTY và Docker, không skip để pass.

Cache chỉ cho smoke pass, SHA-256 theo dependency/phiên bản/mode/allowlist môi
trường; docs không làm mất hiệu lực, dependency đổi thì chạy lại. Fail/timeout/
signal không cache. Full log: `.openarms/logs/`; metadata: `.openarms/test-runs.jsonl`.
Retention 7 ngày/200 file/256 MiB, bảo vệ log đang ghi/vừa tạo. Pass mỗi mode
một dòng, fail tối đa 30 dòng chẩn đoán kèm full log. Hai lỗi giống nhau trên
cùng input chặn lần ba: đọc log, sửa nguyên nhân; override cần
`--force --reason "<lý do đã chẩn đoán>"`. `test:policy` báo automation đi ngoài
runner; lệnh thấp tầng chỉ để chẩn đoán có ghi lý do.

`npm run test:acceptance` so baseline/rollout. Byte raw output không phải byte
context assistant đã đọc; review thủ công theo [Sprint 0.4](how_to_test/Sprint_04.md).
Chưa đủ dữ liệu thì giữ còn chờ, không tự công nhận Phase 0.

Smoke fingerprint chỉ dùng phần execution của test policy: timeout, cleanup,
retention và field execution mới. Đổi mapping docs/tests hoặc reason code không
invalidate smoke đã pass; đổi dependencies/runtime settings vẫn invalidate.
Input bytes được hash bằng buffer 64 KiB, không giữ toàn bộ corpus trong RAM;
post-run fingerprint vẫn kiểm tra input thay đổi khi chạy.
SIGINT/SIGTERM khi chờ smoke/build/failure lock trả exit 130/143, không chạy
callback và không xóa lock của owner khác. Lượt bị chặn không tính thành smoke
execution trong acceptance report.

Fingerprint của `syntax`, `related`, `full` chỉ xác minh code/config, registry
metadata và fixture cô lập do tests tự tạo; không chứng minh integrity library
thật. Các mode này không duyệt/hash `skills` hoặc sandbox local/installed tree,
và từ chối symlink trong input source thay vì theo link đến library. Code/test/
config/registry metadata đổi vẫn tạo revision mới cho retry guard. Smoke/build
giữ nguyên hash library và invalidation; không được suy ra smoke đạt từ full.

| Lệnh | Công dụng |
|---|---|
| `node --version` | Xem phiên bản Node; yêu cầu Node 22+ |
| `npm ci` | Cài dependencies đúng lockfile |
| `docker version` | Kiểm tra Docker client/daemon |
| `docker compose version` | Kiểm tra Compose v2 |
| `python3 --version` | Kiểm tra Python cho TUI smoke trên Linux/macOS |

## 2. Kiểm tra code và OpenCode

| Lệnh | Công dụng |
|---|---|
| `npm run test:plan` | Xem kế hoạch theo file thay đổi, chưa chạy kiểm tra |
| `npm test -- --task <task-id>` | Chạy các kiểm tra được policy chọn |
| `npm run test:syntax -- --file <file>` | Kiểm tra cú pháp và đường dẫn import cục bộ |
| `npm run test:related -- --file <file>` | Chạy tests liên quan đến file |
| `npm run test:full` | Yêu cầu toàn bộ Node tests |
| `npm run test:smoke-static` | Kiểm tra cấu hình/file trên host, không mở Docker |
| `npm run test:smoke-runtime` | Kiểm tra phần máy chủ OpenCode |
| `npm run test:smoke` | Alias của `test:smoke-runtime` |
| `npm run test:tui-smoke` | Kiểm tra giao diện terminal OpenCode |
| `npm run test:smoke -- --installed` | Kiểm tra bằng thư viện đã cài trên máy |
| `npm run test:policy` | Báo các lệnh kiểm tra đi ngoài runner trong automation thay đổi |

## 3. Chọn phạm vi, policy và chạy lại

### Synthetic-only integration

`node scripts/arms-test.mjs verify --synthetic --task <task-id> --file <path>`
chạy full/static/runtime/PTY theo classifier. `--synthetic` cũng hỗ trợ
`smoke-runtime` và `tui-smoke`, không kết hợp `--installed` hoặc baseline.
Runner build từ context tạm với exact allowlist ordinary source/config/package;
registry và content đều tự sinh, không duyệt/read/hash/copy library thật.
Fingerprint bao gồm generator, output fixture, code, build definitions và config;
image/build locks/cache tách mode synthetic. Context tạm được xóa sau build;
runtime/PTY dùng image đã inspect với `--pull never` (không `--build`), volumes
riêng được cleanup. Context đã xóa chặn implicit rebuild thay vì fallback repo.
PTY chọn root synthetic bằng editor khi cấu hình ban đầu chưa có path.
Pass chứng minh host API/UI/local loader trên generated data, không chứng minh
real library integrity, provider/model behavior hoặc installed mounts.
Normal modes giữ behavior cũ và có thể đọc library thật: chỉ chạy ngoài session
hạn chế này khi có authority tương ứng.

| Lệnh/tham số | Công dụng |
|---|---|
| `node scripts/arms-test.mjs verify --file <file> --plan` | Xem kế hoạch của một file |
| `node scripts/arms-test.mjs verify --file <file-a> --file <file-b>` | Phạm vi tường minh; thay danh sách file tự lấy từ Git |
| `node scripts/arms-test.mjs verify --base <revision> --plan` | Xem thay đổi so với mốc Git; không kết hợp với `--file` |
| `node scripts/arms-test.mjs related --file tests/<name>.test.mjs` | Chạy một file test đã chọn |
| `npm run test:smoke-runtime -- --force` | Bỏ qua kết quả smoke cũ; vẫn dùng image hợp lệ |
| `npm run test:smoke-runtime -- --rebuild` | Chạy lại và yêu cầu build image |
| `npm run test:full -- --force --reason "<lý do>"` | Override giới hạn lỗi lặp sau khi đã chẩn đoán |
| `npm run test:smoke-runtime -- --force --reason "<lý do>"` | Override lỗi lặp ở smoke; reason dài 1–160 ký tự |
| `--task <task-id>` | Gắn ID công việc vào bản ghi lần chạy |
| `--installed` | Chọn thư viện đã cài; áp dụng cho smoke modes và baseline smoke |
| `less scripts/test-policy.json` | Xem mapping file, tầng kiểm tra, timeout và retention |
| `less scripts/smoke-policy.json` | Xem đầu vào của từng smoke mode |

## 4. Skill — gõ trong OpenCode

[Single Library](how_to_test/Single_Library.md) là contract hiện hành. Mỗi canonical
project ban đầu chưa chọn root; trong `/skills` → Status nhập thư mục tuyệt đối
chứa `registry.json` + `skills/`. Editor ở đầu khi selection rỗng, cuối khi đã chọn.
Đổi nguồn mặc định Cancel: hủy giữ nguyên; confirm xóa prior source state trong
project và nên `/new` vì context model cũ không thể thu hồi. Phiên gốc mới tự nhận
lựa chọn project gần nhất của cùng library/revision dưới dạng Selected, không
Loaded/grants/task locks; Home draft ưu tiên đúng một lần. Không có hộp Restore.
Ngay sau `/new`, trước prompt thường, Home status đã preview lựa chọn gần nhất
như Selected, không Loaded; chỉ đọc status không tạo draft hay request provider.
Không merge/fallback/env default. [Usage/budget UX](../budget-ux.md) mô tả báo cáo,
editor project và cảnh báo report-only.

Metadata local v1/v2 đều hỗ trợ; migration/hash approval/Grant/Revoke không bắt
buộc trong flow hiện tại. [Sprint 2.1](how_to_test/Sprint_21.md) mô tả maintenance
tooling tùy chọn có thể đọc content, chỉ chạy khi có authority riêng.

[Sprint 2.2](how_to_test/Sprint_22.md) thêm core verified API/grants/hash/response
budget **lịch sử tại mốc 2.2**, không phải local loader hiện tại. Fixture lịch sử:
`node scripts/arms-test.mjs related --file tests/verified-loader.test.mjs`.
Không chạy related nếu full cùng revision vừa bao phủ; shared core/map thay đổi
cần full. Không dùng synthetic pass làm live integrity/host acceptance.

| Lệnh/tool | Công dụng |
|---|---|
| `/skills` | Mở menu quản lý skill |
| `/skills help` | Xem trợ giúp |
| `/skills packages` | Xem packages của library đã chọn |
| `/skills list <package>` | Xem skills của package |
| `/skills use <package>` | Bật package với core skills |
| `/skills use <package> <optional-skill>` | Bật package và chọn optional skill |
| `/skills add <package> <skill>` | Thêm skill vào lựa chọn |
| `/skills remove <package> <skill>` | Gỡ skill khỏi lựa chọn |
| `/skills disable <package>` | Tắt package |
| `/skills clear` | Xóa lựa chọn hiện tại |
| `/skills status` | Xem trạng thái lựa chọn |
| `/skills inspect` | Xem Selected/Loaded/Missing và library error nếu có |
| `load_skill({ skill: "<selected-id>" })` | Sole server content tool; exact selected ID, không path/workflow/reference/package-wide |

Use chỉ chọn metadata. Ask đúng ID khi task cần nội dung; Loaded chỉ successful
router load, không chứng minh model làm theo. Quyền shell/read/external directory
do host/OS quản lý riêng. Folder lỗi thì sửa path/mount/registry/skills trong Status,
không tìm nguồn thay thế. Tests chỉ tự tạo synthetic content theo session authority;
full 178/178 và synthetic runtime 5/5 + live PTY đã đạt; xem phạm vi, logs và
giới hạn ở [completion evidence](../reports/skill-library-redesign.md). Real
library/provider acceptance chưa được suy ra từ generated fixtures.

## 5. Sandbox — vận hành và kiểm tra thủ công

| Lệnh | Công dụng |
|---|---|
| `npm run sandbox -- build cli` | Build riêng runtime sau sửa source; không build test image |
| `npm run sandbox -- build --installed cli` | Build riêng runtime cho chế độ installed |
| `npm run sandbox -- start` | Mở OpenCode để thử bằng mắt và bàn phím |
| `npm run sandbox -- start --installed` | Mở OpenCode với thư viện đã cài |
| `npm run sandbox -- config` | Xem Compose config |
| `npm run sandbox -- config --installed` | Xem cấu hình và mount chế độ installed |
| `npm run sandbox -- doctor` | Xem các đường dẫn OpenCode trong sandbox |
| `npm run sandbox -- shell` | Mở shell trong sandbox |
| `npm run sandbox -- auth login` | Đăng nhập provider trong sandbox |
| `npm run sandbox -- stop` | Dừng sandbox, giữ dữ liệu volume |
| `npm run sandbox -- reset` | **Xóa dữ liệu sandbox**: auth, state, cache và project thử |
| `npm run sandbox -- stop --installed` | Dừng sandbox installed |
| `npm run sandbox -- reset --installed` | **Xóa dữ liệu sandbox installed**, giữ thư viện host được mount |
| `SANDBOX_FIXTURE=empty-project npm run sandbox -- start` | Chọn fixture khi volume project còn rỗng |

Để tiếp tục thử với image đã build, chỉ cần `start`; không cần rebuild/cài lại,
reset auth hay full/smoke. Auth/config/lựa chọn hiện có được giữ. Build không ghi
đè template config đã tồn tại: kiểm tra/sửa config có chủ đích; reset chỉ khi đã
backup và muốn mất dữ liệu sandbox. Ca **Not configured** dùng project thử riêng
chưa cấu hình, không reset blanket. Menu/lệnh local không cần model; load/model
thật cần provider sandbox và chỉ login nếu cần. Xem [checklist thủ công](manual-testing.md)
và [Các tính năng mới — kiểm thử riêng](manual-testing.md#các-tính-năng-mới--kiểm-thử-riêng)
cho dialog normal/narrow, Home preview, usage và budget.

### Storage và giới hạn image sandbox

`node sandbox/image-retention.mjs --keep 2 --current openarms-sandbox:local`
chỉ inspect Docker và in danh sách ID dự kiến xóa (dry-run mặc định). Nếu dùng
image fingerprint, truyền đúng tag đang chọn qua `--current` hoặc
`OPENARMS_SANDBOX_IMAGE`. Image hiện tại phải tồn tại; lỗi inspect chặn cleanup.
Sau khi review danh sách, chạy lại cùng tham số với `--apply` để xóa tường minh.
Runner tự apply sau build/validation thành công (kể cả matching image), và manual
runtime build cũng apply; không chạy ở mọi lần `start`. Mặc định giữ 2 mỗi mode; `OPENARMS_IMAGE_KEEP=1..100`
đổi giới hạn. `OPENARMS_IMAGE_RETENTION=off` tắt hoàn toàn, dùng khi verify cần
giữ rollback images. Summary báo removed hoặc RETENTION_BLOCKED; lỗi không bị
ẩn và làm command thất bại. Smoke stamp hit không chạy build/retention.

Giữ 1–100 image mới nhất **mỗi mode** repository/installed/synthetic (mặc định 2),
cộng image hiện tại và mọi image được container tham chiếu, kể cả container đã
dừng. Chỉ xóa image có toàn bộ tag fingerprint `openarms-sandbox:<mode>-<sha256>`
khớp cả hai label OpenArms; giữ legacy/local, alias khác và image không tag.
Malformed data/label hoặc lỗi Docker chặn thao tác; apply reinspect trước mỗi
ID và không dùng force. Apply có thể hoàn tất một phần nếu Docker lỗi giữa chừng;
hãy review dry-run mới. Không xóa container, volume hay global system/builder cache.

Đây là giới hạn số phiên bản, không phải quota byte. BuildKit cache/layer dùng
chung có thể vẫn chiếm dung lượng sau khi xóa image; không hứa reclaim toàn bộ.
Fingerprint/mode ARG vẫn nằm sau install/RUN trong Dockerfile để không làm mất
cache apt/OpenCode vì thay source identity. Eviction build cache cần quyết định
riêng của owner, không được tự động prune toàn hệ thống.

Legacy shared BuildKit cache chưa được bounded bởi lifecycle này. Không suy ra
ownership từ description và không prune global. Migration opt-in riêng: owner
tạo named docker-container builder chỉ cho OpenArms, cấu hình BuildKit GC với
quota byte/age, chuyển build sang builder đó và load image vào local daemon;
kiểm chứng isolation và rollback trước khi bật. Cache cũ vẫn cần owner review
riêng. Đây là migration tùy chọn, không phải bước bắt buộc để thử thủ công.
Dry-run ở trên chỉ cần khi muốn kiểm tra storage; không cần tạo nhiều image lớn
để kiểm tra retention.

## 6. Baseline và xem bản ghi

| Lệnh | Công dụng |
|---|---|
| `npm run test:baseline -- --command npm-test --task <task-id>` | Đo lần chạy full Node tests legacy |
| `npm run test:baseline -- --command sandbox-test --task <task-id>` | Đo lần chạy tests trong sandbox |
| `npm run test:baseline -- --command sandbox-smoke --task <task-id>` | Đo lần chạy server smoke legacy |
| `npm run test:baseline -- --command tui-smoke --task <task-id>` | Đo lần chạy TUI smoke legacy |
| `npm run test:report` | Xem số mẫu, thời gian chờ và các lần chạy có thể bị trùng |
| `ls -lt .openarms/logs/` | Liệt kê logs theo thời gian |
| `less .openarms/logs/<file>.log` | Đọc full log được summary chỉ tới |
| `less .openarms/test-runs.jsonl` | Xem metadata các lần chạy |
| `ls .openarms/test-results/<mode>/` | Xem các bản ghi smoke pass |
| `less .openarms/test-results/<mode>/<fingerprint>.json` | Xem thông tin một kết quả đã đạt |
| `ls .openarms/test-failures/` | Xem các bản ghi lỗi phục vụ retry guard |
| `docker ps -a --filter name=openarms-smoke --format '{{.Names}}'` | Xem containers của runner-managed smoke còn sót |
| `docker volume ls --filter name=openarms-smoke --format '{{.Name}}'` | Xem volumes của runner-managed smoke còn sót |

## 7. Chẩn đoán cấp thấp — gọi tường minh khi cần

Ghi lý do khi dùng các lệnh dưới; không thay đường verify bình thường. `smoke`
và `smoke-runtime` cùng chạy runtime, không kiểm tra JSON TUI hoặc render TUI.
Offline container chỉ chạy core/server tests, không phải full host suite.

| Lệnh/script | Công dụng |
|---|---|
| `npm run test:raw` | Chạy Node tests trực tiếp, ngoài compact runner |
| `npm run sandbox -- test` | Chạy core/server tests trong image offline |
| `npm run sandbox -- smoke` | Chạy server smoke legacy trực tiếp |
| `npm run sandbox -- smoke-runtime` | Cùng runtime harness với `smoke`, không phải suite riêng |
| `npm run sandbox -- tui-smoke` | Chạy TUI harness trực tiếp |
| `node scripts/arms-test.mjs <mode> [options]` | Điểm vào chung cho kiểm tra |
| `node scripts/check-test-policy.mjs` | Script chỉ báo cáo bypass |
| `node sandbox/smoke-static.mjs` | Script kiểm tra cấu hình offline trực tiếp |
| `node sandbox/manage.mjs <action> [--installed]` | Script điều khiển sandbox |
