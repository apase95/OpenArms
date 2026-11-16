# Kiểm thử Sprint 2.1 — tooling registry độc lập

Mốc 2.1 bên dưới là lịch sử. [Sprint 2.3](Sprint_23.md) hiện tích hợp verified
tool/state; registry checkout v1 fail-closed, không có package-wide fallback.

## Phạm vi và điều kiện

TSK-201–204 có tooling riêng, không đổi loader/state v1 và không bật API
`load_verified_skill`. Cần Linux, `/proc/self/fd`, Node 22+, dependencies theo
lockfile. Platform khác bị từ chối thay vì dùng safe-path yếu hơn. Tests/CI chỉ
tạo dữ liệu tổng hợp trong thư mục tạm, không đọc library cài đặt.

## Schema và quyết định owner

Type: `src/registry-v2-types.ts`; validator: `scripts/registry-v2.mjs`.
Mọi field record đều bắt buộc trừ detection `always?: boolean` tương thích v1;
không có default permission/budget. Package gồm `core`,
`optional`, `detect` (ba mảng strings `files/extensions/dependencies`). Skill gồm
`owner`, `kind`, `path`, `contentHash`, `maxTokens`, `defaultPermission`,
`workflows`, `references`. Hai allowlist là record ID → path/hash/maxTokens.
Migration giữ detection v1; mảng detection bị bỏ trống trong v1 được biểu diễn
bằng `[]` ở v2, không thay ý nghĩa detection. V2 hợp lệ không bị ghi lại chỉ vì
format JSON khác. ID skill/child lowercase duy nhất; package có namespace riêng
(package và core skill có thể cùng tên như v1). Path relative chuẩn hóa, không trùng kể cả
casing; child phải thuộc thư mục skill; skill roots không được chồng nhau.
Hash là SHA-256 raw bytes, không normalize CRLF. Budget là safe integer dương.
CLI parse JSON strict và từ chối duplicate keys, kể cả key escape. Dùng parser
`yaml` đã pin (Sprint 2.3 chuyển thành dependency runtime) để phát hiện duplicate keys sau
JSON syntax check; tooling cần `npm ci`, không thêm dependency mới.
Permission chỉ nhận `allow|ask|deny`, owner tự quyết định.

Ví dụ [hợp lệ về schema](../registry-v2-valid.json) dùng hash placeholder, không
là proof integrity; [không hợp lệ](../registry-v2-invalid.json) có assignment
kép/path escape/hash/budget/permission sai. Decision manifest migration có đúng
tập skill ID v1, mỗi record chỉ có `defaultPermission` và `maxTokens`, ví dụ
`{"example":{"defaultPermission":"ask","maxTokens":100}}` là giá trị fixture,
không phải default cho owner thật.

## Lệnh operator (chỉ chạy khi có quyền library tương ứng)

```bash
node scripts/registry-v2-cli.mjs migrate --root <physical-root> --registry <copy-v1.json> --decisions <owner.json> --dry-run --diff
node scripts/registry-v2-cli.mjs migrate --root <physical-root> --registry <copy-v1.json> --decisions <owner.json> --write
node scripts/registry-v2-cli.mjs hash --root <physical-root> --registry <v2.json> --skill <existing-id> --check
node scripts/registry-v2-cli.mjs hash --root <physical-root> --registry <v2.json> --skill <existing-id> --write
node scripts/registry-v2-cli.mjs integrity --root <physical-root> --registry <v2.json>
```

Mặc định không ghi; `--skill` lặp để chọn nhiều ID. Migration không quét và không
đăng ký workflow/reference ngoài v1. V2 hợp lệ giữ nguyên giá trị; `--diff` xuất
metadata before/after, không xuất content. Hash xuất ID/oldHash/newHash.
Exit 0 đạt; 1 drift hoặc integrity budget/file lỗi; 2 input/schema/I/O/concurrency
lỗi. Integrity xuất kết quả ổn định ID/rule/expected/actual, không xuất content.

Estimator tooling `utf8-bytes-v1 = ceil(raw UTF-8 bytes/4)`, là heuristic không
thay tokenizer model (sai số không có bound); hard limit của mỗi entry là
`maxTokens` owner ghi rõ, áp dụng cả workflow/reference. Không triển khai TSK-210
runtime audit/router budget hoặc tự chọn threshold cho library thật.

## Transaction và recovery

Chạy trong thư mục registry riêng, không có writer ngoài tooling hoặc actor có
quyền sửa ancestors. Writer dùng lock exclusive `.lock`, snapshot registry và
revalidate bytes source trước commit, temp file + fsync + atomic rename. Descriptor
directory được pin khi ghi; đọc đi qua descriptor-relative no-follow Linux và
chỉ nhận regular file. Toàn bộ symlink (kể cả root/ancestors) bị từ chối.
Lock là cooperative, **không có portable CAS rename chống writer bỏ qua lock**;
không dùng check-then-rename làm security boundary trước actor sửa directory.
Đây là giới hạn vận hành cần review, không chứng minh hostile concurrent-write an toàn.

Migration tạo `.bak` exclusive trước ghi; backup tồn tại thì từ chối overwrite.
Không sửa source. Lỗi trước rename giữ registry cũ; lỗi fsync sau rename có thể
đã commit, phải kiểm tra metadata trước retry. Không tự xóa lock stale: xác nhận
process owner đã dừng rồi operator xử lý lock. Recovery từ backup chỉ sau khi
dừng mọi writer, kiểm tra backup và giữ bản registry lỗi để điều tra.

## Các ca và cách chạy

```bash
node scripts/arms-test.mjs related --task sprint-2.1-check --file tests/registry-v2.test.mjs
node scripts/registry-v2-ci.mjs
```

Ca happy path schema/hash/migration, mandatory owner decisions, idempotence,
CRLF byte drift, symlink reject, duplicate ownership, unsafe path/child escape,
backup atomic, unknown ID, concurrent snapshot và hash check không mutation.
Lệnh CI là gate operator riêng (không phải suite runtime): gọi production CLI
trên fixture hợp lệ, rồi chứng minh byte drift/symlink/assignment kép fail.
Workflow `.github/workflows/registry-integrity.yml` chạy gate trước runtime full
qua canonical runner. Không thay required OpenCode smoke và không chứng thực
live library. Kết quả thực tế: [báo cáo Sprint 2.1](../../reports/sprints/report_sprint_21.md).

## Correction sau independent review

Finding Medium: non-smoke fingerprint bỏ sót inputs tests đọc, nên thay bytes
không reset unchanged-failure guard/observation revision. Correction thêm **đúng**
`docs/testing/registry-v2-valid.json`, `docs/testing/registry-v2-invalid.json`,
`.github/workflows/registry-integrity.yml`; không duyệt toàn docs/workflows/library.
`tests/non-smoke-inputs.test.mjs` kiểm tra từng thay đổi một byte cùng kích thước
dưới filesystem guards không cho library I/O; giữ cases symlink rejection và
smoke/build synthetic-library invalidation. Evidence correction ở báo cáo,
không thay thế required smoke hoặc owner acceptance.

## Core tiếp theo — Sprint 2.2

[Sprint 2.2](Sprint_22.md) reuse validator/resolver/raw hash và estimator ở đây,
thêm snapshot read option, authorization/scoped grants và response audit categories.
Registry schema examples không đổi. Guide này vẫn là operator tooling 2.1;
integrity CLI hard `maxTokens` không đồng nhất với runtime reference report-only.
Runtime/plugin v1 chưa nối core mới; historical evidence 2.1 không bị rewrite.
