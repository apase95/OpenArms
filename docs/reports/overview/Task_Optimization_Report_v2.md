# OpenArms v2: Token, context và quản trị runtime

**Trạng thái:** Đề xuất kiến trúc và lộ trình triển khai  
**Nguồn tổng hợp:** Báo cáo sử dụng token từ 14/09/2026 đến 07/10/2026, `Task Optimizaion Report.md`, kiến trúc OpenArms hiện tại và các quyết định trao đổi bổ sung.  
**Mục tiêu:** Mở rộng OpenArms từ một Skill Router thành lớp quản trị context, token, quyền, kiểm thử và vòng đời task cho OpenCode.

Đây là **đề xuất lịch sử v2**, khác v1 về restore/lockfile/rotation và được v3
thu gọn kiến trúc. Các API `load_verified_skill`, `/arms`, budget và cấu trúc mục
tiêu bên dưới không mặc nhiên đã triển khai. Hướng dẫn hiện hành ở [testing](../../testing/testing.md),
[sandbox](../../testing/how_to_test/Sandbox.md); nghiệm thu xem [Phase 0](../phase0-review.md)
và [Phase 1](../phase1-review.md).

Hiện có [core Sprint 2.2](../sprints/report_sprint_22.md) cho API strict/grants/
hash/budget và [source integration Sprint 2.3](../sprints/report_sprint_23.md).
Contract thực thi xem [guide 2.3](../../testing/how_to_test/Sprint_23.md): sole
verified tool, persisted grants, không compatibility loader; library v1 fail-closed.
Live host/migration còn chờ. Các examples/schema/proposals lịch sử dưới đây giữ nguyên.

---

TUI approval/status hiện hành và operational gates xem [Sprint 2.4](../../testing/how_to_test/Sprint_24.md).
Giữ nguyên proposal/examples lịch sử, không dùng schema verified flag hoặc compatibility
loader bên dưới thay contract source hiện tại.

## 1. Tóm tắt điều hành

OpenArms hiện quản lý package và skill theo project/session, bảo vệ đường dẫn skill, chặn native skill loader và chỉ cho phép model nhận skill qua `load_skill_package`. Cơ chế này giải quyết được bài toán xác thực skill, nhưng chưa quan sát hoặc kiểm soát các nguồn gây tiêu tốn token lớn hơn như session dài, tool output, test output và việc load toàn bộ package.

Báo cáo sử dụng cho thấy:

| Chỉ số | Giá trị | Tỷ lệ trên tổng token |
|---|---:|---:|
| Input | 23,386,711 | 7.22% |
| Output | 1,494,456 | 0.46% |
| Cache create | 0 | 0% |
| Cache read | 298,716,595 | 92.21% |
| Tổng token | 323,962,125 | 100% |
| Tổng chi phí | $264.01 | — |

Có 21 ngày hoạt động trong báo cáo, tương đương khoảng **$12.57 mỗi ngày hoạt động**. Ngày cao nhất là 06/10 với **57.36M token** và **$41.26**.

Cache read chiếm phần lớn số token nhưng không đồng nghĩa chiếm cùng tỷ lệ chi phí, vì mỗi provider định giá cache khác nhau. Vì vậy OpenArms v2 phải tối ưu đồng thời ba mục tiêu:

1. Giảm chi phí USD thực tế.
2. Giảm fresh input và context không cần thiết.
3. Giảm số turn lặp lại cùng lịch sử dài.

Đề xuất trọng tâm:

| Ưu tiên | Thay đổi | Giá trị chính |
|---:|---|---|
| P0 | Telemetry sử dụng chính xác | Biết token và chi phí phát sinh ở đâu |
| P0 | Nạp từng skill đã xác thực | Không nạp toàn package khi chỉ cần một skill |
| P0 | Wrapper kiểm thử và output rút gọn | Không đưa hàng chục KB log vào lịch sử |
| P1 | Guard context và `compaction.prune` | Giảm output tool cũ trong session |
| P1 | Cảnh báo ngân sách theo ngày/session/task | Phát hiện bất thường trước khi chi phí tăng mạnh |
| P1 | Bàn giao session và xoay vòng theo ngưỡng | Chặn context tăng tích lũy |
| P2 | Hồ sơ quyền và cô lập session con | Giảm hành động thừa khi lập kế hoạch/review/subagent |
| P2 | Giới hạn cứng và định tuyến model | Chỉ triển khai sau telemetry đủ tin cậy |

OpenArms v2 nên được định vị là:

> **OpenArms Runtime Governor: quản lý skill đã xác thực, context, token budget, test output, quyền và vòng đời task.**

---

## 2. Hiện trạng OpenArms

### 2.1. Kiến trúc hiện tại

| Thành phần | File | Trách nhiệm |
|---|---|---|
| TUI adapter | `plugins/skill-router-tui.tsx` | Chặn `/skills`, dialog, toast và prompt integration |
| TUI core | `plugins/tui-core.ts` | Parse và thực thi command quản lý skill |
| Server adapter | `plugins/skill-router-server.ts` | Router instruction, event hooks và tool loader |
| Server core | `plugins/server-core.ts` | Safe path, package loader và task lock |
| Shared core | `plugins/shared.ts` | Registry, state, project detection và session lifecycle |
| Registry | `registry.json` | Package, core skill, optional skill và detection rule |
| State | `~/.local/state/opencode-skill-router/state.json` | Selection, approval, load history và task state |

Luồng hiện tại:

```text
/skills
  -> TUI plugin
  -> state.json
  -> system router instruction
  -> load_skill_package(package)
  -> core + toàn bộ optional skill đã bật
```

### 2.2. Điểm mạnh cần giữ

