# OpenArms v1: Kế hoạch tối ưu token và cơ chế quản lý context

Đây là **đề xuất lịch sử v1**, không phải mô tả tính năng đã triển khai. Các
đề xuất bỏ restore, cấm lockfile và wrapper `scripts/test.sh` giữ nguyên để đối
chiếu với v2/v3; không thay hướng dẫn chạy hiện hành ở [bảng lệnh](../../testing/testing.md).

**Mục tiêu:** Cắt giảm 60–80% chi phí Cache Read và Input Token trên OpenCode + OpenArms mà không làm giảm tỷ lệ thành công của task.

---

## 0. Chẩn đoán & Bản chất vấn đề

### Dữ liệu thực nghiệm (14/09 – 07/10)

| Chỉ số | Giá trị | Tỷ lệ |
| :--- | :--- | :--- |
| **Cache read** | 298.7M tokens | 92.2% |
| **Input không cache** | 23.4M tokens | 7.2% |
| **Output** | 1.5M tokens | 0.46% |
| **Tỷ lệ Cache Read : Output** | **~200 : 1** | — |

### Kết luận
* **Bản chất tiêu tốn:** Agent không tiêu hao token vì viết mã quá dài, mà do **chạy quá nhiều lượt (turns) lặp lại**, mỗi lượt buộc LLM đọc lại toàn bộ lịch sử ngữ cảnh tích lũy trước đó.
* **Quy luật chi phí:** $\text{Chi phí} \approx \text{Số lượt} \times \text{Độ dài Context}$. Vì tỷ lệ Cache Hit đã đạt ngưỡng ~93%, mục tiêu tối thượng là **giảm số lượt gọi thừa** và **giảm dung lượng context rác**, không phải là tối ưu bộ nhớ đệm.

### Ba nguyên nhân chính gây phình Context
1. **Output rác từ Tool Calls:** Kết quả test 45 bài, stack trace, log package manager, cây thư mục đệ quy bị lưu vĩnh viễn vào history.
2. **Skill không giải phóng:** Nội dung `SKILL.md` sau khi load nằm lì trong context cho đến hết vòng đời session.
3. **Session kéo dài (Snowball Effect):** Chạy 10–15 task trong một session khiến ngữ cảnh của Task 1 bị đọc đi đọc lại ở Task 15.

---

## 1. Chuẩn hóa Quy tắc Session và Vòng đời Skill

Loại bỏ hoàn toàn tính năng thừa kế ngầm để đảm bảo tính cô lập (Zero State).

| Tình huống | Quy tắc mới | Hành vi kỹ thuật |
| :--- | :--- | :--- |
| **Session mới (User tạo)** | `Active Skills = []` | Bắt đầu tuyệt đối từ Zero Context. |
| **Restore Dialog** | Xóa hoàn toàn | Bỏ hộp thoại hỏi khôi phục session cũ; không tự phục hồi selection. |
| **Vòng đời Task** | Một task = Một session | Task kết thúc -> ghi `progress.md` -> Mở session mới. |
| **Subagent Session (Fork)** | Kế thừa quyền, không kế thừa skill | Subagent chạy độc lập; không copy tập skill từ cha. |
| **Subagent load skill** | Cấm mặc định | Từ chối `load_skill_package`, trừ khi cha chỉ định rõ `--with-skill <package>`. |
| **Nhiệm vụ Subagent** | Đơn mục tiêu | Thực thi tác vụ chuyên biệt và chỉ trả về bản tóm tắt ngắn. |
| **Task Lock** | 1 package / 1 prompt task | Giữ nguyên: mỗi task chỉ nạp 1 package; reset khi có user prompt mới. |

### Các điểm can thiệp mã nguồn
* `shared.ts`: Gỡ bỏ hoàn toàn logic khôi phục (`restoreState`) và xóa trường lịch sử project selection trong `state.json`.
* `server-core.ts`: Thêm chốt chặn tại `load_skill_package`: nếu phát hiện `session.parentID` mà không có cờ `--with-skill`, lập tức từ chối và trả về thông báo lỗi ngắn gọn.
* `tui-core.ts` & `skill-router-tui.tsx`: Xóa toàn bộ component và dialog Restore; cập nhật tài liệu README mục 4, 5.

