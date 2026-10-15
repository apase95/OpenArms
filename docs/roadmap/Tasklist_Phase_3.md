# Tasklist Phase 3: Context Rotation & Budget

Mục tiêu phase: cảnh báo sớm khi cost hoặc context tăng bất thường, tạo handoff ngắn và chỉ cân nhắc enforcement nếu telemetry cùng API spike của Phase 0 đã đáng tin cậy.

Quy ước tổng Sprint: 1 day = 8 giờ làm việc; thời gian quan sát được tính riêng, còn TSK-316 chỉ cộng vào effort khi API spike hỗ trợ hard cancel an toàn.

| Sprint | Mục tiêu | Tasks | Thời lượng ước tính |
|---|---|---|---:|
| Sprint 3.1 | Budget data foundation | TSK-301 đến TSK-306 | 8.5 days |
| Sprint 3.2 | Rotation và session lifecycle | TSK-307 đến TSK-313 | 8 days |
| Sprint 3.3 | Shadow evaluation và enforcement decision | TSK-314 đến TSK-316 | 2.5 days + 2 tuần quan sát; thêm 2 days nếu hard limit được hỗ trợ |
| Sprint 3.4 | Verification và KPI report | TSK-317 đến TSK-320 | 7 days |

## Sprint 3.1: Budget Data Foundation

**Sprint Goal:** Xác nhận telemetry đủ tin cậy, xây aggregate/budget policy và cung cấp usage view chỉ đọc.

Implementation/evidence: [Sprint 3.1 report](../reports/sprints/report_sprint_31.md).
TSK-302 configuration and policy foundation delivered. TSK-303–306 have durable
source/rebuild, context report, warning ledger and shared read-only command/TUI
source implementations with fixture coverage; live acceptance remains open.
TSK-301 remains blocked on real-host/provider/owner evidence. Streaming message
capture, task attribution and loaded-skill estimates remain unavailable in the
live adapter; these fields are supported only by explicit library records.
Hard cancellation and child propagation remain blocked pending real-host evidence.

[ ]TSK-301 - Overview: Xác nhận Phase 3 readiness. Details: Tạo readiness checklist có bằng chứng cho Phase 3: message usage upsert idempotent theo `messageID`, tool usage idempotent theo tool-call ID, schema version cố định, aggregate ngày/session khớp report OpenCode/provider trong sai số do owner chấp thuận, output-governor metrics không chứa secret và hai spike `chat.params` cancel cùng child-session metadata có kết luận pass/fail bằng integration test. Nếu bất kỳ điều kiện nào thiếu, budget chỉ được chạy report-only và task hard enforcement/child propagation phải bị đánh dấu blocked, không được giả định API hoạt động. (Estimate: 1 day)

[ ]TSK-302 - Overview: Thiết kế budget policy. Details: Định nghĩa `BudgetPolicy` có schema version và scope riêng cho day/session/task, gồm currency, cost USD, fresh input, output, optional cache-read diagnostic, context utilization, tool-output bytes, warning percentages, reset timezone, policy mode `off|observe|warn|ask|enforce` và override rule. Validator phải reject threshold âm/không tăng, hard limit thấp hơn warning, timezone/currency không hỗ trợ và enforcement khi capability flag chưa đạt; cache read không được là hard-limit duy nhất. Hoàn tất khi default policy chỉ observe, merge precedence global/project/session rõ ràng và config lỗi không âm thầm dùng giá trị nguy hiểm. (Estimate: 1.5 days)

[ ]TSK-303 - Overview: Xây dựng usage aggregates. Details: Xây dựng aggregate từ immutable/latest message snapshot và tool-call record theo ngày, project, session, task, provider, model và agent; update cùng ID phải thay delta cũ thay vì cộng thêm, completed record không bị regression bởi event cũ và day boundary dùng timezone trong policy. Aggregate phải tách input/output/reasoning/cache read/cache write/cost/tool bytes, xử lý missing cost rõ ràng, rebuild được từ JSONL source of truth và ghi atomic. Hoàn tất khi incremental aggregate bằng full rebuild trên fixture có duplicate, out-of-order, retry và partial message. (Estimate: 2 days)

