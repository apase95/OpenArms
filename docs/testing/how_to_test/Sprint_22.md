# Kiểm thử Sprint 2.2 — verified loader core độc lập

Hợp đồng/evidence mốc 2.2 giữ lịch sử; trạng thái runtime hiện tại theo
[Sprint 2.3](Sprint_23.md): sole verified tool, persisted grants và task transaction.
Các câu “runtime vẫn v1/chưa đăng ký” bên dưới chỉ áp dụng tại mốc 2.2.

TSK-205–210 có core `src/verified-loader.mjs`, chưa đăng ký tool OpenCode.
Runtime/plugin, registry và persisted state vẫn v1. Sprint 2.3 mới tích hợp
router/state/compatibility; Sprint 2.4 mới nghiệm thu host/TUI/library thật.
[Báo cáo và evidence](../../reports/sprints/report_sprint_22.md).

## API và trust boundary

`createVerifiedLoader({ root, registry, approvedRevision, budgetPolicy?, hooks?, audit? })`
tạo instance synchronous/in-memory. Host tin cậy cung cấp physical root, snapshot
registry v2 và `approvedRevision: true` **chỉ sau** operator chấp nhận nguồn/revision.
Flag không chứng nhận nội dung an toàn; actor sửa cả registry và library không bị
hash ngăn chặn. Model không được truyền options, grants, context hoặc hooks.

`load_verified_skill({ skill, workflow?, reference? }, { project, session, task, enabledSkills? })`
chỉ nhận skill ID lowercase. Strict validator và JSON schema export dùng chung
adapter/core; thiếu/thừa field, path/package argument hoặc hai selector đều bị
từ chối. `enabledSkills` nếu cung cấp là allowlist selection riêng, không tạo grant.
Không cung cấp nghĩa host không đặt selection filter; authorization vẫn bắt buộc.

Thành công: `{ ok: true, skill, state: 'Loaded', used: true, estimatorVersion,
sources: [{ id, category, content, hash, estimatedTokens, maximum }] }`.
Mặc định chỉ interface; selector trả nguyên interface + đúng một child đã chọn.
Không parse Markdown để tự load reference, không discovery hoặc load package.
Hash SHA256 raw buffer; UTF-8 không hợp lệ bị từ chối để tránh response khác bytes
được hash. CRLF/BOM/Unicode hợp lệ giữ nguyên, không compact instruction.
API/error/audit không thêm internal absolute path; operator vẫn chịu trách nhiệm
review đường dẫn/secret nằm **trong nội dung** được duyệt, loader không sửa content.

Lỗi: `{ ok: false, state, error: { code } }`, không OS message/path/content.
Codes: `INVALID_REQUEST`, `INVALID_CONTEXT`, `UNKNOWN_SKILL`, `DISABLED`,
`UNVERIFIED`, `DENIED`, `APPROVAL_REQUIRED`, `INVALID_WORKFLOW`,
`INVALID_REFERENCE`, `TASK_CONFLICT`, `CONCURRENT_LOAD`, `FILE_MISSING`,
`READ_ERROR`, `NON_REGULAR_FILE`, `UNSAFE_PATH`, `HASH_MISMATCH`,
`CONCURRENT_FILE_CHANGE`, `CONCURRENT_REGISTRY_CHANGE`, `INVALID_ENCODING`,
`UNSUPPORTED_PLATFORM`, `BUDGET_EXCEEDED`. Constructor/policy/grant validation
throws fixed codes, không phải model tool response; adapter gọi core load duy nhất.

## State/grant và transaction

| Điều kiện | State / decision / reason |
|---|---|
| Unknown hoặc metadata/source chưa approved | Unverified / deny / UNKNOWN_SKILL hoặc UNVERIFIED |
| Policy deny/disabled/conflict | Denied / deny / code tương ứng |
| Ask chưa grant đúng scope | Available / ask / APPROVAL_REQUIRED |
| Allow policy hoặc grant hợp lệ | Enabled / allow / AUTHORIZED |
| Hash/I/O/concurrency lỗi | Unverified trong load result; không ghi Loaded/Used |
| Commit thành công | Loaded / Used marker; history metadata tối đa 20 |

`status` derive metadata authorization, không đọc content: Enabled **không phải**
integrity pass hiện tại. Integrity failure trả Unverified cho request đó, không
lưu flag stale. Mỗi load luôn kiểm tra lại bytes. `grant(request, context, scope)`
là thao tác host approval, không filesystem permission. `once` gắn project/session/
task và consume chỉ khi thành công; `session` gắn project/session; `project` chỉ
project và revision. Revision gồm toàn snapshot registry, vì vậy đổi ownership,
permission, budget hoặc hash đều invalidate. `replaceRegistry(next, { approvedRevision })`
xóa grants và tăng generation ngay cả reload cùng bytes; default approval false.
Restart tạo instance mới không restore grant/lock/history. Persisted migration
và task-boundary reset host còn thuộc Sprint 2.3; instance cục bộ giữ locks theo
project/session/task, không dựa vào prompt timing và không cấp cross-package load.

