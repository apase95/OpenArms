# Sprint 4.1 — Foundation nhập skill, chỉ API

Phạm vi TSK-401–404: parser, scope plan, tải GitHub và chuẩn hóa tar.gz thành
`RawSkillPackage` **untrusted**. Chưa có lệnh install hoạt động trên TUI/dispatcher;
không gọi scanner, AI, writer, registry hay loader. Không dùng API này để bỏ qua
quyền đọc skill của phiên. Mọi fixture dưới đây do test tự viết, không đọc thư viện thật.

## API và cách dùng dự kiến

```ts
const command = parseInstallCommand('/skills install --local https://github.com/example/demo')
const source = parseGithubSource(command.url)
const plan = resolveSkillScope({ projectRoot: '/project', skillName: 'demo', ...command })
// Chỉ chuẩn bị parent dirs khi operator đã chấp thuận; không tạo target/registry.
await prepareSkillScope(plan)
await withSkillDownload(source, async bytes => {
  const raw = extractSkillArchive(bytes, { source })
  // raw.trust === 'untrusted'; future scanner phải duyệt trước writer/registry.
})
```

Import từ `src/skill-scope-resolver.ts`, `src/skill-remote-fetcher.ts` và
`src/skill-archive-extractor.ts`. Đây là ví dụ API cho developer, **không chạy fetch
thật trong task/test này**. Callback nhận Buffer và temporary file còn sống;
sau callback, file được xóa, không lưu lại path để dùng sau. Raw package ở RAM
có document text UTF8 nghiêm ngặt và assets Buffer giữ cấu trúc tương đối.
Không render Markdown, thực thi script hoặc coi text là chỉ dẫn đáng tin cậy.

## Hợp đồng và threat model

- Parser yêu cầu đúng `/skills install`, một URL, scope mặc định local; từ chối
  flag lạ/lặp và scope xung đột. Tên skill do API scope nhận riêng, kebab-case,
  không separator, tên thiết bị Windows, NUL hay traversal.
- Local: `<project>/skills/<name>`, `<project>/registry.json`. Global:
  `$XDG_CONFIG_HOME/opencode/skills/<name>` và registry cùng root `opencode`.
  XDG rỗng fallback `~/.config`; XDG tương đối hoặc root `/` bị từ chối.
  Resolution không I/O, plan frozen. Preparation chỉ tạo parent mới 0700,
  không chmod directory cũ, không đọc content, không tạo target/registry.
  Collision cần `overwrite: true`, chỉ là approval, không xóa dữ liệu.
  Symlink/special và parent group/world-writable không có sticky bit bị từ chối.
  Sticky tmp ancestor cho phép test isolation. Filesystem thuộc operator kiểm soát;
  không cam kết chống hostile concurrent rename. Writer tương lai cần lock/revalidate.
- Chỉ HTTPS github.com repo, `.git`, commit SHA đủ 40 hex; không generic Git,
  proxy, shell, hooks, submodule, LFS hay automatic scripts. Branch/ref qua API:
  `parseGithubSource(url, {ref: 'feature/one', subpath: 'skills/demo'})`.
  `/tree/feature/one/skills/demo` bắt buộc `{ref:'feature/one'}` để tránh tự đoán
  branch chứa slash. Parser command chưa cung cấp ref flag; dùng staged API.
  SHA là revision bất biến; HEAD/branch không được quảng cáo là pinned revision.
- Chỉ codeload.github.com cho archive/redirect; tối đa ba redirect, kiểm tra raw
  URL trước normalization. Reject userinfo, ports (kể cả explicit 443), fragments,
  query, percent encoding, backslash, traversal, host/IP khác. Mỗi request resolve
  DNS lại, kiểm tra **mọi** answer, pin IPv4 đã kiểm tra qua HTTPS lookup callback;
  giữ hostname/SNI và certificate verification. Chỉ public IPv4 conservative;
  toàn bộ IPv6 bị từ chối kể cả public (không giả vờ hỗ trợ IPv6). Không generic
  fetch re-resolve/proxy environment. DNS/HTTP seams chỉ dành trusted host/test;
  custom transport phải dùng pinned destination, settle khi AbortSignal bị hủy,
  và `close()` phải hoàn tất resource cleanup. Clock seam `armDeadline` dành cho
  trusted tests: ép expiry đúng lúc transport/stream đã bắt đầu, không phụ thuộc
  scheduling của full suite; production dùng setTimeout với trần 30 giây.
