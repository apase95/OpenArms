# Báo cáo Sprint 1.3 — Kiểm chứng và triển khai quan sát shadow

## Trạng thái và bảng task

Ngày triển khai: 2026-10-10. Khóa package/task: shared-skills, Ponytail full,
TSK-113–116. Không đổi dependency, provider, model, mặc định active hoặc quyền.

| Task | Triển khai/bằng chứng cục bộ | Trạng thái nghiệm thu |
|---|---|---|
| TSK-113 | Assertion governor tập trung và ma trận biên tất định; tái dùng regression exit process | **COMPLETE**: tests cục bộ và validation bắt buộc đạt |
| TSK-114 | Process con thật trong repository tạm; danh sách syntax/related/full, manifest, raw log, assertion/compile/timeout/signal, sink bị chặn, đồng thời, cleanup; fixture hook SDK cục bộ | Đã triển khai fixture; còn chờ host OpenCode gọi after-hook thật |
| TSK-115 | `reviewShadow` hỗ trợ envelope/review; kiểm tra cohort/policy cố định, loại trùng, đếm rule/action/review, byte, cap, lỗi log, full runs/task | **PENDING_OBSERVATION**: chưa cung cấp cohort thật bảy ngày hoạt động |
| TSK-116 | Tài liệu hóa checklist/quy trình nghiệm thu, giới hạn và bằng chứng | **PENDING_ACCEPTANCE**: cần host, telemetry thật, ngưỡng owner duyệt và review mới đúng phạm vi |

Đợt triển khai không tìm thấy bằng chứng host gọi hook trong `docs/README.md`,
`tests/phase0-report.test.mjs` hoặc báo cáo Sprint 0.4 được tham chiếu trực tiếp.
Đường dẫn báo cáo cũ trong README lúc đó không tồn tại; báo cáo ở `reports/sprints/`.
Runtime 5/5 và TUI 4/4 không chứng minh model thực thi tool. Điều này không chặn
công việc cục bộ; fixture SDK cục bộ không phải bằng chứng host.

## Phạm vi kiểm thử và giới hạn

`tests/sprint13.test.ts` có năm bài kiểm thử tập trung:

1. ANSI CSI/OSC BEL/ST, CRLF/CR, điều khiển rỗng/giống binary, escape marker dành
   riêng, head/tail đa byte, metadata byte/đoạn dòng lược bỏ chính xác, output
   tất định và đúng ranh giới soft limit.
2. Bốn ký hiệu × tám độ dài × hai kết quả sink (64 ca): lưu raw input trước compact
   tùy chỉnh, chờ đúng thứ tự lưu, lỗi parser, đếm byte metadata, log reference
   Unicode dài, cap tuyệt đối 50,000 byte kể cả cảnh báo.
3. Process con thật/repository tạm: script syntax và bộ dựng tham số production,
   chọn related theo manifest khác danh sách full fixture, summary pass một dòng,
   tên lỗi assertion/compile, timeout/signal thật, exit 0/1/7/124/143, lỗi log rõ
   ràng, dọn/xóa active marker và listener.
4. After-hook SDK cục bộ đồng thời: lưu đúng input, log chỉ owner, giữ metadata
   nguyên trạng exit 0/7, shadow would-deny không chặn read, không tự thêm messageID
   thiếu, thư mục bị chặn không làm tool fail hoặc quảng cáo full log.
5. Hỗ trợ review: loại fixture/trùng, đếm ngày hoạt động không phải khoảng lịch,
   đếm false positive/user action theo rule, full/task, lỗi sink, từ chối policy
   trộn và ngày sai.

Danh sách full fixture được cấp cho bộ dựng tham số related production bằng
`allTests(fixtureDirectory)`; chạy mọi test fixture, không chạy suite workspace.
Đây không phải bản sao orchestration full runner/tích hợp host. Các tests hiện có
`tests/test-runner.test.mjs`, `tests/test-process.test.mjs`, `tests/sprint11.test.mjs`
giữ coverage kế hoạch CLI, dựng full command, thứ tự log, chuyển signal và cleanup
process cháu. Không mock hành vi production. Node tests lồng chỉ xóa biến nội bộ
`NODE_TEST_CONTEXT`, không thay logic production.

SDK nhận text host gộp, không stdout/stderr riêng hoặc exit status chắc chắn.
Assertion exit áp dụng cho kết quả process con thật và bảo toàn metadata nguyên
trạng; không suy diễn exit thiếu. Fixture read quan sát output dạng host, không
phải thực thi quyền filesystem hoặc kích thước toàn file.

## RED/GREEN và lệnh

Mọi lệnh chạy từ root. Đã kiểm tra `commandFor`: file test tường minh ở related
chỉ truyền filename đó cho Node. Không dùng lệnh suite-wide khi phát triển cô lập.

