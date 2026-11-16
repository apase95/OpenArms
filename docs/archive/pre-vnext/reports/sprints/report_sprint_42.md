# Báo cáo Sprint 4.2 — Security scanner và staged approval

- Ngày: 2026-10-16; profile `openai/gpt-6.1-sol/general`.
- Phạm vi: TSK-405–408. Bảo toàn inherited work, 415 checked/416 unchecked.
- Runbook và manifest công khai: [Sprint 4.2](../../testing/how_to_test/Sprint_42.md).

## Triển khai

Offline deterministic scanner/report và content fingerprint; text/script/reference
audit, incomplete fail-closed. Approval bound source/package/report chỉ cho staged
review. Production `/skills audit <url>` gọi fetch/extract/scan/dialog trong temp
callback, không install/registry/loader authority. HIGH/CRITICAL không force;
MEDIUM cần explicit risk override và audit write thành công. Snippets redacted
theo pattern để tránh giữ raw credentials. Không execute/chmod bất kỳ asset nào.

## Evidence trước continuation (được thay thế bởi kết quả bên dưới)

- RED isolated scanner: 0/1, expected `continue` thay vì `block`, 213 ms.
- GREEN focused scanner/gate/staged offline: 9/9, 218 ms ở revision trước lần
  nối thêm PTY fixture và refinement snippets. Không coi đây là final verification.
- Corpus authored: 18 malicious, 52 benign; assertion TP 18/18 (100%), decision
  FP 0/52 (0%); informational literal attack discussion vẫn có LOW rule hits.
  Không phải corpus skill thật hoặc bảo đảm an ninh tổng quát.
- Final T0: **10/10**, 543 ms. Command `node scripts/arms-test.mjs syntax
  --task sprint-42` với repeated `--file` theo manifest runbook (thêm local handoff).
  Log `.openarms/logs/syntax-63512111b2672f0378fc92ef-104e37d6-fb68-4fe1-95f0-7e849dce0cc8.log`.
- Final T2: **267/267**, 20,391 ms. Cùng scope, mode `full`; bắt buộc vì shared
  test-policy/synthetic infrastructure. Không chạy lại related cùng revision.
  Log `.openarms/logs/full-63512111b2672f0378fc92ef-7703dc8b-87c3-4fbc-a288-1a936931d45f.log`.
- Static smoke: runner tái sử dụng previous pass fingerprint `41097c3ebfe3`,
  không execute lại. `npm run test:policy`: 0 bypass findings.
- Scoped `git diff --check`: còn hai inherited trailing spaces tại 415/416,
  giữ nguyên theo yêu cầu; không claim clean toàn inherited diff.
- Docker server 29.8.2 có sẵn; exact synthetic image
  `openarms-sandbox:synthetic-1b607dc819a16504b3047b2df93ffe51405edf1d07b2d28a23e992c9f204a32b`
  không tồn tại (read-only `buildFingerprint({synthetic:true})` + `imageMatches`).
  Không chạy build vì path hiện tại có thể resolve network, trái session restriction.
  Runtime/PTY vẫn **blocked/unverified**, không có live modal acceptance claim.
- RED chẩn đoán từ bounded assertion summary; không đọc raw logs theo instruction
  scoped implementer. Không retry failure trên input không đổi.

## Fresh continuation — nghiệm thu scoped

- Risk override record có `phase=risk-choice-intent` và
  `outcome=pending-final-validation`; không phải review hoàn tất, installation
  hoặc reusable authorization. Revalidate ngay trước record và sau await;
  mutation trong sink để lại một intent event nhưng kết quả denied.
- RED `node scripts/arms-test.mjs related --task sprint-42 --file tests/sprint42.test.ts`:
  3/5, 145 ms, thiếu phase semantics như dự kiến. Không retry input không đổi.
- GREEN qua `node scripts/arms-test.mjs verify --synthetic --task sprint-42`
  với toàn bộ manifest và handoff (22 paths), theo plan đã review:
  syntax 10/10, 467 ms; full 267/267, 15,852 ms (code/test revision mới).