- Registry là allowlist duy nhất cho skill.
- Safe path từ chối absolute path, `..` và symlink thoát library.
- Native `skill` tool bị deny.
- Direct read và Bash command chứa `SKILL.md` bị deny.
- State được lưu theo project và session.
- Task lock ngăn nhiều package không liên quan bị load trong một task.
- TUI command không cần gửi yêu cầu quản lý skill tới model.
- Load history cho phép phân biệt `Enabled`, `Loaded` và `Used`.

### 2.3. Hạn chế hiện tại

- Loader làm việc ở cấp package, nên một skill được yêu cầu có thể kéo theo nhiều skill khác.
- Chưa có usage store theo message, model, session, skill hoặc project.
- Chưa có budget hoặc cảnh báo chi phí.
- Tool output chưa được chuẩn hóa trước khi vào context.
- Full test có thể bị chạy lặp lại trong agent loop.
- Session và child session có thể kế thừa nhiều state hơn mức cần thiết.
- Restore hiện chưa phân biệt core package và optional skill.
- External directory access và skill verification đang bị gắn quá chặt về mặt permission policy.

---

## 3. Chẩn đoán nguyên nhân tiêu tốn

### 3.1. Công thức thực tế

Chi phí không chỉ phụ thuộc tổng token:

```text
Cost = fresh input price
     + cache read price
     + cache write price
     + output/reasoning price
```

Context dài làm tăng cache read ở mỗi turn. Tool output lớn làm context tăng nhanh. Số turn cao khiến cùng một prefix tiếp tục được đọc lại.

### 3.2. Nguồn phình context chính

| Nguồn | Ví dụ | Hậu quả |
|---|---|---|
| Output kiểm thử | 45 test, stack trace, reporter dài | Log nằm lại trong lịch sử |
| Trình quản lý package | Thanh tiến trình, cảnh báo, cây dependency | Nhiều KB output không có giá trị lâu dài |
| Đọc file quá rộng | Đọc toàn file, lockfile, file sinh tự động | Input mới và cache read tăng |
| Duyệt thư mục | `find .`, `tree`, `ls -R` | Danh sách file lớn và ít liên quan |
| Nạp skill toàn package | Core và nhiều optional skill | Context skill lớn hơn nhu cầu task |
| Session kéo dài | Nhiều task trong cùng session | Context tăng tích lũy qua mỗi lượt |
| Sửa-thử lặp lại | Chạy cùng test sau cùng lỗi | Tăng turn mà không tăng thông tin |
| Subagent không cô lập | Kế thừa selection và context không cần | Nhân context giữa nhiều session |

### 3.3. Điều cần tránh khi kết luận

- Không coi cache read token bằng fresh input token về chi phí.
- Không đặt mục tiêu giảm 60–80% chi phí trước khi có attribution theo model và message.
- Không dùng tổng token làm chỉ số duy nhất.
- Không hard-block request dựa trên số liệu chưa deduplicate.
- Không phá cache prefix chỉ để giảm một lượng context nhỏ.

Mục tiêu 60–80% nên được xem là **giả thuyết tối ưu context waste**, không phải cam kết tiết kiệm chi phí.

---

## 4. Mục tiêu và phạm vi v2

### 4.1. Mục tiêu

1. Quan sát chính xác token và cost theo message, model, session, project và task.
2. Chỉ load skill đã xác thực và thực sự cần.
3. Cho phép làm việc ở nhiều thư mục mà không mở đường cho skill chưa xác thực.
4. Giảm output rác từ test, package manager, read và shell.
5. Đưa full test ra khỏi vòng lặp sửa code thông thường.
6. Cảnh báo budget trước khi session hoặc ngày vượt mức.
7. Tạo handoff ngắn khi session cần được rotate.
8. Dùng permission profile phù hợp với planning, review, build và verify.

### 4.2. Ngoài phạm vi ban đầu

- Không xây billing system thay provider.
- Không tự động chọn model trước khi có dữ liệu đủ lớn.
- Không tự động đóng session đang hoạt động.
- Không sửa lịch sử message cũ để unload skill trong MVP.
- Không xây dependency graph test hoàn chỉnh trong phiên bản đầu.
- Không viết lại permission engine của OpenCode.

---

## 5. Kiến trúc đề xuất

```text
                         OpenCode Runtime
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
       chat.message      message.updated   tool.execute.*
            │                  │                  │
            ▼                  ▼                  ▼
   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
   │ Policy Engine  │  │ Usage Observer │  │ Output Guard   │
   └───────┬────────┘  └───────┬────────┘  └───────┬────────┘
           │                   │                   │
           ▼                   ▼                   ▼
   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
   │ Verified Skill │  │ Usage Store    │  │ External Logs  │
   │ Registry/Loader│  │ + Aggregates   │  │ + Test Results │
   └───────┬────────┘  └───────┬────────┘  └───────┬────────┘
           └───────────────────┼───────────────────┘
                               ▼
                      TUI /arms Dashboard
```

### 5.1. Module dự kiến

| Module | Trách nhiệm |
|---|---|
| `skill-registry` | Xác thực skill, package, ngân sách token và đường dẫn |
| `skill-loader` | Nạp đúng skill/workflow đã cấp phép |
| `usage-observer` | Thu token/chi phí từ message assistant |
| `usage-store` | Loại trùng và tổng hợp mức sử dụng |
| `budget-guard` | Cảnh báo và áp policy theo ngưỡng |
| `context-controller` | Theo context, cắt nội dung cũ và tín hiệu xoay vòng |
| `output-guard` | Cắt output tất định và lưu log đầy đủ |
| `test-governor` | Test đúng mục tiêu, reporter ngắn và manifest kiểm thử |
| `session-lifecycle` | Khôi phục, kế thừa session con, bàn giao và xoay vòng |
| `permission-profiles` | Policy lập kế hoạch, review, build và verify |
| `tui-plugin` | `/arms`, dialog, báo cáo sử dụng và phê duyệt |

---

## 6. Mô hình xác thực và load skill

