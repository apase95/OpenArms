# Verification — bằng chứng trước, kết luận sau

[← Mục lục](README.md)

Trang này phục vụ contributor, reviewer và người nghiệm thu. Feature behavior nằm ở
[Skills](skills.md) / [Output](output.md); ở đây chỉ ghi cách kiểm tra, kết quả và phần còn thiếu.

<a id="evidence"></a>
## 1. Trạng thái bằng chứng

| Phạm vi | Kết quả đã ghi nhận | Giới hạn |
|---|---|---|
| Browser fixes, commit `75afd87` | Typecheck/import/doc links và **41 offline unit tests pass** | Node `24.12.0`, chưa phải phiên bản trong engines |
| Tái cấu trúc docs, sau `75afd87` | Typecheck/import/doc links, explicit anchors, `test:policy`, whitespace và **41 unit tests pass** | Node `24.12.0`; không thay live acceptance |
| Project skill switches, trước footer | Syntax, policy, whitespace và **50 offline unit tests pass** trên Node `26.13.1` | Chưa live acceptance ON/OFF |
| Dialog Back/Done, working tree | Syntax và **54 offline unit tests pass**, Node `26.13.1` | Frame adapter mocked; chưa live JSX/layout/mouse/shortcut acceptance |
| Clean install trên Node hỗ trợ | `npm ci --ignore-scripts` pass, Node `26.13.1` | Chưa kiểm chứng install scripts hoặc live host; audit warnings còn bên dưới |
| Installed runtime / live TUI / provider | **Chưa nghiệm thu** | Source push không phải deploy hoặc live acceptance |

`package.json` khai báo `^22.22.2 || ^24.15.0 || >=26.0.0`, phù hợp requirement của
`ini@7` trong SDK dev dependencies. Môi trường khảo sát ban đầu chỉ có Node `24.12.0` nên npm
cảnh báo engine; việc offline tests pass trên đó không chứng nhận supported setup.
Không tự upgrade Node/global config để che giới hạn này.

UI footer thêm dev dependencies OpenTUI `0.4.5` và Solid `1.9.12` theo peer requirement
của npm packages (không override runtime bundled của host). Dev-only transitive override
`seroval=1.8.1` xử lý advisory critical trong Solid chain, không thay Solid/SDK major.
`npm audit` sau override báo **10 findings: 2 low / 4 moderate / 4 high / 0 critical**,
gồm SDK và UI compiler dev chains. Chưa đánh giá exploitability trên live host; không dùng
`audit fix --force` để âm thầm đổi SDK/UI major versions. Các findings còn lại cần review
trước release; unit pass không phải security acceptance hay audit runtime OpenCode global.

Kết quả ghi ở bảng thuộc revision/phạm vi tương ứng, không phải chứng nhận tự động
cho mọi commit sau. Khi bàn giao mới, kèm summary theo mục 4 và không đánh dấu checklist
live chỉ vì mocks pass.

<a id="host-checks"></a>
## 2. Host checks

Từ repository root, dùng Node đáp ứng engines và `npm ci` khi dependencies đổi:

```bash
node scripts/arms-test.mjs verify --plan --task my-task
npm run check
npm test
npm run test:policy
```

Đây là các entrypoints, không phải yêu cầu chạy lại syntax hai lần: `npm test` đã bao gồm
syntax. Sau khi `npm run check` pass và code/test inputs không đổi, dùng
`node scripts/arms-test.mjs full --task my-task` để chỉ chạy phần unit tests còn thiếu.

| Mode | Nội dung |
|---|---|
| `syntax` / `npm run check` | TypeScript noEmit, MJS syntax, local imports, doc links/fences |
| `verify` / `npm test` | Syntax + toàn bộ small Node unit suite |
| `full` | Chỉ toàn bộ unit suite |
| `policy` / `npm run test:policy` | Package scripts và workflow automation đã review |

Repeated `--file <path>` thay Git discovery; gồm cả removed paths. Hoặc dùng `--base <revision>`
cho scope committed, không dùng đồng thời. Unknown/needs-review phải thêm reviewed scope rule,
không bỏ file để vượt qua check. Chạy policy khi automation đổi.

Suite bao phủ catalog validation/safe errors, names-only Alphabet và ba action rows,
footer Back/Done (root/actions/empty), invalidated callbacks và async completion sau close,
project ON/OFF persistence/isolation/exclusive writes, native deny integration/skill guard,
policy fail-closed, draft preservation và stale targets, in-flight uncertainty, parser
UTF-8/cap/fallback, metadata preservation, native-skill output bypass, private logs/retention.
Preview/pagination đã được bỏ khỏi browser. Mocks thay host boundary, không thay parser.
Không API keys, providers, DB host hay global config trong unit tests.

