# Sprint 4.2 — Quét offline và staged audit trên TUI

Phạm vi TSK-405–408, không phải cài đặt hoàn chỉnh Phase 4. Nội dung vẫn
`untrusted`. Không execute/chmod script, AI decompile, writer, registry hay load.

## Cách dùng production

Trong OpenCode, gõ `/skills audit https://github.com/owner/repository` với URL do
operator chủ động chọn. Đây là **tải mạng thật khi vận hành**, không chạy lệnh đó
trong phiên hạn chế network. Fetcher bounded của Sprint 4.1 tải vào temp private;
extract → scan → dialog đều nằm trong callback cleanup. Sau kết quả chỉ hiện
“Nothing installed”, không giữ package hoặc đường dẫn temp.

- HIGH/CRITICAL: dialog thông tin chặn, không Force; chọn bất kỳ vẫn denied.
- MEDIUM: Cancel được chọn trước; Enter mặc định/Esc/click ngoài/đóng/lỗi/timeout
  60 giây đều denied. Chỉ chọn rõ `Continue despite risk (audit only)` mới tiếp tục.
  Audit write thất bại thì denied. Event `STAGED_AUDIT_RISK_OVERRIDE` chỉ có
  fingerprint package/report/source và enum; không lưu raw text/credential.
  `phase=risk-choice-intent`, `outcome=pending-final-validation`: chỉ ghi nhận
  lựa chọn rủi ro đã thử, không chứng nhận review hoàn tất hay authorization.
  Mutation trong lúc ghi có thể để lại duy nhất intent event nhưng kết quả denied;
  event không bao giờ được dùng lại để cấp quyền.
- LOW: vẫn có cảnh báo và xác nhận tiếp tục staged review, không install authority.
- Approval chỉ tồn tại trong invocation; recompute report/fingerprint trước/sau
  lựa chọn và audit sink. Thay source/root/document/asset/report khiến approval mất hiệu lực.

Scanner quét main document và mọi text asset, không bỏ comment, quote, example hay
reference. Chuẩn hóa ANSI CSI, zero-width, NFKC/whitespace và case; line vẫn trỏ
về dòng gốc. Snippet là mô tả pattern đã redacted, **không phải nguyên văn dòng**;
file/rule/line/recommendation giúp operator tự review trong môi trường có quyền.
Giới hạn 10 MiB, 2048 files, 8192 ký tự/dòng, 128 findings. Vượt giới hạn hoặc binary/
invalid UTF8 script chặn và báo incomplete. Image opaque yêu cầu confirm và ghi rõ
không inspected, không quảng cáo safe. Policy script luôn never-execute-or-chmod.

## Kiểm thử và corpus

`tests/skill-security-audit.test.ts`: 18 authored malicious cases và 52 benign
technical examples có tên, gồm thảo luận literal attack phrases. Decision TP/FP
được tính tại ngưỡng confirm/block; LOW informational hits được tách riêng.
Kết quả fixture không chứng minh TP/FP trên mọi skill thật. Chỉ grammar prose hẹp,
whole-line, theo từng rule (phát hiện injection/không enable developer mode/không
dùng rm -rf để cleanup/không gửi API keys tới webhook) mới có LOW; chỉ áp dụng
md/markdown/txt ngoài scripts/bin. Safetyword prefix/suffix, comment, quote hoặc
thêm câu lệnh không được miễn. Prose khác có thể bị confirm/block (false positive
ngoài corpus); không blanket exemption cho security docs. CRLF/CR giữ boundary dòng.
Regression riêng: 8 laundering variants × 3 vị trí, executable-prose edge và ba
line-ending variants; không gộp chúng vào denominator corpus 18/52.
Không phân tích ngữ nghĩa toàn chương trình, arbitrary encodings,
homoglyph mọi ngôn ngữ, malware trong ảnh hoặc exfiltration cách xa window 5 dòng.

`tests/sprint42.test.ts`: gate tamper/source/stale, default/Esc/override, audit sink
failure, dialog close/dispose/timeout/error; staged download dùng offline transport
nhưng extractor/scanner/gate thật, kiểm tra cleanup và không install writer.
PTY fixture dùng **production ConfirmationDialog + createStagedAuditUI**, không
component giả, ba severity và năm lựa chọn. Harness giữ picker/domain regressions.

Focused RED/GREEN dùng runner `related --file tests/skill-security-audit.test.ts`
(hoặc thêm `--file tests/sprint42.test.ts`); filename thật sự giới hạn plan.related.
Không chạy related lại nếu full đã bao phủ cùng revision.

## Manifest verification công khai

Từ root repo, Bash:

```bash
files=(
  src/skill-security-audit.ts src/skill-audit-review.ts
  tests/skill-security-audit.test.ts tests/sprint42.test.ts tests/test-runner.test.mjs
  plugins/skill-router-tui.tsx sandbox/tui-fixture.ts sandbox/tui-smoke.py
  scripts/synthetic-context.mjs scripts/test-map.json scripts/test-policy.json
  docs/roadmap/Tasklist_Phase_4.md docs/roadmap/README.md
  docs/testing/how_to_test/Sprint_42.md docs/reports/sprints/report_sprint_42.md
  docs/reports/sprints/README.md docs/testing/testing.md
  docs/testing/how_to_test_overview.md docs/testing/README.md docs/README.md
  docs/architecture/openarms-overview.md
)
args=(); for file in "${files[@]}"; do args+=(--file "$file"); done
node scripts/arms-test.mjs verify --plan --synthetic --task sprint-42 "${args[@]}"
node scripts/arms-test.mjs verify --synthetic --task sprint-42 "${args[@]}"
npm run test:policy
```

Full bắt buộc bởi mapping/synthetic infrastructure; static/runtime/PTY theo policy.
Synthetic chỉ sinh authored content, không đọc library thật. Docker build được
phép dùng trusted base image/package dependencies qua runner; không live provider
hoặc fetch skill thật. Final hardening revision đạt syntax10/10 (494 ms), full269/269
(16,737 ms), runtime 5/5 (30,062 ms) và PTY 1/1 (141,590 ms), gồm cả năm audit
cases và picker/domain regressions, không suy ra
end-to-end installation hoặc độ an toàn của mọi nội dung từ kết quả này.
Trạng thái thực tế và blockers: [báo cáo](../../reports/sprints/report_sprint_42.md).
