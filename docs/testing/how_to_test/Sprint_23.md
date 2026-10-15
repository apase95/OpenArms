# Sprint 2.3 — persisted verified runtime

> **Historical contract, not current setup.** The redesign uses explicit project
> root selection and only `load_skill({skill})`. Local v1/v2 metadata requires no
> migration, approved hashes or grants. Commands, gates and pass counts below
> retain older verified-runtime evidence; optional maintenance needs separate
> authority. See [Single Library](Single_Library.md). Redesign checks are pending.

TSK-211–215 source integration; [report/evidence/gates](../../reports/sprints/report_sprint_23.md).
TUI/status hiện hành đã thêm trong [Sprint 2.4](Sprint_24.md); các câu TSK-218 còn
chờ bên dưới giữ mốc lịch sử 2.3, không phải trạng thái implementation hiện tại.
Không tự nghiệm thu Phase 2. Registry checkout và installed library vẫn v1;
runtime mới từ chối content v1, không legacy fallback hay live migration tự động.

## API / configuration / trust

Tool duy nhất: `load_verified_skill({skill, workflow?, reference?})`.
Skill không phải package; tối đa một selector registered ID, không nhận path.
Default trả một interface; selector trả interface + đúng child. Core strict
validator/schema Sprint 2.2 dùng chung; SDK shape khai báo ID patterns và core
execute reject thừa field/hai selectors. Router không đưa path/hash/history vào
prompt, zero selection vẫn sole-loader rule và cấm filesystem/web/subagent copies.

`createRuntime({directory, worktree?, libraryRoot?, stateFile?, approvedRegistryHash?, budgetPolicy?})`
đọc registry metadata; v2 phải validate strict (gồm duplicate JSON keys), v1 chỉ
cung cấp UI selection/detection projection. Host tin cậy truyền approval hash của
`hashBytes(Buffer.from(JSON.stringify(parsedRegistry)))` sau operator review nguồn,
permission và budgets. Không phải raw-file hash; đổi object field order cũng có
thể invalidate. Plugin nhận `OPENARMS_APPROVED_REGISTRY_HASH` từ môi trường host,
không từ request model/context/permission dialog. Explicit library option ưu tiên
`OPENARMS_LIBRARY_ROOT`. Không tự chọn permission/budget của library thật.

Trusted embedding có `grantVerifiedSkill(request, {sessionID}, scope)`; không
đăng ký tool grant cho model. `/skills use`, mismatch dialog hoặc read allow không
cấp grant. `allow` policy và `ask` grants chỉ có tác dụng khi nguồn/revision approved.
Grant/session/project không tự chứng nhận source an toàn hoặc bytes hiện tại.

## State / task / restore

State `version:2`; v1 được migrate dưới cooperative lock/atomic rename, giữ
selection đã reconcile, không mang task lock/used/verified grants tự tạo từ v1.
Corrupt JSON/schema giữ nguyên/report, không overwrite thành empty. State temp
đặt 0600; parent directory phải riêng/cooperative như contract cũ. Không claim
hostile OS writer CAS hoặc crash-durable fsync journal.

Session snapshot lưu grants, records tối đa 20 và task lock gồm project/session/
task boundary, owner package, registry revision, used skill IDs tối đa 200.
Grants tối đa 200, bind skill + owner + registry object revision và project:
- once: session/task, consume chỉ khi load commit thành công;
- session: chỉ đúng session, giữ qua runtime restart cùng session;
- project: metadata ở project, dùng qua session khi selection cho phép;
- reconcile loại grant revision/owner/project/session/task không khớp;
- restore giữ selection, không restore active locks/used/once, không copy
  session grant sang session mới; project grant hợp lệ vẫn có thể dùng;
- cùng live boundary cross-instance/process dùng persisted lock, không coi việc
  mở runtime instance mới là authority reset task. Explicit restore/prompt mới mới reset.

