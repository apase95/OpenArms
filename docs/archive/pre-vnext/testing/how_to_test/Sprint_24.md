# Sprint 2.4 — fixture adapter và approval TUI

> **Contract lịch sử, không phải flow hiện tại.** Redesign chọn một root rõ ràng
> theo project, chỉ dùng `load_skill({skill})`; metadata v1/v2 không cần migrate,
> hash approval hay Grant/Revoke. Matrix/runbook/evidence dưới đây giữ mốc verified
> runtime cũ; maintenance tùy chọn cần authority riêng. Xem
> [Single Library](Single_Library.md). Full/smoke redesign vẫn pending.

Đây là contract implementation/fixture và checklist vận hành, không tuyên bố
nghiệm thu toàn Phase 2. [Evidence và docs audit](../../reports/sprints/report_sprint_24.md).
Không đọc library thật, không lấy skill từ web/filesystem để chạy các fixture.

## Fixture và runner

`tests/sprint23.test.ts` được tái sử dụng để giữ các regression lifecycle cũ và thêm
approval ticket, projection/service, revoke và migrated synthetic adapter acceptance.
Fixture `arms-sprint24-adapter-*` tự tạo bytes có ID `graphify` (không phải skill thật),
migrate v1 bằng production transaction với backup rồi đăng ký children tường minh.
SDK plugin thật đăng ký duy nhất `load_verified_skill`; test gọi `execute`, không
mock authorize/hash/resolver/transaction. Fixture khôi phục biến môi trường và xóa
temp root trong `finally`. Đây không phải installed OpenCode engine/e2e.

Chạy từ root, chỉ khi revision chưa được full kiểm chứng:

```bash
node scripts/arms-test.mjs related --task sprint-2.4-check --file tests/sprint23.test.ts
```

`related` truyền các filename đã map cho Node test runner; không phải full mặc định.
Task shared runtime/TUI phải dùng complete scope trong plan và full; không chạy
related rồi full trên cùng revision chỉ để lặp GREEN. Xem report cho exact scope.

## Trusted UI và scope

Trong `/skills` picker chọn `grant` hoặc `revoke`, chọn **skill ID**, scope rồi
confirm. Package selection, mismatch confirmation, restore và filesystem permission
không cấp grant. Model không có tool grant/revoke. Dialog không thay
`OPENARMS_APPROVED_REGISTRY_HASH`: source revision vẫn do operator review/config.

Host gọi `prepareVerifiedGrant` trước khi mở scope/confirmation dialog. Ticket là
object identity trong WeakMap của runtime, dùng một lần, không serialize/copy thành
capability. Request được clone riêng; commit kiểm tra lại current registry và
captured task boundary trong persisted transaction. Reset trong lúc dialog mở
trả `TASK_CHANGED`, không áp dụng approval vào task mới. Ticket cũ/copy/replay trả
`INVALID_GRANT`. Revoke cũng dùng ticket và boundary check tương tự.

- once: một successful load trong session/task hiện tại; failure không consume;
- session: chỉ session hiện tại, không copy sang child;
- project: mọi session trong project nếu selection/policy cho phép;
- revoke: chỉ scope đã chọn; revoke session không xóa project grant;
- selection `use` chỉ enable metadata, không approval cho `ask`;
- policy `allow` không bị revoke thành `ask`: revoke chỉ xóa grant.