### 6.1. Tách quyền hệ thống file khỏi quyền skill

Agent có thể được phép truy cập nhiều thư mục nhưng không được tự do load skill. Hai scope phải độc lập:

```text
Filesystem scope → OpenCode permission
Skill scope      → OpenArms registry + approval policy
```

Policy skill mới:

| Trạng thái | Hành vi |
|---|---|
| Skill không có trong registry | `deny` |
| Skill có trong registry nhưng chưa verified | `deny` |
| Skill verified nhưng chưa enabled | `ask` |
| Skill verified và enabled | `allow` |
| Workflow không thuộc verified skill | `deny` |
| Reference ngoài verified skill root | `deny` |

### 6.2. Loader cấp skill thay vì package

API hiện tại:

```ts
load_skill_package({ package: "shared-skills" })
```

API đề xuất:

```ts
load_verified_skill({
  skill: "graphify",
  workflow: undefined
})
```

Khi task cần Superpower workflow:

```ts
load_verified_skill({
  skill: "superpower",
  workflow: "systematic-debugging"
})
```

Không tự động load mọi optional skill trong package. Package chỉ còn vai trò:

- Nhóm skill theo domain.
- Detection theo project.
- Default suggestion trong TUI.
- Policy preset.

### 6.3. Registry v2

```json
{
  "version": 2,
  "skills": {
    "graphify": {
      "path": "skills/graphify/SKILL.md",
      "package": "shared-skills",
      "verified": true,
      "kind": "optional",
      "maxTokens": 2000,
      "references": true,
      "defaultPermission": "ask"
    }
  }
}
```

### 6.4. Trạng thái khi chạy

| Nhãn | Ý nghĩa |
|---|---|
| Available | Skill verified và có thể yêu cầu cấp quyền |
| Enabled | Skill đã được cấp phép trong session/project |
| Loaded | Skill đã từng được đưa vào context của session |
| Used | Skill được load trong task hiện tại |
| Denied | Skill bị policy từ chối |
| Unverified | Skill chưa được OpenArms xác thực |

---

## 7. Ngân sách kích thước skill

### 7.1. Giới hạn

| Loại | Giới hạn đề xuất |
|---|---:|
| Core `SKILL.md` | 1,500 tokens |
| Optional `SKILL.md` | 2,000 tokens |
| Router instruction động | 300 tokens |
| Workflow entry | 1,500 tokens |
| Reference | Không auto-load; kiểm tra riêng |

MVP có thể ước tính token bằng `characters / 4`. Sau đó có thể thay bằng tokenizer theo model nếu sai số ảnh hưởng policy.

### 7.2. Cấu trúc skill

`SKILL.md` chỉ giữ:

- Trigger và phạm vi.
- Các quy tắc bắt buộc.
- Workflow ngắn.
- Link rõ ràng đến reference cần thiết.

Nội dung dài chuyển sang:

```text
skills/<name>/references/
```

Reference chỉ được đọc khi skill đã load và task thực sự cần nội dung đó.

### 7.3. Xử lý `soul`

Không nên đưa toàn bộ `soul` vào `AGENTS.md`, vì `AGENTS.md` là context luôn bật và sẽ tăng input/cache read của mọi task.

Giải pháp đề xuất:

- Trích 5–8 quy tắc quan trọng nhất thành system prefix dưới 300 tokens.
- Giữ phần chi tiết dưới dạng optional reference hoặc xóa nếu trùng system rules.
- Không cần gọi loader riêng chỉ để nhận các quy tắc phong cách cơ bản.

Prefix tối thiểu:

```text
Use simple language.
Prefer the smallest correct change.
Read relevant files before editing.
Do not modify unrelated work.
Run one relevant check.
Do not commit or push unless asked.
```

---

## 8. Telemetry mức sử dụng

### 8.1. Nguồn dữ liệu

OpenCode `AssistantMessage` cung cấp:

```text
message ID
session ID
provider ID
model ID
agent
cost
input tokens
output tokens
reasoning tokens
cache read
cache write
timestamps
```

Plugin có thể thu thập từ event `message.updated`.

### 8.2. Loại trùng

`message.updated` có thể phát nhiều lần cho cùng message. Usage store phải upsert theo `messageID`, không cộng dồn mỗi event.

Quy tắc:

```text
Khóa chính: messageID
Giá trị mới: snapshot token/cost mới nhất
Aggregate: tính delta hoặc rebuild từ snapshot
Completed message: đánh dấu immutable
```

### 8.3. Quy thuộc dữ liệu

Mỗi record nên gắn:

```json
{
  "messageID": "msg_x",
  "sessionID": "ses_x",
  "projectRoot": "/workspace/project",
  "providerID": "openai",
  "modelID": "gpt-5.6-sol",
  "agent": "build",
  "taskID": "task_x",
  "loadedSkills": ["graphify"],
  "tokens": {
    "input": 12400,
    "output": 1420,
    "reasoning": 0,
    "cacheRead": 182000,
    "cacheWrite": 0
  },
  "cost": 0.42,
  "completedAt": "2026-10-07T14:32:11Z"
}
```

Attribution theo skill chỉ cho biết skill nào hiện diện trong task, không chứng minh toàn bộ token do skill đó gây ra. Report phải ghi rõ đây là correlation.

### 8.4. Lưu trữ

Không nên tiếp tục nhét usage volume lớn vào `state.json` của skill.

Đề xuất:

```text
~/.local/state/openarms/
  skills.json
  policy.json
  usage/
    2026-10.jsonl
  aggregates/
    daily.json
    sessions.json
```

JSONL phù hợp MVP vì append đơn giản và dễ kiểm tra. Nếu query chậm hoặc dữ liệu tăng lớn, migrate sang SQLite sau khi xác nhận runtime tương thích giữa Node và Bun.

---

