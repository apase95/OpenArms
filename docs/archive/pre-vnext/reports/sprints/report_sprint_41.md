# Báo cáo Sprint 4.1: Foundation nhập skill an toàn

* **Thời gian thực hiện:** 2026-10-16
* **Giai đoạn:** Phase 4, chỉ TSK-401–404
* **Người thực hiện:** openai/gpt-6.1-sol / general (current injected profile)
* **Tasklist gốc:** [Phase 4](../../roadmap/Tasklist_Phase_4.md)
* **Kịch bản kiểm thử:** [Sprint 4.1](../../testing/how_to_test/Sprint_41.md)

## 1. Tóm tắt Sprint

Foundation API độc lập với loader và TUI: scope plan/preparation, HTTPS GitHub
download callback, bounded tar.gz reader/layout. Nội dung luôn untrusted, không
registry mutation hay persistent install. Bảo toàn inherited work và trạng thái 415/416.

## 2. Kết quả Tasks

| Task | Phạm vi | Trạng thái | Bằng chứng |
|---|---|---|---|
| 401 | Parser/scope/parent preparation | Hoàn thành scoped API | `tests/skill-install.test.ts` |
| 402 | Pinned HTTPS GitHub + private temp lifecycle | Hoàn thành offline contract | Offline HTTP/DNS seams |
| 403 | Bounded tar.gz/layout/untrusted assets | Hoàn thành bounded subset | Authored archive fixtures |
| 404 | Offline security cases | Hoàn thành | 15 ingestion cases + mapping regression trong full |

## 3. Bằng chứng Kiểm thử & Độ tin cậy

- Plan đầy đủ đã review: syntax + full do thay mapping/policy; không smoke.
- RED isolated `node scripts/arms-test.mjs related --task sprint-41 --file tests/skill-install.test.ts`:
  2/4 pass, 2 expected failures `Not implemented`, 145 ms. Scope happy/edge pass;
  archive happy/edge fail trước implementation.
- GREEN isolated: 13/13, 403 ms trước khi thêm hai lifecycle cases;
  log `.openarms/logs/related-63512111b2672f0378fc92ef-0af5b840-79ac-4434-872a-c0b102163009.log`.
- Final T0: 7/7, 442 ms; final T2: **257/257, 15,819 ms**, gồm 15 ingestion
  cases và regression classifier. Commands: `node scripts/arms-test.mjs syntax`
  rồi `full`, `--task sprint-41`, repeated `--file` cho 3 source, 2 tests,
  `scripts/test-map.json`, `scripts/test-policy.json`. Full bắt buộc vì mapping/
  test infrastructure; không thêm related cùng revision đã được full bao phủ.
- Final logs: `.openarms/logs/syntax-63512111b2672f0378fc92ef-6417ef29-5e9c-4aa4-a0be-1f90977f9907.log`;
  `.openarms/logs/full-63512111b2672f0378fc92ef-3f37ceb0-d080-4221-ae28-51e86a28c517.log`.
- Một verify orchestration đầy đủ scope đã pass 257/257 (15,511 ms). Sau review
  thêm case-insensitive ancestor conflict, full rerun gặp test timing 10 ms trước
  HTTP entry: 256/257, 15,404 ms. Chẩn đoán từ summary, không raw-log inspection
  theo session restriction. Clock seam sửa test để ép expiry sau transport start;
  final syntax/full trên revision mới đạt như trên, không unchanged retry.
- `npm run test:policy`: 0 findings, 170 ms; automation mapping không đổi sau đó.
- Scoped `git diff --check`: bỏ whitespace ở 401–404 do task sửa; còn hai inherited
  markdown hard-break tại roadmap 415/416, giữ nguyên phần user thay đổi. Không
  claim clean toàn inherited diff; command khoảng 3 ms.
- T3 static/runtime/TUI bỏ qua do không có integration boundary. Không nghiệm thu
  real macOS/network hoặc atomic install.
- Không network thật, library thật, Docker/PTY hay live-provider observations.

## 4. Quyết định Kỹ thuật & Rủi ro

Không dependency mới; dùng node:https DNS pinning, Buffer bounded gunzip và
ustar subset strict. Giới hạn public IPv4 và GitHub/codeload thay generic Git;
tree ref bắt buộc tường minh vì slash ambiguity. PAX global commit comment
được hỗ trợ, local override/GNU/ZIP từ chối rõ. Filesystem threat model là
owner-controlled, không hostile concurrent mutation; overwrite không xóa target.
Chi tiết limits/API/SSRF/extraction ở runbook.

## 5. Giới hạn & Sprint tiếp theo

Chưa scanner/decompiler/writer/registry/dispatcher; không chứng nhận nội dung
an toàn chỉ vì archive hợp lệ. Chưa real GitHub tar corpus hay macOS host run;
Linux/macOS path resolution được kiểm tra bằng injected home/env. Writer tương
lai phải revalidate và lock trước commit. Không claim nghiệm thu toàn Phase 4.
