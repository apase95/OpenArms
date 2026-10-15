# Tasklist Phase 2: Granular Verified Loader

Mục tiêu phase: chuyển từ package-wide loading sang per-skill/workflow loading, chỉ cấp nội dung có hash hợp lệ và không cho reference thoát verified root.

`Verified` nghĩa là nguồn/revision được operator chấp nhận và bytes khớp registry,
không chứng nhận nội dung an toàn hoặc đúng. Hash không bảo vệ khỏi actor có thể
sửa cả library và registry. Filesystem/shell/network do host hoặc sandbox quản lý;
router instruction không phải security boundary.

### Contract reference và compatibility

Trước Sprint 2.3, `load_skill_package` trả `Reference root`; API đó đã được gỡ
trong source Sprint 2.3 (không fallback cho v1). Contract hiện tại là
`load_verified_skill({ skill, workflow?, reference? })`; `reference` là ID trong
allowlist của skill, không phải đường dẫn tùy ý. Request chỉ chọn tối đa một
workflow hoặc reference; input kết hợp cả hai bị từ chối. Reference đi qua cùng
authorize/read/hash/revalidate/commit flow và trả source ID, hash, token estimate.
Workflow/reference không tự kéo nội dung khác; phần interface cần thiết được trả
theo contract. Bỏ đường dẫn tuyệt đối khỏi response chỉ sau khi API này hoạt động.

Contract này áp dụng cho TSK-205, TSK-208, TSK-209, TSK-214, TSK-215 và TSK-217:
TSK-205 phải có reference field trong strict schema; TSK-208 giữ path nội bộ;
TSK-209 trả reference khi request ID hợp lệ, không tự load mọi reference được
interface nhắc tới; TSK-214 công bố cách request reference. Compatibility dùng
cùng verification path, không bỏ reference access trước khi consumer migrate.

Quy ước tổng Sprint: 1 day = 8 giờ làm việc; estimate là tổng effort, chưa bao gồm thời gian chờ review hoặc release window.

| Sprint | Mục tiêu | Tasks | Thời lượng ước tính |
|---|---|---|---:|
| Sprint 2.1 | Registry schema và integrity | TSK-201 đến TSK-204 | 4.5 days |
| Sprint 2.2 | Verified loader core | TSK-205 đến TSK-210 | 7.5 days |
| Sprint 2.3 | State, task lock và integration | TSK-211 đến TSK-215 | 6.5 days |
| Sprint 2.4 | Verification, TUI và rollout | TSK-216 đến TSK-219 | 6.5 days |

## Sprint 2.1: Registry Schema & Integrity

**Sprint Goal:** Chốt schema, migration, hash tooling và CI integrity trước khi thay đổi loader runtime.

Cập nhật 11/10/2026: standalone schema/migration/hash/integrity tooling và CI
synthetic fixture đã được viết; runtime/registry checkout vẫn v1. [Báo cáo
Sprint 2.1](../reports/sprints/report_sprint_21.md) ghi evidence và giới hạn
Linux/cooperative transaction. Chưa tick nghiệm thu trước review concurrency,
required smoke tổng task và operational live migration/source approval; không
đồng nhất fixture CI với library tin cậy hoặc hoàn tất toàn Phase 2.

Independent review phát hiện Medium: fingerprint non-smoke thiếu hai JSON example
và workflow CI được tests đọc. Correction thêm đúng ba authored paths và regression
single-byte invalidation, không mở traversal library hoặc giảm required smoke.
Các vùng review khác sạch trong contract Linux/private directory/cooperative writers
đã công bố; finding/correction này không phải acceptance Sprint 2.1.

[ ]TSK-201 - Overview: Thiết kế verified registry schema. Details: Định nghĩa registry schema mới với `schemaVersion`, package ID, skill ID duy nhất, kind core/optional, normalized relative path, `contentHash` dạng `sha256:<64 lowercase hex>`, `maxTokens`, `defaultPermission`, workflow/reference allowlist và ownership đúng một package. Validator phải reject field thiếu/thừa không được hỗ trợ, ID/path trùng, absolute path, `..`, hash sai format, token budget không dương, workflow/reference không thuộc skill root và assignment nhiều package. Hoàn tất khi schema có TypeScript type, runtime validator, JSON example hợp lệ/không hợp lệ và mô tả rõ field bắt buộc/default. (Estimate: 1.5 days)