## 9. Chốt kiểm soát ngân sách

### 9.1. Cấu hình

```json
{
  "budget": {
    "dailyCostUSD": 10,
    "sessionCostUSD": 3,
    "taskFreshInputTokens": 200000,
    "taskOutputTokens": 20000,
    "warnAtPercent": [50, 80, 100],
    "maxOutputTokens": 12000,
    "onLimit": "ask"
  }
}
```

### 9.2. Hành vi

| Mức | Hành vi |
|---:|---|
| 50% | Toast thông tin |
| 80% | Toast cảnh báo kèm phân tích thành phần |
| 100% | Yêu cầu xác nhận trước task tiếp theo |
| Giới hạn cứng | Chặn hoặc yêu cầu đổi policy nếu đã bật enforcement |

### 9.3. Nguyên tắc rollout

- Giai đoạn đầu chỉ quan sát.
- Sau 7–14 ngày mới bật warning.
- Hard limit tắt mặc định.
- Budget ưu tiên cost USD và fresh input.
- Cache read dùng để phát hiện session dài, không dùng làm hard limit duy nhất.
- `chat.params` có thể giới hạn `maxOutputTokens`.
- Việc throw để hủy model request phải được kiểm chứng bằng integration test trước khi dùng.

---

## 10. Bộ quản trị kiểm thử

### 10.1. Mục tiêu

- Agent không chạy full suite sau mỗi chỉnh sửa nhỏ.
- Một script duy nhất chuẩn hóa output.
- Thành công trả một dòng.
- Thất bại trả danh sách test lỗi và tối đa 30 dòng cuối.
- Full log nằm ngoài conversation history.

### 10.2. Các tầng test

| Tầng | Khi chạy | Nội dung |
|---|---|---|
| T0 Syntax | Sau thay đổi code đáng kể | Parse, compile, type-check hoặc lint mục tiêu |
| T1 Related | Trước khi hoàn thành task | Test liên quan file đã sửa |
| T2 Full | Pre-push hoặc CI | Toàn bộ suite |

Không nên chuyển toàn bộ trách nhiệm test ra khỏi agent. Agent vẫn cần T0 và T1 để không báo hoàn tất khi code đang lỗi.

### 10.3. Giao diện script

```bash
scripts/arms-test syntax
scripts/arms-test related
scripts/arms-test full
```

Output pass:

```text
44/44 pass
```

Output fail:

```text
FAIL: shared.test.ts > restores core only
FAIL: server.test.ts > denies unverified skill
Full log: .openarms/logs/test-20261007-143211.log

[last 30 lines]
...
```

### 10.4. Mapping file sang test

MVP dùng manifest tĩnh:

```json
{
  "plugins/shared.ts": ["tests/shared.test.ts"],
  "plugins/server-core.ts": ["tests/server.test.ts"],
  "plugins/tui-core.ts": ["tests/tui.test.ts"]
}
```

Fallback:

| Trường hợp | Test chạy |
|---|---|
| File có mapping | Test đã khai báo |
| File test thay đổi | Chính file test đó |
| Shared/core thay đổi | Full suite |
| File mới chưa có mapping | Test cùng basename hoặc full suite |
| Chỉ docs thay đổi | Không chạy code test |

### 10.5. Hook Git

Full suite nên đặt ở `pre-push` hoặc CI, không nên mặc định đặt ở `pre-commit` nếu suite chậm.

```text
Agent loop → syntax + related
Pre-push   → full suite
CI         → full suite + skill validation
```

---

## 11. Chốt kiểm soát output

### 11.1. Chính sách cắt output

| Điều kiện | Hành vi |
|---|---|
| Output <=100 dòng và <=4,000 tokens | Giữ nguyên |
| Output vượt ngưỡng | Giữ 20 dòng đầu + 30 dòng cuối |
| Test thất bại | Giữ tên test lỗi + 30 dòng cuối |
| Output đầy đủ | Ghi file ngoài context |

Thông báo:

```text
[Truncated 824 lines]
Full log: /tmp/openarms/tool-logs/<session>-<call>.log
Use grep or read with offset if more detail is needed.
```

### 11.2. Tính tất định

Cùng output đầu vào phải tạo cùng output rút gọn. Không thêm timestamp ngẫu nhiên vào nội dung trả về model nếu không cần thiết. Timestamp chỉ nằm trong tên log hoặc metadata ngoài prompt.

### 11.3. Cách triển khai an toàn

Ưu tiên wrapper command có chủ đích như `arms-test`. Không nên tự động rewrite mọi Bash command ngay từ đầu.

Hook `tool.execute.after` có thể compact output, nhưng cần xác nhận:

- Tool result đã bị sửa trước khi model nhận hay chưa.
- Full output có được lưu trước khi truncate hay không.
- Binary và ANSI output được xử lý đúng.
- Không cắt mất thông tin bảo mật hoặc exit code.

---

## 12. Output trình quản lý package và shell

### 12.1. Môi trường tĩnh

```bash
CI=1
NO_COLOR=1
TERM=dumb
PAGER=cat
GIT_PAGER=cat
```

Có thể inject qua `shell.env` nếu không làm thay đổi hành vi test hoặc CLI ngoài mong muốn.

### 12.2. Preset theo tool

| Công cụ | Preset đề xuất |
|---|---|
| npm | `--no-progress --loglevel=error` |
| pnpm | `--reporter=silent` khi phù hợp |
| yarn | `--silent` khi command hỗ trợ |
| pip | `--quiet` |
| Git | `git status --short`, `git diff --stat` trước full diff |

Không tự động thêm `--silent` vào mọi command. Một số command không hỗ trợ flag hoặc sẽ che mất warning quan trọng. stderr, exit code và lỗi cuối phải luôn được giữ.

---

## 13. Truy cập file và chính sách bỏ qua

### 13.1. OpenCode hỗ trợ chính thức

