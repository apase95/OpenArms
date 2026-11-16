# Kiến trúc OpenArms

**Định hướng cải tổ:** OpenCode sở hữu agent loop; OpenArms là plugin/control plane
cho context, workflow, observability và recovery. Không xây permission engine hoặc
conversation database cạnh tranh với host.

| Tài liệu | Vai trò |
|---|---|
| [Overview](openarms-overview.md) | Hiện trạng và thứ tự cải tổ |
| [Architecture](Architecture.md) | Route active, ownership, persistence và thiết kế đích |
| [Skill management](../guides/skill-management.md) | Format/toggles/migration hiện hành |
| [Audit cần vá](../reports/overview/openarms-remediation-audit.md) | Runtime drift, rủi ro, checklist và nghiệm thu |
| [Harness survey](../reports/overview/agent-harness-architecture-survey.md) | Pi, OpenCode, Claude Code, Aider; nguồn tham khảo |
| [Feature proposals](../reports/overview/openarms-feature-proposals.md) | Backlog phù hợp, dependency và rollout |

## Nguyên tắc

1. **Hiện trạng khác proposal:** source có module không chứng minh capability đã active hoặc live-tested.
2. **Một route skill rõ:** manifests, project ON/OFF/ERROR, safe bounded injection; không model-facing loader.
3. **History khác context:** giảm context không phải lý do xóa conversation.
4. **State có ownership:** toggle state ở XDG state; task artifacts/packages/policies trong project.
5. **Atomicity theo writer:** lock và rename được kiểm chứng trên từng route, không claim mọi file đều được khóa.
6. **Capabilities trước enforcement:** unsupported/advisory phải được hiển thị, không thay bằng prompt.
7. **Measure quality trước rollout:** bytes saved không đồng nghĩa cost saved; cần task success và latency.

Các thiết kế grants/verified-loader/package locks trước đây là lịch sử khi không được
route active dùng. Xem [reports](../reports/README.md) và [roadmap](../roadmap/README.md).