[ ]TSK-202 - Overview: Xây dựng registry migration. Details: Viết migration một chiều từ registry v1 sang schema mới: giữ package detection và ownership hiện có, chuyển string path thành skill record, tính hash chỉ khi file nằm trong verified library, yêu cầu owner quyết định các field permission/budget không thể suy ra và tạo backup trước khi ghi. Migration phải idempotent, hỗ trợ dry-run/diff, không sửa source skill, không tự đăng ký file ngoài v1 và dừng toàn bộ nếu một record lỗi thay vì ghi registry nửa chừng. Hoàn tất khi fixture v1 migrate byte-stable sang output mong đợi và registry đã migrate validate đầy đủ. (Estimate: 1 day)

[ ]TSK-203 - Overview: Tạo công cụ quản lý skill hash. Details: Tạo CLI cập nhật hash chỉ cho skill ID đã tồn tại và được chỉ định tường minh; resolve path qua safe-root check, đọc raw bytes không normalize line ending, tính SHA-256 và cập nhật đúng `contentHash` bằng atomic write. CLI phải có `--check` không ghi, hiển thị old/new hash, từ chối symlink escape, unknown skill, directory, missing file hoặc concurrent registry change và không quét/tự thêm skill mới. Hoàn tất khi cùng bytes cho cùng hash trên môi trường hỗ trợ và CI có thể dùng exit code để phát hiện drift. (Estimate: 1 day)

[ ]TSK-204 - Overview: Kiểm tra skill integrity trong CI. Details: Thêm CI job chạy registry validation, safe-path resolution và hash verification cho toàn bộ registered skill/workflow/reference cần bảo vệ; fail với skill ID, rule và expected/actual hash khi thiếu hoặc lệch, nhưng không in file content. Job cũng phải phát hiện orphan registry entry, duplicate ownership, unregistered file được package tham chiếu và token budget vượt ngưỡng; kết quả có thứ tự ổn định để review dễ dàng. Hoàn tất khi sửa một byte skill, tạo symlink escape hoặc duplicate assignment đều làm CI fail trước test runtime. (Estimate: 1 day)

## Sprint 2.2: Verified Loader Core

**Sprint Goal:** Xây dựng loader per-skill an toàn từ authorization đến hash verification, safe path và minimal response.

Cập nhật 11/10/2026: `src/verified-loader.mjs` có core độc lập TSK-205–210 dùng
resolver/estimator v2 chung, strict request/API, scoped in-memory grants, buffer
hash/snapshot revalidation, minimal children và budget audit. Runtime/plugin/state
vẫn v1; không migrate/read library thật. [Báo cáo và docs audit](../reports/sprints/report_sprint_22.md),
[contract/fixture/recovery](../testing/how_to_test/Sprint_22.md). Checkbox là nghiệm
thu, giữ pending đến fresh review/host integration/operational approval; standalone
fixtures không chứng minh toàn Phase 2 hoặc đóng gates Phase 0/1.

[ ]TSK-205 - Overview: Thiết kế API verified skill loader. Details: Định nghĩa `load_verified_skill({ skill, workflow?, reference? })` theo contract reference ở trên, strict schema dùng chung adapter/core, source IDs, hashes và token estimate; không lộ absolute path trên API mới. Lỗi machine-readable gồm unknown, disabled, approval-required, unverified, hash mismatch, invalid workflow/reference, budget exceeded và task conflict. Không nhận package name thay skill ID. Hoàn tất khi validate -> authorize -> read -> hash/revalidate -> commit được mô tả rõ và request reference hợp lệ có đường trả nội dung hoàn chỉnh. (Estimate: 1 day)

