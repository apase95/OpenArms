# Tasklist Phase 1: Quick Wins & Output Governor

Mục tiêu phase: giảm test/tool output đi vào context với rủi ro thấp, bảo toàn full log và chạy policy mới ở Shadow Mode trước khi enforcement.

Quy ước tổng Sprint: 1 day = 8 giờ làm việc; thời gian quan sát được tính riêng và có thể chạy song song với công việc không phụ thuộc.

| Sprint | Mục tiêu | Tasks | Thời lượng ước tính |
|---|---|---|---:|
| Sprint 1.1 | Test foundation và contract | TSK-101 đến TSK-106 | 6 days |
| Sprint 1.2 | Output governor và policy | TSK-107 đến TSK-112 | 6.75 days |
| Sprint 1.3 | Verification và rollout | TSK-113 đến TSK-116 | 6 days + 1 tuần quan sát |

## Sprint 1.1: Test Foundation & Contracts

**Sprint Goal:** Chốt contract output, test wrapper, log sink và related-test mapping trước khi can thiệp tool output.

[ ]TSK-101 - Overview: Chuẩn hóa contract của output governor. Details: Định nghĩa contract TypeScript duy nhất cho `output-governor`: input phải chứa tool name, session ID, message/tool-call ID, command đã redaction, stdout, stderr và exit code; output phải chứa text được phép đưa vào context, số byte/dòng trước và sau compact, trạng thái truncated, full-log path tùy chọn và reason code. Quy định thứ tự bắt buộc là nhận raw result -> lưu full log khi cần -> strip ANSI/control sequence -> compact -> áp hard cap -> trả metadata; lỗi governor không được đổi exit code hoặc biến command thất bại thành thành công, và phải rơi về hard-cap fallback có cảnh báo. Hoàn tất khi contract được export dùng chung, có ví dụ pass/fail/truncated và không còn adapter tự định nghĩa result shape riêng. (Estimate: 6 hours)

[ ]TSK-102 - Overview: Xây dựng test wrapper ba tầng. Details: Tạo một test wrapper có giao diện ổn định cho ba chế độ `syntax`, `related` và `full`; `syntax` chỉ chạy parse/type-check/lint phù hợp với file thay đổi, `related` resolve test từ manifest, còn `full` chạy nguyên suite. Wrapper phải truyền nguyên exit code của process con, xử lý signal/timeout, từ chối mode không hợp lệ, không tự chuyển từ `related` sang `full` trừ fallback được khai báo trong policy và hỗ trợ chạy non-interactive trong agent, pre-push và CI. Hoàn tất khi cùng một command chạy được từ repository root, T0/T1 không gọi full suite ngoài policy và T2 chỉ được kích hoạt tường minh. (Estimate: 1.5 days)

[ ]TSK-103 - Overview: Chuẩn hóa output của test wrapper. Details: Chuẩn hóa parser và renderer output của test wrapper: khi pass chỉ trả một dòng dạng `<passed>/<total> pass` kèm duration nếu có; khi fail trả danh sách test/suite lỗi đã deduplicate, exit code, full-log path và tối đa 30 dòng cuối có giá trị chẩn đoán. Không được cắt mất compile error đầu tiên, tên test lỗi hoặc nguyên nhân process crash; nếu reporter không parse được thì trả reason `UNPARSEABLE_TEST_OUTPUT`, phần đầu chứa lỗi đầu tiên và phần cuối chứa termination context. Hoàn tất khi output context có giới hạn tất định cho pass, assertion failure, compile failure, timeout và process signal. (Estimate: 1 day)

[ ]TSK-104 - Overview: Xây dựng full-output log sink. Details: Triển khai log sink lưu raw stdout/stderr đầy đủ trước mọi thao tác compact vào thư mục runtime ngoài conversation history; tên file phải chống collision và truy vết được bằng session ID cùng tool-call ID nhưng không đưa command/secret vào filename. Ghi file bằng create-exclusive hoặc atomic rename, đặt permission chỉ owner đọc/ghi, trả path chỉ sau khi flush thành công và có policy cleanup/retention rõ ràng. Nếu ghi log thất bại, result phải giữ đủ lỗi trong context, gắn `LOG_WRITE_FAILED` và tuyệt đối không tuyên bố đã bảo toàn full output. (Estimate: 1 day)

[ ]TSK-105 - Overview: Thiết lập related-test manifest. Details: Thiết kế và tạo `test-map.json` với schema version, path tương đối chuẩn hóa từ repository root và mapping một source file tới một hoặc nhiều test file có thứ tự ổn định. Resolver phải reject absolute path, `..`, file không tồn tại và test nằm ngoài repository; file test thay đổi phải chạy chính nó, module shared/core được phép map sang full suite theo khai báo, docs-only trả empty test set, còn source mới chưa map chỉ dùng test cùng basename nếu tồn tại, nếu không trả lỗi cấu hình thay vì âm thầm bỏ test. Hoàn tất khi manifest validate được độc lập và mọi source hiện tại có quyết định test rõ ràng. (Estimate: 1 day)