---

## 2. Ngân sách và Thu hồi Skill

### 2.1. Ngân sách kích thước
* **Core skill:** $\le$ 1.5k tokens.
* **Optional skill:** $\le$ 2.0k tokens.
* **References:** Phần diễn giải dài, ví dụ mẫu bắt buộc tách sang thư mục con `references/`. Model chỉ đọc file này khi có tham chiếu rõ ràng trong `SKILL.md`.
* **CI Validation:** Tích hợp script đếm token ước tính ($\approx \text{bytes} / 4$) chạy thẳng trong `npm test` để chặn commit vượt ngân sách.
* **Tối ưu hóa `soul`:** Rút gọn còn dưới 10 dòng quy tắc cốt lõi và tích hợp trực tiếp vào `AGENTS.md` (prefix tĩnh). Không tốn một lượt gọi `load_skill_package`.

### 2.2. Cơ chế thu hồi skill
1. **Ưu tiên số 1 (Mặc định):** Đóng session hiện tại và mở session mới theo từng task (giải phóng tự nhiên, không làm vỡ cache prefix).
2. **Lệnh `/skills unload <package>`:**
   * Xóa package khỏi session state trong `state.json` và mở lại Task Lock.
   * *Xử lý History:* Nếu plugin API của OpenCode cho phép chỉnh sửa tin nhắn, thay thế tool result của `load_skill_package` cũ bằng stub ngắn gọn: `[System: Skill <package> unloaded]`.
   * *Đánh đổi Cache:* Việc sửa message cũ sẽ làm mất cache từ vị trí đó trở đi một lần duy nhất. Chỉ dùng khi session buộc phải kéo dài và các lượt tiếp theo đủ nhiều để bù đắp chi phí.

### 2.3. Giám sát chi phí Skill Runtime
* Lưu trữ metadata tại `state.json`: package name, skill list, byte size, token ước tính, timestamp, session ID.
* Bật TUI Toast thông báo: `Loaded <package>: ~X.Xk tokens`.
* Đặt cảnh báo tự động: Khi tổng token của các skill đã load trong 1 session vượt quá **10k tokens**, TUI cảnh báo người dùng nên mở session mới.

---

## 3. Cấu trúc Prompt tối ưu hóa Cache Prefix

Các LLM Provider (DeepSeek, OpenAI, Anthropic) yêu cầu chuỗi prompt phải **khớp chính xác từng byte từ đầu (exact prefix matching)** mới kích hoạt Cache Hit.

### Thứ tự lắp ghép bắt buộc
```text
┌────────────────────────────────────────────────────────┐
│ 1. System Prompt tĩnh + AGENTS.md (Cố định 100%)       │ ──> Cache Hit tuyệt đối
├────────────────────────────────────────────────────────┤
│ 2. Router Instructions cố định (Không đổi)             │ ──> Cache Hit tuyệt đối
├────────────────────────────────────────────────────────┤
│ 3. Tool Declarations / Schemas                         │ ──> Không được đột biến
├────────────────────────────────────────────────────────┤
│ 4. Loaded Skills (Nằm trong Tool Results - Append-only)│ ──> Cache kế thừa nội bộ
├────────────────────────────────────────────────────────┤
│ 5. Task Prompt & Workspace State (Biến thiên)          │ ──> Cache Miss chấp nhận
└────────────────────────────────────────────────────────┘
```

### Quy tắc bất khả xâm phạm

- **Không chèn biến động:** Tuyệt đối không đặt timestamp, mã hash ngẫu nhiên, hoặc dynamic session ID vào đầu system prompt.
    
- **Không đột biến Tool Schema:** Không bật/tắt tool giữa các turn trong cùng một session vì hành vi này thay đổi schema ở phần đầu, làm vỡ sạch cache của toàn bộ session.
    
- **Cố định Model ID:** Giữ nguyên một model ID xuyên suốt session. Việc chuyển đổi qua lại giữa các model sẽ phá hủy ngữ cảnh cache.
    