[ ]TSK-206 - Overview: Triển khai skill authorization state machine. Details: Triển khai authorization state machine trước mọi file read: ngoài registry hoặc hash metadata thiếu là `Unverified/Deny`; verified nhưng policy deny là `Denied`; verified chưa grant là `Available/Ask`; verified có grant đúng scope là `Enabled/Allow`; chỉ load thành công mới chuyển runtime marker sang `Loaded/Used`. Approval phải phân biệt once/session/project, gắn đúng project/session, hết hiệu lực khi registry hash đổi và không được suy ra từ filesystem permission. Hoàn tất khi mọi state/transition có reason code và test chứng minh deny xảy ra trước I/O nội dung. (Estimate: 1.5 days)

[ ]TSK-207 - Overview: Xác minh content hash tại runtime. Details: Runtime loader phải mở file sau safe-path check, đọc bytes, tính SHA-256 trên chính buffer sẽ trả về và so sánh constant-format với registry ngay trước response; nếu metadata/file thay đổi giữa authorization và commit thì abort không ghi lock/history. Missing file, read error, non-regular file, hash mismatch và concurrent registry reload phải trả lỗi riêng, hạ skill về unverified trong kết quả runtime và ghi audit event không chứa content. Hoàn tất khi TOCTOU/concurrent-change test không bao giờ trả bytes chưa được hash xác thực. (Estimate: 1.5 days)

[ ]TSK-208 - Overview: Chuẩn hóa safe-path resolution. Details: Tái sử dụng một safe-path resolver cho skill, workflow và reference: chỉ nhận normalized relative path, resolve realpath của library root và từng target, yêu cầu regular file nằm trong đúng skill root, từ chối absolute path, empty segment, `..`, symlink escape, directory, device/FIFO và case-collision. Resolver phải kiểm tra cả parent directory symlink và trả path nội bộ chỉ cho loader, không đưa absolute path vào model response. Hoàn tất khi security tests bao phủ nested symlink, broken symlink, sibling-skill escape và valid nested reference. (Estimate: 1 day)

[ ]TSK-209 - Overview: Tách skill interface khỏi reference. Details: Interface chỉ chứa trigger, scope, mandatory rules, workflow index và reference IDs cần thiết. Nội dung dài chuyển sang reference allowlist; mặc định chỉ trả interface, workflow/reference chỉ trả khi request chỉ định ID hợp lệ. Mention trong interface không tự load reference; không auto-load thư mục hoặc reference của skill khác. Hoàn tất khi task cơ bản nhận interface trong budget, workflow/reference request nhận đúng nội dung cần và reference chưa request không xuất hiện. (Estimate: 1.5 days)

[ ]TSK-210 - Overview: Kiểm soát token budget của skill. Details: Xây dựng token-budget audit tính trên chính nội dung loader trả về, ban đầu dùng estimator được version hóa và ghi rõ sai số; kiểm tra riêng core interface, optional interface, router instruction, workflow entry và reference. Report phải có bytes, estimated tokens, configured maximum, delta và top contributors, có thứ tự ổn định; CI chỉ fail các loại đã có hard budget trong policy, reference chỉ report nếu chưa chốt giới hạn. Hoàn tất khi vượt budget một token làm đúng check fail và thay estimator không âm thầm đổi baseline. (Estimate: 1 day)

## Sprint 2.3: State, Task Lock & Integration

**Sprint Goal:** Tích hợp verified loader với state, task boundary, host permissions và router instruction mà không tạo đường bypass.

Cập nhật Sprint 2.3: source đăng ký sole verified tool, state version 2 và scoped
grants, persisted transaction reuse core. Registry checkout/library thật chưa
migrate: fail-closed v1, không auto approval. [Báo cáo và gates](../reports/sprints/report_sprint_23.md),
[contract/recovery](../testing/how_to_test/Sprint_23.md). Checkbox giữ pending;
implementation không thay fresh review, mandatory GREEN hoặc live host acceptance.