OpenCode có:

- `watcher.ignore` để giảm watcher noise.
- `permission.read` để allow/ask/deny file read.
- `permission.external_directory` để quản lý path ngoài workspace.
- Per-agent permission.

`.opencodeignore` chưa được tài liệu hiện tại xác nhận là access-control mechanism. Không nên dựa vào nó như lớp bảo vệ chính.

### 13.2. Bỏ qua trong watcher

```json
{
  "watcher": {
    "ignore": [
      "node_modules/**",
      "vendor/**",
      ".git/**",
      "dist/**",
      ".next/**",
      "build/**",
      "**/*.log"
    ]
  }
}
```

`watcher.ignore` không ngăn agent đọc file nếu tool được gọi trực tiếp.

### 13.3. Từ chối đọc

```json
{
  "permission": {
    "read": {
      "*": "allow",
      "**/node_modules/**": "deny",
      "**/.git/**": "deny",
      "**/dist/**": "deny",
      "**/.next/**": "deny",
      "**/build/**": "deny",
      "**/vendor/**": "deny",
      "**/*.min.js": "deny",
      "**/*.map": "deny",
      "**/*.log": "deny",
      "**/*.env": "deny",
      "**/*.env.*": "deny",
      "**/*.env.example": "allow"
    }
  }
}
```

Lockfile không nên bị deny tuyệt đối. Dependency, audit và reproducibility task có thể cần đọc lockfile. Policy phù hợp hơn:

```text
Mặc định không đọc lockfile.
Cho phép khi task liên quan install, dependency, audit hoặc build reproducibility.
```

### 13.4. Thư mục bên ngoài

Mục tiêu mới là cho phép làm việc ở nhiều nơi nhưng không cho load skill chưa xác thực.

Phương án cân bằng:

```json
{
  "permission": {
    "external_directory": {
      "*": "allow"
    },
    "skill": {
      "*": "deny"
    },
    "read": {
      "*": "allow",
      "*SKILL.md": "deny"
    },
    "bash": {
      "*": "allow",
      "*SKILL.md*": "deny"
    }
  }
}
```

Native skill vẫn bị deny; verified skill chỉ đi qua OpenArms loader. Nếu dữ liệu nhạy cảm là rủi ro, nên dùng allowlist cho `~/Workspace/**`, `~/Documents/**` và `/tmp/**` thay vì `*`.

---

## 14. Chính sách đọc chọn lọc

Agent nên tuân theo thứ tự:

```text
1. Tìm tên file hoặc symbol.
2. Grep keyword/caller.
3. Đọc block 100–300 dòng quanh match.
4. Mở toàn file chỉ khi file nhỏ hoặc cần toàn bộ cấu trúc.
```

Guardrail đề xuất:

| Loại | Hành vi |
|---|---|
| Binary | Từ chối |
| Minified/source map | Từ chối |
| Output sinh tự động | Mặc định từ chối |
| File >1 MB | Hỏi quyền hoặc yêu cầu đọc đoạn |
| File >2,000 dòng | Cảnh báo, yêu cầu tìm kiếm/đọc đoạn |
| Lockfile | Hỏi quyền theo loại task |
| Log lớn | Từ chối đọc trực tiếp; grep hoặc tail qua wrapper |

Không nên tự động cắt mọi file read vì có thể làm model hiểu sai cấu trúc. Giai đoạn đầu chỉ cảnh báo, deny các loại rõ ràng và đo số byte đã đọc.

---

## 15. Vòng đời session

### 15.1. Không bắt buộc mọi task tạo session mới

“Một task một session” giảm snowball context nhưng cũng gây:

- Mất continuity.
- Phải đọc lại handoff.
- Load lại skill cần thiết.
- Tạo nhiều session khó quản lý.

Policy tốt hơn là rotation theo ngưỡng:

```text
Task đã hoàn tất
AND một trong các điều kiện sau đúng:
  context utilization > 60%
  session cost > budget
  cache read tăng bất thường
  tool output tích lũy vượt ngưỡng
  task mới không liên quan task cũ
→ đề xuất tạo session mới
```

### 15.2. Bàn giao

File đề xuất:

```text
.openarms/progress.md
```

Giới hạn dưới 30 dòng:

```markdown
# Objective
# Completed
# Active
# Decisions
# Verification
# Relevant Files
# Next Step
```

Không chứa:

- Code block dài.
- Stack trace.
- Full diff.
- Tool output.
- Secret hoặc credential.

Không nên tự động xóa handoff sau lần đọc đầu tiên. Nên giữ đến khi session mới xác nhận đã nhận context, tránh mất dữ liệu khi startup lỗi.

### 15.3. Lệnh

```text
/arms handoff
/arms rotate
/arms context
```

MVP chỉ tạo handoff và đề xuất rotation. Tự động mở/đóng session để phase sau khi SDK flow đã ổn định.

---

## 16. Khôi phục và session con

### 16.1. Chính sách khôi phục

Dialog mặc định chọn `No`.

Khi chọn restore:

| Trạng thái | Khôi phục |
|---|---|
| Lựa chọn package | Có |
| Core khả dụng | Có |
| Skill tùy chọn | Không |
| Khóa task | Không |
| Skill đã nạp trong task | Không |
| Lịch sử nạp | Có thể giữ để inspect, không đưa vào context |
| Phê duyệt mismatch | Theo policy |

“Restore core” nghĩa là package được bật với optional list rỗng; core vẫn chỉ load khi task cần.

### 16.2. Chính sách session con

Child session không nên tự động kế thừa skill selection.

| Trạng thái | Session con kế thừa |
|---|---|
| Registry đã xác thực | Có, vì toàn cục |
| Phê duyệt mismatch | Có thể có |
| Skill tùy chọn đã bật | Không mặc định |
| Khóa task | Không |
| Lịch sử nạp | Không |
| Context session cha | Theo OpenCode, ngoài phạm vi OpenArms |

