# OpenArms — backlog tính năng phù hợp với định hướng mới

## Trạng thái và nguyên tắc

Đây là **đề xuất cải tổ**, chưa phải release notes hay cấu hình dùng được ngay.
Baseline khảo sát `bdd62e8`; mọi checkbox dưới đây chưa hoàn tất triển khai/nghiệm thu.
Một số nền tảng đã có trong source, nhưng tính năng mở rộng vẫn cần spec và evidence riêng.

Định hướng làm việc cho cải tổ theo yêu cầu người dùng: **OpenCode sở hữu agent loop;
OpenArms là control plane cho context, workflow, observability và recovery**.
Chưa quyết định viết harness độc lập, đa host hay thay permission engine.

Đọc trước: [audit cần vá](openarms-remediation-audit.md),
[các harness tham khảo](agent-harness-architecture-survey.md),
[kiến trúc hiện tại và đích](../../architecture/Architecture.md).

## 1. Thứ tự ưu tiên và phụ thuộc

| Thứ tự | ID | Tính năng | Học từ | Điều kiện trước |
|---|---|---|---|---|
| 0 | F-01 | Release identity, doctor, deploy/rollback | Host/adapter separation | FIX-01…08 |
| 1 | F-02 | Capability-aware configuration | OpenCode, Pi | F-01 |
| 2 | F-03 | Events/traces và private artifacts | Claude Code | Privacy spec, F-01 |
| 3 | F-04 | Task-scoped context planner | Pi, Aider | F-03 baseline |
| 4 | F-05 | Evidence manifest / bounded discovery | Aider | F-04 MVP |
| 5 | F-06 | Typed task protocol, delegation có giới hạn | Pi, Aider | F-02, F-03 |
| 6 | F-07 | Checkpoint/handoff có thể phục hồi | Pi, long-running harness | Handoff guards, F-03, F-06 |
| Theo dữ liệu | F-08 | Usage store scaling | Persistence patterns | Benchmark thực tế |
| Xuyên suốt | F-09 | Evaluation và rollout shadow | Các harness + policy repo | Fixed corpus, owner review |

FIX IDs thuộc audit; chúng là điều kiện triển khai, không tự hoàn tất khi viết tài liệu.

## 2. F-01 — biết chính xác runtime nào đang chạy

**Giá trị:** chấm dứt sửa source nhưng chạy installed code cũ.

MVP: release manifest chứa revision/content hash, adapter versions, dependency versions;
diagnostic read-only hiển thị runtime root, library root, state/log paths và health.
Deploy có preview/diff và backup/rollback; không tự overwrite toàn config người dùng.
`/arms doctor` chỉ là tên lệnh đề xuất, chưa có trong runtime.

- [ ] Spec output không có credential; phân biệt configured URL và runtime đã xác nhận nạp.
- [ ] Detect server/TUI revision mismatch và dependency compatibility chưa kiểm chứng.
- [ ] Release artifact bất biến; deploy core/adapters cùng revision.
- [ ] Rollback không ghi đè library/state; có migration policy nếu schema đổi.

**Nghiệm thu:** mở phiên mới và chứng minh revision nạp đúng; rollback có evidence;
không cần đoán từ đường dẫn hoặc thời gian sửa file.

## 3. F-02 — cấu hình có nguồn gốc và hiểu capability

**Giá trị:** người dùng biết control nào thật sự enforce được.

- [ ] Schema version và validation; unknown key không âm thầm bị bỏ qua.
- [ ] Effective config + provenance; không giả lập precedence khác với host.
- [ ] Capability report: available / unsupported / unverified, kèm host version và evidence.
- [ ] Mỗi control có trạng thái enforced / advisory / disabled và lý do.
- [ ] Explicit user consent nếu xuất/merge host permission hoặc agent profile.

**Ví dụ ý định, không phải file config đã hỗ trợ:**

```yaml
workflow:
  maxModelSteps: 12
  maxDelegationDepth: 1
  repeatedFailureLimit: 2
context:
  strategy: task-scoped
  skillTokenBudget: 6000
artifacts:
  capture: on-transform
  retentionDays: 7
handoff:
  requireReview: true
  automaticSubmit: false
```

