# Sprint 4.4 — Registry và topic loader (API-only)

Gọi `registerDecompiledSkill(raw, draft, options)` từ
`src/skill-decompiler-writer.ts` với options giống writer Sprint 4.3:
`scopePlan`, `callerAuditReviewUI`, `confirmWrite`. Entry này audit raw/generated
bytes và consent riêng, giữ target lock và `.registry-lock` qua read/validate/
merge/write. `writeDecompiledSkill` mặc định vẫn unregistered; không tự select/load.
Không thêm `/skills install`, model request hay TUI action.

Registry mới dùng schema v2 hiện có: core và mỗi reference có `path`,
`contentHash: sha256:<hex>`, `maxTokens`. References là hash-bearing objects, không
string paths. Mỗi skill được cài vào package cùng ID, core singleton; child IDs
phải unique toàn registry (nên prefix bằng skill ID). Schema exact không có
description; không tự mở rộng format cho Routing Index. V1 registry hiện hữu bị
từ chối đăng ký, không tự hash/migrate legacy bytes thành trusted content.

Overwrite cần scopePlan.overwrite=true và package ownership tương thích. Hash
tính từ validated byte buffers, không từ files có thể đã bị đổi. Files commit
trước registry temporary fsync/rename/parent fsync. Trước publish lỗi thì rollback
files/backup, registry cũ giữ nguyên; cleanup errors surfaced. Sau rename registry,
parent fsync lỗi báo durability uncertain, giữ installed files thay vì rollback
làm registry trỏ bytes cũ. Không crash recovery/cross-file atomicity guarantee;
reader trong overwrite có thể fail hash tạm thời, không trả bytes sai hash.
Owner-controlled filesystem và cooperating locks, không hostile-FS race proof.
Registry lock chờ tối đa 5s rồi REGISTRY_BUSY; stale lock cần owner điều tra,
không tự xóa lock không sở hữu.

`load_skill({skill, topic?})` giữ source revision và selected checks. Topic phải
là ID có trong cùng skill references allowlist, path lexical dưới references/
của skill và không symlink ở bất kỳ component trong skills tree. Raw buffer được
hash trước UTF8 decode/return và trước history transaction commit. Unknown topic,
unsafe path, tamper (`HASH_MISMATCH`) không tạo history mới. V1 core không hash
vẫn chạy; topic v1 bị từ chối. Hard response cap không đổi. Routing Index TSK415
deferred, Sprint4.5 index acceptance chưa đạt.

Kiểm thử isolated: `node scripts/arms-test.mjs related --task sprint-44 --file tests/sprint44.test.ts`.
Không chạy lại nếu full cùng revision đã bao phủ. Final whole-scope verify cần
full (shared runtime/map) và classifier-required synthetic smoke-runtime, không TUI.
Fixtures tự sinh, provider mocked, không đọc skill library thật.
[Kết quả và giới hạn](../../reports/sprints/report_sprint_44.md).