`chat.message` dùng output message ID làm boundary, duplicate ID không unlock.
Request capture boundary trước transaction; đổi boundary khi chờ trả TASK_CHANGED.
Child giữ selection/mismatch và `taskSession` trỏ trực tiếp tới authoritative
root session (grandchild cũng trỏ root), không copy grant/history. Persisted
transaction dùng root lock ngay cả khi child được tạo trước load hoặc load trước
parent; child prompt/clear/restore không tạo task boundary độc lập. Parent prompt
reset vẫn idempotent và reset shared boundary/once/used markers. Parent clear/restore
vẫn bắt đầu boundary mới; child request kế tiếp capture boundary root hiện tại.
Authoritative restore/clear retire the whole flattened family atomically, just as
prompt reset does: boundary synchronized, locks/used IDs/once grants removed before
any ancestry rebind can merge them. Session/project grants and records survive,
including clear; clear empties only the requesting session's selection. Restore
uses lastSelection only for the requesting session. Alias selections/history remain
local, and alias restore/clear do not rotate the root boundary. Regression variants
cover restore/clear/prompt reset, rebind/restart, retained grants and fresh used IDs.
Current correction validation: task `sprint-2.3-family-reset-fix`, six explicit paths
in the handoff, one plan then syntax **2/2, 400ms** and full **132/132, 14364ms**;
all 16 Sprint23 cases included, no separate unchanged related GREEN. Meaningful
pre-fix isolated RED **14/16, 723ms**; exact logs in report/current handoff. Smoke
NOT_AFFECTED for this scope does not close historical live runtime/TUI/host gates.

Home selection inheritance dùng `sharedTask=false`: session top-level độc lập,
không chia task với home template. Grant-aware child bridge Phase 3 chưa triển khai.
Missing migrated boundary được initialize atomically bằng `startSession` trước
capture; load và trusted grant đều compare boundary không có truthiness bypass.

Out-of-order ancestry (`inherit(child, grandchild)` before `inherit(parent, child)`)
atomically rebinds all existing descendants directly to the new root. Compatible
locks merge used IDs; conflicting owners/revisions or overflowing used IDs reject
without replacing persisted bytes. Session grants/records are retained, current
once grants follow the reconciled boundary without being copied to another session.
All state publications validate the canonical schema before rename. Self-inheritance
rejects; independent-template inheritance cannot detach an existing shared family.
No old-v2 ancestry reconstruction is attempted. Fresh scoped review remains required.

Transaction giữ state lock qua core validate/authorize/read/hash/budget/revalidate.
Competing owner bị reject trước content read. Same package có thể load skill khác
đã chọn; child thuộc skill đã authorize. Chỉ thành công mới publication snapshot,
once consume và rename state; failure không thay file state. Không duplicate
resolver/hash logic ở runtime. Registry metadata reread trước/ở final revalidation;
quiescent approved library/private dirs/cooperative writers vẫn bắt buộc.

## Reproduction / operator recovery (không chạy live trong sprint này)

```bash
node scripts/arms-test.mjs related --task sprint-2.3-check --file tests/sprint23.test.ts
```

File isolated tự tạo synthetic roots, happy/tamper, scopes/restart/restore,
metadata invalidation, state corruption, multi-skill, idempotent reset và competing
instances/processes. Scout đã chẩn đoán RED cũ; final full bao phủ file này,
**123/123 PASS, 12,827 ms**. Không related + full trên unchanged revision.
Continuation also authors deterministic old-request/new-prompt scheduling coverage:
the wrapper waits, then delegates to the real persisted transaction. No production
authorization/hash/filesystem behavior is mocked. Startup explicitly reconciles
persisted verified grants; UI projection and verification share one parsed registry
snapshot. These assertions are GREEN in the final full run, not live acceptance.
Task shared/runtime/dependency/sandbox yêu cầu full + static/runtime/TUI theo plan.
Fingerprint runtime/TUI đọc library thật: blocked nếu authority cấm content I/O;
không giảm classifier hoặc chạy low-level harness để né gate.

