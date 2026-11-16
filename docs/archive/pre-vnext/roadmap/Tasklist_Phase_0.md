# Tasklist Phase 0: Fast Feedback & Test Cost Control

Mục tiêu phase: giảm ngay thời gian chờ và context waste do test/smoke test chạy lặp lại, tạo một đường kiểm thử duy nhất có khả năng chọn đúng phạm vi, tái sử dụng kết quả còn hiệu lực và trả output ngắn nhưng vẫn giữ đầy đủ log để chẩn đoán.

Phase này ưu tiên vấn đề vận hành hiện tại trước các thay đổi runtime lớn. Phase 0 không thay thế coverage của full test, sandbox smoke hoặc TUI smoke; nó quyết định chính xác khi nào từng tầng cần chạy và ngăn cùng một kiểm tra được chạy 3-4 lần trên cùng trạng thái code.

Quy ước tổng Sprint: 1 day = 8 giờ làm việc; estimate là tổng effort, chưa bao gồm thời gian thu thập baseline thực tế. Kết quả test chỉ được tái sử dụng khi fingerprint của toàn bộ input liên quan không đổi.

| Sprint | Mục tiêu | Tasks | Thời lượng ước tính |
|---|---|---|---:|
| Sprint 0.1 | Test policy và unified runner | TSK-001 đến TSK-006 | 6 days |
| Sprint 0.2 | Smoke-test deduplication và selective execution | TSK-007 đến TSK-013 | 7.5 days |
| Sprint 0.3 | Compact logs và failure control | TSK-014 đến TSK-018 | 5.5 days |
| Sprint 0.4 | Rollout, measurement và Phase 0 acceptance | TSK-019 đến TSK-023 | 5.5 days + 1 tuần quan sát |

## Sprint 0.1: Test Policy & Unified Runner

**Sprint Goal:** Tạo một entry point duy nhất cho mọi kiểm tra, phân tầng rõ test nào được chạy trong agent loop và chặn việc gọi smoke/full suite không cần thiết.

**Implementation status (07/10/2026):** TSK-002–006 được triển khai qua
`scripts/test-policy.json`, `scripts/arms-test.mjs`, `AGENTS.md` và
[testing guide](../testing/testing.md). TSK-001 đã có observation wrapper/report nhưng còn
**pending observation**: cần ít nhất 10 task thật hoặc một tuần hoạt động, đủ bốn
command và review duplicate candidates trên runtime inputs. Không có baseline
lịch sử bị suy diễn. Cache/deduplication xuyên invocation vẫn thuộc Sprint 0.2;
TSK-006 hiện là guidance và bypass detection report-only.

**Verification:** `verify` theo scope Sprint 0.1 pass T0 (9 files), T2 (42 tests),
build một lần, server smoke và TUI smoke mỗi mode một lần. Offline sandbox test
image pass 30 tests qua observation wrapper; đã thu một mẫu baseline thật cho
task `sprint-0.1`, chưa đủ observation cohort. Bypass report: 0 findings.

[ ]TSK-001 - Overview: Đo baseline của test loop hiện tại. Details: Ghi nhận tối thiểu 10 task hoặc một tuần hoạt động với command, thời điểm, git revision, changed files, loại kiểm tra, thời lượng, exit code, số lần chạy lại và kích thước stdout/stderr cho `npm test`, `sandbox test`, `sandbox smoke` và `tui-smoke`. Phân biệt rerun cần thiết sau code change với rerun trùng trên cùng input; không lưu source content, credential hoặc raw environment. Hoàn tất khi có bảng p50/p95 duration, tổng thời gian chờ/task, số smoke runs/task, tỷ lệ duplicate runs và ba command tốn thời gian/output lớn nhất để làm baseline so sánh. (Estimate: 1 day implementation + observation in parallel)

[x]TSK-002 - Overview: Định nghĩa test execution policy. Details: Chốt bốn tầng kiểm tra và trigger machine-readable: T0 chạy syntax/type/import checks nhanh; T1 chạy unit tests liên quan; T2 chạy toàn bộ Node tests; T3 chạy sandbox smoke hoặc TUI smoke. Agent loop mặc định chỉ được chạy T0 sau thay đổi đáng kể và T1 trước khi hoàn tất; T2 chỉ chạy khi thay đổi shared/core, test infrastructure hoặc user yêu cầu; T3 chỉ chạy khi file thuộc plugin/config/sandbox/runtime integration bị ảnh hưởng. Policy phải nêu rõ docs-only, registry-only, server-only, TUI-only và sandbox-infrastructure changes; unknown classification phải trả `needs-review`, không âm thầm chạy mọi tầng. Hoàn tất khi mỗi file hiện có ánh xạ tới một test decision giải thích được. (Estimate: 1 day)