[ ]TSK-106 - Overview: Phát hiện drift của test mapping. Details: Thêm drift test quét đúng các source directory được cấu hình, bỏ qua declaration/generated/build/vendor path, chuẩn hóa separator đa nền tảng và kiểm tra từng source có mapping hợp lệ hoặc test cùng basename. Test phải fail với danh sách đầy đủ file thiếu mapping, mapping trỏ tới file đã xóa, entry trùng và path sai casing; message lỗi phải nêu chính xác cách sửa manifest. Hoàn tất khi thêm một source giả không mapping làm test fail và thêm mapping hợp lệ làm test pass mà không cần thay test code. (Estimate: 6 hours)

## Sprint 1.2: Output Governor & Policy

**Sprint Goal:** Triển khai compact output an toàn, hard cap, noise preset, Shadow Mode và telemetry phục vụ đo lường.

Implementation Sprint 1.2: xem [report](../reports/sprints/report_sprint_12.md) và
[guide](../testing/how_to_test/Sprint_12.md). TSK-107–112 có code/fixtures;
checkbox nghiệm thu giữ pending đến scoped review và mandatory validation.
Không đánh dấu Sprint 1.3/quan sát bảy ngày bằng unit-test evidence.

[ ]TSK-107 - Overview: Triển khai deterministic output compaction. Details: Triển khai compact pipeline thuần và tất định: normalize line endings, loại ANSI/OSC/control sequence an toàn, tính byte bằng UTF-8, giữ cấu trúc dòng, chọn head/tail theo policy và chèn marker chứa chính xác số dòng/byte bị lược bỏ. Pipeline phải xử lý Unicode không cắt giữa code point, stdout/stderr rỗng, dòng đơn cực dài, binary-like output và output không có newline; metadata/exit code nằm ngoài text và không bị parser thay đổi. Hoàn tất khi cùng input/policy luôn tạo byte-for-byte output giống nhau và marker không thể bị nhầm với raw tool output. (Estimate: 1.5 days)

[ ]TSK-108 - Overview: Áp dụng hard safety cap 50 KB. Details: Thêm interceptor cuối cùng áp trần tuyệt đối 50,000 byte UTF-8 cho text trả về model, độc lập với threshold mềm và luôn chạy kể cả compact parser throw. Interceptor phải cắt ở ranh giới code point, ưu tiên giữ cảnh báo critical cùng log reference, không làm tổng payload sau khi thêm cảnh báo vượt cap, giữ exit code/metadata và ghi metric `HARD_CAP_APPLIED`; raw output phải được gửi tới log sink trước khi cắt. Hoàn tất khi property test chứng minh mọi output trả về không vượt cap, kể cả Unicode, một dòng khổng lồ và lỗi trong compact logic. (Estimate: 1 day)

[ ]TSK-109 - Overview: Thêm preset giảm command noise. Details: Khai báo preset giảm noise theo executable và subcommand đã allowlist, ví dụ environment `CI=1`, `NO_COLOR=1`, `TERM=dumb`, cùng flag chỉ được tài liệu tool hỗ trợ. Preset không được rewrite shell string tùy ý, không thêm `--silent` toàn cục, không thay đổi command khi không nhận diện chắc chắn và phải giữ stderr, warning quan trọng cùng exit code. Hoàn tất khi có bảng compatibility, unit test cho npm/pnpm/yarn/pip/Git được hỗ trợ và test xác nhận command lạ được giữ nguyên. (Estimate: 6 hours)

[ ]TSK-110 - Overview: Xây dựng file-access Shadow Mode. Details: Xây dựng policy evaluator thuần cho file access với mode `off|shadow|active`, reason code riêng cho lockfile, minified, source map, generated output, binary, log lớn và file vượt size/line threshold. Ở `shadow`, evaluator phải ghi quyết định `SHADOW_DENY` hoặc `SHADOW_ASK` kèm normalized path, rule ID và context tối thiểu nhưng vẫn cho host tiếp tục; không log file content, secret hoặc raw command. Hoàn tất khi cùng request/policy tạo cùng decision và test chứng minh Shadow Mode không thay đổi kết quả read thực tế. (Estimate: 1.5 days)

[ ]TSK-111 - Overview: Truy xuất lockfile hiệu quả. Details: Ghi hướng dẫn search/range trước khi đọc toàn lockfile và đo dung lượng qua telemetry hiện có. Cho phép đọc theo nhu cầu task, gồm review dependency, audit và chẩn đoán CI trước install; không tạo permission gate theo install history hoặc ba tool calls. Đọc toàn file lớn có warning hoặc ask nếu host được cấu hình, không tự thêm engine quyền. Hoàn tất khi fixture review trước install không bị policy lockfile chặn, search/range vẫn hoạt động và cảnh báo kích thước không làm mất đường đọc cần thiết. (Estimate: 1 day)

