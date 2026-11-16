# Kiểm tra tối thiểu — OpenArms 0.2

## Host checks

Từ repository root, dùng Node.js phù hợp `package.json` và `npm ci`:

```bash
node scripts/arms-test.mjs verify --plan --task my-task
npm run check
npm test
npm run test:policy
```

Có thể thêm repeated `--file <path>` (gồm cả removed paths) hoặc `--base <revision>`
cho scope diagnostics, không dùng cả hai. Unknown paths phải có reviewed scope rule.
Scope không chọn subset test: toàn bộ suite nhỏ được chạy; không test mapping database.

| Mode | Việc chạy |
|---|---|
| `syntax` / `npm run check` | TypeScript noEmit, local imports, active doc links/fences |
| `verify` / `npm test` | Syntax checks + toàn bộ Node unit tests |
| `full` | Chỉ toàn bộ unit tests nếu syntax đã pass với inputs không đổi |
| `policy` / `npm run test:policy` | Kiểm tra package scripts và workflow automation được duyệt |

Runner không cache, không multi-tier selective execution, smoke, Docker, Python, PTY,
retry guard hay baseline/acceptance ledger. Không chạy test suite unchanged nhiều lần;
đọc failure rồi sửa/diagnose trước khi retry. Không có Git hooks tự cài.

Archive không thuộc link/type/import checks vì chứa snapshots của layout và commands cũ.
Không chạy archived commands để kiểm tra bản mới.

## Unit coverage

- Catalog shape, metadata errors, duplicates; phân loại unsupported/transport/rejected/invalid response,
  bảo đảm không leak exception hoặc response body trong UI.
- Preview giữ Markdown newline/blank lines/tabs, normalize CRLF và strip ANSI; labels single-line.
- Browser list/inspect/request, giữ draft, stale/disposed callbacks và failed append.
- Session/home/directory target checks tại discovery, selection/preview callback và revalidation.
- In-flight append đổi session: báo uncertain, không success/clear/retry; lifecycle signal được truyền cho SDK.
- Server chỉ output hook; native skill/custom tools bypass.
- Compactors giữ diagnostic, generic fallback, UTF-8/final cap và malformed parser handling.
- Private save, write failures, concurrent artifacts và retention.
- Existing compiler parser regressions được giữ lại trong small suite.

Mocks thay host boundary; không thay pure parser implementation. Tests không dùng API keys,
không gọi provider, không mở DB host hoặc global config.

## Evidence của task redesign

Typecheck/import/doc-link checks, automation policy và 32 offline unit tests đã pass
trên môi trường Node `24.12.0`. npm báo engine warning: SDK dev dependency kéo `ini@7`
yêu cầu `^22.22.2 || ^24.15.0 || >=26.0.0`; `package.json` khai báo cùng dải này.
Môi trường khảo sát chưa có Node trong dải hỗ trợ, nên kết quả trên không chứng nhận
clean install/checks ở phiên bản được hỗ trợ. Không tự upgrade Node/global config.

Bản vá skill browser tiếp theo đã pass typecheck/import/doc-link checks và **41 offline
unit tests** (thêm regression cho preview layout, safe error categories và session-bound
callbacks/revalidation/in-flight uncertainty). Vẫn chạy trên Node `24.12.0`, nên giới hạn
engine/live acceptance nêu trên chưa thay đổi.

- [ ] Chạy `npm ci`, checks và tests trên Node đáp ứng engines trước release/deploy.
- [ ] Ghi live host/TUI/provider acceptance riêng; chưa thực hiện trong task source này.

## Manual acceptance trên host đã deploy

Các checkbox này là runbook, **chưa đánh dấu như đã nghiệm thu live**:

- [ ] Ghi host version, dependency version, plugin URLs và code revision đang thử.
- [ ] Catalog từ native directories và `skills.paths` xuất hiện sau host refresh.
- [ ] `/skills` mở dialog/filter; Inspect có location/content đúng, giữ paragraphs/code indentation.
- [ ] Thử host API thiếu, request thất bại và malformed response: lỗi có code phân biệt, không raw body.
- [ ] Request append với draft đang có; không mất attachments/text, không auto-submit.
- [ ] Đổi session trong cùng directory khi browser đang mở/refresh: không append sang target mới.
- [ ] Đổi target khi append đã được gửi: báo unconfirmed, không success/clear/retry;
  kiểm tra drafts thủ công, không suy ra request đã bị hủy atomically.
- [ ] Kiểm tra normal prompt mode và chỉ một client điều khiển; API append không có
  guarantee atomic targeting giữa nhiều clients.
- [ ] Submit task có skill; native permission ask/deny hoạt động như host cấu hình.
- [ ] Skill body/custom tool output không bị governor thay đổi.
- [ ] Chạy command thành công/thất bại có output dài; metadata không đổi, log đúng bản gốc.
- [ ] Test storage unavailable trên workspace tạm, không chmod/phá dữ liệu thực.
- [ ] Không còn usage/install/handoff UI và không có writes vào legacy state từ code mới.

Không tự chạy live smoke/provider tasks trong ordinary verification. Nếu host API lệch,
ghi reproduction và báo unsupported; không thêm fallback scanner hoặc bypass permission.