[x]TSK-003 - Overview: Xây dựng unified test runner. Details: Tạo một runner Node.js tương thích môi trường hiện tại, ví dụ `scripts/arms-test.mjs`, với các mode `syntax`, `related`, `full`, `smoke`, `tui-smoke` và `verify`; runner phải được gọi từ repository root, parse argument strict, forward signal/exit code, áp timeout theo mode và không shell-interpolate path. `verify` phải lập execution plan từ changed files rồi chạy mỗi mode tối đa một lần theo thứ tự rẻ đến đắt; không được gọi `smoke` hoặc `tui-smoke` qua nhiều nhánh độc lập. Hoàn tất khi package scripts và tài liệu chỉ tới runner, còn command thấp tầng vẫn có thể gọi tường minh để chẩn đoán. (Estimate: 1.5 days)

[x]TSK-004 - Overview: Chọn related tests theo file thay đổi. Details: Tạo versioned test map cho `src/`, `plugins/`, `sandbox/`, `registry.json`, config và tests; resolver lấy changed files từ argument tường minh trước, chỉ dùng Git diff khi không có argument, chuẩn hóa path và trả danh sách test ổn định đã deduplicate. Thay đổi test file phải chạy chính test đó; thay đổi shared state/registry/runtime chạy cả `core.test.ts` và `server.test.ts`; docs-only không chạy code test; file mới hoặc không map trả lỗi cấu hình hay fallback được policy nêu rõ, không silently pass. Hoàn tất khi một thay đổi server nhỏ không mặc định chạy sandbox smoke và mọi source file có test decision. (Estimate: 1 day)

[x]TSK-005 - Overview: Thêm test-plan dry run. Details: Thêm `--plan` cho unified runner để in đúng một bảng ngắn gồm changed files đã phân loại, T0/T1/T2/T3 sẽ chạy hoặc skip, reason code, dependency và cache eligibility mà không thực thi test hay khởi động Docker. Plan phải deterministic trên cùng input và đánh dấu rõ `required`, `recommended`, `skipped`, `blocked`; user có thể override bằng mode tường minh nhưng override phải xuất hiện trong result metadata. Hoàn tất khi agent có thể kiểm tra kế hoạch trước và không cần đoán liệu smoke test có bắt buộc hay không. (Estimate: 6 hours)

[x]TSK-006 - Overview: Chặn test invocation ngoài policy. Details: Cập nhật repository guidance để agent dùng unified runner thay vì gọi lặp trực tiếp `npm test`, `docker compose`, `sandbox smoke` hoặc `tui-smoke`; thêm detection/report-only check phát hiện command bypass trong automation mới nhưng không phá workflow thủ công hiện có. Không cài Git hook hoặc sửa global config tự động; pre-push/CI integration phải opt-in và được mô tả. Hoàn tất khi một task thông thường có một test plan, tối đa một T1 run cho mỗi code revision và không có smoke run nếu classifier không yêu cầu. (Estimate: 6 hours)

## Sprint 0.2: Selective & Deduplicated Smoke Testing

**Sprint Goal:** Chỉ chạy đúng loại smoke test khi integration surface thay đổi và tái sử dụng kết quả hợp lệ thay vì khởi động lại Docker/OpenCode nhiều lần.

**Implementation status (07/10/2026):** TSK-007–013 hoàn tất. Assertion inventory
và cache/build contract ở [smoke-contract.md](../testing/smoke-contract.md). Policy version 2
thêm static prerequisite, runtime/TUI scopes riêng; smoke pass stamps atomic,
per-fingerprint lock và content-addressed image có fingerprint/library-mode labels.
Runner-managed smoke dùng project/volumes tạm để loại bỏ mutable-volume ambiguity.

**Verification:** T0 pass 14 files; full suite pass 58/58 tests (bao gồm invalidation,
TUI/runtime separation, installed-library fixture, forced failure, concurrent
processes và static fail-fast). Static/server/TUI smoke thật đều pass; các lần gọi
lại trả cache hit không start/build. Forced server rerun pass và reuse matching
image. Không còn temporary smoke containers/volumes; bypass report 0 findings.

