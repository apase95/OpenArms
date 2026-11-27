# Harness notes — tham khảo, không phải roadmap

[← Mục lục](README.md)

Trang đọc tùy chọn, rút gọn từ nghiên cứu trước redesign. URL nhánh `main` và docs bên
ngoài có thể thay đổi; pin revision nếu đưa một API/behavior vào implementation.
“Aiden” trong yêu cầu ban đầu được tạm hiểu là **Aider**, chưa xác nhận một sản phẩm khác.

## Bản đồ so sánh

| Harness | Mô hình đáng chú ý | Bài học phù hợp OpenArms | Không nên sao chép |
|---|---|---|---|
| Pi | Agent/session core dùng chung cho TUI, JSON, RPC, SDK | Tách history, model context và extension state; skills on-demand | Viết thêm loop/session DB cạnh tranh với OpenCode |
| OpenCode | Host sở hữu loop, persistence, permissions, native skills và plugin hooks | Adapter mỏng, capability checks và error states rõ | Direct SQL vào DB host hoặc áp API nhánh dev cho host cũ |
| Claude Code | Gather context → act → verify; lifecycle hooks và observability | Verification dựa trên evidence; error handling theo hook contract | Thêm telemetry/workflow platform chỉ vì harness khác có |
| Aider | Selected files + repo map → model → structured edits → feedback | Chọn context liên quan trước khi đọc; feedback rõ khi thiếu evidence | Làm indexer/multi-agent framework trước khi có nhu cầu thực tế |

Đây là mô tả tài liệu/source được khảo sát, không phải benchmark hay chứng nhận security.
Claude Code không công khai toàn bộ implementation; không suy ra kiến trúc nội bộ từ docs UX.

## Nguồn chính thức để đọc sâu

### Pi

- [How Pi Works](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/how-pi-works.md)
- [Agent core: context transforms, steering/follow-up, tool scheduling](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)
- [JSONL session tree và compaction](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md)

Compaction đổi context dựng cho request sau, không đồng nghĩa xóa history. Custom extension
state không nhất thiết đi vào model context. Tools/extensions vẫn chạy theo quyền process;
minimal core không tự tạo sandbox.

### OpenCode

- [Native skill discovery v1.19.3](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/skill/index.ts)
- [Native skill tool v1.19.3](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/tool/skill.ts)
- [Session loop v1.19.3](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/session/prompt.ts)
- [Configuration](https://opencode.ai/docs/config/)

Nguồn khảo sát pin `v1.19.3`; SDK declarations của dự án pin riêng theo package lock.
Source/typecheck không thay live compatibility test. After-hook không thể ngăn side effect
đã xảy ra; step limit không tự tương đương hard cost/token budget.

### Claude Code

- [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)
- [Hooks reference](https://code.claude.com/docs/en/hooks)
- [Monitoring / OpenTelemetry](https://code.claude.com/docs/en/monitoring-usage)

Transcript, operational events và artifacts phục vụ mục đích khác nhau. Checkpoint,
permission và OS isolation không thay thế nhau. OpenArms hiện chỉ cần output artifacts,
không triển khai hệ thống telemetry đầy đủ theo mẫu đó.

### Aider

- [Repository map](https://aider.chat/docs/repomap.html)
- [Architect/chat modes](https://aider.chat/docs/usage/modes.html)
- [Edit formats](https://aider.chat/docs/more/edit-formats.html)
- [Configuration options](https://aider.chat/docs/config/options.html)

Repo map dùng symbols/dependency ranking để chọn context theo budget; architect/editor
separation là tùy chọn, không chứng minh nhiều agent luôn tốt hơn. Raw LLM history dùng
cho debug vẫn cần privacy policy riêng.

### Đọc bổ sung

- [Codex core: platform sandbox assumptions](https://github.com/openai/codex/blob/main/codex-rs/core/README.md):
  boundary OS thực tế không được thay bằng regex Bash hoặc prompt.
- [Anthropic: effective long-running harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents):
  progress/feature evidence giúp nối công việc; không phải yêu cầu OpenArms khôi phục handoff/auto-commit.

## Khi cân nhắc áp dụng một ý tưởng

1. Có use case thuộc browser hoặc output compactor không?
2. Host đã làm được chưa? Có supported API thay vì engine riêng không?
3. Có testable contract, failure/privacy story và lợi ích đủ bù maintenance không?
4. Nếu vượt scope, cần quyết định mới; không tự khôi phục backlog control-plane trước đây.

Bản nghiên cứu dài và audit installed/source trước redesign còn trong
[Git snapshot](https://github.com/apase95/OpenArms/tree/75afd87/docs/archive/pre-vnext/reports/overview).
**Đọc tiếp:** [Architecture hiện hành](architecture.md), không dùng snapshot như setup hiện tại.