Subagent chỉ được load skill khi parent chỉ định rõ:

```text
withSkill: graphify
```

Giới hạn kỹ thuật: event `session.created` hiện có `parentID` nhưng không có custom skill flag. Cần wrapper tạo subagent hoặc pending metadata keyed theo child/session creation. Không nên giả định flag có sẵn trong native event.

---

## 17. Hồ sơ quyền

OpenCode đã hỗ trợ per-agent permission. OpenArms nên cung cấp preset và validation, không viết lại permission engine.

| Hồ sơ | Đọc/tìm kiếm | Bash | Sửa | Task/subagent |
|---|---|---|---|---|
| Lập kế hoạch | Cho phép | Từ chối hoặc allowlist chỉ đọc | Từ chối | Hỏi quyền |
| Review | Cho phép | `git status/diff/log` | Từ chối | Hỏi quyền |
| Build | Cho phép | Cho phép theo policy | Cho phép | Cho phép |
| Verify | Cho phép | Chỉ wrapper test/build | Từ chối | Từ chối |

Planning không nhất thiết phải cấm toàn bộ Bash. Một allowlist nhỏ cho `git status`, `git diff`, `git log` và command inventory có thể giảm việc model đoán thiếu dữ liệu.

Không bật/tắt tool schema liên tục trong cùng session nếu việc đó làm provider mất cache prefix. Ưu tiên agent profile cố định.

---

## 18. Chốt chống vòng lặp

Không nên dừng ngay sau hai lần fail nếu lỗi đã thay đổi hoặc có tiến triển. Policy chính xác hơn:

```text
Nếu cùng command thất bại hai lần với cùng error signature
AND giữa hai lần không có thay đổi liên quan
→ chặn retry và yêu cầu phân tích nguyên nhân.
```

Error signature có thể gồm:

```text
command
exit code
test names
normalized final error lines
```

Hành vi:

- Không chạy lại command giống hệt.
- Hiển thị lỗi ngắn.
- Đề xuất một bước chẩn đoán mới.
- Chỉ hỏi người dùng khi không còn bước an toàn, có thông tin mới để thử.

---

## 19. Chính sách prefix cache

Thứ tự context nên ổn định:

```text
1. System prompt tĩnh
2. OpenArms rules ngắn và ổn định
3. Tool declarations ổn định
4. Task prompt
5. Verified skill tool result được append khi cần
6. Tool results đã compact
```

Quy tắc:

- Không đặt timestamp hoặc random ID trong system prefix.
- Không liệt kê metadata động dài trong system prompt.
- Không đổi model liên tục trong cùng session nếu cần cache continuity.
- Dùng provider cache key khi provider hỗ trợ và semantics rõ ràng.
- Không sửa message lịch sử chỉ để unload skill trong MVP.
- Bật `compaction.auto` và cân nhắc `compaction.prune: true`.

Cấu hình đề xuất để thử nghiệm:

```json
{
  "compaction": {
    "auto": true,
    "prune": true,
    "reserved": 10000
  }
}
```

Cần đo trước/sau vì pruning có thể làm mất chi tiết tool output mà task dài vẫn cần.

---

## 20. TUI và tập lệnh

Namespace nên đổi dần từ `/skills` sang `/arms` vì phạm vi đã rộng hơn.

```text
/arms status
/arms skills
/arms inspect
/arms verify <skill>
/arms usage [today|session|project|model|skill]
/arms budget
/arms context
/arms test [syntax|related|full]
/arms permissions
/arms handoff
/arms rotate
/arms doctor
```

Tương thích ngược:

```text
/skills → alias của /arms skills trong một giai đoạn chuyển tiếp
```

Ví dụ `/arms usage session`:

```text
Session Usage
Cost          $2.41 / $3.00 (80%)
Fresh input   184K
Cache read    4.2M
Output        18K
Turns         14
Skills        graphify (~1.8K)
Suggestion    Finish this task, then rotate session
```

---

## 21. Mô hình dữ liệu đề xuất

### 21.1. Trạng thái skill

```ts
type SkillGrant = {
  skill: string
  scope: "once" | "session" | "project"
  permission: "ask" | "allow" | "deny"
  grantedAt: string
}
```

### 21.2. Trạng thái task

```ts
type TaskState = {
  taskID: string
  sessionID: string
  loadedSkills: string[]
  startedAt: string
  freshInputTokens: number
  outputTokens: number
  cost: number
}
```

### 21.3. Record sử dụng

```ts
type UsageRecord = {
  messageID: string
  sessionID: string
  projectRoot: string
  providerID: string
  modelID: string
  agent: string
  tokens: {
    input: number
    output: number
    reasoning: number
    cacheRead: number
    cacheWrite: number
  }
  cost: number
  completedAt?: number
}
```

### 21.4. Chính sách

```ts
type OpenArmsPolicy = {
  budget: BudgetPolicy
  skills: SkillPolicy
  tests: TestPolicy
  context: ContextPolicy
  sessions: SessionPolicy
}
```

---

## 22. Cấu trúc codebase mục tiêu

```text
openarms/
  plugins/
    server-plugin.ts
    tui-plugin.tsx
  core/
    config.ts
    policy.ts
    state.ts
    skill-registry.ts
    skill-loader.ts
    usage-observer.ts
    usage-store.ts
    budget-guard.ts
    context-controller.ts
    output-guard.ts
    test-governor.ts
    session-lifecycle.ts
    permission-profiles.ts
  scripts/
    arms-test
    check-skills
    install-hooks
  config/
    registry.json
    policy.json
    test-map.json
  tests/
    skill-registry.test.ts
    skill-loader.test.ts
    usage-observer.test.ts
    usage-store.test.ts
    budget-guard.test.ts
    output-guard.test.ts
    test-governor.test.ts
    session-lifecycle.test.ts
    permissions.test.ts
```