[x]TSK-007 - Overview: Phân rã sandbox smoke contract. Details: Tách rõ các assertion hiện có thành nhóm static/offline và runtime: version/config JSON, path/template validation và plugin URL có thể kiểm tra không khởi động OpenCode; server startup, health endpoint và tool registration thuộc runtime smoke; picker/render/keyboard/hover thuộc TUI smoke. Mỗi assertion chỉ có một owner test, không lặp giữa unit, server smoke và TUI smoke nếu không bảo vệ boundary khác. Hoàn tất khi có inventory assertion, chi phí tương đối và lý do tầng kiểm tra cho từng mục trong `sandbox/smoke.mjs` cùng `tui-smoke.py`. (Estimate: 1 day)

[x]TSK-008 - Overview: Tách fast smoke khỏi runtime smoke. Details: Tạo `smoke-static` chạy trực tiếp bằng Node cho config, expected paths, compose/template references và tool contract có thể xác minh offline; giữ `smoke-runtime` cho các assertion bắt buộc khởi động OpenCode server. Unified runner phải chạy static trước và dừng sớm nếu lỗi cấu hình, tránh trả chi phí container startup cho lỗi phát hiện được offline. Hoàn tất khi server smoke chứa duy nhất assertion cần process OpenCode thật và static smoke chạy trong vài giây trên host/CI được hỗ trợ. (Estimate: 1 day)

[x]TSK-009 - Overview: Tạo smoke dependency classifier. Details: Ánh xạ changed files tới smoke scope: thay đổi `src/` core thuần chỉ cần unit/full tests trừ runtime composition; server adapter, package loader contract, `opencode.json`, compose, Dockerfile hoặc smoke script yêu cầu runtime smoke; TUI adapter/config yêu cầu static plus TUI smoke; docs và unrelated skill content không yêu cầu smoke. Classifier phải dùng allowlist path/pattern versioned, fail `needs-review` cho file integration mới và có unit tests cho mọi rule. Hoàn tất khi reason code giải thích chính xác vì sao từng smoke mode chạy hoặc skip. (Estimate: 1 day)

[x]TSK-010 - Overview: Fingerprint smoke-test inputs. Details: Tính SHA-256 fingerprint từ bytes của tất cả file ảnh hưởng tới từng smoke mode, mode name, relevant environment values đã allowlist, Node/OpenCode/plugin SDK versions, installed/repository library mode và runner version; không dùng timestamp, absolute workspace path, Git branch hoặc secret. Fingerprint static, runtime và TUI phải độc lập để thay đổi TUI không invalidate server smoke nếu dependency graph không yêu cầu. Hoàn tất khi cùng input tạo cùng fingerprint và thay một dependency bắt buộc làm fingerprint đổi. (Estimate: 1 day)

[x]TSK-011 - Overview: Tái sử dụng smoke result còn hiệu lực. Details: Lưu result stamp theo fingerprint gồm mode, started/completed time, duration, exit code, log path và tool versions; chỉ cache kết quả pass, ghi atomic và không tái sử dụng result đang chạy, fail, timeout hoặc bị signal. Trước smoke run, runner kiểm tra stamp và trả một dòng `SKIP: unchanged inputs, previous pass <fingerprint>`; `--force` cho phép chạy lại tường minh và được ghi metadata. Hoàn tất khi 3-4 lời gọi smoke liên tiếp trên cùng code chỉ khởi động runtime đúng một lần, còn thay file dependency làm smoke chạy lại. (Estimate: 1.5 days)

[x]TSK-012 - Overview: Tái sử dụng sandbox build an toàn. Details: Trước `docker compose build`, tính build fingerprint từ Dockerfile, compose files, package manifests/lockfile, source copied vào image và build args; inspect image label để skip build khi fingerprint khớp thay vì rebuild theo thói quen. Không reuse image giữa repository và installed mode nếu mount/config khác làm thay đổi behavior; `--rebuild` luôn khả dụng. Hoàn tất khi source/config không đổi không tạo build mới, còn thay file nằm trong Docker build context bắt buộc invalidate image. (Estimate: 1 day)

[x]TSK-013 - Overview: Gate TUI smoke theo phạm vi thay đổi. Details: Chỉ yêu cầu `tui-smoke` khi thay đổi `skill-router-tui.tsx`, TUI facade/service contract, `tui.json`, picker interaction, terminal harness hoặc dependency ảnh hưởng render/input; server/core-only change mặc định skip TUI smoke. Preserve manual `--force tui-smoke` và installed-mode test; nếu host thiếu Python/PTY support, trả `blocked` với command khắc phục thay vì fallback sang smoke khác. Hoàn tất khi TUI smoke không còn chạy lặp trong task server-only và vẫn bắt buộc cho thay đổi interaction. (Estimate: 1 day)