[ ]TSK-304 - Overview: Báo cáo context growth. Details: Tạo report theo task/session gồm cost, fresh input, output, reasoning, cache read/write, turn count, context-utilization sample, raw/context tool-output bytes, truncation count và loaded skill/token estimate. Report phải chỉ ra top tool/output contributors theo số liệu đo được, ghi `correlation only` cho skill hiện diện, đánh dấu metric missing/estimated thay vì thay bằng 0 và không suy diễn nguyên nhân từ proximity. Hoàn tất khi report JSON có schema ổn định, TUI text có cùng số liệu và tổng breakdown reconcile với aggregate gốc. (Estimate: 1.5 days)

[ ]TSK-305 - Overview: Triển khai budget threshold warnings. Details: Triển khai threshold evaluator cho từng metric/scope với crossing semantics: chỉ phát event khi usage đi từ dưới lên bằng/vượt 50%, 80% hoặc 100%; nhảy thẳng qua nhiều mức chỉ phát cảnh báo mức cao nhất kèm các mức đã vượt; retry/restart không phát trùng nhờ key gồm policy version, scope ID, metric và threshold. Reset chỉ xảy ra khi scope mới bắt đầu hoặc owner reset budget, còn aggregate correction giảm xuống không được tự mở khóa cảnh báo cũ. Hoàn tất khi concurrent updates tạo tối đa một event và message hiển thị current/limit, breakdown cùng action an toàn. (Estimate: 1 day)

[ ]TSK-306 - Overview: Hiển thị usage và budget. Details: Thêm read-only command/TUI cho `usage today|session|project|model` và `budget`, dùng chung query service thay vì tính riêng trong UI. Mỗi view phải hiển thị thời gian/scope, policy version, cost và token breakdown, tool-output contributors, threshold đã phát, dữ liệu estimated/missing và khuyến nghị cụ thể như compact output hoặc rotate sau task; không hiển thị raw prompt/tool output/secret. Unknown scope, empty data và corrupt aggregate phải có trạng thái rõ, không báo `0` gây hiểu nhầm. (Estimate: 1.5 days)

## Sprint 3.2: Rotation & Session Lifecycle

**Sprint Goal:** Xây rotation signal, handoff an toàn, child-session policy, restore policy và Shadow Mode action layer.

Implementation/evidence: [Sprint 3.2 report](../reports/sprints/report_sprint_32.md)
and [test/recovery guide](../testing/how_to_test/Sprint_32.md). Source implements
explicit-boundary advisory rotation, sanitized compact handoff and durable
lifecycle, disabled-bridge child fallback, scoped restore, and allow-only shadow
auditing/replay. Deployed task-completed delivery, restore rendering, provider
readiness and owner acceptance remain open; no task is marked fully accepted by
fixture evidence. No automatic rotation, new-session bridge or cancellation.
Completion repository checks passed: full 164/164, static 8/8, runtime 5/5 and
TUI 4/4; exact scope/logs are in the report. These do not close live acceptance.

[ ]TSK-307 - Overview: Xây dựng session rotation signal. Details: Xây dựng rotation evaluator thuần chỉ chạy tại task-completed boundary, nhận context utilization, session budget, cache-read trend, cumulative tool bytes và task-relatedness signal có nguồn rõ ràng. Trả `none|suggest|ask` cùng reason codes; không tự đóng session, không rotate khi edit/test còn active, không dùng cache read đơn lẻ làm hard trigger và nếu task-relatedness không xác định thì bỏ tiêu chí đó thay vì đoán. Hoàn tất khi threshold default 60% cấu hình được, cùng snapshot cho cùng decision và test bao phủ nhiều reason, metric thiếu cùng task chưa hoàn tất. (Estimate: 1.5 days)

[ ]TSK-308 - Overview: Tạo compact session handoff. Details: Tạo handoff writer ghi `.openarms/progress.md` theo đúng bảy section `Objective`, `Completed`, `Active`, `Decisions`, `Verification`, `Relevant Files`, `Next Step`; tổng file không quá 30 dòng, mỗi item ngắn và chỉ chứa trạng thái có nguồn từ task/runtime. Writer phải dùng atomic rename, tạo parent directory an toàn, không chèn full diff/log/code block, không ghi ngoài project root và không overwrite handoff mới hơn nếu có concurrent writer. Hoàn tất khi output parse/reuse được, deterministic với cùng input và quá giới hạn được compact theo ưu tiên thay vì cắt mất Next Step. (Estimate: 1 day)

