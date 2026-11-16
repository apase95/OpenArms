# OpenArms

> Phạm vi: báo cáo này ghi lại môi trường cài đặt trước đó. Package, đường dẫn và
> kết quả kiểm thử không đại diện cho checkout hiện tại. Xem
> [mục lục hiện tại](../../README.md), [README dự án](../../../README.md) và
> [kiến trúc nền tảng](../../architecture/Architecture.md).

Core verified loader xem [Sprint 2.2](../sprints/report_sprint_22.md); source
integration hiện tại xem [Sprint 2.3](../sprints/report_sprint_23.md): sole verified
tool/persisted state, v1 content fail-closed. Live host/library acceptance còn chờ;
không thay evidence hoặc môi trường lịch sử bên dưới, kể cả hướng dẫn cài v1.

## 1. Tổng quan

Current TUI approval/status và matrix/runbook theo [Sprint 2.4](../../testing/how_to_test/Sprint_24.md).
Các lệnh cài v1, package-wide và reference direct-read bên dưới chỉ là lịch sử,
không dùng để triển khai source hiện tại hoặc bỏ qua source approval.

![[Pasted image 20261006091936.png]]

**OpenArms** là Skill Router cục bộ cho OpenCode. Nó quản lý skill theo project và session mà không đưa toàn bộ skill vào context ngay từ đầu.

| Quy tắc | Hành vi |
|---|---|
| Session mới | Bắt đầu không có skill |
| Lệnh `/skills` | Được TUI xử lý, không gửi đến model |
| Nạp skill | Chỉ nạp khi task cần |
| Task | Chỉ được load một package |
| Session con | Kế thừa skill và approval từ session cha |
| Bộ nạp skill native | Bị từ chối toàn cục |

| Dữ liệu | Đường dẫn |
|---|---|
| Dự án | `/home/hodangthaiduy/.local/share/opencode-skill-router` |
| Trạng thái | `/home/hodangthaiduy/.local/state/opencode-skill-router/state.json` |

## 2. Kiến trúc

| Thành phần | File | Vai trò |
|---|---|---|
| TUI adapter | `plugins/skill-router-tui.tsx` | Chặn `/skills`, hiển thị toast và dialog |
| TUI core | `plugins/tui-core.ts` | Xử lý lệnh `/skills` |
| Server adapter | `plugins/skill-router-server.ts` | Thêm router instruction và tool `load_skill_package` |
| Server core | `plugins/server-core.ts` | Safe path, package loader và task lock |
| Shared core | `plugins/shared.ts` | Parser, project detection và state store |
| Registry | `registry.json` | Khai báo package, skill và detection |
| Skill library | `skills/` | Lưu skill ngoài native auto-discovery |
| Kiểm thử | `tests/` | Tests tự động |

```text
/skills -> TUI plugin -> state.json -> server plugin -> load_skill_package
```

## 3. Package và skill

| Package | Skill cốt lõi | Skill tùy chọn | Nhận diện |
|---|---|---|---|
| Docs (`docs`) | `technical-writing` | `docs-editor`, `document-service`, `aws-well-architected-review`, `paper-writing`, `math-proof`, `verified-web-research`, `archify` | Markdown, MDX, MkDocs, Docusaurus, AI template, CDK, SAM, Serverless, CloudFormation, AWS dependency |
| Go (`go`) | `golang-pro` | Không có | `go.mod`, `go.work`, `.go` |
| NestJS (`nestjs`) | `nestjs-expert` | Không có | `nest-cli.json`, dependency `@nestjs/core` |
| NextJS (`nextjs`) | `nextjs-expert` | Không có | `next.config.*`, dependency `next` |
| Python-AI (`python-ai`) | `pytorch-expert` | `huggingface-expert` | Python, `pyproject.toml`, `requirements.txt`, `environment.yml` |
| AI-Research (`ai-research`) | `deep-learning-researcher` | Không có | `.ipynb`, `experiment.yaml`, `experiment.yml` |
| Shared-Skills (`shared-skills`) | `soul` | `superpower`, `ponytail`, `graphify` | Luôn khả dụng |

Mỗi skill chỉ thuộc đúng một package. State cũ được tự động đối chiếu với registry khi plugin khởi động; assignment không còn hợp lệ sẽ bị xóa.

