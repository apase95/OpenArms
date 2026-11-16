# OpenArms v3: Quản trị runtime tinh gọn và kiến trúc theo rủi ro

**Trạng thái:** Đặc tả kiến trúc tinh gọn và kế hoạch thực thi  
**Dựa trên:** Đánh giá phản biện v2, hiện trạng OpenArms và bài toán tối ưu token/chi phí thực tế trong OpenCode  
**Mục tiêu chính:** Tối ưu hóa context và chi phí vận hành với độ phức tạp tối thiểu (phù hợp năng lực một lập trình viên duy trì), loại bỏ suy đoán bằng telemetry per-tool-call, và triệt tiêu rủi ro API trước khi cam kết triển khai.

Đây là **đề xuất lịch sử v3**, không phải biên bản nghiệm thu. Phase 0 trong
roadmap hiện hành ưu tiên phản hồi nhanh/chi phí kiểm thử, khác Phase 0 đề xuất
dưới đây. Xem [tổng kết Phase 0](../phase0-review.md), [Phase 1](../phase1-review.md)
và [hướng dẫn sandbox](../../testing/how_to_test/Sandbox.md) cho bằng chứng/giới hạn hiện tại.

[Sprint 2.2](../sprints/report_sprint_22.md) đã viết standalone verified core;
[Sprint 2.3](../sprints/report_sprint_23.md) nối sole verified tool/persisted grants
trong source, bỏ package loader và Reference root. Library thật chưa migrate;
v1 content fail-closed, live host acceptance còn chờ. [Contract hiện hành](../../testing/how_to_test/Sprint_23.md)
không đồng nhất với schema/examples và Reference root baseline trong báo cáo này.

---

TUI approval/status và production action-contract fixture hiện hành xem
[Sprint 2.4](../../testing/how_to_test/Sprint_24.md). Không phải renderer/PTY proof;
schema/Reference root và roadmap bên dưới vẫn là proposal lịch sử.

## 1. Tóm tắt định hướng v3: Tinh gọn và Thực tế

Phiên bản v2 đề xuất một hệ thống governance toàn diện nhưng gặp phải cảnh báo về sự phình to kiến trúc (**Architecture Bloat**): 10–15 module và 150 tests là quá tải đối với năng lực duy trì của một người. Đồng thời, v2 có các lỗ hổng kỹ thuật: thiếu dữ liệu đo đạc chi tiết từng tool call, cơ chế "verified" chưa bảo mật content hash, và phụ thuộc vào các API giả định chưa được kiểm chứng.

OpenArms v3 tái định hình chiến lược:

1. **Thu gọn bề mặt kiến trúc:** Gộp các thành phần có cùng vòng đời, giảm từ 10+ module xuống còn **4 module cốt lõi** trong giai đoạn đầu.
2. **Quyết định dựa trên dữ liệu thật (Per-Tool Telemetry):** Không tối ưu hóa hay viết bộ lọc phức tạp dựa trên cảm tính; đo lường chính xác dung lượng từng tool call trước khi can thiệp.
3. **De-risk ngay tại Phase 0:** Làm spike kiểm chứng giới hạn API của OpenCode trước khi viết roadmap cho Phase 3–4.
4. **Bảo mật chuỗi cung ứng kỹ thuật số:** Skill được verified bằng `contentHash` (SHA-256), không chỉ dựa vào đường dẫn tĩnh.
5. **Cơ chế Shadow Mode & Safety Nets:** Policy tối ưu mới chạy thử nghiệm (dry-run) để tránh chặn nhầm; invariant integrity/safe path vẫn có hiệu lực, hard cap 50KB độc lập với logic mềm.

---

## 2. Tinh gọn Module: Tối giản ranh giới code

Thay vì phân tán thành 10–15 files/modules gây gánh nặng bảo trì và duplicate types, Phase 0–2 chỉ tập trung vào 4 khối chức năng:

| Khối đề xuất v3 | Module v2 gộp vào | Lý do gộp |
|---|---|---|
| **`telemetry`** | `usage-observer` + `usage-store` | Thu thập và lưu trữ luôn đi cùng nhau. Gộp lại giảm phân mảnh I/O và interface trung gian. |
| **`output-governor`** | `output-guard` + `test-governor` | Đều có bản chất là "chuẩn hóa/cắt gọt text trước khi đẩy vào context". Dùng chung core logic: truncation, ANSI stripper, log offloading. |
| **`verified-registry`** | `skill-registry` + `skill-loader` | Quản lý schema, xác thực SHA-256 hash và trả về nội dung skill hợp lệ. |
| **`policy-preset`** | `permission-profiles` | **Không viết code module riêng**. Triển khai hoàn toàn dưới dạng declarative config JSON mapping với per-agent settings của OpenCode. |

---

## 3. Kiến trúc Telemetry: Bổ sung Per-Tool-Call Metrics

Sai lầm lớn nhất của v2 là chỉ theo dõi ở tầng `message.updated` (cấp assistant). Điều này không chứng minh được giả thuyết nguồn phình context đến từ đâu. v3 tách telemetry thành hai tầng rõ rệt:

### 3.1. Hook `tool.execute.after` (Bằng chứng tiêu tốn per-tool)

Mỗi lần một tool được thực thi, telemetry ghi nhận:

```json
{
  "schemaVersion": 1,
  "type": "tool_call",
  "tool": "bash",
  "command": "npm test",
  "outputBytes": 48291,
  "estimatedTokens": 12072,
  "sessionID": "ses_abc123",
  "messageID": "msg_xyz789",
  "timestamp": "2026-10-07T16:00:00Z"
}
```

Dữ liệu này là căn cứ duy nhất để trả lời: *Có thực sự cần tốn công build output truncation cho linter hay chỉ riêng test log mới gây tốn token?*

### 3.2. Loại trùng và quản lý phiên bản schema

* **`schemaVersion` bắt buộc:** Bổ sung trường `schemaVersion: 1` cho toàn bộ file state: `registry.json`, `state.json`, `usage/*.jsonl`. Tuyệt đối không để xảy ra tình trạng đoán cấu trúc object khi migrate.
* **Idempotent upsert:** Vẫn giữ nguyên khóa chính `messageID` tại `message.updated` để không bị cộng dồn token khi OpenCode stream response.

---

## 4. Bảo mật skill đã xác thực: gắn mã băm nội dung

Chỉ dùng flag `verified: true` và đường dẫn file là lỗ hổng nghiêm trọng (khi `SKILL.md` bị chỉnh sửa vô tình hoặc bị tấn công chuỗi cung ứng, flag vẫn giữ nguyên).

### 4.1. Cấu trúc Registry v3

```json
{
  "schemaVersion": 2,
  "skills": {
    "graphify": {
      "path": "skills/graphify/SKILL.md",
      "contentHash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "package": "shared-skills",
      "maxTokens": 2000,
      "defaultPermission": "ask"
    }
  }
}
```

### 4.2. Quy tắc thực thi

1. **Kiểm tra runtime:** Trước khi load, tính SHA-256 của file `SKILL.md`. Nếu hash không khớp với `registry.json`, trạng thái lập tức hạ về `unverified` và hành động load bị **`deny`**.
2. **Kiểm tra CI/test:** Bộ test tự động kiểm tra tính toàn vẹn: nếu ai đó commit file skill mới mà không chạy script cập nhật hash trong registry, CI sẽ báo lỗi ngay lập tức.

Hash chỉ xác nhận bytes khớp revision đã đăng ký, không xác nhận skill an toàn
hoặc đúng. Nguồn/revision phải được operator chấp nhận riêng; nếu cùng một actor
sửa cả skill và registry, hash không tạo một trust anchor độc lập.

---

## 5. Thử nghiệm giảm rủi ro: thực hiện ngay tại Phase 0

Trước khi lên kế hoạch cho Phase 3 và Phase 4, cần thực hiện 2 spike kỹ thuật độc lập (thời gian tối đa 1–2 ngày) nhằm kiểm tra giới hạn của OpenCode Plugin API:

* **Spike 1: Hủy model request bằng `chat.params`**
  * *Vấn đề:* Liệu việc `throw Error` hoặc can thiệp params trong runtime hook có thể cancel request một cách an toàn mà không làm crash TUI / UI của OpenCode hay không?
  * *Hành động:* Viết một plugin thử nghiệm đơn giản chặn request khi output vượt 1,000 tokens. Nếu API không hỗ trợ hủy gracefully, **bỏ ý định xây dựng Hard Limit enforcement**; chuyển toàn bộ sang cảnh báo người dùng (soft warning).
* **Spike 2: Truyền metadata cho Child Session qua `session.created`**
  * *Vấn đề:* Event `session.created` chỉ có `parentID`, không có cờ custom. Liệu có thể truyền thông tin cô lập skill cho subagent thông qua shared in-memory map hoặc pending state hay không?
  * *Hành động:* Kiểm tra xem OpenCode có cung cấp context bridge giữa parent và child session hay không. Nếu không, chuyển sang mô hình: subagent luôn mặc định `zero-skill` trừ khi người dùng cấp lệnh tường minh.

---

## 6. Output & Test Governor: Thiết kế an toàn và bền vững

### 6.1. Chốt an toàn cứng 50KB

Độc lập với mọi logic truncate thông minh hay quy tắc heuristic:

* Tầng interceptor thấp nhất đặt một **Hard Cap tuyệt đối: 50KB**.
* Bất kể tool nào trả về output vượt 50KB, nếu logic truncate gặp lỗi hoặc không kịp bắt, interceptor sẽ cắt ngang tại byte thứ 50,000, ghi toàn bộ ra `/tmp/openarms-overflow.log` và đính kèm cảnh báo: `[CRITICAL: Output exceeded hard safety limit of 50KB. Truncated.]`.
* Điều này bảo đảm bug logic trong module governor không bao giờ làm sập context window của agent.

### 6.2. Phát hiện lệch mapping kiểm thử

File tĩnh `test-map.json` rất dễ bị lạc hậu khi project thêm file mã nguồn mới:

* Bổ sung automated test kiểm tra liên tục (**Drift Test**):
  ```ts
  test("test_map_coverage_drift", () => {
    // Quét toàn bộ file .ts trong thư mục src/plugins/
    // Fail test nếu phát hiện file .ts không có mặt trong test-map.json
    // và không có file test tương ứng theo quy chuẩn basename (ví dụ: foo.ts -> foo.test.ts)
  });
  ```
* Bắt buộc lập trình viên phải khai báo bài test liên quan khi tạo module mới, giữ cho chính sách T1 (Related Test) luôn có hiệu lực.

### 6.3. Đọc lockfile theo nhu cầu, giảm context

Lockfile là dữ liệu project hợp lệ cho dependency review, audit, CI debugging
và reproducibility, kể cả trước khi chạy install.

* Ưu tiên search và đọc range liên quan; đọc toàn file khi task cần.
* File lớn có thể cảnh báo dung lượng hoặc ask theo cấu hình host.
* Không dùng install history hoặc cửa sổ ba tool calls làm permission gate.
  Telemetry đo bytes và hiệu quả truy xuất, không xây permission engine mới.

---

## 7. Cơ chế "Shadow Mode" cho Enforcement

Không bật policy tối ưu chặn thao tác chỉ theo mốc thời gian (như 7 hay 14 ngày). Policy tối ưu mới phải trải qua **Shadow Mode**:

```text
Request / Tool Output
        │
        ▼
┌────────────────────────┐
│  Kiểm tra Policy       │
└───────┬────────────────┘
        │
        ├──[ Vi phạm policy ]──► Ghi log: [SHADOW DENY: would have blocked {reason}]
        │                        (Không chặn, cho phép tiếp tục bình thường)
        │
        └──[ Phù hợp policy ]──► Cho phép tiếp tục
```

* Sau một tuần hoạt động, xem xét log `SHADOW DENY`. Nếu phát hiện có các tình huống chặn sai lệch gây hại đến luồng lập trình bình thường (False Positives), tiến hành điều chỉnh policy trước khi chuyển cờ từ `shadow` sang `active`.

Shadow Mode áp dụng cho policy tối ưu mới, không áp dụng cho invariant bắt buộc
như từ chối path escape hay hash mismatch. Activation dựa trên dữ liệu, capability
của host và override, không chỉ thời gian. Instruction là hướng dẫn; loader chỉ
kiểm soát nội dung nó trả; filesystem/shell/network do OpenCode hoặc sandbox
thực thi. Bash pattern theo tên file không bảo đảm cô lập toàn máy.

Reference hiện được truy cập từ `Reference root` do package loader cấp và theo
permission host. Phase 2 bổ sung `load_verified_skill({ skill, workflow?, reference? })`:
reference ID thuộc allowlist được trả qua cùng authorization/hash/safe-path flow.
Chỉ bỏ absolute path khỏi response khi contract reference này đã hoạt động.

---

## 8. Lộ trình triển khai v3

```text
Phase 0: De-risk, Telemetry & Integrity
   │
   ├── 1. Thực hiện 2 Spikes (chat.params cancel & child session metadata)
   ├── 2. Thêm telemetry per-tool-call (ghi log bytes/tokens của tool)
   ├── 3. Gắn contentHash SHA-256 vào registry & viết drift test
   └── 4. Thêm schemaVersion vào toàn bộ các state files
   │
Phase 1: Quick Wins & Output Governor
   │
   ├── 1. Gộp test wrapper + hard cap 50KB thành module output-governor
   ├── 2. Đưa full test log ra file ngoài context; thành công trả 1 dòng
   └── 3. Bật Shadow Mode cho policy đọc file (lockfiles, minified files)
   │
Phase 2: Granular Verified Loader
   │
   ├── 1. Thay thế load_skill_package bằng load_verified_skill
   ├── 2. Triển khai phân tách SKILL.md: Interface (<150 tokens) vs References
   └── 3. Hệ thống chỉ cho phép load skill khớp SHA-256 hash
   │
Phase 3: Context Rotation & Budget (Tùy thuộc kết quả Spike Phase 0)
   │
   ├── 1. Cảnh báo rotation dựa trên ngưỡng (Context > 60% hoặc Chi phí > budget)
   └── 2. Tạo handoff progress.md (<30 dòng) trước khi xoay vòng session
```

---

## 9. Ba việc cần thực hiện ngay lập tức

1. **Spike API OpenCode (Ưu tiên số 1):** Xác minh khả năng hủy request qua `chat.params` và khả năng truyền metadata sang child session trong `session.created`.
2. **Tool-level Telemetry Hook:** Cắm hook vào `tool.execute.after`, xuất dữ liệu log kích thước thực tế của từng tool để xác minh đích danh nguồn gây tốn token.
3. **Thêm SHA-256 Hash vào `registry.json`:** Khóa bảo mật toàn bộ các file `SKILL.md` hiện có bằng mã băm nội dung để bảo vệ tính toàn vẹn của skill library.