- Build trusted dependencies qua runner: 1/1, 15,680 ms.
- Runtime **5/5**, 29,330 ms, log
  `.openarms/logs/smoke-runtime-63512111b2672f0378fc92ef-e4fee6b0-4542-4369-a9c0-3fa76621d2af.log`.
- PTY **1/1**, 128,792 ms, log
  `.openarms/logs/tui-smoke-63512111b2672f0378fc92ef-69293d20-a8c9-455d-8c73-c7d535ba0e3a.log`.
  Real host production modal: MEDIUM default/Esc denied, explicit override ghi
  event và staged-only; HIGH/CRITICAL không force. Không install; các regression
  picker, usage/budget, roots và real-host domain vẫn được thực thi.
- Static dùng cached pass `41097c3ebfe3`; không rerun unchanged passing suite.
  Blocker network/build cũ đã được supersede, không còn runtime/PTY blocker.

## Final security hardening — severity laundering

- Đã bỏ demotion theo safetyword bất kỳ. LOW chỉ cho controlled grammar whole-line,
  riêng từng rule, trong md/markdown/txt ngoài scripts/bin. Network/path không có
  exemption. CRLF/CR giữ line boundary; HIGH/CRITICAL vẫn hardblock, không Force.
- RED isolated scanner `related --file tests/skill-security-audit.test.ts`:
  4/5, 142 ms, `rm -rf / # never` sai thành continue. Đọc full named failure log
  trước sửa. Không retry input không đổi.
- Regression mới: 8 variants × 3 vị trí (24), executable-prose edge, ba line endings;
  staged transport mock + real extractor/scanner/gate denied cả laundered destruction
  và override, không ghi risk override. Corpus riêng vẫn TP18/18, FP0/52, bốn
  informational-hit packages; không inflate denominator bằng regression variants.
- Final `verify --synthetic --task sprint-42` với complete22path manifest đã review:
  syntax **10/10, 494 ms**, full **269/269, 16,737 ms**; full bắt buộc theo shared
  test infrastructure và yêu cầu final revision. Không focused GREEN trùng full.
  Log syntax `.openarms/logs/syntax-63512111b2672f0378fc92ef-58980be7-3418-4bdb-94f2-2b9e54fbfbfe.log`;
  full `.openarms/logs/full-63512111b2672f0378fc92ef-065cfdfd-a954-43d9-9765-c91447713fa5.log`.
- Trusted synthetic build **1/1, 13,738 ms**; runtime **5/5, 30,062 ms**;
  PTY **1/1, 141,590 ms** (production five audit cases + existing regressions).
  Logs `.openarms/logs/smoke-runtime-63512111b2672f0378fc92ef-05cf2796-4e62-4832-87a7-55a2304a3086.log`
  và `.openarms/logs/tui-smoke-63512111b2672f0378fc92ef-1e68025d-be96-45f7-9b18-8923977b6a2a.log`.
- Static cached `41097c3ebfe3`; policy bypass report 0 findings. Scoped diff-check
  chỉ báo inherited hard-break whitespace tại 415/416; giữ nguyên trạng thái user.
  Không còn blocker. Docs/evidence-only edits sau checks không đổi code/test inputs.

## Giới hạn

Heuristic window 5 dòng không bắt mọi obfuscation hoặc semantic attack. Prose
negation chỉ được LOW theo grammar whole-line hẹp và rule-specific trong docs/text,
không trong scripts/bin; safetyword/comment prefix/suffix không demote. Prose khác
có thể confirm/block ngoài corpus; literal executable examples vẫn bị flag. Không
decompiler, persistent writer, verified registry hoặc end-to-end install.
Không real skill/library/credential/live provider trong tests. Synthetic Docker
build dùng trusted dependencies theo authorization. TSK-407 đạt scoped staged-only
PTY; không claim hoàn tất Phase 4 hoặc end-to-end install.