| Skill | Mục đích |
|---|---|
| `graphify` | Kiến trúc, quan hệ file và đồ thị tri thức |
| `superpower` | Tìm ý tưởng, lập kế hoạch, TDD, chẩn đoán và review |
| `ponytail` | Giải pháp nhỏ, đơn giản và ít phụ thuộc |
| `soul` | Phong cách ngắn gọn, thực dụng, English A1-B1 |
| `pytorch-expert` | Model, training, tensor, GPU và inference |
| `huggingface-expert` | Transformers, Datasets, PEFT, Trainer và Hub |
| `deep-learning-researcher` | Paper, experiment, baseline, ablation và metrics |
| `nextjs-expert` | App Router, rendering, caching và deployment |
| `technical-writing` | Quy cách viết, cấu trúc, văn phong và kiểm chứng tài liệu |
| `docs-editor` | Review Markdown, MDX và notebook với thay đổi nhỏ, an toàn |
| `document-service` | Tạo tài liệu kiến trúc từ codebase và AWS IaC có source citation |
| `aws-well-architected-review` | Review workload theo AWS Well-Architected Framework |
| `paper-writing` | Lập luận học thuật, khẳng định, bằng chứng, giả định và giới hạn |
| `math-proof` | Chứng minh, suy diễn, ký hiệu, ca biên và trực giác toán học |
| `verified-web-research` | Tìm nguồn, kiểm chứng khẳng định, URL và trích dẫn |
| `archify` | Vẽ bộ Mermaid diagram rõ ràng, tách view theo mục tiêu và tránh sơ đồ quá tải |

Core skill luôn được load cùng package và không thể bị xóa bằng `remove`. Optional skill chỉ được load khi được chọn.

## 4. Lệnh `/skills`

Nhập `/skills` rồi nhấn Enter hoặc chọn `/skills` trong slash menu để mở picker nhiều giai đoạn:

1. Chọn action: `status`, `packages`, `use`, `list`, `add`, `remove`, `disable`, `clear`, `help`.
2. Với action cần tham số, chọn package rồi chọn optional skill.

Picker hỗ trợ gõ để lọc, `↑`/`↓` để di chuyển, `Enter` để chọn và `Esc` để đóng.

- `status`, `packages`, `help`, `clear`: đóng picker sau khi chọn action rồi hiện toast.
- `list`, `disable`: đóng picker sau khi chọn package rồi hiện toast.
- `use`, `add`, `remove`: giữ picker skill mở; mỗi skill được áp dụng ngay và có toast riêng. Chọn nhiều skill liên tiếp rồi tự đóng bằng `Esc`.
- `add`, `remove` và `disable` chỉ gợi ý package đang bật; `add` ẩn skill đã bật và `remove` chỉ hiện skill đang bật.
- Picker dùng dialog mặc định của OpenCode. `← Back` quay lại picker trước và `Done` đóng picker hiện tại.
- Package picker và toast chỉ hiện trạng thái `Detected`, `Active`, `Available`; package không có trạng thái để trống.
- Toast đọc dữ liệu dùng `info`, cập nhật thành công dùng `success`, hủy dùng `warning`, lỗi dùng `error`; title nêu rõ thao tác.
- `clear` yêu cầu xác nhận khi session có package. `disable` yêu cầu xác nhận khi package có optional skill đang bật.
- Toast hiển thị trong 10 giây.

Cú pháp đầy đủ như `/skills use docs archify` vẫn hoạt động.

| Lệnh | Tác dụng | Ví dụ hoặc kết quả |
|---|---|---|
| `/skills status` | Xem mọi skill đang bật theo từng package | Tên package và danh sách skill hoặc `No skills are enabled` |
| `/skills packages` | Liệt kê package và trạng thái | `• Go (Detected • Active)` |
| `/skills help` | Xem cú pháp lệnh | Hiển thị ba dòng trợ giúp |
| `/skills list <package>` | Xem core và optional skill; package không cần đang bật | `/skills list go` |
| `/skills use <package> [skills]` | Bật package và gộp optional skill mới | `/skills use shared-skills graphify` |
| `/skills add <package> <skills>` | Thêm skill vào package đang bật | `/skills add shared-skills ponytail` |
| `/skills remove <package> <skills>` | Xóa optional skill | `/skills remove shared-skills graphify` |
| `/skills disable <package>` | Tắt package, xóa approval và task lock của package đó | `/skills disable go` |
| `/skills clear` | Xóa toàn bộ selection của session | `All skills are off for this session` |

`use` và `add` giữ skill cũ, tự loại tên trùng. `remove` từ chối core skill. `disable` giữ nguyên các package khác. `clear` vẫn giữ lịch sử project cho restore dialog.

## 5. Hành vi khi chạy

| Tình huống | Hành vi |
|---|---|
| Lưu state | Theo project root và session ID |
| Khôi phục | `Yes` khôi phục lựa chọn gần nhất; `No` bắt đầu không có skill |
| Session con | Kế thừa lựa chọn và phê duyệt mismatch |
| Package không khớp | TUI hỏi `Allow` hoặc `Cancel`; phê duyệt chỉ tồn tại trong session |
| Khóa task | Sau khi nạp một package, package thứ hai bị chặn trong cùng task |
| Prompt mới | Đặt lại khóa task |

`Shared-Skills` là package độc lập và vẫn chịu task lock. Một task đã load `Go` không thể load thêm `Shared-Skills`; bắt đầu user task mới để chuyển package.

Ví dụ mismatch trong project NestJS:

```text
/skills use go
Go was not found in this project
Use the Go package for this session?
```