Checkout linkage tests chạy CLI với HOME/config fixtures tạm: URLs encode đúng khi path có
spaces/Unicode, không phụ thuộc cwd, missing/non-file entries không xuất JSON dở dang,
`--help` và rejection của apply/install không sửa config. Lệnh chỉ in fragments không chứng
minh global đã migration hoặc server/TUI thực sự load cùng revision.

Không tiers/selective mappings/cache/smoke framework, Docker/Python/PTY hoặc Git hooks.
Không chạy unchanged suite nhiều lần; diagnose failure trước retry. Full ở đây là **full unit
suite**, không phải end-to-end acceptance.

<a id="manual-acceptance"></a>
## 3. Manual acceptance trước release

Các bước dưới đây **chưa được ghi nhận là đã pass**. Thử trên workspace tạm và host đã
review/deploy; không phá permissions hoặc dữ liệu thực. Ghi host version, plugin URLs,
code revision và environment trước khi đánh dấu.

| ID | Thao tác | Kết quả cần quan sát |
|---|---|---|
| A1 | Refresh library, mở `/arms-skills` | Dialog **OpenArms skills** chỉ có names theo Alphabet, không description/preview/packages; `/skills` native giữ nguyên |
| A2 | Chọn skill; thử Back/Done ở list/actions/empty, click và Alt+← / Alt+Enter, đóng khi save/append đang chờ | Ba action rows giữ nguyên; footer ở dưới, không bị filter; Back về list/root đóng; Done giữ preference/draft; completion không reopen/clear UI mới; shortcuts không còn active ở dialog host khác |
| A3 | Request với draft/attachments sẵn có ở normal mode | Append không mất input, không tự submit/đổi model |
| A4 | Đổi session cùng directory trong lúc browser/refresh | Không bắt đầu append từ callback của target cũ |
| A5 | Đổi target sau khi append đã gửi | Báo unconfirmed, không success/clear/retry; kiểm tra drafts thủ công, không suy ra atomic cancel |
| A6 | Gửi task dùng native skill với host ask/deny | Host permission được tôn trọng, skill output không bị rewrite |
| A7 | Command success/failure có output dài | Diagnostics/status được giữ, transformed output có observed original khi save thành công |
| A8 | Storage không dùng được trên project tạm | Marker save failure, không path giả, metadata không đổi |
| A9 | Quan sát filesystem/config sau thao tác | Chỉ project `skills.json` và output logs mới được phép theo contract; không usage/handoff/legacy state, DB/global config/draft side effects |
| A10 | OFF skill rồi yêu cầu native skill qua model (cả session có cached approvals nếu có) | REQUEST bị từ chối; server skill guard chặn subsequent calls, không chỉ UI; tool đã in-flight không được coi là bị hủy |
| A11 | ON sau OFF, restart host và thử lại | OpenArms deny được gỡ sau refresh; host deny nguyên có vẫn giữ, không auto-allow |
| A12 | Đổi subdirectory/project, restart server/TUI | Cùng worktree giữ preference, project khác độc lập; file private, no symlink/unsafe-store bypass |

- [ ] Ghi kết quả từng A1–A12, evidence và blockers; giữ unchecked nếu chưa thử.
- [ ] Chạy clean install/checks trên Node được hỗ trợ.
- [ ] Xác minh server/TUI cùng revision và khả năng rollback theo [Migration](migration.md).
- [ ] Test case failure/unknown không được trình bày thành pass chung.

Client guards không bảo đảm atomic multi-client targeting; dùng một client điều khiển và
review drafts theo [Skills](skills.md#draft-safety). Không tự chạy live provider/smoke trong
ordinary verification.

<a id="handoff-template"></a>
## 4. Mẫu bàn giao ngắn

Dán vào PR/issue hoặc release notes, không tạo thêm report folder trong docs:

```text
Revision / phạm vi:
Node / OpenCode / dependency versions:
Plugin URLs và revision thực sự được nạp (nếu đã deploy):
Commands + results + nơi lưu full log nếu có:
Manual A1–A12: pass / fail / skipped + evidence:
Node engine warning / blockers:
Chưa kiểm chứng:
Migration / rollback:
```

**Tiếp theo:** [Migration](migration.md) nếu cần triển khai; [Development](development.md) nếu cần sửa lỗi.
