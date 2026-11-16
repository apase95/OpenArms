# OpenArms — các lỗi và khoảng trống cần xử lý

## Phạm vi và cách đọc

Đây là audit tĩnh phục vụ cải tổ, không phải báo cáo nghiệm thu runtime.
Baseline repository: `bdd62e8` (trước task tài liệu này).

Hai bản được đối chiếu:

- Source: `/home/hodangthaiduy/Workspace/Extensions/OpenArms/`.
- Installed: `/home/hodangthaiduy/.config/opencode/openarms-runtime/`.
- Host config: `~/.config/opencode/opencode.json`, `opencode.jsonc`, `tui.json`, `tui.jsonc`.
- Đường dẫn `~/Workspace/Extension/OpenArms/` (không có chữ `s`) không tồn tại khi khảo sát.

OpenCode CLI quan sát được: `1.19.3`; dependency `@opencode-ai/plugin` của hai bản: `1.18.34`.
Không suy ra tương thích hay bất tương thích chỉ từ chênh lệch phiên bản.
Không chạy cleanup, không đọc credential, không sửa runtime đã cài và không xác minh
SQL đã thực sự xóa dữ liệu. Effective configuration của một phiên vẫn cần kiểm tra
vì còn config `.jsonc`, project overrides và plugin khác.

Nhãn: **Quan sát** = có bằng chứng source/config; **Rủi ro** = tác động cần tái hiện;
**Đề xuất** = chưa triển khai. Checkbox chưa đánh dấu nghĩa là chưa hoàn tất remediation,
không có nghĩa việc khảo sát chưa được thực hiện.

Định hướng: OpenCode sở hữu loop, model/tool execution, permissions và conversation;
OpenArms sở hữu context bổ sung, workflow metadata, observability và recovery qua API host.
Xem [kiến trúc hiện tại/đích](../../architecture/Architecture.md),
[nghiên cứu harness](agent-harness-architecture-survey.md) và
[backlog tính năng](openarms-feature-proposals.md).

## 1. Runtime drift — bản đang cài không đồng nhất với source

Trong `src/`, `plugins/`, `prompts/`, `scripts/`: repo có 43 file `src`, installed có 44;
11 file chung khác nội dung và installed có thêm `src/auto-prune.ts`.
Config `.json` global trỏ tới installed runtime, không trỏ checkout.
Restart không phải deploy. Đây là snapshot khảo sát, cần đối chiếu lại trước khi vá.

| File/nhóm | Installed runtime | Repository baseline |
|---|---|---|
| `src/auto-prune.ts` | Có, gọi khi tạo session | Không có |
| `src/local-library.ts` | Cache catalog theo mtime root | Đọc lại metadata |
| `src/session-handoff.ts` | Thiếu guard/sanitize mới | Validate ID, bảo vệ handoff chưa archive, sanitize notes |
| Server/TUI adapters | Gọi prune; bỏ qua lỗi snapshot | Không prune; cảnh báo `STALE_HANDOFF` |
| Hai workflow prompts | Ràng buộc model/profile cụ thể | Tổng quát hơn |
| Test map/policy | Mapping cũ, integration lên lịch smoke | Host-only verify; smoke explicit-only |

## 2. P0 — cleanup can thiệp database của host

**Quan sát:** installed `src/auto-prune.ts` mặc định 7 ngày, gọi Python/SQLite để xóa
session, message, part và các bảng liên quan trong database OpenCode. Server gọi
`void autoPrune().catch(() => {})` từ `session.created`.

**Rủi ro:** phụ thuộc schema nội bộ; xóa conversation ngoài phạm vi plugin; thiếu preview,
backup và xác nhận trong đường gọi; lỗi bị nuốt. Throttle ở RAM không phối hợp bền vững
nhiều process. Nhánh sửa `state.json` dùng read/write/rename riêng, không dùng lock của
`StateStore`, nên atomic rename không ngăn lost update. Path mặc định cũng không giải
quyết đầy đủ XDG như runtime paths.

- [ ] **FIX-01:** Dừng đường auto-prune DB host; backup trước thay đổi vận hành.
- [ ] **FIX-02:** Nếu vẫn cần cleanup session, thiết kế opt-in qua API host được hỗ trợ;
  có dry-run, phạm vi, xác nhận và kết quả quan sát được.