| Lệnh | Kết quả | Thời lượng | Log dưới `.openarms/logs/` |
|---|---|---:|---|
| `node scripts/arms-test.mjs related --file tests/sprint13.test.ts --task sprint-1.3-red` | RED: thiếu export `reviewShadow` | 399 ms | related-63512111b2672f0378fc92ef-f9b0a443-5dc7-435d-ad1c-9121259a7f53.log |
| Cùng phạm vi cô lập, `--task sprint-1.3-green` | Ban đầu 4/5: kế thừa context IPC nội bộ Node test; sau đó 4/5: input syntax bị lọc vì tên chỉ có trong fixture không tồn tại ở root runner | 1059 / 1663 ms | related-63512111b2672f0378fc92ef-019fddd4-85ec-4433-9080-e40808dc0afc.log / related-63512111b2672f0378fc92ef-cd43d7bc-92e2-47f0-a41b-34d5bf6d6fb4.log |
| Cùng phạm vi sau sửa fixture | GREEN 5/5 | 1698 ms | related-63512111b2672f0378fc92ef-8e6877df-975e-49c8-9535-33ab2b325e4a.log |

Đã chẩn đoán lỗi trước sửa fixture/retry; không retry đầu vào không đổi hay force
override. Các lỗi ban đầu không phải kết quả validation thành công cuối.

### Validation bắt buộc cuối

Một `node scripts/arms-test.mjs verify --plan --task sprint-1.3` review đủ 12
đường dẫn dưới bằng `--file` lặp. Không needs-review hoặc thiếu capability.
AGENTS yêu cầu full do telemetry dùng chung và test-map thay đổi. Kế hoạch:
syntax + full; full bao phủ related; mọi smoke `NOT_AFFECTED`. Sau T0 đạt mà
input không đổi, hoàn tất bằng mode `full` còn lại theo AGENTS, không lặp syntax
qua verify. Full chạy một lần trên code cuối.

| Lệnh | Kết quả cuối | Thời lượng | Log dưới `.openarms/logs/` |
|---|---|---:|---|
| `node scripts/arms-test.mjs syntax --task sprint-1.3` + đủ phạm vi | 3/3 đạt | 444 ms | syntax-63512111b2672f0378fc92ef-e75109cf-eb68-4bf9-ab5e-b6785ec38d13.log |
| `node scripts/arms-test.mjs full --task sprint-1.3` + cùng phạm vi | 104/104 đạt | 13,215 ms | full-63512111b2672f0378fc92ef-732f88ca-825b-40a3-982e-3fa62c876dd3.log |
| `npm run test:policy` | 0 phát hiện | Không báo thời lượng | Output terminal |

Phạm vi/đường dẫn thay đổi chính xác (mỗi path cấp bằng `--file <path>`):

```text
src/governance-telemetry.ts
scripts/test-map.json
tests/sprint13.test.ts
docs/reports/sprints/report_sprint_13.md
docs/reports/sprints/report_sprint_12.md
docs/testing/how_to_test/Sprint_13.md
docs/reports/phase1-ponytail-review.md
docs/testing/how_to_test_overview.md
docs/README.md
docs/testing/testing.md
docs/roadmap/Tasklist_Phase_1.md
.opencode/handoff.md
```

Bỏ qua: chạy lại test cô lập không đổi sau GREEN, related/full trùng, runtime/static/
TUI smoke không bị ảnh hưởng. Chưa xác lập tích hợp host/provider; không tạo giả
quan sát bảy ngày thật. Chỉ cập nhật tài liệu bằng chứng/trạng thái sau kiểm tra;
không test lại code không đổi. Syntax xác minh parse/import, không type TypeScript
ngữ nghĩa. Không typecheck riêng, network/e2e, tìm skill, commit/push hay sửa config toàn cục.

## Bằng chứng thật, riêng tư và rollout

Cỡ mẫu cohort shadow thật: **chưa cung cấp**, không phải lưu lượng đo bằng không.
Cỡ mẫu baseline và mức tiết kiệm trước/sau tương đương: **còn chờ**. Bảy ngày
hoạt động, tỷ lệ false positive, hành động người dùng và review incident data loss:
**còn chờ**. Ngày fixture chỉ là dữ liệu test; không khẳng định hiệu quả rollout.

Dùng đúng [quy trình Sprint 1.3](../../testing/how_to_test/Sprint_13.md).
Ghi SHA256 của `src/tool-policy.ts` và source governor/hook, runner policy v3,
telemetry v1, phiên bản tool/host, cohort/ca sử dụng cố định trước khi bắt đầu.
Telemetry thiếu timestamp/task/user action: người quan sát phải ghi riêng trong
envelope review, không đoán từ mtime. Export mỗi ngày trước retention best-effort
bảy ngày/200 file/256 MiB làm mất bằng chứng.