[ ]TSK-112 - Overview: Ghi telemetry cho output governance. Details: Mở rộng telemetry schema có version cho mỗi tool call với tool name, session/message/call ID, raw bytes, context bytes, estimated tokens, truncation type, omitted bytes/lines, log-write status, policy mode, rule ID và decision. Không lưu raw output, file content, environment, credential hoặc command chưa redaction; event retry phải idempotent theo tool-call ID và lỗi telemetry không được làm tool call thất bại. Hoàn tất khi có JSON schema/type validation, redaction test và aggregate tính được tỷ lệ tiết kiệm cùng false-positive review set. (Estimate: 1 day)

## Sprint 1.3: Verification & Shadow Rollout

TSK-110 chỉ đánh giá policy tối ưu và ghi telemetry; quyền filesystem thực tế
thuộc host. Lockfile không có deny mặc định theo loại file. Generated/minified
và size rules bắt đầu ở observe/shadow; chỉ active sau đánh giá từng rule, xác
nhận host hỗ trợ enforcement và có override. Không xây shell/file permission
engine trong output governor.

**Sprint Goal:** Kiểm chứng output governor end-to-end, chạy Shadow Mode có dữ liệu và chốt điều kiện hoàn thành Phase 1.

Sprint 1.3 local implementation: [report](../reports/sprints/report_sprint_13.md),
[guide](../testing/how_to_test/Sprint_13.md). TSK-113 local coverage implemented;
TSK-114 local process/SDK fixtures implemented, actual host invocation pending.
TSK-115 collection/review aid ready, seven active days and real baseline pending.
TSK-116 acceptance pending host/telemetry/owner/fresh review. TSK-113 local tests
passed mandatory validation. Remaining checkboxes are acceptance gates, not claims
that synthetic fixtures complete real rollout.

[x]TSK-113 - Overview: Kiểm thử đơn vị output governor. Details: Viết unit/property tests cho toàn bộ output-governor gồm ANSI/OSC stripping, CRLF, Unicode multi-byte, empty output, binary-like bytes, head/tail boundary, exact marker count, deterministic result, hard cap 50,000 byte, pass/fail exit code và log-write failure. Dùng fixture nhỏ tự tạo, không phụ thuộc network/thời gian thực; mỗi bug class phải có assertion trên text lẫn metadata và test phải chứng minh raw log bằng input trước compact khi write thành công. (Estimate: 1.5 days)

[ ]TSK-114 - Overview: Kiểm thử tích hợp test và output flow. Details: Viết integration tests chạy process thật trong fixture repository để kiểm chứng `syntax|related|full`, manifest resolution, full-log creation, compact result qua hook OpenCode đã được Phase 0 xác nhận và Shadow Mode không chặn read. Bao phủ pass, assertion fail, compile fail, timeout, process signal, missing mapping, concurrent calls và log directory không ghi được; test phải kiểm tra exit code đầu-cuối và cleanup fixture. (Estimate: 2 days)

[ ]TSK-115 - Overview: Đánh giá policy bằng Shadow Mode. Details: Chạy Shadow Mode tối thiểu bảy ngày hoạt động với policy version cố định; thu thập số lần từng rule would-deny/would-ask, thao tác sau đó của người dùng, output bytes trước/sau compact, hard-cap count, full-test runs/task và lỗi log sink. Review từng decision bị đánh dấu sai, phân loại false positive theo rule/use case, không thay threshold giữa kỳ nếu không tạo cohort mới và xuất báo cáo so sánh baseline có sample size. Chỉ đề xuất chuyển rule sang active khi không có data-loss incident, false-positive rate nằm trong ngưỡng được owner chấp thuận và có override path. (Estimate: 1 week observation + 1.5 days analysis)

[ ]TSK-116 - Overview: Nghiệm thu Phase 1. Details: Thực hiện acceptance review bằng fixture và telemetry thật: test pass trả đúng một dòng; assertion/compile/timeout failure giữ tên lỗi, exit code và tối đa 30 dòng hữu ích; agent T0/T1 không gọi full suite ngoài fallback được khai báo; payload cuối luôn <=50,000 byte; mọi truncation có full-log path hợp lệ hoặc `LOG_WRITE_FAILED` minh bạch; Shadow Mode không chặn thao tác. Ghi lại command, kết quả, policy version và các giới hạn còn lại; Phase 1 chỉ hoàn tất khi toàn bộ tiêu chí pass và không còn lỗi severity cao. (Estimate: 1 day)
