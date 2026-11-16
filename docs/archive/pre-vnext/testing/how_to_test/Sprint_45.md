# Sprint 4.5 — install UI, deterministic PTY và paired KPI protocol

## Cài đặt tương tác

Gõ `/skills install [--local|--global] [--overwrite] https://github.com/owner/repo`
hoặc chọn `install` trong `/skills` (palette `/skills-install`). Nhập chính xác
`providerID/modelID`; đây là lựa chọn thủ công rõ ràng, không tự kế thừa model đang
chọn của host. Không có default/fallback; chưa chứng minh bảo toàn current-host model.
Không tự lấy model rẻ hơn. Xác nhận riêng việc
gửi source/assets text cho model (có thể tính phí; <=16 calls, 30s/call, không billing
cap), từng staged security review, rồi target/registry/fingerprint ở final Install.
Mặc định mọi confirmation là Cancel; Esc/đóng/60s timeout đều từ chối.
HIGH/CRITICAL luôn chặn. MEDIUM phải ghi risk-choice event trước khi tiếp tục.
Audit review không phải install consent. UI báo bốn progress stages; không hiển thị
savings ước đoán thành savings thật. Download giới hạn 10 MiB/30s, temporary cleanup
được giữ trong `withSkillDownload`; adapter cleanup session riêng.

Local ghi `<project>/skills/<id>` + `<project>/registry.json`; global ghi
`$XDG_CONFIG_HOME/opencode/skills/<id>` + registry ở cùng root (fallback `~/.config`).
Writer không migrate v1, không merge khác library và không bypass security review.
Sau thành công, chỉ refresh cùng root; khác root phải confirm `Use installed library?`
(xóa selection/history/task locks, nên `/new`). Từ chối giữ nguyên root; cài đặt vẫn
đã tồn tại. Sau đó `/skills use <id>` chọn metadata; `load_skill({skill, topic?})`
chỉ load exact selected IDs/topics và kiểm hash. Không auto-select hoặc auto-load.
Lỗi publication/durability/cleanup cần kiểm target/registry trước retry, không retry tự động.
Trong fetch chờ deadline tối đa 30s; cancellation ở các review/model/dispose được
kiểm trước bước tiếp theo. Không có nút ngắt giữa atomic writer commit.

## Deterministic Docker PTY

Harness giữ toàn bộ regression cũ, thêm production install model-input/cancel và
fixture commands `/arms-test-install-{cancel,high,failure,local,global}`. Commands
gọi cùng `runSkillInstallUI`/production pipeline, chỉ inject HTTP/DNS và model output
authored, không thay audit/validator/writer. Phím thật duyệt send/audit/write/switch
modal trong Docker; local/global sau đó dùng `/skills use pty-workflow` và fixture
load core/topic qua runtime hash-checked. Đây là synthetic decompiler và explicit
topic load, không phải model autonomous routing hoặc live GitHub/provider evidence.
Không đọc library thật; dùng root runner `verify --synthetic` với manifest trong report.

## Phạm vi hiện có

`pairedUsageReport(records, comparisons)` trong `src/sprint45.ts` nhận
`UsageStore.read(policy).records`; không đọc library, không gọi provider, không
ghi host filesystem. Đây là API reporting, chưa có CLI collector; install UI là pipeline riêng.

Mỗi comparison khai báo `project`, `task`, `baseline`, `progressive` (session IDs),
`provenance: "real" | "synthetic"`, `success`, `evidence` và `controls`.
Evidence/controls là attestation của operator, không phải xác minh tự động.

## Thu thập có thể tái lập

1. Xin phép riêng trước khi gọi provider trả phí. Chốt corpus ít nhất 50 task
   khác nhau, rubric thành công và reviewer trước khi đo; không chỉ giữ task tốt.
2. Giữ cùng prompt, provider/model/version, tool permissions, skill revision,
   output rubric và cache warm/cold policy. Luân phiên thứ tự hai nhánh để giảm
   bias. Ghi controls, timestamp và commit/skill hash trong study manifest riêng.
3. Mỗi task có hai session riêng: nguyên khối và progressive. Session chỉ chứa
   đúng task đó; cùng project và đúng một provider/model identity trên cả hai session.
   Mixed-model sessions bị từ chối kể cả cùng tập model nhưng phân bổ khác nhau.
   Chờ mọi message completed rồi lấy
   records từ UsageStore. Không tái dùng session hoặc task giữa các comparison.
4. Reviewer ghi success cho cả hai nhánh và evidence trỏ tới artifact kiểm tra.
   Ghi cả lỗi và regression, không giả lập success từ telemetry completed.
5. Gọi API với records và manifest. Lưu report JSON cùng manifest, phiên bản code
   và hash export nguồn; bảo vệ nội dung nhạy cảm của artifacts.

Report deduplicate revision bằng `latestUsage`, báo `freshInput`, `cacheRead`,
`costUSD` riêng; estimated/missing/partial không được tính reduction. Zero baseline
cho reduction `null`, không chia zero. Số âm là regression, không clamp.
Không cộng cache vào fresh input hoặc coi token estimate là provider billing.
`costUSD` là recorded usage, cần reconcile invoice riêng để gọi là billed dollars.
Không có aggregate dollar-savings claim hoặc suy luận nhân quả.

`accepted` chỉ là gate dữ liệu operator-attested: >=50 real successful pairs có
đủ measured fields và mỗi pair giảm freshInput >=60%. Không phải Phase 4 acceptance,
không xác thực provenance thật, chất lượng semantic, invoice hay Routing Index.
Giới hạn 100,000 records/1,000 comparisons; export lớn hơn cần chia study có review.

## Kiểm thử

Chạy từ root qua `node scripts/arms-test.mjs related --task sprint-45 --file tests/sprint45.test.ts`
để kiểm thử file cô lập. Không chạy lại nếu full vừa bao phủ revision đó.
Fixtures authored/synthetic chỉ kiểm tra arithmetic/gates, không là 50 task thật.
Xem [report](../../reports/sprints/report_sprint_45.md) cho kết quả và blockers.