Raw log có thể chứa secret. Giữ owner-only, cục bộ, ngoài conversation; không
upload như telemetry. Hash hỗ trợ correlation, không ẩn danh hóa. Envelope review
không chứa nội dung, raw path, command hoặc environment. Helper chỉ tổng hợp và
tin nhãn người quan sát; không chứng thực execution thật, suy diễn false positive
hay tự duyệt active. Không đếm lỗi ghi telemetry từ record vắng mặt: thu quan sát
incident sink/host độc lập, kể cả tool thành công nhưng thiếu telemetry.

## Trở ngại nghiệm thu / rủi ro review

- TSK-114 — host: quan sát read/bash do model OpenCode thật gọi, có log/telemetry
  after-hook, title/metadata không đổi, kể cả shadow read; giữ correlation call
  và phiên bản tool không chứa secret.
- TSK-115 — thời gian: ít nhất bảy ngày hoạt động khác nhau thật, cohort/policy
  cố định, baseline tương đương, cỡ mẫu rõ; review mọi would-action với ca sử dụng
  và phản hồi người dùng. Chỉ khoảng lịch không đủ.
- TSK-116 — owner/review: ngưỡng false positive theo rule đã duyệt, không lỗi
  nghiêm trọng/data loss, host enforcement/override đã xác nhận trước active.
  Không deny lockfile theo loại; không thêm permission engine.
- Review độc lập đúng phạm vi phát hiện lỗi inclusion full-run mức medium (sửa
  bên dưới). Tại mốc báo cáo này còn chờ review mới; không tuyên bố nghiệm thu.
- Buffer runtime có trước hook; retention best effort. Công cụ review gọi thủ
  công, không phải collector dài hạn tự động. Giữ bằng chứng gốc và xử lý review
  trùng/mâu thuẫn trước phân tích.

## Sửa theo review độc lập — sprint-1.3-review-fix

Phát hiện: chỉ khớp tên task đã tính cả full record lịch sử/ngoài cohort.
Schema runner v1 (`test-observation.mjs`, `arms-test.mjs`) có `startedAt`, không
policy/cohort. Export riêng phải ghép policy/cohort từ sổ người quan sát.
`reviewShadow` kiểm tra nhãn/UTC chuẩn, chỉ tính policy/cohort khớp và cặp task/
ngày hoạt động đã quan sát. Loại ngày lịch sử/không hoạt động, giữ run đã thực
thi nhưng fail, bỏ invocation blocked. Chỉ số hẹp này không là mọi run trong
khoảng lịch. Nhãn thủ công chưa được chứng thực; không gán toàn lịch sử hàng loạt.

Regression cô lập RED: 4/5, mong đợi 1 nhưng đếm 5 (1672 ms), log
`.openarms/logs/related-63512111b2672f0378fc92ef-3847aa52-271b-41cc-aca6-ec6929f2be8e.log`.
Quy tắc quyền log của host từ chối đọc full log; assertion trên terminal xác
định nguyên nhân gốc, không chạy lại lỗi với input không đổi.
GREEN: 5/5 (1717 ms), log
`.openarms/logs/related-63512111b2672f0378fc92ef-6d0ae660-bb46-4762-a896-2c6b4c8b49ca.log`.
Revision cuối thêm assertion timestamp ngày lịch sai. Một plan phạm vi sửa yêu
cầu syntax/full (core dùng chung); không smoke bị ảnh hưởng. Kết quả validation
cuối ở dưới; điều kiện host/bảy ngày/owner vẫn còn chờ.

Phạm vi sửa cuối (mỗi path truyền qua `--file` lặp):
`src/governance-telemetry.ts`, `tests/sprint13.test.ts`,
`docs/reports/sprints/report_sprint_13.md`, `docs/testing/how_to_test/Sprint_13.md`,
`docs/reports/phase1-ponytail-review.md`, `.opencode/handoff.md`.
Lệnh: `node scripts/arms-test.mjs syntax --task sprint-1.3-review-fix`
và mode hoàn tất còn lại `node scripts/arms-test.mjs full --task sprint-1.3-review-fix`,
cả hai đủ phạm vi đó. Syntax 2/2 đạt (441 ms), log
`.openarms/logs/syntax-63512111b2672f0378fc92ef-39dbd904-4ae0-4f63-96ed-9d66d903c734.log`.
Full 104/104 đạt một lần trên revision code/test cuối (12349 ms), log
`.openarms/logs/full-63512111b2672f0378fc92ef-a3103b54-ad55-47cb-8705-e20f4f6e5f00.log`.
Không related trùng trên revision cuối; không lặp syntax không đổi qua verify
theo AGENTS. Bỏ báo cáo policy vì không đổi automation. Không chạy smoke, host/
network/e2e hay typecheck ngữ nghĩa riêng. Sau kiểm tra chỉ cập nhật tài liệu
bằng chứng. Giữ công việc trước; không commit/push/đổi config.
