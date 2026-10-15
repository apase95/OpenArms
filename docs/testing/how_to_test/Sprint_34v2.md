# Sprint 3.4 v2 — Build & Compiler Compactor

## Hành vi

`src/build-output-compactor.ts` được governor đăng ký mặc định cho domain build.
Giữ năm lỗi đầu, continuation nhiều dòng, tọa độ, causal notes và template
instantiation chain; báo số lỗi còn lại. Notes không tăng bộ đếm lỗi.
Raw log vẫn do governor lưu trước khi nén; `compactors: []` tắt defaults.

Các format được kiểm tra bằng fixture đại diện (không phải compiler chạy live):

- TypeScript pretty: `src/main.ts:4:2 - error TS2322: ...`, nonpretty:
  `src/main.ts(4,2): error TS2322: ...`.
- GCC/Clang: `a.cc:3:2: error: ...`, `note:`, `In instantiation of`,
  `required from here`, continuation template và code/caret.
- Cargo/Rust: `error[E0308]: ...`, arrow `--> src/main.rs:3:5`, gutter,
  `= note:` và terminal `could not compile` summary.
- Webpack: `ERROR in ./src/a.js 2:3`, `Module not found: Error: ...`.
- Vite: version/build progress, `[vite:load-fallback] ...`, `file: ...`,
  stack thụt đầu dòng. Esbuild: `✘ [ERROR]`, snippet dùng `│`/`╵`.

Chỉ xóa warning blocks và progress/banner đã nhận diện khi có error. Warning-only
fallback, không biến build warning thành output trống. Top-level không hiểu hoặc
template prelude chưa có diagnostic kết thúc khiến **toàn stream fallback**.
Không dùng regex “mọi dòng có chữ error” để bỏ dữ liệu.

## Ví dụ đọc kết quả

```text
src/main.ts:10:7 - error TS2322: incompatible
  Type 'Widget' is not assignable
    Property 'id' is missing
10<TAB>const value9 = 0;
 <TAB>      ~~~~~
```

`<TAB>` ở ví dụ là ký hiệu minh họa: implementation giữ tab thật, không đổi
indentation/caret sau khi strip ANSI. Snippet đánh số được giữ khoảng hai dòng
trước/sau dòng có caret; phần source bị bỏ có marker. Message nhiều dòng không
bị áp giới hạn hai dòng. Snippet không xác định được caret được giữ bảo thủ.

## Warnings-as-errors và giới hạn

- Truyền `command` vào cả `match` và `compact`. Với `-Werror` (kể cả
  `-Werror=...`), `--deny warnings`, `--deny=warnings`, `-D warnings`,
  `-Dwarnings`, parser từ chối lọc warning để governor dùng generic fallback.
  Có test `RUSTFLAGS=-Dwarnings`; không suy diễn flags nằm trong config hoặc
  môi trường không xuất hiện trong command.
- Format/version ngoài grammar được giữ qua fallback, không được coi là đã
  compact thành công. Fallback của governor vẫn có generic byte cap/raw log.
- Diagnostic dài tùy ý **không được cam kết dưới 1KB**. `maxBytes` cuối parser
  cắt ở ranh giới UTF8 và thêm marker; xem full raw log nếu evidence bị cắt.
- Classifier vẫn do governor sở hữu; hỗ trợ parser trực tiếp không tự mở rộng
  mọi executable alias (ví dụ `clang++` qua wrapper).

## Kiểm tra cô lập và bằng chứng

```bash
node scripts/arms-test.mjs related --task sprint-34-35v2 --file tests/sprint34v2.test.ts
```

Đã đọc runner và mapping: test path này chỉ chọn `tests/sprint34v2.test.ts`.
Focused check đã ghi nhận **9/9 pass, 179ms**; final full bên dưới bao phủ
revision tích hợp cuối. Lệnh trên dành cho kiểm tra riêng, không cần chạy lại
trước full trên cùng revision.

Các phép đo được assert trong tests:

| Fixture | Raw | Context |
|---|---:|---:|
| 400 lỗi TypeScript nonpretty | >30.000 bytes | <1.000 bytes, gồm provenance |
| 400 warning GCC + lỗi TS pretty | >30.000 bytes | <1.000 bytes, gồm provenance |
| 400 warning + C++ template causal chain | >30.000 bytes | <1.000 bytes, parser output |

Có thêm kiểm tra first-five/count, warning-only, flags, malformed fallback,
Rust/Vite/esbuild, multiline indentation và UTF8 budget 256 bytes.
Chỉ mock log sink; parser/governor thật được chạy.

## Kết quả tích hợp cuối — 15/10/2026

Final integrator đã review plan toàn scope: syntax **24/24, 559ms**, full
**241/241, 15808ms**, policy **0 findings**. TS fixture ghi nhận
**35.413 raw → 518 context bytes**; đây vẫn là fixture, không phải chạy `tsc` live.
Log full: `.openarms/logs/full-63512111b2672f0378fc92ef-440919a8-f568-412b-bd6f-faab43b0f441.log`.
Log syntax: `.openarms/logs/syntax-63512111b2672f0378fc92ef-2ccd172d-1ea8-448f-9217-cd5bf551bbb6.log`.

Docker runtime **5/5** và PTY **1/1** đã pass. Trong PTY OpenCode thật,
`g++ -Wall -fsyntax-only acceptance.cpp` chạy binary thật, exit **1**, giữ lỗi
và giảm **12439 → 295 bytes (97.63%)** qua production hook. Xem
[Sprint 3.5: workflow, lệnh và logs](Sprint_35v2.md) để tái hiện và phân biệt
compiler thật với model transport/reporter tổng hợp. Không suy ra live-provider,
mọi compiler/format hoặc nghiệm thu toàn Phase từ kết quả này.
Các số trên là bằng chứng hoàn tất đã ghi nhận, không phải rerun khi sửa tài liệu.