Operator được cấp quyền riêng mới dùng tooling 2.1:

```bash
node scripts/registry-v2-cli.mjs migrate --root <physical-root> --registry <v1-copy.json> --decisions <owner.json> --dry-run --diff
node scripts/registry-v2-cli.mjs migrate --root <physical-root> --registry <approved-registry.json> --decisions <owner.json> --write
node scripts/registry-v2-cli.mjs hash --root <physical-root> --registry <v2.json> --skill <exact-existing-id> --check
node scripts/registry-v2-cli.mjs integrity --root <physical-root> --registry <v2.json>
```

Các lệnh này đọc content; không chạy nếu chưa có operator source/budget authority.
Review source, owner permissions/budgets, backup, integrity, rồi host thiết lập
approved hash. Không hash-write để “sửa” tamper chưa review. Registry đổi phải mở
runtime snapshot mới và reapprove revision; ask grant stale phải cấp lại qua trusted
host API. Missing/path/platform/budget lỗi: sửa approved root/entry/capability,
không fallback hoặc truncate instruction. Corrupt state: dừng writers, giữ bản lỗi,
operator restore backup đã validate; không tự xóa hoặc sửa state để giả pass.

## Host fixture / legacy disposition / limits

SDK fixture pin 1.18.34; sandbox target OpenCode 1.18.35 (chưa live xác nhận sprint).
Config fixture xét read `*`, `SKILL.md`, `*SKILL.md`; external_directory
`/opt/openarms/**`, `/opt/installed-router/**`; native skill `*` deny; Bash
`*SKILL.md*` deny. Synthetic ordered glob evaluation **không phải host engine**
proof. External text allow không tạo skill grant hoặc đăng ký unknown SKILL.
Không thêm allow bypass; không claim mọi shell encoding/python/network bị ngăn.

Removed registered `load_skill_package`, `createPackageLoader`, `resolveSkillPath`
và package-wide content implementation. `package-loader.ts` chỉ instruction;
facade/server/tests/sandbox smoke/docs dùng API mới. Không external compatibility
need được chứng minh nên không warning/metric/deadline adapter dự phòng. UI command
selection vẫn giữ; inspect Selected/Used và historical Loaded không là authorization
state machine. TSK-218 TUI approval/status redesign còn chờ.

Linux `/proc/self/fd`, physical private approved root; core full-buffer reads và
reread; byte/4 estimator heuristic không bound tokenizer uncertainty. Audit best
effort; no live-source approval/migration/CI-provider/whole-machine security claim.

## Final continuation validation / inventory

Review correction evidence supersedes old 123-test source evidence for the changed
revision: four new scheduling/inheritance regressions RED 7/11, then required full
GREEN 127/127 (13,770 ms); syntax 6/6 (410 ms), static 8/8 (443 ms). Exact correction
paths, commands and logs are in the report/handoff correction section. This is
correction evidence for fresh independent review, not security/live acceptance.

`node scripts/arms-test.mjs full --task sprint-2.3` với toàn bộ 38 `--file` ở
[handoff](../../../.opencode/handoff-sprint-23.md): exit 0, 123/123, 12,827 ms,
cache disabled; log `.openarms/logs/full-63512111b2672f0378fc92ef-3cbd8c1c-c05e-4168-9d84-4a735123ab3a.log`.
Không fresh plan/related/full rerun; T0/static/policy unchanged evidence ở report.
Named legacy source/tests/harness/install inventory và ordinary-doc audit đã đọc
trực tiếp, không discovery/grep/skill reads. Disposition chi tiết ở report; named
`tsconfig.json` không tồn tại, không tự tạo config hoặc claim semantic typecheck.
Sandbox docs-project README là prompt fixture, không source approval: với v1
hiện tại vẫn phải Unverified/no content dù fixture nhờ review. Live migrate và
host read/native/Bash acceptance, runtime/TUI smoke và fresh review vẫn pending.