- [ ] **FIX-03:** Chỉ cleanup state OpenArms qua transaction chung; kiểm tra XDG paths.
- [ ] **FIX-04:** Có test bảo đảm tạo session không tự xóa conversation và test concurrent writer.

**Nghiệm thu:** session creation không mở DB host để ghi/xóa; cleanup không giả báo thành công;
không mất update khi state writer khác đang hoạt động. Không chạy SQL phá hủy để thử trên DB thật.

## 3. P0 — guard an toàn chưa được triển khai tới bản cài

**Quan sát:** installed cache catalog bằng mtime thư mục root. Sửa manifest sâu bên trong
không nhất thiết làm đổi mtime đó. Repo đã bỏ cache này.
Installed `saveSnapshot()` thiếu validate session ID, guard handoff chưa archive và sanitize
metadata notes đã có ở repo; TUI thiếu cảnh báo riêng `STALE_HANDOFF`.

- [ ] **FIX-05:** Đồng bộ catalog revalidation; test sửa nested manifest mà root mtime không đổi.
- [ ] **FIX-06:** Triển khai guard handoff và sanitize notes sau khi review diff.
- [ ] **FIX-07:** Test không ghi đè journal/rotation chưa archive; reject ID không hợp lệ.
- [ ] **FIX-08:** Đóng gói một revision có manifest/hash, deploy và rollback đồng bộ adapters/core.

**Nghiệm thu:** stale catalog không tiếp tục được dùng như snapshot mới; handoff cũ còn nguyên
khi save mới bị từ chối; doctor hoặc release manifest chứng minh đúng code đang được nạp.

## 4. P1 — thiếu một contract kiến trúc dễ xác định

**Quan sát:** server dùng `createLocalRuntime()` từ `src/local-library.ts`; skill đang ON
được `buildInjection()` đưa vào system transform. `src/runtime.ts` và verified-loader/grants
vẫn tồn tại cho các đường khác/lịch sử; không coi tên file là bằng chứng route đang active.
Tài liệu cũ trộn ON/OFF với Selected/Loaded, grants, central registry và load tools.

- [ ] **FIX-09:** Phân loại module active / tooling / library-only / historical bằng import graph.
- [ ] **FIX-10:** Chọn contract skill chính; quyết định giữ, cách ly hay gỡ đường legacy bằng ADR.
- [ ] **FIX-11:** Rà runbook/tasklist lịch sử trước khi tái sử dụng; không chạy hướng dẫn load tool cũ.

**Nghiệm thu:** developer đi từ server entrypoint tới content assembly bằng một bản đồ rõ ràng;
không tài liệu hiện hành nào yêu cầu model gọi loader không được server cung cấp.
Các trang đầu vào đã được sửa trong task tài liệu; việc cleanup code vẫn chưa làm.

## 5. P1 — context budget và scope chưa theo task

**Quan sát:** selection theo project; các skill ON được assemble mỗi system transform.
`DEFAULT_SKILL_BUDGET` là 153.600 byte, không phải tokenizer/model-aware token limit.
OFF không xóa instruction trong history trước đó.

**Rủi ro:** nhiều instruction không liên quan; thay project toggle ảnh hưởng các session;
không biết đóng góp từng skill; thay prefix có thể ảnh hưởng cache nhưng chưa đo.

- [ ] **FIX-12:** Đo instruction bytes/tokens theo request và skill; đánh dấu estimate/source.
- [ ] **FIX-13:** Thử task-scoped context selection có chế độ tương thích project ON/OFF.
- [ ] **FIX-14:** Tách available / enabled / selected-for-task / injected-for-request như
  context states, không tự tạo permission engine hoặc grant mới.

**Nghiệm thu:** giải thích được vì sao skill xuất hiện ở request cụ thể; báo unknown khi thiếu
usage; so sánh chất lượng và chi phí trên task thành công trước khi đổi default.

## 6. P1 — logs và telemetry chưa thành observability hoàn chỉnh