[ ]TSK-309 - Overview: Làm sạch dữ liệu handoff. Details: Thêm sanitizer trước handoff writer để reject hoặc redaction credential phổ biến, bearer token, private key block, `.env` assignment, absolute sensitive path, stack trace, diff hunk và raw tool output; sanitizer phải chạy trên từng field trước khi tính giới hạn dòng. Không được tuyên bố phát hiện mọi secret: nếu detector không chắc hoặc field đến từ untrusted tool output, bỏ field và ghi placeholder an toàn; audit chỉ ghi rule ID, không ghi secret đã match. Hoàn tất khi fixture secret không xuất hiện trong file/error/log và false-positive fixture vẫn giữ được thông tin tiến độ cần thiết. (Estimate: 1 day)

[ ]TSK-310 - Overview: Quản lý handoff lifecycle. Details: Định nghĩa lifecycle handoff `prepared -> claimed -> acknowledged -> archived` với handoff ID, source session, target session tùy chọn, created time và content hash trong metadata ngoài phần 30 dòng. Tạo session thất bại hoặc chỉ đọc file không được xóa handoff; chỉ archive sau acknowledgement explicit từ target session khớp ID/hash, thao tác phải idempotent và stale handoff có retention policy. Hoàn tất khi crash/retry/concurrent target không làm mất hoặc claim nhầm handoff và user có command inspect/recover. (Estimate: 1 day)

[ ]TSK-311 - Overview: Giới hạn skill cho child theo task. Details: Nếu spike xác nhận bridge đáng tin cậy, parent cấp tập skill cần thiết cho task được giao qua pending grant có exact skill IDs, child intent, nonce và expiry; child consume một lần khi ID khớp. Nếu bridge không có, child mặc định zero optional skill và request grant tường minh qua loader. Không match bằng timing, không inherit task lock/history hay toàn bộ parent/project grants; orphan metadata phải hết hạn. Filesystem/shell rights do host quyết định riêng, không suy ra từ skill grant. Hoàn tất khi child nhận đúng tập cần thiết, concurrent creation không nhận chéo và fallback được test end-to-end. (Estimate: 1.5 days)

[ ]TSK-312 - Overview: Restore selection và grant theo vòng đời. Details: Dialog mặc định No; No tạo zero selection, Yes restore selection sau reconcile. Không restore active task lock, used markers hay mismatch approval. Grant once hết hiệu lực sau một load thành công và không mang sang session mới; grant session chỉ dùng trong session gốc; grant project có thể giữ qua session khi project, registry revision/hash và policy vẫn hợp lệ, không được tạo lại từ selection. Dialog nêu rõ selection và grant nào còn hiệu lực; history chỉ dùng inspect, không vào router prompt. Hoàn tất khi parent không bị sửa, stale grant bị loại, project grant hợp lệ không yêu cầu cấp lại và once/session không bị chuyển scope khi restore. (Estimate: 1 day)

[ ]TSK-313 - Overview: Thực thi budget policy ở Shadow Mode. Details: Thêm policy executor tách evaluator khỏi action: trong `observe/shadow`, mọi decision `would_warn|would_ask|would_block|would_rotate` chỉ ghi event chứa policy version, scope, metric, threshold, current value và reason codes rồi trả allow; không mở dialog, cancel request hay tạo session. Event phải deduplicate giống warning thật, không chứa prompt/output và hỗ trợ replay offline để so policy version. Hoàn tất khi integration test chứng minh tất cả request/tool call vẫn chạy như khi policy off nhưng audit đủ để dự đoán impact. (Estimate: 1 day)

## Sprint 3.3: Shadow Evaluation & Enforcement Decision

**Sprint Goal:** Đánh giá dữ liệu Shadow Mode và chọn chính xác warning-only hoặc optional hard enforcement dựa trên API capability.

[ ]TSK-314 - Overview: Phân tích budget Shadow Mode. Details: Chạy Shadow Mode trong 7-14 ngày hoạt động với baseline và policy cohort được version hóa; đo sample size, cost/ngày, fresh input/task, cache read/turn, output/task, tool bytes/task, turns/task, task success proxy, would-block/would-rotate count và override giả định. Review thủ công mẫu decision để gắn true/false positive cùng nguyên nhân, tách thay đổi provider/model/workload khỏi tác động policy và không thay threshold giữa cohort. Báo cáo phải nêu confidence/limitation và chỉ khuyến nghị activation từng rule, không bật toàn bộ theo mốc thời gian. (Estimate: 2 weeks observation + 2 days analysis)

