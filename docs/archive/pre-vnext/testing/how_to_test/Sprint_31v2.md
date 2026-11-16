# Sprint 3.1 v2 — Classifier và Router

Phạm vi TSK-301v2–304v2, không thay hướng dẫn usage/budget Sprint_31.md.
Foundation tại mốc 3.1 chưa có parser chuyên biệt. Nay xem
[Sprint 3.2 v2](Sprint_32v2.md) cho default test/linter parsers; chưa nghiệm thu phase.

## Kiểm tra từ repository root

```sh
node scripts/arms-test.mjs related --task sprint-31v2 --file tests/sprint31v2.test.ts
```

Mong đợi 6 tests đạt: hơn 50 fixture, fast path, lỗi parser/sink, UTF8 cap,
authoritative skill và hook thật bảo toàn exitCode=7. Không chạy lại related nếu
full cùng revision đã bao phủ. Với toàn task, review một `verify --plan` kèm lặp
`--file` cho đủ file; chạy `syntax` sau sửa đáng kể rồi các mode còn lại.
Core/adapter cần full và runtime smoke theo policy, không kéo TUI.
Trong session không được đọc library thật, dùng `smoke-runtime --synthetic`
(với cùng danh sách `--file`); static dùng `smoke-static`, không nhận `--synthetic`.
Synthetic pass chỉ chứng minh runtime trên fixture tự sinh, không phải provider
hoặc integrity library thật.

## API và pipeline

`governOutput(raw, {command, compactors, save})` bật domain-aware. Await sink raw
trước normalize/classify/match kể cả output ngắn; hook flush/fsync và owner-only.
Sink lỗi báo `LOG_WRITE_FAILED`, không path giả. ANSI/control bị tước, CR/CRLF
thành newline, giữ space/tab. Hook không đổi title/metadata/exit status và không
suy diễn exit code từ text. Ưu tiên args.redactedCommand; bash command cũ chỉ dùng
phân loại trong bộ nhớ, không ghi command vào telemetry/tên log.

`domain` chỉ là phân loại, không chứng minh parser chạy. `fastPath` đúng khi
normalized/escaped text **<1000 UTF8 bytes** và không có warning/error/failure,
PASS/FAIL, tick, phần trăm/progress bar hoặc TAP banner. Đúng 1000 bytes phải route.
Noise chặn bypass; parsers 3.2 chỉ bỏ noise theo format được nhận diện.

Inject `DomainCompactor` với domain, `match(command, text)` và
`compact(text, {maxBytes: 32000})`. Text contract gọi rawText nhưng router truyền
stream sau normalize/escape, trước compact. Parser đầu cùng domain match thắng.
Không truyền compactors sẽ dùng defaults test/linter/git-diff (xem [Sprint 3.3 v2](Sprint_33v2.md)); inject thay thế defaults,
`[]` tắt chúng. Không parser/format unsupported dùng generic head/tail; match/compact ném lỗi dùng
generic và `GOVERNOR_FAILED`, không lộ exception. Callback compact cũ vẫn ưu tiên
và nhận raw. Authoritative skill bỏ qua router/normalize/escape; quá cap trả refusal,
không trả fragment skill. Marker từ tool/parser không thể giả `[OPENARMS:`.
Cap cuối 50000 UTF8 bytes gồm metadata/path/warning, giữ đúng biên Unicode.
Hook lưu raw trong governance directory hiện hành; telemetry/usage vẫn downstream,
chưa đổi schema domain/savings.

### Tương thích output ngắn

Output sạch, không thay đổi và đi fast-path (ví dụ `ok`, `unchanged`, chuỗi rỗng)
vẫn được lưu raw trước xử lý. API trả `logPath` và `logStatus: "written"`, nhưng
không chèn dòng full-log vào context để giữ nguyên text cho caller cũ. Chỉ ẩn
reference khi text bằng raw từng byte và không có warning/omission. Output bị
normalize/escape, có noise, đạt 1000 bytes hoặc bị compact vẫn có reference.
Sink lỗi luôn hiện `LOG_WRITE_FAILED`, không bị fast-path che mất.

## Quyết định classifier và giới hạn

Executable/verb chính xác thắng signature. Hỗ trợ absolute executable, env assignment
và wrapper đơn giản npx/pnpm/yarn/bunx. Không chạy shell, không tìm tên tool trong
argument incidental của echo/cat/node. Wrapper/alias lạ dùng signature neo dòng:
TAP, PASS/FAIL kèm file JS/TS/Python, diff --git, lỗi TS/Rust/GCC, flake8/ESLint.
Signature nhiều domain xung đột trả generic; PASS/FAIL trơ trọi không đủ.
Đây không phải shell parser: shell -c, pipeline, git global flags và wrapper flags
phức tạp có thể fallback generic. Test/linter PASS/warnings được lọc từ Sprint 3.2;
lockfile/inspection có ở Sprint 3.3; build và live-provider/PTY/phase acceptance vẫn thuộc sprint sau.