**Đã có:** save-before-transform, private files, domain compactors, cap 50.000 UTF-8 byte,
telemetry whitelist/dedup; retention best-effort 7 ngày / 100 file / 64 MiB mỗi sink folder,
không xóa file mới flush và có grace period. Không phải quota cứng toàn hệ thống.

**Khoảng trống:** hook chỉ thấy `output.output`, có thể đã bị host truncate; raw output có thể
chứa secret; thiếu trace/timing/request lineage; reference có thể sống lâu hơn artifact.
`governance-hooks.ts` còn tự append `.gitignore` khi ghi log.

- [ ] **FIX-15:** Gọi chính xác là full observed output; ghi provenance/truncation upstream nếu biết.
- [ ] **FIX-16:** Tách operational events khỏi raw artifacts; thiết kế capture/redaction policy.
- [ ] **FIX-17:** Bổ sung task/request/span IDs, timing, retry lineage, config/revision identity.
- [ ] **FIX-18:** Có trạng thái artifact expired/unavailable và error event không chứa raw exception.
- [ ] **FIX-19:** Đưa thay đổi `.gitignore` sang setup có xác nhận; log hook không tự sửa repo.

**Nghiệm thu:** truy được một task tới model/tool/output; secret fixtures không lọt vào metadata;
artifact hết hạn không được quảng bá là còn đọc được. Redaction là heuristic, không chứng nhận an toàn.

## 7. P1 — workflow prompt chưa phải runtime protocol

**Quan sát:** controller/scout/implementer là prompt/config tùy chọn. Installed scout có
`steps: 6`; chỉ dẫn 6 turns/30.000 raw-output tokens không tự tạo budget enforcement.
Bash string deny không chứng minh filesystem isolation.

- [ ] **FIX-20:** Xác minh semantics `steps`, stop/cancel và child metadata trên host pin cụ thể.
- [ ] **FIX-21:** Schema hóa task envelope, input artifacts, acceptance criteria, failure reasons.
- [ ] **FIX-22:** Hiển thị supported / advisory / unsupported cho từng control.
- [ ] **FIX-23:** Đo số vòng `NEEDS_CONTEXT`; tránh hạn chế discovery làm tăng chi phí vô ích.

**Nghiệm thu:** không claim hard budget/cancel nếu adapter chưa chứng minh được;
child nhận input có scope và provenance; prompt không được hiểu là quyền thực thi.

## 8. P2 — usage store và vận hành dài hạn

**Quan sát:** `UsageStore.upsert()` đọc source JSONL, ghi lại source và rebuild aggregate.
Có transaction nhưng có nguy cơ read/write amplification khi lịch sử lớn.

- [ ] **FIX-24:** Benchmark theo dung lượng và số record; ghi latency/bytes thực tế.
- [ ] **FIX-25:** Chỉ sau benchmark mới chọn segmentation/snapshot hoặc SQLite riêng OpenArms.
- [ ] **FIX-26:** Migration, crash recovery và aggregate rebuild có test; không dùng DB host.
- [ ] **FIX-27:** Xây runtime identity/doctor và compatibility matrix server/TUI/host.

**Nghiệm thu:** phục hồi được aggregate từ source; diagnostics chỉ ra runtime/library/state/config;
không ghi credential vào report. SQLite là phương án, không phải yêu cầu MVP.

## 9. Checklist bàn giao remediation

- [ ] Chọn FIX IDs, owner và phạm vi source + installed cần đổi; không vá mù bản cài.
- [ ] Review test plan bằng `node scripts/arms-test.mjs verify --plan` với toàn task scope.
- [ ] Thêm regression trước khi sửa lỗi có thể tái hiện; không test phá hủy dữ liệu thật.
- [ ] Chạy syntax sau sửa code đáng kể và verify cuối task theo plan.
- [ ] Smoke chỉ khi được yêu cầu explicit; ghi host acceptance riêng, không đồng nhất fake SDK với live host.
- [ ] Deploy đúng revision, kiểm tra identity, có backup/rollback; không tự ghi đè config người dùng.
- [ ] Chỉ đánh dấu FIX hoàn tất khi có diff, lệnh kiểm tra, kết quả và bằng chứng deployment phù hợp.
