# Hướng dẫn kiểm thử Sprint 1.3

Phạm vi: TSK-113–116. Fixture cục bộ không thay bằng chứng host thật hoặc bảy ngày hoạt động thật.
[Tổng quan](../how_to_test_overview.md) · [Ca sandbox và giới hạn bằng chứng](Sandbox.md) · [Báo cáo](../../reports/sprints/report_sprint_13.md).

## Kiểm tra cục bộ

[Sprint 2.1](Sprint_21.md) bổ sung tooling fixture/CI, không đáp ứng host thật,
bảy ngày hoạt động hay owner nghiệm thu của Sprint 1.3.

Chạy từ root repository, Node 22+ và dependencies đã cài:

```sh
node scripts/arms-test.mjs related --file tests/sprint13.test.ts --task sprint-1.3-local
```

Mong đợi: 5/5 đạt, một dòng tóm tắt và đường dẫn log đầy đủ. Tests dùng repository
tạm, process cục bộ thật, không provider/mạng và dọn fixture sau chạy.
Chúng cố ý gây lỗi nghiêm trọng; kết quả assertion bao ngoài mới là kết quả test.
Ma trận giới hạn có 64 tổ hợp parser/sink. Danh sách full của fixture khác danh
sách chọn lọc theo manifest và không chạy suite thật của workspace.

Khi đổi code, review một `verify --plan` với toàn bộ đường dẫn task. AGENTS yêu
cầu full cho thay đổi telemetry/test-map dùng chung; không chạy lại related và
full trên đầu vào không đổi. Không thêm TUI smoke không liên quan. Log trong báo
cáo là log cục bộ chịu thời hạn lưu, không phải artifact vĩnh viễn.

## Điều kiện host thật (còn chờ)

Dùng host OpenCode đã cấu hình; không đổi model/provider. Quan sát bash/read do
model thực sự gọi, ghi correlation session/call, phiên bản host/plugin, title/metadata
trước/sau, số byte output và log cục bộ. Đọc fixture generated/minified: host vẫn
phải trả nội dung dù telemetry ghi shadow would-deny. Output lớn phải có log raw
text gộp đọc được hoặc `LOG_WRITE_FAILED` rõ ràng, payload cuối <=50,000 byte UTF8.
Không suy diễn stdout/stderr/exit khi host chỉ cấp text gộp. So metadata nguyên
trạng, không tự thêm trường exit. Runtime health smoke không đáp ứng điều kiện này.
Nếu không quan sát được execution thật, ghi còn chờ; chỉ fixture SDK cục bộ đã
kiểm chứng adapter, không phải thực thi quyền.

## Quy trình bảy ngày hoạt động với cohort cố định

1. Tạo thư mục bằng chứng cục bộ ngoài conversation, chỉ owner có quyền. Ghi ID
   cohort, ca sử dụng, phiên bản host/plugin và SHA256 của policy/governor/hooks.
   Ghi schema telemetry v1, runner policy v3. Cố định ngưỡng 100,000 byte/5,000
   dòng quan sát và giới hạn output 32,000/50,000 byte. Đổi policy/ngưỡng/cohort
   phải bắt đầu kỳ quan sát mới.
2. Thu số task/mẫu baseline đại diện và byte trước/sau cùng phạm vi.
   `npm run test:report` / `npm run test:acceptance` chỉ cung cấp quan sát runner,
   không chứng minh context governor hay host gọi hook.
3. Mỗi ngày hoạt động thật, export `<state directory>/governance/*.json` trước
   khi retention xóa. Ghép với task/call bằng sessionID+callID. Thêm envelope
   thủ công với `event`, UTC `day`, `task` không nhạy cảm, `policyVersion`, `cohort`,
   `evidence: "real"`, `userAction: "continued"|"needed-read"|"used-range"|"unknown"`
   và `falsePositive: true|false` tùy chọn sau review. Ghi phân loại ca sử dụng
   riêng, không nội dung/path/secret. Review thiếu vẫn là thiếu, không tự gán false.
4. Thu byte raw/context, hard cap, lỗi log, full runs/task từ runner và incident
   host/telemetry sink độc lập. Thiếu event không chứng minh sink không lỗi.
   Đếm ngày có hoạt động thật, không chỉ bảy ngày trôi qua hay ngày giả.
   Chỉ lưu raw log cục bộ bổ sung khi cần.
5. Phân tích baseline/pilot riêng bằng `reviewShadow`, rồi so sample size,
   would-deny/would-ask theo rule, mẫu số đã review, false positive, hành động
   người dùng và tiết kiệm. Giải quyết review call trùng/mâu thuẫn trước.

Ví dụ gọi với export JSON-array cục bộ thật (không phải mẫu tạo giả):

```sh
node --experimental-strip-types --input-type=module -e 'import {readFileSync} from "node:fs"; import {reviewShadow} from "./src/governance-telemetry.ts"; const read=p=>JSON.parse(readFileSync(p,"utf8")); console.log(JSON.stringify(reviewShadow(read(process.argv[1]),read(process.argv[2]),process.argv[3],process.argv[4]),null,2))' /private/observations.json /private/runner-records.json policy-hash cohort-id
```

Chuyển `.openarms/test-runs.jsonl` thành array trong export bằng chứng riêng;
chỉ đưa record runner một lần, không nhân đôi summary. Schema runner v1 ghi
`startedAt` (UTC ISO chuẩn), không có policy/cohort. Ghép từng full record đã
thực thi với sổ cohort cố định rồi thêm `policyVersion`/`cohort`; không gán toàn
bộ lịch sử thành cohort hiện tại. Record runner/full không blocked mà thiếu nhãn
hoặc timestamp sai sẽ bị từ chối. Điều kiện tính là đúng task quan sát + ngày
hoạt động UTC + policy + cohort, không phải cả khoảng lịch. Loại run lịch sử,
ngày không hoạt động và cohort/policy khác. Full đã thực thi nhưng fail vẫn tính;
invocation blocked không tính. Run vào ngày không có call quan sát của task nằm
ngoài chỉ số này theo chủ đích; báo riêng. Helper loại fixture, từ chối cohort
trộn/ngày sai và luôn trả `PENDING_ACCEPTANCE`. Nó không chứng thực nhãn, ngày,
mẫu đầy đủ hoặc nghiệm thu độc lập. Không cần tạo rollout giả.

## Điều kiện review và kích hoạt

| Điều kiện | Bằng chứng bắt buộc |
|---|---|
| An toàn fixture | pass/fail/compile/timeout/signal, exit, chẩn đoán giới hạn, raw log hoặc lỗi ghi trung thực, cap và cleanup |
| Host thật | Model gọi after-hook, nêu giới hạn text gộp, shadow read vẫn thành công |
| Quan sát | >=7 ngày hoạt động, cohort/policy cố định, sample size, baseline tương đương, review mọi would-action |
| Tin cậy | Không data loss/lỗi nghiêm trọng; review rõ lỗi raw log và telemetry sink |
| Owner duyệt | Ngưỡng false positive theo rule và quyết định ca sử dụng, host hỗ trợ enforcement và override đã thử |

Tỷ lệ false positive = false positives / would-actions đã review; trình bày theo
rule với tử số, mẫu số và số chưa review. Không chia cho mọi call để che quyết
định chưa review. Giữ mặc định active không đổi. Lockfile không bị deny theo loại;
review dependency/audit/CI trước install vẫn hợp lệ. Search/range là ưu tiên,
không phải điều kiện cấp quyền. Báo trung thực từng điều kiện còn chờ và yêu cầu
review mới đúng phạm vi bằng báo cáo, source diff và bằng chứng kiểm tra.