Không cần tách đủ module ngay từ đầu. Chỉ tách khi trách nhiệm và test boundary đã rõ.

---

## 23. Lộ trình triển khai

### Phase 0: Baseline và đặc tả

**Mục tiêu:** Không thay đổi hành vi, chỉ xác định số liệu chuẩn.

- Định nghĩa usage schema.
- Xác định event lifecycle của `message.updated`.
- Ghi snapshot theo message ID.
- Viết `/arms usage` bản read-only.
- Đo ít nhất 7 ngày.

**Tiêu chí hoàn tất:** Tổng mức sử dụng theo ngày khớp báo cáo OpenCode/provider trong sai số chấp nhận được.

### Phase 1: Cải tiến nhanh

**Mục tiêu:** Giảm output rác với rủi ro thấp.

- Thêm `scripts/arms-test`.
- Thêm T0/T1/T2 test policy.
- Lưu full log ngoài context.
- Thêm compact package-manager presets.
- Bật watcher ignore.
- Thử `compaction.prune` có đo lường.

**Tiêu chí hoàn tất:** Agent chỉ nhận một dòng khi test đạt; full suite không chạy lặp trong task thông thường.

### Phase 2: Nạp từng skill đã xác thực

**Mục tiêu:** Giảm context skill và mở external scope an toàn.

- Registry v2 có `verified`, `maxTokens`, `defaultPermission`.
- Thêm `load_verified_skill`.
- Verified-but-disabled dùng `ask`.
- Unverified dùng `deny`.
- Reference path vẫn chịu safe-root validation.
- Package loader cũ được giữ làm compatibility adapter tạm thời.

**Tiêu chí hoàn tất:** Yêu cầu `graphify` chỉ nạp `graphify`, không kéo theo `soul`, `ponytail` hoặc `superpower`.

### Phase 3: Ngân sách và chốt context

**Mục tiêu:** Cảnh báo sớm, chưa hard-block.

- Daily/session/task aggregates.
- Toast 50/80/100%.
- Context growth report.
- Skill token budget CI.
- Large output warning/truncation.

**Tiêu chí hoàn tất:** Người dùng thấy nguyên nhân ngân sách tăng theo model, session và task.

### Phase 4: Chính sách session và subagent

**Mục tiêu:** Giảm snowball và inheritance không cần thiết.

- Restore mặc định `No`.
- Restore package/core only.
- Child không inherit optional skill.
- Handoff dưới 30 dòng.
- Rotation suggestion theo ngưỡng.

**Tiêu chí hoàn tất:** Session mới không tự mang skill tùy chọn; bàn giao đủ để tiếp tục task mà không đọc lại lịch sử dài.

### Phase 5: Thực thi chính sách

**Mục tiêu:** Chặn hành vi vượt policy sau khi telemetry đã tin cậy.

- Optional hard budget.
- Anti-loop signature.
- Plan/review/build/verify profiles.
- Optional model routing.
- Optional automatic session rotation.

**Tiêu chí hoàn tất:** Mọi chặn cứng có override rõ, log audit và test tích hợp.

---

## 24. Bộ kiểm thử cần bổ sung

| Test | Mục tiêu |
|---|---|
| `usage_upsert_is_idempotent` | Một message update nhiều lần không bị cộng trùng |
| `usage_aggregate_by_day_model_session` | Aggregate đúng các chiều |
| `verified_skill_can_ask` | Skill verified nhưng chưa enabled trả approval request |
| `unverified_skill_is_denied` | Skill ngoài registry không thể load |
| `per_skill_loader_is_minimal` | Chỉ skill được yêu cầu được trả về |
| `reference_cannot_escape_skill_root` | Reference không thoát verified root |
| `skill_budget_is_enforced` | Skill vượt token budget làm CI fail |
| `output_truncation_is_deterministic` | Cùng input cho cùng compact output |
| `full_log_is_preserved` | Truncate không làm mất full log |
| `related_test_mapping` | File đổi chạy đúng test |
| `full_test_only_on_explicit_mode` | Agent loop không tự chạy full suite |
| `restore_core_without_optional` | Restore chỉ package/core availability |
| `child_does_not_inherit_optional` | Child session zero optional skill |
| `task_lock_resets_on_new_message` | Lock reset đúng task boundary |
| `project_root_is_consistent` | TUI/server đọc cùng project state |
| `budget_warning_is_not_duplicated` | Một threshold chỉ cảnh báo một lần |
| `hard_limit_has_override` | Enforcement có approval path |
| `anti_loop_uses_error_signature` | Không chặn hai lỗi khác nhau |

Integration tests cần kiểm tra plugin hooks thật của OpenCode, đặc biệt `message.updated`, `tool.execute.after`, `chat.params` và session creation.

---

## 25. KPI đánh giá hiệu quả

### 25.1. KPI chính

| Chỉ số | Baseline | Mục tiêu thử nghiệm |
|---|---:|---:|
| Chi phí/ngày hoạt động | $12.57 | Giảm 20–40% sau 30 ngày |
| Input mới/task | Chưa có | Giảm 30% |
| Cache read/lượt | Chưa có | Giảm 30–50% ở session dài |
| Lượt full test/task | Chưa có | <=1, thường bằng 0 |
| Token output tool/task | Chưa có | Giảm 50% |
| Token skill/task | Chưa có | <=2K cho task một skill |
| Lượt/task | Chưa có | Giảm 20% |
| Tỷ lệ task thành công | Chưa có | Không giảm quá 5% |

Các mục tiêu trên là target thử nghiệm, không phải cam kết trước telemetry.

### 25.2. Báo cáo trước/sau