**Nghiệm thu:** adapter không hỗ trợ hard cancel thì UI nói advisory/unsupported;
không throw từ hook để giả lập một bảo đảm cancel chưa có.

## 4. F-03 — observability ba lớp

```text
Host transcript          → host sở hữu, đọc/export qua API được hỗ trợ
Operational events       → IDs/timing/errors/usage/policy decisions, không raw content mặc định
Private artifacts        → observed output, patches, test evidence, reviewed handoff
```

Event envelope đề xuất: `schemaVersion`, event ID/type/time, task/session/request/span/parent IDs,
host/runtime/config revision, status, numeric metrics và sanitized reason code.
Unknown khác zero. Tool-output savings khác actual provider token/cost savings.

- [ ] Correlation từ task tới model request, tool, transform và artifact.
- [ ] Latency, retries, cancellation/failure events; không lưu exception body tùy tiện.
- [ ] Capture policy `off`/`on-transform`/explicit debug; privacy-safe defaults cần review.
- [ ] Artifact ID/hash/sensitivity/retention, status available/expired/write-failed.
- [ ] Redaction tests; không gọi regex sanitizer là chứng nhận loại hết secret.
- [ ] Local read-only report trước; OTel exporter tùy chọn sau khi schema ổn định.

**Nghiệm thu:** debug một task từ đầu tới cuối; raw content không lọt vào events;
retention không xóa host transcript. Không capture được upstream raw stream thì ghi observed output.

## 5. F-04 — context planner theo task

Nền tảng đã có: project ON/OFF và safe bounded assembly. Đề xuất thêm lớp chọn context,
không biến enabled thành permission grant.

```text
available → enabled → selected-for-task → injected-for-request
```

Các chế độ đề xuất:

- `always`: instruction ngắn, ít thay đổi.
- `on-demand`: nội dung liên quan được chọn theo task và capability.
- `explicit`: người dùng/controller chỉ định.

Không tự thêm model-facing loader cho tới khi có ADR/API/UX tương ứng. Trong thời gian
chuyển tiếp giữ project injection làm compatibility mode.

- [ ] Mỗi skill/request có lý do chọn, revision/hash và contribution estimate.
- [ ] Model-aware budget; ghi tokenizer/source hoặc đánh dấu estimate.
- [ ] Stable ordering và prefix; đo cache impact, không hứa cache savings.
- [ ] Task overrides không âm thầm đổi project defaults hay quyền host.
- [ ] Fail rõ ràng khi vượt budget; không cắt giữa instruction có tính authoritative.
- [ ] Benchmark task nhỏ/lớn và nhiều session trước khi thay default.

**Nghiệm thu:** task nhỏ không mang instruction không cần thiết; success rate không suy giảm
ngoài ngưỡng owner duyệt; so sánh chi phí trên task thành công, không chỉ bytes.

## 6. F-05 — evidence manifest trước khi làm repo index lớn

**Giá trị:** giảm open-ended discovery, tránh gửi raw logs/history cho mọi agent.

Artifact đề xuất gồm file/range, symbol nếu có, content hash hoặc Git revision,
nguồn quan sát, findings, điều chưa biết và thời điểm xác minh.

- [ ] Scout tạo manifest bounded, không biến suy đoán thành confirmed root cause.
- [ ] Implementer đọc named inputs; có đường yêu cầu thêm context khi cần.
- [ ] Stale revision/input được đánh dấu, không tái dùng như evidence mới.
- [ ] Thử symbol/repo map retrieval sau MVP; benchmark graph index cost trước khi xây.

**Nghiệm thu:** giảm read/discovery lặp lại mà không làm tăng vòng `NEEDS_CONTEXT`;
đủ provenance để reviewer kiểm tra findings.

## 7. F-06 — workflow như protocol, không chỉ prompt

Task envelope: task/parent IDs, objective, workspace/revision, allowed scope,
input artifacts, acceptance criteria, verification evidence và failure reason.