[ ]TSK-315 - Overview: Chốt warning-only fallback. Details: Khi spike cho thấy `chat.params` không cancel request gracefully hoặc làm crash/hỏng TUI state, ghi Architecture Decision Record chọn warning-only: capability flag `hardCancel=false`, config `enforce` bị validator từ chối hoặc hạ về `ask` có cảnh báo rõ, không tồn tại throw/rewrite workaround trong production path và tài liệu/command không hứa hard limit. Hoàn tất khi integration test xác nhận vượt 100% vẫn cảnh báo nhưng request tiếp tục, và task TSK-316 được đánh dấu not applicable thay vì triển khai giả lập. (Estimate: 4 hours)

[ ]TSK-316 - Overview: Triển khai optional hard budget limit. Details: Chỉ khi spike pass, triển khai hard limit opt-in với default `off`: evaluator phát block trước model request kế tiếp, UI nêu scope/metric/current/limit và cho `cancel`, `allow once` hoặc grant có expiry; override phải gắn user action, policy version và audit ID, không tự tăng budget vĩnh viễn. Cancel phải dùng API đã kiểm chứng, không throw ngoài contract, không chặn tool cleanup/handoff và cache-read-only không được kích hoạt block. Hoàn tất khi integration test chứng minh graceful cancel, once override chỉ dùng một lần, restart không mất audit và không có đường block thiếu recovery. (Estimate: 2 days)

## Sprint 3.4: Verification & KPI Report

**Sprint Goal:** Kiểm thử toàn bộ budget/session lifecycle, đo kết quả trước-sau và nghiệm thu Phase 3.

[ ]TSK-317 - Overview: Kiểm thử đơn vị budget và lifecycle. Details: Viết unit/property tests cho aggregate delta/rebuild, out-of-order event, timezone reset, threshold crossing/dedup, policy validation, rotation task-boundary, report missing metric, handoff 30-line compaction, sanitizer secret corpus, lifecycle idempotence, restore filtering và child metadata/fallback. Dùng fake clock/IDs và fixture cục bộ để test deterministic; mỗi safety invariant phải có negative test chứng minh request không bị block hoặc state không bị inherit ngoài ý muốn. (Estimate: 2.5 days)

[ ]TSK-318 - Overview: Kiểm thử tích hợp budget và session flow. Details: Viết integration tests qua adapter/TUI boundary cho usage query, warning 50/80/100, restart dedup, task-complete rotation suggestion, atomic handoff, target acknowledgement, restore No/Yes và concurrent child session. Nếu hard cancel được hỗ trợ, test request bị cancel gracefully và once override; nếu không, test validator loại enforcement và warning-only path. Test phải kiểm tra không lộ raw usage content/secret và cleanup toàn bộ temp state. (Estimate: 2 days)

[ ]TSK-319 - Overview: Báo cáo KPI trước và sau tối ưu. Details: Lập báo cáo before/after dùng cùng định nghĩa metric, timezone, provider/model segmentation và tối thiểu sample size đã thống nhất; gồm cost/ngày hoạt động, fresh input/task, cache read/turn ở session dài, output/task, raw/context tool bytes, full-test runs/task, turns/task, rotation acceptance và task success rate. Báo cáo phải tách estimated khỏi billed value, nêu workload/confounder, không claim causation từ correlation và so mục tiêu thử nghiệm 20-40% cost reduction với confidence/limitation thực tế. (Estimate: 1.5 days)

[ ]TSK-320 - Overview: Nghiệm thu Phase 3. Details: Acceptance end-to-end: aggregate reconcile, view giải thích dữ liệu thiếu, threshold không trùng, rotation sau task, handoff <=30 dòng và archive sau ack. Child chỉ nhận tập skill được cấp theo branch đã kiểm chứng; host permission độc lập. Restore default No, không restore active lock; project grant hợp lệ giữ đúng scope, once/session không chuyển sang session mới. Shadow Mode không chặn. Hard enforcement nếu có phải opt-in, graceful cancel, once override và audit; hoàn tất khi không có blocker safety/data-integrity và KPI ghi rõ giới hạn. (Estimate: 1 day)