## Sprint 0.3: Compact Logs & Failure Control

**Sprint Goal:** Giữ output test trong context ở mức tối thiểu, bảo toàn full log và ngăn retry cùng lỗi khi không có thay đổi liên quan.

**Implementation status (07/10/2026):** TSK-014–018 hoàn tất. Policy version 3;
`scripts/test-process.mjs`, `scripts/test-failure.mjs` và
`sandbox/process-output.mjs` dùng chung log/summary/guard. Raw logs được ghi trước
parse; output buffers và UTF-8/line parser bounded; active/current logs được bảo vệ
khỏi retention. Runtime/TUI harness có stage deadlines và cleanup nhất quán.

**Verification:** T0 11 files; full **72/72** tests; stress fixture **256 MiB**,
raw-log integrity, first/last errors, Unicode, log failure, retention, retry guard,
concurrent invocations, timeout/signal/grandchild/port cleanup đều pass. Static,
runtime và TUI smoke thật pass, build một lần và reuse image. Bypass 0; 44 local
Markdown links hợp lệ. Xem [testing guide](../testing/testing.md) và
[report ba sprint](../reports/sprints/report_sprint_01_02_03.md). TSK-001 vẫn chờ observation.

[x]TSK-014 - Overview: Chuẩn hóa test result summary. Details: Mỗi mode chỉ trả một summary ổn định: pass gồm mode, số test/check, duration và cache status trên một dòng; fail gồm mode, exit code/signal, failed test hoặc failed stage, tối đa 30 dòng chẩn đoán và full-log path. Parser không được che compile error đầu tiên, assertion name, OpenCode startup failure hoặc Docker error cuối; nếu không parse được, gắn `UNPARSEABLE_OUTPUT` và dùng bounded head/tail. Hoàn tất khi pass output không chứa reporter verbose và fail output đủ xác định bước chẩn đoán tiếp theo. (Estimate: 1 day)

[x]TSK-015 - Overview: Lưu full test và smoke logs. Details: Ghi raw stdout/stderr của mỗi run vào `.openarms/logs/` hoặc runtime state path đã thống nhất bằng filename chứa mode, short fingerprint và run ID không nhạy cảm; tạo file permission owner-only, ghi trước compact, flush trước khi trả path và có retention theo tuổi/số lượng/dung lượng. Log của concurrent run không overwrite nhau; lỗi ghi log phải trả `LOG_WRITE_FAILED` và giữ đủ bounded output trong context. Hoàn tất khi mọi output bị compact đều có log đọc được hoặc báo lỗi minh bạch. (Estimate: 1 day)

[x]TSK-016 - Overview: Giới hạn process output trong bộ nhớ. Details: Sửa smoke/test process runner để stream stdout/stderr trực tiếp tới log sink và chỉ giữ bounded ring buffer cho summary thay vì nối toàn bộ output vào string không giới hạn như runtime smoke hiện tại. Buffer phải giữ phần đầu quan trọng và phần cuối gần failure, xử lý UTF-8 boundary, interleaved streams, process signal và output một dòng rất lớn; tổng memory không tăng tuyến tính theo log. Hoàn tất khi fixture phát hàng trăm MB output vẫn giữ memory trong ngưỡng test và summary đúng. (Estimate: 1.5 days)

[x]TSK-017 - Overview: Ngăn retry cùng lỗi không thay đổi. Details: Tạo failure signature từ mode, normalized command, exit code/signal, failed test/stage và normalized error lines; nếu cùng fingerprint và failure signature đã xảy ra hai lần mà không có relevant file change, runner từ chối lần ba và trả hướng dẫn phân tích log hoặc dùng `--force` có lý do. Lỗi khác hoặc code/test input thay đổi phải được chạy lại bình thường; không dùng chỉ số lần fail đơn thuần. Hoàn tất khi agent không thể lặp smoke 3-4 lần với cùng lỗi mà không tạo thông tin mới. (Estimate: 1 day)