- [ ] Schema và trạng thái planned/running/blocked/needs-context/completed/failed/cancelled.
- [ ] Tách user task, model step, tool call; đếm budget đúng đơn vị.
- [ ] Delegation depth/concurrency do host capability quyết định; không nested spawn vô hạn.
- [ ] Controller/scout/implementer là profile tùy chọn; task nhỏ có fast path.
- [ ] Quyền và model không được mở rộng chỉ nhờ task JSON/prompt.
- [ ] Có ownership/cancellation contract; race/ambiguous submit không tự retry side effect.

**Nghiệm thu:** có thể tái dựng task status từ metadata, không cần model tự kể;
không ép multi-agent nếu latency/cost/success kém single-agent.

## 8. F-07 — handoff có evidence và phục hồi an toàn

Nền tảng đã có: journal, phase tracking, sanitize, selection snapshot, reviewed handoff.
Automatic threshold rotation chưa được production adapter bật; không đổi trạng thái đó
chỉ vì có module `AutoSessionRotator`.

- [ ] Handoff ghi objective, scope, revision, decisions, pending work, next step và evidence refs.
- [ ] Tách operator attestation khỏi completion proof từ host.
- [ ] Revalidate source/target/selection trước submit; giữ guard handoff chưa archive.
- [ ] Explicit review/consent; không auto-delete source session.
- [ ] Sau timeout/crash trạng thái ambiguous phải inspect/recover, không resend mù.
- [ ] Expired artifacts và changed workspace có hướng xử lý rõ.
- [ ] Checkpoint không claim rollback mọi network/shell side effect.

**Nghiệm thu:** interruption tại từng phase không làm mất journal hoặc submit trùng tự động;
real-host acceptance riêng với fake SDK tests. Host không có atomic ownership thì công bố
single-controller assumption thay vì hứa hỗ trợ concurrent clients.

## 9. F-08 — lưu trữ usage theo quy mô thực tế

- [ ] Benchmark upsert/read/rebuild khi JSONL lớn.
- [ ] Đặt ngưỡng quyết định segmentation/snapshots hoặc SQLite riêng OpenArms.
- [ ] Durable dedup và rebuildable aggregates; migration và recovery tests.
- [ ] Retention không phá audit cần cho task đang mở; không dùng DB nội bộ của host.

**Nghiệm thu:** latency/IO nằm trong mục tiêu đã duyệt; recover từ source không cộng usage trùng.

## 10. F-09 — evaluation và rollout có kiểm soát

Không lấy reduction bytes làm KPI duy nhất. Corpus phải cố định revision/policy/cohort,
phân biệt fixture, synthetic-host và real tasks; không gộp chúng thành live acceptance.

- [ ] Baseline task success, cost/successful-task, fresh/cache input, latency và turns.
- [ ] Theo dõi reread rate, `NEEDS_CONTEXT`, false positives và recovery success.
- [ ] Chọn ngưỡng chất lượng/chi phí trước thử nghiệm, không sau khi thấy kết quả.
- [ ] Shadow cho policy decisions; output compaction active phải ghi nhãn riêng.
- [ ] Opt-in canary, owner review, rollback; không tự bật enforcement vì đủ số ngày.
- [ ] Mỗi implementation task đi qua runner repo; full/smoke theo policy và explicit scope.

## 11. Chưa nên làm

- Viết lại loop/model/tool engine trong OpenArms khi chưa có quyết định thành harness độc lập.
- Direct SQL cleanup conversation hoặc copy schema nội bộ của host.
- Permission/sandbox engine riêng chỉ dựa trên command regex.
- Auto model fallback, auto-submit handoff, auto-commit hay xóa session mặc định.
- Multi-agent/indexer/OTel stack lớn trước khi có runtime identity và baseline đo lường.
- Hard billing limit khi chỉ có usage trễ hoặc capability cancel chưa kiểm chứng.

## 12. Checklist quyết định một feature

- [ ] Có lỗi/use case và metric rõ, không chỉ “harness khác cũng có”.
- [ ] Đã xử lý P0 liên quan trong audit.
- [ ] Có ADR về scope/ownership, spec states/failure modes và capability requirements.
- [ ] Có privacy, migration, rollback và compatibility story.
- [ ] Test plan và evidence phân biệt offline với host thật.
- [ ] Chỉ đánh dấu hoàn tất khi implementation, verification và rollout tương ứng đã có bằng chứng.