- **Cố định `prompt_cache_key`:** Thiết lập khóa định danh ngữ cảnh cố định theo workspace nếu provider hỗ trợ.
    

## 4. Chốt chặn output không cần thiết

### 4.1. Chốt cắt output cứng (tầng server adapter)

Cài đặt hook chặn tại `tool.execute.after` cho toàn bộ các lệnh CLI (`bash/exec`) và `read_file`:

|**Tiêu chí**|**Hành vi xử lý**|
|---|---|
|**Ngưỡng kích hoạt**|Output vượt quá **100 dòng** hoặc **4.000 tokens**.|
|**Thuật toán cắt**|Giữ **20 dòng đầu** (bối cảnh) + **30 dòng cuối** (kết quả/lỗi).|
|**Lưu trữ ngoài**|Toàn bộ output gốc được ghi ra `/tmp/opencode/tool-logs/<session>-<tool_id>.log`.|
|**Thông báo đính kèm**|`[Truncated: Đã ẩn N dòng. Log đầy đủ tại: <path>. Hãy dùng grep hoặc đọc theo offset]`|
|**Tính tất định**|Cùng một input lệnh phải cho ra cùng một output cắt gọt để bảo toàn Cache Hit.|

### 4.2. Chặn duyệt thư mục vô tội vạ

- Giới hạn `max_depth = 2` (tối đa 3 nếu đi kèm glob pattern cụ thể).
    
- Giới hạn số lượng phần tử trả về `max_entries = 50`. Khi vượt ngưỡng, hiển thị: `... (còn N mục bị ẩn)`.
    
- **Chặn các lệnh nguy hiểm:** Cấm hoàn toàn `find .` không có `-maxdepth`, `ls -R`, `tree` không có cờ `-L`.
    
- **Thông báo hướng dẫn chuẩn:** _`Lệnh bị chặn. Hãy sử dụng glob("src/**/*.ts") hoặc grep("<keyword>") để thu hẹp phạm vi.`_
    

### 4.3. Chặn đọc file rác qua Configuration & Ignore

- Cấu hình danh sách loại trừ qua `.opencodeignore` hoặc `permission.read.deny` trong `opencode.json`:
    ```
    {
      "permission": {
        "read": {
          "*": "allow",
          "**/node_modules/**": "deny",
          "**/.git/**": "deny",
          "**/dist/**": "deny",
          "**/build/**": "deny",
          "**/.next/**": "deny",
          "**/vendor/**": "deny",
          "**/*.min.js": "deny",
          "**/*.map": "deny",
          "**/package-lock.json": "deny",
          "**/pnpm-lock.yaml": "deny",
          "**/yarn.lock": "deny",
          "**/go.sum": "deny",
          "**/*.log": "deny"
        }
      }
    }
    ```
    

### 4.4. Chuẩn hóa môi trường thực thi ít output

- Ép các biến môi trường sau cho mọi tiến trình shell con do agent khởi tạo:
    ```bash
    export CI=1
    export NO_COLOR=1
    export TERM=dumb
    export PAGER=cat
    export GIT_PAGER=cat
    ```
    
- Bổ sung cờ giảm verbose cho package manager:    
    - `npm`: `--silent --no-progress --loglevel=error`
    - `pip`: `-q`
    - `go`: `-q` (nếu hỗ trợ)
- **Kỷ luật Git Diff:** Khi agent cần kiểm tra các file đã chỉnh sửa, hướng dẫn dùng `git status -s` hoặc `git diff --stat` trước; chỉ chạy `git diff <file>` trên từng file mục tiêu.
    

## 5. Pipeline kiểm thử phân tầng và smoke đúng mục tiêu
### 5.1. Nguyên tắc tách biệt
- **Agent loop:** Tuyệt đối không để agent tự ý chạy toàn bộ 45 bài smoke test sau mỗi lần sửa code nhỏ.
- **Pre-push hook:** Di chuyển toàn bộ test suite (45 tests) ra ngoài vòng lặp agent, chạy tự động cục bộ trước khi đẩy code (`git push`).