- Deadline download toàn bộ 30 giây, tối đa **10 MiB (10×1024² bytes)** thực tế
  streamed, không tin Content-Length. HTTP content encoding chỉ identity; gzip
  là archive format riêng. Temp `os.tmpdir()/openarms-fetch-*` private 0700,
  `source.tar.gz` exclusive 0600. Callback/HTTP/error/timeout đều awaited cleanup;
  lỗi cleanup có AggregateError, không ẩn lỗi gốc. Không trả temp path đã xóa.
- Không dependency hay shell extractor. ZIP không hỗ trợ. Tar.gz bounded output
  tối đa 10 MiB **kể cả tar header/padding**, nên content hữu dụng thấp hơn 10 MiB.
  Tối đa 2048 entries, path 512 ký tự, mỗi file/total content không vượt 10 MiB.
  Checksum, ustar header/version, octal size, padding, hai zero terminator blocks,
  trailing bytes được kiểm tra trước khi trả object. Không ghi extracted paths.
  Reject duplicate/case aliases, file/dir conflict, absolute/UNC/drive/ADS,
  traversal, backslash, percent alias, links và mọi special entry. GNU/PAX local
  extensions từ chối; POSIX global PAX chỉ comment/mtime/atime/ctime, hỗ trợ
  GitHub-style commit comment, không cho path/size/link override.
- Strip đúng một top dir. Chọn SKILL.md → README.md → skill.markdown; nếu không
  có root doc, xét `skills/<child>`, nhiều candidate báo ambiguity, không chọn đầu.
  Explicit subpath chỉ lấy document/assets trong subtree đó. Text chính UTF8
  fatal và không NUL; binary assets giữ nguyên, chưa được scanner chứng thực.

## Kiểm thử offline

Từ root repo, review một plan đủ task scope với repeated `--file`.
Isolated command dưới thật sự chỉ chạy một test file (runner `commandFor` dùng
`plan.related`, không wildcard). Full cuối task bao phủ cùng tests, không chạy
lại related trên revision không đổi:

```sh
node scripts/arms-test.mjs related --task sprint-41 --file tests/skill-install.test.ts
```

Happy path và critical edge có trong cùng file: scope default/global/custom XDG,
collision nondestructive, modes/symlink/unsafe parent; URL/ref/DNS/private IPv4/IPv6,
redirect/rebinding; exact 10 MiB/missing length/oversize; deadline abort cleanup,
consumer throw; tar traversal/type/checksum/truncation/trailing/duplicate/PAX/bomb/
entry cap; layout priority/subpath/assets/ambiguity. Không cần credential/network.
Kết quả và thời lượng thực tế: [báo cáo](../../reports/sprints/report_sprint_41.md).

Để tái hiện verification toàn scope, dùng Bash và manifest công khai sau
(không cần local handoff). Chọn workflow này **thay cho** focused test phía trên
trên cùng revision; full đã bao phủ các tests liên quan:

```bash
files=(
  src/skill-scope-resolver.ts src/skill-remote-fetcher.ts src/skill-archive-extractor.ts
  tests/skill-install.test.ts tests/test-runner.test.mjs
  scripts/test-map.json scripts/test-policy.json
  docs/roadmap/Tasklist_Phase_4.md docs/testing/how_to_test/Sprint_41.md
  docs/reports/sprints/report_sprint_41.md docs/reports/sprints/README.md
  docs/testing/testing.md docs/testing/how_to_test_overview.md
  docs/testing/README.md docs/README.md docs/architecture/openarms-overview.md
)
args=(); for file in "${files[@]}"; do args+=(--file "$file"); done
node scripts/arms-test.mjs verify --plan --task sprint-41 "${args[@]}"
node scripts/arms-test.mjs verify --task sprint-41 "${args[@]}"
npm run test:policy
```

Plan hiện yêu cầu syntax và full do task thay mapping/test infrastructure;
không thêm Docker/TUI smoke cho API chưa nối runtime. Nếu đã chạy syntax thành
công với inputs không đổi, chạy mode còn lại từ plan thay vì verify lặp lại T0.

## Chưa nghiệm thu

Không real GitHub compatibility corpus/network, real skill library, prompt-injection
scanner, AI decompile, atomic writer/registry, end-to-end install hay Docker/PTY.
Dispatcher/TUI chỉ nối sau khi các security/writer gates về sau hoàn tất. Đây không
phải nghiệm thu Phase 4 hoặc thay đổi API Single Library đang hoạt động.