`status/list/inspect` gọi status core qua runtime transaction và render reason code,
không raw hash/path. Loaded/Used marker không override denied/unverified revision.
Failed integrity result được ghi vào advisory sidecar trong private state directory,
không đổi failed-load state/lock/history/once. TUI đọc safe reason cùng revision/task;
Unverified/HASH_MISMATCH không bị successful marker cũ che. Successful load xóa
sidecar dưới same transaction lock; grant/revoke không xóa integrity failure. Reset
hoặc revision mới invalidate advisory entry. Sidecar không thể grant hoặc approve
source; corrupt/missing telemetry bị ignore, không làm load result đổi.
Correction security review: ticket có `authorization` từ core tách khỏi displayed
`status` advisory. Cả picker và action seam dùng authorization cho grant eligibility;
stale HASH_MISMATCH không chặn repair → revoke → regrant. Sidecar vẫn hiển thị warning,
không bị grant/revoke xóa; load tiếp theo vẫn verify exact bytes/source policy.
Enabled/AUTHORIZED vẫn không chứng minh bytes hiện tại đã verified nếu chưa có load
hoặc tamper chưa được phát hiện. Chưa có screenshot hoặc live keyboard/PTY proof.

## Operator recovery và acceptance còn chờ

Source review, permission/budget manifest, dry-run/diff, backup, migration, integrity,
hash drift và corruption recovery dùng [runbook Sprint23](Sprint_23.md#reproduction--operator-recovery-không-chạy-live-trong-sprint-này).
Không hand-edit state để cấp quyền hoặc sửa hash nhằm che tamper chưa review.
Thêm skill mới cần registry registration/ownership/children tường minh rồi integrity;
hash CLI chỉ update exact existing skill ID, không scan/auto-register.
Registry revision đổi cần runtime snapshot mới và operator reapproval, rồi cấp lại
ask grants qua trusted UI. Legacy package-wide loader không được phục hồi.

Host permission fixture cũ là ordered picomatch glob model: SDK 1.18.34, target
OpenCode 1.18.35; read `SKILL.md`/`*SKILL.md`, native skill `*`, Bash `*SKILL.md*`
deny trong named config. Không coi đó là proof host engine hoặc toàn OS/shell.
Runtime/TUI smoke cần authority cho real-library fingerprint; không thay classifier,
cache hoặc fingerprint để synthetic fixture giả làm live smoke pass.

## Production action-contract fixture (không actual host API proof)

`plugins/tui-core.ts` export `chooseVerifiedConfirmation` và `runVerifiedAction`;
TUI production gọi chính hai seam này. Fixture trong `tests/sprint23.test.ts`
dùng runtime/store/core thật trên temp data và mock **UI callback** duy nhất:
DialogSelect/replace, select/cancel/dismiss, toast. Default Cancel đứng trước Grant;
chỉ boolean true confirm; dismiss/string/undefined không approval. Ticket được
production capture trước scope/confirm, không selection-as-approval. Happy grant
load thành công; cancel không ghi; reset lúc confirm trả TASK_CHANGED, không grant.
Các ticket copied/replay, revoke scope và status/service regressions vẫn giữ.
Không import Solid renderer hoặc giả lập screenshot/PTY. Root SDK 1.18.34,
metadata `.opencode` plugin/SDK 1.18.35, sandbox host 1.18.35: không claim tương
đương đã test; không install declarations hoặc coi chúng là missing-input gate.

## Finite error matrix

L = `tests/verified-loader.test.mjs`; R = `tests/registry-v2.test.mjs`;
P = `tests/sprint23.test.ts`. Đây là test names/cases, không host engine evidence.

| Code | File / ca production kiểm chứng |
|---|---|
| INVALID_REQUEST | L strict request và finite malformed request matrix |
| INVALID_CONTEXT | L stable errors và 3 context fields × 5 invalid values |
| UNKNOWN_SKILL | L deny trước content I/O |
| DISABLED | L enabledSkills rỗng |
| APPROVAL_REQUIRED | L ask/no grant, once consumption, scope isolation |
| UNVERIFIED | L unapproved/invalid registry; P v1/unapproved adapter |
| DENIED | L permission deny trước missing file |
| INVALID_WORKFLOW | L stable errors và explicit children |
| INVALID_REFERENCE | L stable errors và explicit children |
| TASK_CONFLICT | L competing owner trước read; P shared-family/process race |
| HASH_MISMATCH | L happy/tamper và failed once; P persisted/SDK tamper exact state |
| INVALID_ENCODING | L invalid UTF8 round-trip |
| FILE_MISSING | L missing file; P fresh task missing file |
| NON_REGULAR_FILE | L directory/FIFO |
| UNSAFE_PATH | L root/parent/nested/broken symlink; P SDK selected reference |
| READ_ERROR | L actual chmod read failure, conditional non-root; không mock reader |
| CONCURRENT_FILE_CHANGE | L same-bytes inode replacement trước commit |
| CONCURRENT_REGISTRY_CHANGE | L generation reload; P registry disk mutation/restart |
| CONCURRENT_LOAD | L reentrant load, outer success chỉ một record |
| UNSUPPORTED_PLATFORM | L mock environment process.platform=win32; real reader fail-closed, không native Windows proof |
| BUDGET_EXCEEDED | L hard category one-token boundary/no mutation |
| INVALID_GRANT | L invalid scope exception; P copied/stale ticket |
| INVALID_STATE | L invalid restore exception; P corrupt persisted schema preserve |
| INVALID_BUDGET_POLICY | L constructor/version mismatch exception |
| TASK_CHANGED | P scheduled load/grant, copied UI/reset and production action contract |
| REGISTRY_IO_ERROR | P missing/directory/chmod registry khi dialog mở; registered SDK tool outer failure, không publication/path/content |
| INVALID_REGISTRY | P malformed registry lúc confirm, không publication/content leak |
| STATE_IO_ERROR | P state directory/corrupt JSON: safe runtime result; giữ bytes lỗi cho operator recovery |
| RUNTIME_ERROR | P unexpected UI callback exception; tool defensive envelope không arbitrary exception.message |

TUI catch dùng `SKILL_ACTION_FAILED` cố định (presentation fallback, không loader
authorization code). Outer failure không success, không consume once hoặc cho replay
ticket; commit ticket bị consume trước I/O, cần mở dialog mới sau recovery. Native
store exceptions/recovery validation vẫn nội bộ operator; model chỉ nhận safe code.

| Property group | Finite matrix/evidence |
|---|---|
| Strict schema | R unknown 4 fields × 4 locations; missing every field at root/package/detect/skill/child; 3 child unknown fields; 6 invalid child IDs |
| JSON / ownership | R 6 malformed/duplicate JSON strings + escaped duplicate parser + duplicate CLI; duplicate/unknown assignment, casing/path/hash/budget/permission |
| Bytes / estimator | R lengths 0–32, π🙂 UTF8/CRLF, Unicode path migration; L response JSON audit/version/hard vs report-only |
| Migration | R idempotence, detection preservation, exact backup/no-op and one-bad-record whole rollback |
| Auth / lifecycle | L once/session/project × project/session/task identity, revision invalidation; P restart/restore/clear/reset/ancestry/root/process and ticket scope |
| Minimal response | L interface + requested child only; P migrated synthetic graphify registered SDK execute, hashes from returned bytes/no absolute path |
| Safe path / races | L nonregular/symlinks/root/file identity/registry/reentrancy; P tamper/reference escape/revision/reset exact state preservation |

## Operator Phase 2 runbook / acceptance checklist

Không thực thi live trong task này. Owner ghi người duyệt/revision/version/log cho
mỗi bước; không tick chỉ vì fixture pass. Không hand-edit state hoặc đổi model.

1. **Owner source gate:** review nguồn, license, scripts, physical private root,
   skill IDs/ownership/children, explicit permission/budget manifest. Hash không
   chứng nhận source an toàn. Ngừng mọi writer ngoài cooperative tooling.
2. **Migration gate** (chỉ sau authority content được cấp):

   ```bash
   node scripts/registry-v2-cli.mjs migrate --root <physical-root> --registry <registry.json> --decisions <owner.json> --dry-run --diff
   node scripts/registry-v2-cli.mjs migrate --root <physical-root> --registry <registry.json> --decisions <owner.json> --write
   node scripts/registry-v2-cli.mjs integrity --root <physical-root> --registry <registry.json>
   node scripts/registry-v2-cli.mjs hash --root <physical-root> --registry <registry.json> --skill <existing-id> --check
   ```

   Backup `<registry.json>.bak` exclusive trước migration. Exit 0 pass, 1 drift/
   integrity-budget/file failure, 2 invalid input/schema/I/O/concurrency. Một record
   lỗi phải giữ toàn registry cũ; fsync sau rename lỗi cần kiểm tra metadata trước retry.
3. **Add/update gate:** owner thêm exact schema entry/assignment/allowlisted child,
   không auto-discovery. Với existing interface đổi đã review, dùng cùng hash command
   `--write` thay `--check`; children cần contentHash riêng sau review, CLI hash chỉ
   cập nhật interface IDs. Chạy integrity toàn registry; drift chưa review không hash-write.
4. **Source approval gate:** host đặt `OPENARMS_APPROVED_REGISTRY_HASH` là
   `hashBytes(Buffer.from(JSON.stringify(parsedRegistry)))`, **không raw-file hash**.
   Deploy source đúng revision, giữ config/library/state riêng rồi restart. Revision
   đổi invalidate grants; selection/mismatch/path allow không reapprove source.
5. **Trusted UI gate:** status/list/inspect phải phân biệt package/skill và safe reason;
   grant từng once/session/project, cancel/dismiss, revoke exact scope, reset khi
   dialog mở, tamper sau grant. Failed load giữ lock/history/once; Used chỉ successful
   commit. Không dùng Enabled như current integrity pass. Ghi ảnh thật (không fabricate).
6. **Actual host permission gate:** OpenCode 1.18.35 + version plugin thực chạy;
   external text read allow, unregistered SKILL.md read deny, native skill `*` deny,
   Bash command `cat /opt/openarms/example/SKILL.md` matched `*SKILL.md*` deny.
   Ghi tool/version/pattern/result; ordered picomatch fixture không engine proof,
   không suy ra mọi shell/python/encoding/network đường đi bị chặn.
7. **Required smoke authority gate:** controller/operator cấp phép fingerprint đọc
   actual library; canonical runner duy nhất, dùng complete scope ở report:

   ```bash
   node scripts/arms-test.mjs smoke-runtime --task sprint-2.4-operational --installed
   node scripts/arms-test.mjs tui-smoke --task sprint-2.4-operational --installed
   ```

   Đây là remaining operational modes, không chạy nếu cùng verify đã bao phủ.
   Real PTY entrypoint `sandbox/tui-smoke.py`, Compose cli 120×32, entrypoint.mjs và
   config/tui.json; required Docker/Compose/Python/PTY được runner probe. Không giảm
   library fingerprints/cache/classifier để pass; capability block chỉ ghi khi thật.
8. **Review/acceptance gate:** fresh independent security review + owner ký acceptance
   matrix, full/source fixtures và actual host evidence đúng revision. TSK216–219
   checkbox vẫn là nghiệm thu tổng, không tự tick từ implementation/fixture.

Recovery: Denied/Disabled/ApprovalRequired sửa policy/selection hoặc trusted scope,
không source fallback. Unverified/hash drift giữ bản lỗi, review trước reapprove.
Missing/read/symlink/platform sửa approved root/capability; budget split interface/
child hoặc explicit owner policy, không truncate instructions. Concurrency/TASK_CHANGED
lấy snapshot/task mới, mở dialog mới, không dùng ticket cũ. Corrupt state dừng writers,
giữ bản lỗi và restore validated backup; không sửa grants thủ công. Linux `/proc/self/fd`
và private cooperative directories bắt buộc; không hostile-writer CAS guarantee.
Estimator ceil(UTF8 bytes/4) versioned, không tokenizer/billing và không bound sai số.
Legacy package-wide loader đã gỡ, không compatibility deadline/second loader cần giữ.