### 5.2. Wrapper Script duy nhất: `scripts/test.sh`
Mọi thao tác kiểm thử của agent bắt buộc phải gọi qua script bọc duy nhất này:
```Bash
#!/usr/bin/env bash
# scripts/test.sh: Bọc kiểm thử tinh gọn cho Harness
set -uo pipefail

TARGET=${1:-"--affected"}
LOG_FILE="/tmp/opencode/test-run.log"

run_test() {
  if [ "$TARGET" = "--all" ]; then
    # Full suite cho pre-push hook
    npm test -- --bail > "$LOG_FILE" 2>&1
  else
    # Chỉ chạy targeted test dựa trên git diff
    npx jest --bail --findRelatedTests $(git diff --name-only HEAD) > "$LOG_FILE" 2>&1
  fi
}

if run_test; then
  TOTAL=$(grep -c "✓" "$LOG_FILE" || echo "All")
  echo "TESTS PASSED (${TOTAL} tests)."
  exit 0
else
  echo "TESTS FAILED."
  echo "--- 30 lines of errors ---"
  tail -n 30 "$LOG_FILE"
  echo "--- Log file saved: $LOG_FILE ---"
  exit 1
fi
```

### 5.3. Chiến lược kiểm thử theo tầng

|**Tầng**|**Thời điểm kích hoạt**|**Lệnh thực thi**|**Mục tiêu**|
|---|---|---|---|
|**T0 (Cú pháp)**|Sau mỗi lần sửa code|`tsc --noEmit` hoặc `go vet`|Kiểm tra lỗi cú pháp và type ranh giới.|
|**T1 (Đơn vị)**|Kết thúc 1 task|`scripts/test.sh --affected`|Chỉ chạy test liên quan trực tiếp đến file đổi.|
|**T2 (Hệ thống)**|Trước khi Push / PR|Git Hook: `scripts/test.sh --all`|Kiểm tra toàn bộ 45 bài test cục bộ trên máy.|

#### Quy định công cụ cho T1 theo từng nền tảng
- **NestJS / NextJS (Jest):** `jest --findRelatedTests <files> --bail`
- **NextJS / TypeScript (Vitest):** `vitest related --run <files>`
- **Golang:** Lấy danh sách package đổi qua `git diff --name-only` và chạy `go test -v <packages>`
- **Cách dự phòng:** Nếu file sửa là file mới chưa được import hoặc không tìm thấy quan hệ test, script chạy file test liền kề cùng thư mục (`path/to/__tests__/*.spec.ts`).
    

## 6. Phân tách quyền theo chế độ
Để bảo vệ cache prefix, không bật/tắt quyền động trong cùng một session. Thay vào đó, phân tách thành 2 chế độ/agent rõ ràng:

|**Chế độ**|**Danh mục quyền cho phép**|**Mục đích sử dụng**|
|---|---|---|
|**Plan Mode**|`read_file`, `glob`, `grep`, `list_dir`. Cấm tuyệt đối `write_file`, `bash/exec`.|Phân tích bài toán, đọc code, lập kế hoạch. Không sinh ra vòng lặp sửa lỗi tốn kém.|
|**Build Mode**|Cấp đầy đủ quyền ghi mã và chạy lệnh qua `scripts/test.sh`.|Hiện thực hóa mã nguồn theo spec đã thống nhất từ Plan Mode.|

## 7. Kỷ luật Làm việc & Bàn giao Session
### 7.1. Chốt chặn vòng lặp sửa lỗi
- Bổ sung vào `AGENTS.md`:
    > _"Nếu chạy test hoặc build thất bại 2 lần liên tiếp với cùng một lỗi, DỪNG LẠI NGAY LẬP TỨC. Tóm tắt nguyên nhân nghi vấn và yêu cầu người dùng định hướng. Cấm tuyệt đối việc thử sai mù quáng hoặc chạy lại cùng một lệnh test mà chưa sửa code."_
    

### 7.2. Chuẩn hóa Schema bàn giao `progress.md`
Khi kết thúc một task, agent phải tóm tắt trạng thái vào `.opencode/progress.md`. File này có cấu trúc cố định và **không được vượt quá 30 dòng**:

```md
### Session Handoff
- **Task hoàn thành:** [Tóm tắt 1 câu ngắn gọn]
- **Files đã sửa đổi:** [Danh sách path, tối đa 5 file quan trọng]
- **Nhiệm vụ tiếp theo:** [Gạch đầu dòng yêu cầu cụ thể tiếp theo]
- **Ghi chú & Blockers:** [Tối đa 2 dòng cảnh báo, không dán code/stack trace]
```

- **Cơ chế tải tự động:** Ở lượt đầu tiên của session mới, router tự động đọc `.opencode/progress.md` làm context mở đầu, sau đó agent xóa nội dung cũ để chuẩn bị cho chu kỳ tiếp theo.
    
- **Server Hook Kiểm tra:** Server adapter từ chối lệnh ghi nếu file `progress.md` chứa code block (```) hoặc vượt quá 30 dòng.
    

## 8. Đo lường Baseline & Đánh giá Hiệu quả

Thực hiện đo lường trước và sau khi kích hoạt các giải pháp trên. Mọi lượt task ghi 1 dòng log dạng JSON Lines vào `.opencode/metrics.jsonl`:

```json
{
  "task_id": "TASK-102",
  "session_id": "sess-xyz",
  "model": "gpt-5.6-sol",
  "turns": 6,
  "tokens": {
    "input_fresh": 12400,
    "cache_read": 182000,
    "output": 1420
  },
  "peak_context": 34500,
  "test_runs": 2,
  "skills_loaded_tokens": 1450,
  "truncations_triggered": 1
}
```

## 9. Bộ kiểm thử Mới cho OpenArms (`tests/`)
Bổ sung các automated tests sau vào bộ test suite hiện tại:
1. `test_skill_budget`: Quét toàn bộ thư mục `skills/`, xác nhận dung lượng token mỗi core skill $\le$ 1.5k và optional skill $\le$ 2.0k.
2. `test_child_session_isolation`: Khởi tạo child session, đảm bảo `Active Skills = []` và chặn `load_skill_package` khi không có cờ `--with-skill`.
3. `test_zero_state_on_new_session`: Kiểm tra session mới luôn có trạng thái skill rỗng, không hiển thị dialog restore.
4. `test_output_truncation_deterministic`: Đưa vào mock stdout 500 dòng, kiểm tra server adapter cắt đúng 20 dòng đầu + 30 dòng cuối và ghi đủ file log.
5. `test_directory_traversal_guard`: Thử thực thi lệnh `find .` hoặc `tree`, xác nhận plugin chặn thành công và trả về thông báo chuẩn.
6. `test_progress_schema_validation`: Thử ghi file `progress.md` chứa code fence hoặc > 30 dòng, xác nhận server chặn thao tác ghi thành công.

## 10. Lộ trình Triển khai theo Thứ tự Ưu tiên

```plaintext
[Giai đoạn 1: Chốt chặn Output & Test]
  ├── 1. Viết scripts/test.sh (Silent, bail, output 1 dòng hoặc 30 dòng lỗi).
  ├── 2. Cài đặt Hard Truncation Guardrail trong plugin Server Adapter.
  └── 3. Ép biến môi trường tĩnh (CI=1, NO_COLOR=1, TERM=dumb).

[Giai đoạn 2: Tái cấu trúc Vòng đời Session]
  ├── 4. Bỏ hoàn toàn Restore Dialog; áp dụng Zero State cho mọi session mới.
  ├── 5. Áp dụng kỷ luật: 1 Task = 1 Session + Schema progress.md bắt buộc.
  └── 6. Cấm Subagent kế thừa skill ngầm định.

[Giai đoạn 3: Ngân sách Skill & Tối ưu Prefix]
  ├── 7. Di chuyển 'soul' vào AGENTS.md; kiểm soát ngân sách Core/Optional skills.
  ├── 8. Chặn duyệt thư mục đệ quy và cấu hình .opencodeignore đầy đủ.
  └── 9. Viết bộ kiểm thử tự động xác thực các điều kiện chặn (tests/).
```