1. Validate request/context, kiểm metadata, approval, grant/selection/task trước I/O.
2. Reuse `readEntry`/`readRegular` Sprint 2.1: normalized relative path, disjoint
   roots, Linux descriptor-relative O_NOFOLLOW; chỉ regular file, reject mọi symlink.
3. Hash chính buffer, kiểm UTF-8 và assembly interface/selected child.
4. Audit budget trên response JSON bytes; hard violation abort.
5. Revalidate generation/revision/grant/task và read lại từng file: raw bytes cùng
   device/inode/size/mtime/ctime phải không đổi, kể cả replace cùng content.
6. Không await/callback giữa revalidation và publication records/lock/once consume.
   Failed load không sửa lock/history/grant. Trusted test hooks deterministic ở
   afterAuthorize/beforeCommit; không mock production read/hash/authorization.
7. Audit chỉ ID/revision/code/state/budget, không content/path/context. Sink lỗi
   best-effort không đổi kết quả commit; không claim audit durable.

Filesystem actors không hợp tác có thể sửa ngay sau final check: response vẫn là
buffer đã hash, không hứa snapshot toàn OS hoặc CAS chống hostile writer. Cần
private/quiescent approved root. Linux `/proc/self/fd` bắt buộc, platform khác fail
closed. File đọc đầy đủ trong RAM rồi re-read, không streaming; split nội dung dài
bằng workflow/reference allowlist hiện có, không migrate installed skills.

## Budget contract và baseline

Reuse `utf8-bytes-v1 = ceil(bytes/4)` Sprint 2.1; không tokenizer hoặc billed tokens,
không có bound sai số. Policy yêu cầu đúng version, `responseMaximum` positive
integer và đúng năm categories `core/optional/router/workflow/reference`, mỗi
category `{ maximum: integer|null, enforcement: 'hard'|'report-only' }`.
Hard cần maximum; effective source ceiling là min(category maximum, entry maxTokens).
Default core/optional/workflow hard theo entry; reference report-only theo entry;
router report-only/no maximum; tổng response JSON hard 12.500 estimate tương đương
50.000 bytes. Đây là safety ceiling của code, không budget owner của library thật.
Host có thể cấp explicit policy; không thay silently baseline khi estimator đổi.

`auditVerifiedResponse(response, policy, routerText?)` pure report gồm version,
bytes/estimate/maximum/delta trên **JSON response thực trả**, từng source content
bytes/estimate/maximum/delta/enforcement, router riêng khi cấp text và stable top
contributors (bytes giảm dần, tie theo ID). Router không được tự chèn vào response;
wrapper/metadata overhead nằm ở total response, không quy sai vào source content.
Reference report-only vẫn báo vượt, không làm fail trừ tổng payload safety ceiling.
Sprint 2.1 integrity CLI vẫn hard theo entry `maxTokens`; đó là operator integrity
gate riêng, không tự đổi policy runtime audit hoặc thay budget categories.

## Fixture/checks/recovery

Linux + Node 22+ + dependencies lockfile đã cài; FIFO fixture dùng `mkfifo`.
Không cần Docker, network, provider hoặc live library. Chạy từ root:

```bash
node scripts/arms-test.mjs related --task sprint-2.2-check --file tests/verified-loader.test.mjs
```

Không chạy related nếu full cùng revision vừa bao phủ. Core/shared/resolver/map
changes bắt buộc full theo root AGENTS; xem plan toàn scope trước final checks.
Tests tự tạo và xóa temp fixtures: happy/tamper, strict/deny-before-I/O, scopes,
minimal children, deterministic registry/file races, FIFO/directory/symlinks,
collision/sibling escape/encoding, one-token budget boundary, task conflict,
failed once grant và reentrant load. Không dùng live library hoặc grants thật.

Recovery: hash mismatch không auto-update hash, không auto-grant. Operator review
source thay đổi, rồi cập nhật registry bằng tooling Sprint 2.1 có authority; gọi
replaceRegistry với approval mới và cấp lại ask grant. Missing/read/root/platform
lỗi: sửa file/root/capability đã duyệt, không fallback đọc path khác. Budget vượt:
split interface/child hoặc owner review explicit policy, không truncate nội dung.
Concurrency lỗi: lấy snapshot registry mới, không retry unchanged failure mù quáng.
Không chỉnh persisted state thủ công; core chưa tích hợp persisted v2 state.
