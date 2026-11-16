# OpenArms 0.2 — tài liệu hiện hành

**Phạm vi:** native skill browser + output compactor. Mọi ý tưởng control plane,
workflow engine, traces, usage/budget, installers và session lifecycle trong tài liệu
trước đây không còn là roadmap đã được chấp thuận.

| Tài liệu | Nội dung |
|---|---|
| [README](../README.md) | Cài đặt và cách dùng |
| [Features](features.md) | Chức năng giữ lại / đã gỡ / giới hạn |
| [Architecture](architecture/Architecture.md) | Host boundary, catalog adapter, output pipeline |
| [Skill management](guides/skill-management.md) | Native discovery, inspect, request; không ON/OFF |
| [Output compaction](guides/output-compaction.md) | Parsers, cap, artifact privacy/retention |
| [Migration](guides/migration.md) | Upgrade có review, bảo toàn data và bỏ rules cũ |
| [Testing](testing/testing.md) | Small host checks và manual acceptance |
| [Contributor guide](contributing/GETTING_STARTED.md) | Cấu trúc code và nguyên tắc maintain |
| [Archive](archive/README.md) | Snapshot tài liệu/nghiên cứu trước redesign, không dùng như hướng dẫn hiện hành |

## Nguồn sự thật

- Server entry chỉ đăng ký `tool.execute.after`.
- TUI `/skills` dùng native catalog và host dialogs/keymap; không thay Prompt component.
- Skill loading và host permissions vẫn do OpenCode quyết định.
- Code có test không đồng nghĩa đã chạy trên provider hay live TUI thật.
- Task này không triển khai bản installed trong `~/.config/opencode/`.

## Checklist khi cập nhật docs

- [ ] Không quảng bá tính năng đã gỡ như hiện hành.
- [ ] Phân biệt host capability, OpenArms behavior và manual acceptance chưa làm.
- [ ] Link active trỏ tới docs hiện hành; lịch sử phải đi qua archive và có nhãn rõ.
- [ ] Không hứa token savings, OS isolation hoặc hard budget.
- [ ] Cập nhật migration nếu đổi config/library/entry paths hoặc output artifacts.
