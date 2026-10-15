# Báo cáo Sprint [XX]: [Tên Cột mốc / Chủ đề Sprint]

* **Thời gian thực hiện:** [YYYY-MM-DD đến YYYY-MM-DD]
* **Giai đoạn (Phase):** [Phase X]
* **Người thực hiện:** [Tên Contributor / Team]
* **Tasklist gốc:** [`Tasklist_Phase_X.md`](../roadmap/README.md) *(Thay bằng link tới Tasklist Phase tương ứng)*
* **Kịch bản kiểm thử nghiệm thu:** [`Sprint_XX.md`](../testing/README.md) *(Thay bằng link tới runbook test tương ứng)*

---

## 1. Tóm tắt Sprint (Executive Summary)

Tóm tắt ngắn gọn trong 1-2 đoạn:
- Sprint này tập trung vào mục tiêu gì?
- Kết quả chính đạt được là gì?
- Có thay đổi đột phá nào về kiến trúc hoặc hành vi runtime không?

---

## 2. Kết quả Hoàn thành Tasks (Delivered Scope)

| Mã Task | Tiêu đề Task | Trạng thái | Bằng chứng kiểm chứng |
|---|---|---|---|
| TSK-XXX | [Tiêu đề task 1] | 🟩 Hoàn thành | `tests/[test1].test.ts` pass |
| TSK-YYY | [Tiêu đề task 2] | 🟩 Hoàn thành | Verified qua TUI runbook |
| TSK-ZZZ | [Tiêu đề task 3] | 🟨 Dời sang Sprint sau | Cần phụ thuộc từ host OpenCode |

---

## 3. Bằng chứng Kiểm thử & Độ tin cậy (Test & Quality Evidence)

### Kết quả chạy kiểm thử tự động:
- **T0 (Syntax/Typecheck):** [Passed]
- **T1 (Related Unit/Integration Tests):** [Passed - X tests]
- **T2 (Full Suite):** [Passed - Y tests]
- **T3 (Smoke Runtime/TUI):** [Passed / Fingerprint cache pass-only]

### Quan sát thực tế (Real-world / Sandbox observations):
- Ghi nhận hành vi khi chạy trên Docker sandbox hoặc host thật.
- Đo lường thời gian thực thi hoặc bộ nhớ tiêu thụ nếu có.

---

## 4. Quyết định Kỹ thuật & Rủi ro phát sinh (Decisions & Trade-offs)

- **Quyết định 1:** [Giải thích ngắn gọn lựa chọn kỹ thuật]
- **Quyết định 2:** [Giải thích vì sao không áp dụng phương án khác]

---

## 5. Giới hạn Còn tồn đọng & Đề xuất Sprint tiếp theo (Pending Items)

1. **Giới hạn đã biết (Known Limitations):**
   - [Nêu rõ những gì chưa hỗ trợ hoặc chưa nghiệm thu được với host thật]
2. **Kế hoạch cho Sprint kế tiếp:**
   - [Định hướng bước tiếp theo theo roadmap]
