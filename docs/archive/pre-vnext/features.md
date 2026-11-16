# OpenArms — danh mục năng lực và giới hạn

Đối chiếu source baseline `bdd62e8`. **Có implementation không đồng nghĩa đã nghiệm thu
live host/provider/TUI**. Trang này thay danh sách “20/24 hoàn tất” và các cam kết tuyệt đối
trước đây; không dùng phần trăm tiết kiệm chưa có corpus/evidence làm tuyên bố sản phẩm.

## 1. Có trong source/route hiện tại

| Năng lực | Cơ chế | Giới hạn |
|---|---|---|
| Project skill controls | Per-package manifests, ON/OFF/ERROR, TUI `/skills` | Scope project; OFF không xóa history |
| Safe skill assembly | `local-library.ts`, bounded reads và system transform | Instruction không phải OS permission |
| Output governor | Save observed output trước normalize/compact; domain parsers và fallback | Hook có thể nhận output đã bị host truncate |
| Test/build/linter/git-diff compactors | Domain classification và bounded rendering | Không hỗ trợ mọi format; không bảo đảm giữ mọi thông tin |
| File inspection guard | Xử lý output read/cat theo nhận diện | Không phải filesystem sandbox |
| Final tool text cap | 50.000 UTF-8 byte trên output đi qua governor | Không giới hạn toàn prompt, memory hay provider request |
| Private logs/telemetry | Raw artifacts riêng với numeric metadata | Raw logs có thể chứa secret; cần privacy review |
| Retention | Best-effort 7 ngày / 100 file / 64 MiB mỗi sink folder | Có grace/new-file exceptions; không quota cứng |
| Usage/context reports | Completed message snapshots, tool metrics, `/usage`, `/budget` | Unknown khác zero; byte/4 chỉ estimate |
| Budget policy/warnings | Observe/report/advisory paths | Không hứa hard cancellation/billing cap |
| Reviewed handoff | Sanitized fields, journal, phase tracking, selection snapshot | Không chứng minh model hiểu hay task hoàn tất |
| Test runner | Scope classification, syntax/related/full và explicit smoke | Host verify không yêu cầu Docker/Python/PTY |
| Sandbox/PTY tooling | Reference smoke có synthetic-host scenarios | Chỉ chạy explicit; không chứng minh 100% UI hoặc OS isolation |

Source hiện còn tự append `.gitignore` khi log; installed runtime khảo sát có thêm cleanup
DB host. Đây là [vấn đề cần vá](reports/overview/openarms-remediation-audit.md), không phải
feature được khuyến nghị.

## 2. APIs/tooling có điều kiện, không được hiểu là bảo đảm toàn runtime

- Audited ingestion/install/decompiler có schema, bounded inputs, consent và transactional
  writer theo từng pipeline; cần xem [skill guide](guides/skill-management.md) và sprint evidence.
- Remote fetcher/extractor có phạm vi nguồn/archive giới hạn; không hứa mọi URL, Git hoặc ZIP.
- Security scanner/sanitizer là heuristic; không xác nhận skill không chứa mã độc/secret.
- Registry v2/hash tooling và verified-loader tồn tại cho các đường/lịch sử khác; route server
  hiện dùng manifest injection, không bắt mọi skill có hash grant hoặc gọi loader.
- Hash khớp chỉ chứng minh bytes khớp revision, không chứng nhận nguồn/nội dung an toàn.
- Context telemetry không chứng minh phân rã chính xác system/user/tool token hoặc causal attribution.

Không dùng nhãn sprint “done” để suy ra mọi migration/live acceptance đã hoàn tất.
Xem [reports](reports/README.md) để phân biệt fixture, synthetic-host và real evidence.

## 3. Chưa bật hoặc chưa có bảo đảm

- Automatic threshold rotation và automatic task-completion detection trong production adapter.
- Hard budget enforcement/cancel có bảo đảm.
- Atomic ownership nhiều client hoặc exactly-once submission xuyên host/process.
- Measured token/cost savings, không giảm task quality, hoặc phòng overflow tuyệt đối.
- Model tự tuân thủ toàn bộ skill instructions hay sanitizer loại hết dữ liệu nhạy cảm.

## 4. Đề xuất cải tổ — chưa phải tính năng hiện hành

- [ ] Runtime identity/doctor, release manifest và reviewed deploy/rollback.
- [ ] Capability-aware config, provenance và explicit advisory/unsupported states.
- [ ] Trace correlation và artifact capture/privacy/expiry contract.
- [ ] Task-scoped context planner, token budgets và evidence manifest.
- [ ] Typed task/delegation protocol, recoverable reviewed handoff.
- [ ] Usage storage scaling sau benchmark; optional OTel export.

Dependency, checklist và nghiệm thu: [feature proposals](reports/overview/openarms-feature-proposals.md).

## 5. Điểm vào

- [Kiến trúc](architecture/Architecture.md) — hiện trạng khác thiết kế đích.
- [Skill format và migration](guides/skill-management.md).
- [Usage/budget UX](guides/budget-ux.md).
- [Audit remediation](reports/overview/openarms-remediation-audit.md).
- [Testing policy](testing/testing.md) — smoke không tự lên lịch từ integration classification.