Ví dụ task lock:

```text
This task already uses the go package
Start a new task to use nestjs
```

## 6. An toàn

| Cơ chế | Bảo vệ |
|---|---|
| Registry allowlist | Chỉ skill trong `registry.json` được load |
| Safe path | Từ chối absolute path và path chứa `..` |
| Symlink check | Từ chối symlink đi ra ngoài skill library |
| Exclusive skill scope | Chỉ nội dung do `load_skill_package` trả về được xem là skill hợp lệ |
| Direct skill read deny | Chặn model đọc hoặc dùng `SKILL.md` bằng file tools hay Bash |
| External directory approval | File ngoài workspace cần người dùng cấp quyền `once` hoặc `always` |
| Atomic state | Ghi qua temporary file và atomic rename |
| Lock file | Tránh mất dữ liệu giữa các session đồng thời |
| Native tool deny | Ngăn OpenCode bỏ qua OpenArms |

Các Ponytail utility skill được lưu cục bộ nhưng không đăng ký thành skill độc lập.

Model không được tìm bản skill khác trong project, filesystem, `/tmp`, web hoặc subagent. Mọi `SKILL.md` vẫn bị permission từ chối trực tiếp, kể cả khi thư mục ngoài workspace đã được cấp quyền. Nếu skill đã load thiếu thông tin, model phải báo người dùng thay vì tự tìm một bản khác. Reference không phải `SKILL.md` chỉ được đọc khi nằm trong thư viện OpenArms và được skill đã load tham chiếu rõ ràng.

Quyền ngoài workspace dùng native permission dialog của OpenCode. Chọn `once` để cấp quyền cho lần hiện tại hoặc `always` cho pattern được hiển thị. Câu hỏi `question` do model tự tạo không phải permission grant và không thay đổi config.

Tên đứng trước dấu `:` trong router instruction là package; các tên phía sau là optional skill. Ví dụ `docs: archify` phải được load bằng `load_skill_package(package="docs")`, không phải tìm package hoặc file tên `archify`.

## 7. Kiểm thử

```bash
cd /home/hodangthaiduy/.local/share/opencode-skill-router
npm test
```

Kết quả tại mốc cài đặt lịch sử: **40 tests, 40 pass, 0 fail**; không phải kiểm
chứng checkout hiện tại. Quy trình hiện hành và toàn bộ ca sandbox xem
[bảng lệnh](../../testing/testing.md) và [hướng dẫn sandbox](../../testing/how_to_test/Sandbox.md).

Sau khi sửa plugin hoặc config, phải đóng toàn bộ OpenCode và mở lại.

## 8. Sao lưu và khôi phục

| Nội dung | Giá trị |
|---|---|
| Bản sao lưu trước chuyển đổi | `/home/hodangthaiduy/.local/share/opencode-skill-router/backup-before-cutover` |
| Dữ liệu | Config cũ, SOUL, global skills, Superpower agent và Graphify plugin |

Sau khi khôi phục config, đóng và mở lại OpenCode.

## 9. Thêm skill từ GitHub

OpenArms chưa hỗ trợ cài skill tự động.

| Bước | Thao tác |
|---|---|
| 1. Tải | Clone vào `/tmp/opencode/skill-review` |
| 2. Review | Kiểm tra `SKILL.md`, giấy phép, script, symlink, token và quyền credential |
| 3. Cài | Sao chép cả thư mục vào `skills/my-skill/` |
| 4. Đăng ký | Thêm đường dẫn vào `skills` trong `registry.json` |
| 5. Gắn package | Thêm tên skill vào `core` hoặc `optional` |
| 6. Kiểm tra | Xác minh JSON, chạy tests, khởi động lại OpenCode |

```bash
git clone https://github.com/OWNER/REPOSITORY.git /tmp/opencode/skill-review
```

`SKILL.md` nên có tên trùng tên đăng ký:

```yaml
---
name: my-skill
description: Use when...
---
```

Ví dụ `registry.json`:

```json
"skills": {
  "my-skill": "skills/my-skill/SKILL.md"
},
"packages": {
  "go": {
    "core": ["golang-pro"],
    "optional": ["superpower", "my-skill"]
  }
}
```

| Loại | Khi sử dụng |
|---|---|
| `core` | Luôn load cùng package; không thể `remove` |
| `optional` | Chỉ load qua `use` hoặc `add` |

Mỗi skill chỉ được thuộc một package; automated test sẽ từ chối assignment trùng. Skill vẫn chỉ đăng ký đường dẫn một lần. OpenArms nhận diện package, không nhận diện từng skill; thêm vào package có sẵn không cần sửa `detect`.

```bash
jq empty /home/hodangthaiduy/.local/share/opencode-skill-router/registry.json
cd /home/hodangthaiduy/.local/share/opencode-skill-router
npm test
```

Sau khi restart OpenCode:

```text
/skills list go
/skills use go my-skill
/skills status
```

---