Independent review yêu cầu sửa HIGH inherited lock divergence và MEDIUM migrated
missing-boundary load/grant race. Correction bind child tới persisted root task
authority và initialize boundary trước capture; deterministic regressions RED
7/11 rồi full GREEN 127/127. [Correction evidence/logs](../reports/sprints/report_sprint_23.md)
không phải acceptance; checkbox và live/source/host gates vẫn pending.

Ancestry lifecycle correction additionally flattens pre-existing descendants during
out-of-order inheritance, reconciles compatible task evidence without dropping
session grants/history, and rejects conflicting live locks atomically. Canonical
publication validation and deterministic regressions added; fresh review pending.

Retired-family correction synchronizes authoritative restore/clear/prompt reset
across flattened aliases, retiring lock/used/once evidence before ancestry rebind
while preserving session/project grants and historical records. Restore/clear
regressions and exact current check evidence are in the Sprint23 report/handoff;
fresh scoped review and live gates remain pending, not acceptance.

[ ]TSK-211 - Overview: Nâng cấp verified skill state. Details: Mở rộng state schema/version để lưu grant theo skill/scope, registry hash tại thời điểm grant, load history giới hạn và task-used skill IDs; `Available`, `Denied`, `Unverified` phải được derive từ registry/policy thay vì lưu snapshot dễ stale. Migration phải giữ selection hợp lệ, loại grant có hash/ownership không còn khớp, không restore task lock/used state và không đưa history vào router prompt. Hoàn tất khi restart/restore/reconcile tạo đúng state, corrupt state vẫn được preserve/report và atomic concurrency guarantees hiện tại không bị giảm. (Estimate: 2 days)

[ ]TSK-212 - Overview: Chuyển task lock sang skill-aware policy. Details: Định nghĩa task lock record gồm task boundary, package ID, used skill IDs và registry revision; lần load đầu commit package sau khi read/hash thành công, lần sau cho phép skill khác chỉ khi cùng package và policy cho phép, workflow/reference chỉ khi thuộc skill đã authorize. Request package khác phải bị chặn trước read; failed load không reserve lock; concurrent load khác package chỉ một transaction thắng và prompt mới reset lock đúng một lần. Hoàn tất khi các race-condition tests cũ vẫn pass và có test mới cho multi-skill cùng package, workflow và hash failure. (Estimate: 1.5 days)

[ ]TSK-213 - Overview: Tách filesystem và skill permission. Details: Tách hai quyết định độc lập trong policy/config: filesystem read/external-directory do OpenCode host quản lý, còn skill authorization chỉ dựa trên OpenArms registry, hash và grant. Không có `allow` filesystem, approval dialog chung hoặc path nằm trong workspace nào được chuyển thành skill grant; direct `SKILL.md` read/native skill tool vẫn deny theo host config. Hoàn tất khi integration test cho phép đọc external text file nhưng vẫn từ chối unregistered `SKILL.md`, và verified loader vẫn hoạt động qua library root được cấu hình. (Estimate: 1 day)

[ ]TSK-214 - Overview: Tích hợp verified loader vào router. Details: Đăng ký tool `load_verified_skill` với strict JSON schema và cập nhật router instruction ngắn, ổn định để liệt kê package cùng enabled skill, giải thích skill name khác package name và cấm filesystem/web/subagent discovery. Instruction không được liệt kê absolute path, hash dài, history hoặc dynamic metadata không cần thiết; zero-skill session vẫn phải nêu loader là nguồn duy nhất. Hoàn tất khi prompt tests xác nhận đúng tool/name, package mismatch rule và không còn hướng dẫn model gọi package loader trên đường đi chính. (Estimate: 1 day)

[ ]TSK-215 - Overview: Chuyển đổi package loader cũ. Details: Inventory mọi consumer của `load_skill_package` trong source, tests, sandbox và cấu hình cài đặt; nếu có consumer ngoài đường đi có thể migrate ngay, tạo adapter chỉ chuyển request package sang skill khi request xác định duy nhất và không bao giờ auto-load toàn package. Adapter phải phát deprecation metric/warning, dùng cùng verification path và có ngày/điều kiện xóa; nếu không có nhu cầu compatibility thì xóa tool và cập nhật tests thay vì giữ code dự phòng. Hoàn tất khi không tồn tại hai implementation loader hoặc bypass hash check. (Estimate: 1 day)

