# OpenArms Overview

## Hiện trạng và định hướng là hai lớp khác nhau

OpenArms hiện là plugin của OpenCode cho project skill toggles, output compaction,
usage reporting và reviewed handoff. Định hướng cải tổ là **control plane cho context,
workflow, observability và recovery**, không phải harness/model loop độc lập.
Mô tả này dựa trên source baseline `bdd62e8`, không chứng nhận live-host acceptance.

## Hiện trạng source

```text
TUI ON/OFF → project enabled IDs
          → server system transform → safe bounded skill reads → instructions

Tool after-hook → observed output artifact → compaction/cap → context
Completed message/tool metrics → usage store → read-only reports/warnings
```

- Active composition: `src/local-library.ts`, `src/package-catalog.ts`, server/TUI adapters.
- Root mặc định `.openarms/packages`; optional external root cần xác nhận.
- Per-package manifests; ON/OFF/ERROR; không cần central registry.
- Không model-facing skill loader, grants hoặc core/optional dependency trên route active.
- Enabled instructions được assemble mỗi system transform; OFF không xóa history cũ.
- Output cap 50.000 UTF-8 byte không bảo đảm toàn request không vượt context window.
- Usage/budget mang tính reporting/advisory; token/cost savings thực tế chưa được chứng minh.
- Reviewed handoff có journal; automatic threshold rotation chưa được production adapter bật.

[Skill format và migration](../guides/skill-management.md) là contract vận hành.
[Feature inventory](../features.md) phân biệt source, hạn chế và proposal.

## Ranh giới không thay đổi

OpenCode sở hữu model calls, loop, tools, host permissions và conversation persistence.
OpenArms chỉ dùng capability host hỗ trợ. Safe path/hash không phải OS isolation;
regex Bash deny không chứng minh chặn mọi đường đọc file. Không viết/xóa DB conversation host.

Toggle state nằm tại `$XDG_STATE_HOME/openarms/state.json` hoặc fallback tương ứng;
`.openarms/` trong project chứa package/artifacts/policy theo tính năng, không phải toàn bộ state.

## Ưu tiên cải tổ

1. Vá runtime drift/cleanup nguy hiểm và guard handoff.
2. Runtime identity, doctor, capability report, reviewed deploy/rollback.
3. Events/traces và private artifacts có privacy/retention rõ ràng.
4. Task-scoped context selection, evidence manifest và measured budgets.
5. Typed workflow/handoff recovery; không bắt buộc multi-agent cho task nhỏ.

Các mục 2–5 là đích đề xuất hoặc mở rộng, chưa phải bộ tính năng đã được triển khai.
Không tự bật on-demand loader, hard cancel hoặc model fallback bằng thay đổi tài liệu.

## Nguồn đọc tiếp

- [Architecture hiện tại/đích](Architecture.md).
- [Audit và checklist vá](../reports/overview/openarms-remediation-audit.md).
- [Các harness tham khảo](../reports/overview/agent-harness-architecture-survey.md).
- [Feature proposals và acceptance criteria](../reports/overview/openarms-feature-proposals.md).
- [Testing](../testing/testing.md) — verify host-only, smoke explicit-only.
- [Roadmap](../roadmap/README.md) — định hướng cải tổ và tasklists lịch sử.

## Tài liệu lịch sử

Các mô hình package-wide loader, verified registry/grants, unset library root và
`load_skill({skill})` thuộc các revision trước. Không dùng làm setup route hiện tại.
Chi tiết còn trong [reports](../reports/README.md), [sprint runbooks](../testing/how_to_test/)
và Git history. Khi tái dùng một tasklist, phải đối chiếu import path và host version.
