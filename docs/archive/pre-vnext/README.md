# Tài liệu OpenArms

OpenArms là plugin của OpenCode. **Hiện tại:** project skill toggles, safe injection,
output compaction, usage reports và reviewed handoff. **Định hướng cải tổ:** control plane
cho context, workflow, observability và recovery; OpenCode vẫn sở hữu loop/model/tools/permissions.
Proposal không phải tính năng đã bật hoặc bằng chứng live acceptance.

## Bộ tổng hợp cải tổ — ba tài liệu

1. [Những lỗi/rủi ro cần vá](reports/overview/openarms-remediation-audit.md): so sánh source
   và installed runtime, P0–P2, FIX IDs, checklist và tiêu chí nghiệm thu.
2. [Kiến trúc và điểm hay của từng harness](reports/overview/agent-harness-architecture-survey.md):
   Pi, OpenCode, Claude Code, Aider, tham khảo thêm Codex; sơ đồ và nguồn chính thức.
3. [Tính năng có thể phù hợp OpenArms](reports/overview/openarms-feature-proposals.md):
   F-01…09, dependency, privacy, rollout và acceptance criteria.

## Đọc theo nhu cầu

| Nhu cầu | Tài liệu |
|---|---|
| Cài đặt và phạm vi sản phẩm | [README](../README.md) |
| Dùng skill / migration | [Skill management](guides/skill-management.md) |
| Hiểu kiến trúc hiện tại/đích | [Overview](architecture/openarms-overview.md) → [Architecture](architecture/Architecture.md) |
| Contributor mới | [Getting started](contributing/GETTING_STARTED.md), [Cheat sheet](contributing/architecture-cheat-sheet.md) |
| Xem năng lực và giới hạn | [Features](features.md) |
| Usage/budget | [Budget UX](guides/budget-ux.md) |
| Kiểm thử | [Testing policy](testing/testing.md), [AGENTS.md](../AGENTS.md) |
| Phạm vi cải tổ và tasklists | [Roadmap](roadmap/README.md) |
| Evidence lịch sử | [Reports](reports/README.md) |
| Viết tài liệu | [Documentation guide](contributing/documentation-guide.md), [Templates](templates/README.md) |

## Contract hiện hành

- **Skills:** `.openarms/packages`, per-package manifests, project ON/OFF/ERROR và
  automatic system-transform injection. Không model-facing load tools hoặc read grants.
- **State:** toggle state dùng XDG state namespace; package/artifacts/project policies có thể
  ở `.openarms/`. Không coi mọi file trong project là đã có writer lock.
- **Budget:** báo cáo/cảnh báo; không claim hard enforcement hoặc actual savings khi chưa đo.
- **Host boundary:** plugin không ghi/xóa DB conversation, không tự cấp OS permission hoặc thay model.
- **Testing:** preview scope qua `node scripts/arms-test.mjs verify --plan` với repeated
  `--file <path>`. Unknown/needs-review cần reviewed mapping; docs đã được policy phân loại
  không nhất thiết cần thêm mapping từng file. Verify host-only; smoke chỉ chạy explicit mode.

## Cấu trúc

```text
docs/
├── architecture/    # Route active, ownership và thiết kế đích
├── guides/          # Hướng dẫn vận hành
├── contributing/    # Onboarding và quy chuẩn
├── templates/       # ADR, spec, report, runbook
├── testing/         # Policy và runbooks có mốc phiên bản
├── roadmap/         # Định hướng cải tổ + tasklists theo giai đoạn
├── reports/         # Audit/nghiên cứu và evidence lịch sử
├── assets/          # Tài nguyên đồ họa
└── features.md      # Năng lực, giới hạn, proposal
```

## Cách đọc tài liệu cũ

Runbooks/reports/tasklists có thể ghi unset-root, Selected/Loaded, central registry,
`load_skill` hoặc verified grants. Đây là semantics của revision trước, không phải setup
route active. Trước khi tái dùng phải đối chiếu skill guide, imports và host version.
Lịch sử sprint không được viết lại thành một lần nghiệm thu mới; các item blocked vẫn
cần evidence. Không coi synthetic transport/fake SDK là live-provider acceptance.