## Sprint 2.4: Verification, TUI & Rollout

**Sprint Goal:** Kiểm thử security/integration, cập nhật trải nghiệm vận hành và nghiệm thu per-skill verified loading.

Cập nhật Sprint 2.4: [scope/evidence và remaining acceptance](../reports/sprints/report_sprint_24.md),
[synthetic adapter/TUI runbook](../testing/how_to_test/Sprint_24.md). Có scoped
grant/revoke picker và core-derived status/service, migrated synthetic SDK fixture;
advisory failed-integrity projection cùng private state directory. Chưa nghiệm thu
live TUI/host. Completion subtask bổ sung finite error/property matrix,
production action-contract fixture và full ordinary-doc audit/sync; evidence cuối
trong report 2.4, không thay operational gates bằng fixture.
Checkbox vẫn pending, không tuyên bố Phase 2 hoàn tất hoặc library thật đã trusted.
Security correction độc lập: tách advisory warning khỏi authoritative grant eligibility;
outer runtime/state/registry I/O được safe-code normalize, TUI không toast native
exception.message, tool có defensive envelope. Regression repair/revoke/regrant và
dialog I/O/once/state-preservation được bổ sung; fresh review vẫn bắt buộc.

[ ]TSK-216 - Overview: Kiểm thử đơn vị verified loader. Details: Viết unit/property tests cho registry strictness, migration idempotence/rollback, raw-byte SHA-256, authorization transitions, grant invalidation khi hash đổi, token estimator version, minimal response assembly và safe-root resolver. Bao phủ malformed JSON, unknown field, duplicate ownership, Unicode path/content, symlink escape, concurrent registry revision và every machine-readable error; fixture phải cô lập trong temp directory và không phụ thuộc library thật. (Estimate: 2 days)

[ ]TSK-217 - Overview: Kiểm thử integrity và loader integration. Details: Qua adapter/tool thật, kiểm tra request `graphify` chỉ trả interface và workflow/reference được yêu cầu; sửa bytes sau grant phải deny; reference sibling/symlink escape phải deny; failed load không tạo lock/history. Kiểm tra direct read, native skill tool và mẫu Bash bị chặn theo host fixture, ghi rõ tool/version/pattern đã kiểm chứng; không suy ra mọi shell bypass bị ngăn. API mới không lộ absolute path, reference ID trả nội dung đầy đủ và restart invalidate stale grant. Cô lập toàn máy cần sandbox/OS, không thuộc loader tests. (Estimate: 2 days)

[ ]TSK-218 - Overview: Cập nhật TUI và tài liệu verified skill. Details: Cập nhật TUI `status`, `list`, `inspect`, approval dialog và toast để hiển thị Available/Enabled/Loaded/Used/Denied/Unverified nhất quán, phân biệt package với skill và nêu hash mismatch mà không hiện raw hash nếu không cần. Cập nhật hướng dẫn thêm/sửa skill, chạy hash CLI, xử lý CI drift, migration và deprecation; không mô tả proposal chưa bật như hành vi hiện tại. Hoàn tất khi user có thể xác định vì sao skill không load và operator có quy trình recovery không cần sửa state thủ công. (Estimate: 1.5 days)

[ ]TSK-219 - Overview: Nghiệm thu Phase 2. Details: Thực hiện acceptance review trên registry migrated và adapter thật: mỗi request chỉ trả interface/workflow/reference được yêu cầu; response bytes đều được hash trên cùng buffer và khớp registry; tamper/concurrent change bị deny trước commit; reference không thoát skill root; grant đúng scope và bị invalidate khi hash đổi; external-directory allow không mở rộng skill trust; mọi failed load không tạo lock/history. Ghi command, fixture và kết quả; Phase 2 chỉ hoàn tất khi security/integration suite pass và package-wide bypass đã bị xóa hoặc có compatibility deadline được owner chấp thuận. (Estimate: 1 day)