```json
{
  "taskID": "TASK-102",
  "sessionID": "ses_x",
  "model": "gpt-5.6-sol",
  "turns": 6,
  "tokens": {
    "freshInput": 12400,
    "cacheRead": 182000,
    "output": 1420,
    "reasoning": 0
  },
  "cost": 0.42,
  "testRuns": {
    "syntax": 1,
    "related": 1,
    "full": 0
  },
  "skills": {
    "loaded": ["graphify"],
    "estimatedTokens": 1450
  },
  "toolOutputTokens": 3200,
  "truncations": 1
}
```

---

## 26. Rủi ro và biện pháp giảm thiểu

| Rủi ro | Tác động | Giảm thiểu |
|---|---|---|
| Truncate che mất lỗi quan trọng | Agent sửa sai | Luôn giữ exit code, tên test và full log |
| Targeted test bỏ sót regression | Code lỗi qua T1 | Full suite ở pre-push/CI |
| Budget record cộng trùng | Cảnh báo sai | Upsert theo message ID |
| Per-skill loading thiếu core guidance | Chất lượng task giảm | Cho phép skill khai báo dependency tối thiểu |
| External access quá rộng | Đọc file nhạy cảm | Deny `.env`, credential và secret paths |
| Bash bypass read deny | Permission bị vô hiệu | Bash patterns và system policy tương ứng |
| Restore core-only gây bất ngờ | Skill optional không còn | Dialog mô tả rõ state sẽ restore |
| Session rotation quá thường xuyên | Mất continuity | Chỉ đề xuất theo ngưỡng |
| Hard limit chặn task quan trọng | Gián đoạn | Default `ask`, có override và audit |
| Plugin API experimental thay đổi | Maintenance | Adapter nhỏ, contract tests và pin version |
| Cache prefix bị phá | Chi phí tăng ngắn hạn | System prefix tĩnh, rollout có A/B measurement |

---

## 27. Quy mô dự án sau mở rộng

OpenArms v2 là dự án cỡ medium, không còn là plugin nhỏ.

Ước tính:

```text
10–15 module core/plugin
100–150 automated tests
3 state domains: skill, usage, policy
1 test wrapper
1 optional Git hook installer
1 TUI management surface
1 compatibility layer cho /skills
```

Độ khó:

| Phần | Độ khó |
|---|---|
| Usage collection | Trung bình |
| Dedup và aggregate | Trung bình |
| Per-skill loader | Trung bình–cao |
| Test wrapper | Thấp–trung bình |
| Output guard | Trung bình |
| Budget warning | Trung bình |
| Session lifecycle | Cao |
| Child skill flags | Cao do giới hạn event API |
| Hard enforcement | Cao |
| Model routing | Cao và nên để cuối |

---

## 28. Quyết định kiến trúc khuyến nghị

| Chủ đề | Quyết định |
|---|---|
| Định vị | Runtime governor, không chỉ token counter |
| Skill security | Registry verified allowlist |
| Verified nhưng chưa enabled | `ask` |
| Unverified | `deny` |
| Load granularity | Per-skill/workflow |
| External directories | Tách khỏi skill policy |
| Usage store | JSONL MVP, SQLite khi cần |
| Budget | Observe → warn → enforce |
| Full test | Pre-push/CI |
| Agent test | Syntax + related |
| Session rotation | Theo ngưỡng, không bắt buộc mọi task |
| Restore | Mặc định No; restore package/core only |
| Child session | Không inherit optional skill mặc định |
| `soul` | Prefix tối thiểu, không đưa toàn bộ vào `AGENTS.md` |
| Ignore | `watcher.ignore` + permission, không dựa vào `.opencodeignore` |
| Lockfile | Không đọc mặc định, không deny tuyệt đối |
| Hard blocking | Tắt mặc định đến khi telemetry đáng tin cậy |

---

## 29. Bước triển khai đầu tiên

Sprint đầu tiên chỉ nên gồm:

1. Usage record schema và idempotent store.
2. Hook `message.updated` với dedup theo `messageID`.
3. `/arms usage today` và `/arms usage session`.
4. `scripts/arms-test` với output một dòng hoặc 30 dòng lỗi.
5. Test mapping tối thiểu cho OpenArms.
6. Skill token audit report, chưa enforce.
7. Bật thử `compaction.prune` có feature flag.

Không thay đổi loader, restore hoặc child inheritance trong sprint đầu. Telemetry và test output là hai thay đổi ít rủi ro nhất, đồng thời tạo dữ liệu để quyết định các phase tiếp theo.

### Tiêu chí nghiệm thu sprint đầu

- Usage tổng hợp không cộng trùng message update.
- Có thể xem cost, fresh input, cache read và output theo ngày/session.
- Test pass chỉ trả một dòng.
- Test fail giữ tối đa 30 dòng và có full log path.
- Không làm thay đổi hành vi `/skills` hiện tại.
- Toàn bộ test hiện có tiếp tục pass.

---

## 30. Kết luận

Mở rộng OpenArms là hợp lý, nhưng giá trị lớn nhất không nằm ở việc đếm token. Giá trị nằm ở khả năng liên kết bốn lớp vốn đang tách rời:

```text
Verified skills
Context lifecycle
Tool/test output
Token and cost budget
```

Thứ tự đúng là:

```text
Measure → Reduce waste → Warn → Enforce
```

Ba thay đổi có ROI cao nhất:

1. Chuyển từ package-wide loading sang verified per-skill loading.
2. Chuẩn hóa test/tool output và lưu full log ngoài context.
3. Thu thập usage chính xác trước khi áp budget hoặc tự động rotate session.

Nếu triển khai theo phase, OpenArms có thể giảm context waste đáng kể mà vẫn giữ tính an toàn, khả năng kiểm chứng và chất lượng task. Nếu triển khai đồng thời mọi guardrail, project sẽ có nguy cơ trở thành một lớp orchestration phức tạp hơn chính vấn đề nó đang giải quyết.