[x]TSK-018 - Overview: Thêm timeout và cleanup nhất quán. Details: Định nghĩa timeout riêng cho unit, server startup, endpoint request và TUI interaction; khi timeout hoặc signal, runner phải gửi graceful termination, chờ grace period, force kill nếu cần, xóa container tạm, release port và giữ log. Timeout message phải nêu stage bị treo thay vì chỉ `exit 1`; cleanup failure không được che lỗi gốc nhưng phải xuất hiện trong summary. Hoàn tất khi fixture hung process không để container/process/port orphan và lần chạy tiếp theo hoạt động. (Estimate: 1 day)

## Sprint 0.4: Rollout, Measurement & Acceptance

**Sprint Goal:** Bảo vệ runner bằng automated tests, tích hợp workflow kiểm soát được và chứng minh smoke runs cùng thời gian chờ đã giảm mà không mất coverage.

**Implementation status (07/10/2026):** TSK-019–022 hoàn tất phần triển khai và
verification. TSK-023 có report/mẫu review nhưng **PENDING_OBSERVATION** cùng
TSK-001; chưa đủ baseline/rollout để công nhận giảm smoke >=50%.
Full **75/75** tests, static **8** checks, runtime **5** checks và TUI **4** checks
pass; build một lần, TUI reuse image; không còn container/volume smoke tạm.
Bypass report 0 findings. Xem [Sprint_04](../testing/how_to_test/Sprint_04.md)
và [report](../reports/sprints/report_sprint_04.md).

[x]TSK-019 - Overview: Kiểm thử unified runner. Details: Viết unit/property tests cho argument parsing, changed-file classification, test map, smoke triggers, fingerprint determinism, stamp invalidation, duplicate suppression, summary formatting, failure signature, timeout và retention. Dùng fake clock/temp directory/fake process thay Docker cho unit tests; bao phủ concurrent invocation để chứng minh chỉ một process sở hữu cùng fingerprint còn process khác chờ hoặc reuse result. Hoàn tất khi mọi policy branch và reason code có positive/negative test. (Estimate: 1.5 days)

[x]TSK-020 - Overview: Kiểm thử smoke orchestration end-to-end. Details: Tạo integration fixture hoặc chế độ test double để kiểm chứng plan -> static smoke -> optional build -> runtime/TUI smoke -> result stamp -> cached skip; chạy ít nhất một smoke thật để xác nhận tool registration và cleanup boundary. Test phải chứng minh lần hai trên cùng input không khởi động OpenCode, `--force` chạy lại, thay server dependency invalidate runtime stamp và thay docs không invalidate smoke. (Estimate: 1.5 days)

[x]TSK-021 - Overview: Tích hợp full verification ngoài agent loop. Details: Thêm command opt-in cho pre-push hoặc CI chạy `full` và các smoke mode do classifier yêu cầu; không tự cài hook, không chạy full suite ở pre-commit và không chạy TUI smoke trên môi trường thiếu capability. Workflow phải reuse unified runner/result format, nhưng CI không tin local pass stamp nếu artifact/provenance không được xác minh. Hoàn tất khi local agent loop nhanh vẫn được bảo vệ bởi full validation trước push/merge. (Estimate: 6 hours)

[x]TSK-022 - Overview: Cập nhật hướng dẫn kiểm thử. Details: Cập nhật README, sandbox guide và developer instructions với một decision table: command nào dùng sau edit, cuối task, trước push, khi đổi server/TUI/sandbox và khi cần `--force`; giải thích cache fingerprint, log location, retention, bypass policy, failure retry rule và cách xem plan. Xóa hướng dẫn khiến người dùng chạy tuần tự `sandbox test`, `smoke` và `tui-smoke` cho mọi thay đổi; vẫn giữ command thấp tầng cho troubleshooting. Hoàn tất khi một maintainer mới có thể chọn đúng một command mà không đoán. (Estimate: 6 hours)

[ ]TSK-023 - Overview: Nghiệm thu Phase 0. Details: Chạy rollout ít nhất một tuần hoặc đủ 10 task đại diện, so với baseline về test duration/task, smoke starts/task, duplicate smoke rate, context output bytes, failure-diagnosis success và regression escaped. Acceptance yêu cầu cùng revision không chạy cùng smoke quá một lần nếu không `--force`, server-only task không chạy TUI smoke, docs-only task không chạy code test, pass output một dòng, fail output bounded có full log và full/pre-push validation vẫn bắt regression fixture. Phase 0 chỉ hoàn tất khi smoke runs/task giảm ít nhất 50% mà không bỏ qua required integration boundary; nếu chưa đạt, báo rule gây rerun thay vì nới cache thiếu an toàn. (Estimate: 1 day + 1 week observation)
