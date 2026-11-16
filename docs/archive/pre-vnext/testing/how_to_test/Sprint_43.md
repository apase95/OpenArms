# Sprint 4.3 — Decompiler và transactional writer (API-only)

Không phải full installer: không có registry commit, runtime reload, topic loader
hay TUI action mới. Các file ghi ra vẫn **unregistered**, không được tự động nạp.

## Luồng API

```typescript
const draft = await decompileSkillPackage(raw, {
  adapter: createOpenCodeModelAdapter(client),
  selectedModel: { providerID, modelID }, // lựa chọn hiện tại, không fallback
  callerAuditReviewUI,
})
const result = await writeDecompiledSkill(raw, draft, {
  scopePlan, callerAuditReviewUI,
  confirmWrite: async ({ target, fingerprint, files }) => {
    // Host hiển thị đúng đích/fingerprint/danh sách và lấy consent riêng.
    return await confirmExactWrite(target, fingerprint, files)
  },
})
```

Caller chủ động opt-in việc gửi text ra selected provider trước lời gọi service.
Không gọi API từ nội dung skill; raw data không có authority. Service chỉ gửi text
document/text assets và binary metadata, không binary bytes hoặc host credentials.
Không có model request thật trong kiểm thử task này.

Schema v1 exact keys, bounded kebab IDs/strings/references, frozen parsed data.
Validator kiểm tra core `<800`, canonical `references/<id>.md`, asset containment,
không orphan, literal normalized constraints/headings và negation đơn giản.
HTML/wiki/reference aliases không hỗ trợ; không render/execute. `semanticProof:false`:
không chứng minh implicit meaning, mọi paraphrase hoặc arbitrary contradiction.
Thiếu evidence yêu cầu human review, không giả vờ chứng minh semantic preservation.

Default estimate = UTF-8 bytes (upper bound), không actual tokenizer/bytes÷4.
Service compact một lần ở `>=800`, final vẫn phải `<800`; không truncate.
Writer luôn kiểm định lại bằng byte upper bound mặc định, không tin estimator
hoặc budget report của draft; draft chỉ đạt bằng estimator tùy biến có thể bị
writer từ chối nếu core chưa đạt ngưỡng byte bảo thủ này.
Input text ≤1MiB; ≤16 calls gồm merge/compact; chunks ≤30000 bytes và estimate,
whole-line overlap tối đa 128 UTF16 units, ordered summaries giữ literal evidence.
Request ≤1MiB, response ≤256KiB, timeout mặc định 30s. Không silently bỏ chunks.

## Security và consent

Writer không tin draft/report/staged string: tự dựng source từ raw, parse và
validate skill, so fingerprint và SHA256 metadata assets. Audit raw và chính
generated files dưới exclusive target lock. HIGH/CRITICAL block; MEDIUM cần
choice và recorded event qua `reviewSkillAudit`. Consent ghi riêng trong invocation,
bound target/fingerprint/files, không tái dùng audit approval thành write capability.
Kiểm tra mutation sau awaits và trước commit; report/model metadata không authority.

Sibling stage 0700, files 0600, per-file temporary + fsync + rename, directory sync;
overwrite backup + rollback, cleanup awaited/errors surfaced. Asset bytes giữ nguyên;
SKILL/reference collisions, aliases, traversal, ADS, reserved names, file-dir conflicts,
symlink roots/trees và hardlinked/special existing files bị từ chối. Lock không tự xóa
lock của writer khác. SHA256 manifest trả về cho future registry API, không ghi registry.
Threat model: filesystem do owner kiểm soát, cooperating writers dùng cùng lock;
không openat/race-proof trước external hostile rename, không crash-recovery guarantee.

SDK v2 adapter dùng explicit model, fresh no-parent session, enumerated tools=false,
deny-all permissions, JSON schema, abort/delete finally. Host phải đáng tin và project
context phải được cô lập bên ngoài: SDK không có switch loại toàn bộ host-added
project/plugin/system context, không freeze dynamic tools, không per-request output
token/billing cap. Local timeout/byte bound không phải provider billing guarantee.
Late response không trả session ID thì không thể bảo đảm cleanup; không universal
host isolation claim. Dùng clean trusted host trước production provider requests.

## Kiểm thử

Runner root `node scripts/arms-test.mjs`; `related --file tests/skill-decompiler-writer.test.ts`
chỉ chạy exact test file. Không lặp related sau full pass cùng revision. Final manifest,
plan và kết quả ở [báo cáo](../../reports/sprints/report_sprint_43.md).
Fixtures workflow/cloud/docs tự viết, SDK/model mocked, không đọc real skill library.
Đo raw/core cùng byte estimator, assert core<800 và reduction≥60%; không phải real
provider/tokenizer/cost benchmark. References ngắn khi hữu ích, không padding 500–1500.
