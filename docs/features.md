# Danh mục Tính năng Hệ thống OpenArms (OpenArms Features)

> Skill-manager update: the active runtime now uses project `.openarms/packages`
> manifests, project-scoped ON/OFF/ERROR toggles and automatic per-turn injection.
> No model-facing load tools, core/optional dependency or read grants apply.
> Sections 2.1, 2.5 and 2.6 below describe legacy install/export capabilities or
> earlier designs, not the active runtime contract. See [migration and current
> limitations](guides/skill-management.md); historical completion labels do not
> certify the redesigned integration.

Tài liệu này tổng hợp toàn bộ 24 tính năng cốt lõi của dự án **OpenArms**, được phân nhóm theo 5 trụ cột kiến trúc chính. Mỗi tính năng được tóm tắt súc tích trong khoảng 3 dòng (mục đích, cơ chế hoạt động, giá trị mang lại) và được gắn nhãn trạng thái triển khai thực tế trong mã nguồn:
- **`[Đã hoàn thành]`**: Đã cài đặt hoàn chỉnh trong source code và vượt qua các bài kiểm thử.
- **`[Chưa hoàn thành / Đề án]`**: Mới dừng ở mức thiết kế lý thuyết, đang tạm hoãn (deferred), mới có logic ngầm nhưng bị tắt trên UI, hoặc chưa nghiệm thu thực tế.

---

## 📊 Bảng tổng quan trạng thái (20 Đã hoàn thành · 4 Chưa hoàn thành / Đề án)

| Nhóm tính năng | Đã hoàn thành | Chưa hoàn thành / Đề án | Tổng số |
| :--- | :---: | :---: | :---: |
| **1. Kiểm soát & Nén Đầu ra (Output Governance)** | 7 | 0 | 7 |
| **2. Quản lý Gói & Kỹ năng (Skill Package Manager)** | 6 | 1 | 7 |
| **3. Đo lường Ngân sách & Ngữ cảnh (Budget & Telemetry)** | 3 | 1 | 4 |
| **4. Vòng đời Phiên & Bàn giao (Session Lifecycle)** | 2 | 2 | 4 |
| **5. Hạ tầng Kiểm thử (Testing Infrastructure)** | 2 | 0 | 2 |
| **Tổng cộng** | **20** | **4** | **24** |

---

## 1. Kiểm soát & Nén Đầu ra (Output Governance & Compaction)

### 1.1. Kiểm soát & Rút gọn Kết quả Test (Test Output Compactor) — `[Đã hoàn thành]`
- Lọc bỏ log rác và stack trace dài dòng từ các test framework (Jest, Mocha, Vitest).
- Chỉ giữ lại tổng quan số lượng test pass/fail, tên test case lỗi và dòng code nguyên nhân chính xác.
- Giúp giảm trung bình 70–90% token tiêu hao cho mỗi lần chạy test trong ngữ cảnh LLM.

### 1.2. Nén Git Diff Thông minh (Git Diff Compactor) — `[Đã hoàn thành]`
- Tự động phân tích git diff, rút gọn hunk lớn, file nhị phân và các file lock/vendor dài hàng nghìn dòng.
- Tập trung hiển thị các dòng thay đổi cốt lõi kèm ngữ cảnh tối thiểu vừa đủ để LLM hiểu.
- Ngăn chặn hoàn toàn tình trạng tràn ngữ cảnh (context window overflow) khi commit/review lượng code lớn.

### 1.3. Nén Log Biên dịch & Build (Build Output Compactor) — `[Đã hoàn thành]`
- Phát hiện và trích xuất đúng mã lỗi, cảnh báo (warning), đường dẫn file và số dòng gây lỗi build.
- Tự động gập/cắt tỉa hàng nghìn dòng thông báo tiến trình thành công vô ích của Webpack, Vite, Docker build,...
- Giữ ngữ cảnh prompt luôn sạch sẽ, giúp mô hình AI tập trung ngay vào điểm nghẽn cần sửa.

### 1.4. Nén Kết quả Linter (Linter Output Compactor) — `[Đã hoàn thành]`
- Gom nhóm và phân loại lỗi linter (ESLint, Prettier, TypeScript diagnostics) theo quy tắc và file.
- Loại bỏ định dạng bảng dài dòng, chỉ giữ danh sách lỗi cô đọng kèm tọa độ dòng:cột và gợi ý sửa.
- Tiết kiệm token tối đa khi codebase có lượng cảnh báo kiểu dáng (style warnings) dày đặc.

### 1.5. Giám sát & Nén Xem trước File (File Inspection Compactor) — `[Đã hoàn thành]`
- Điều tiết nội dung trả về khi công cụ đọc hoặc duyệt file hệ thống (read file, directory listing).
- Tự động phát hiện file nhị phân, minified code hoặc file quá dài để tóm tắt cấu trúc thay vì in tràn lan.
- Đảm bảo các thao tác duyệt mã nguồn của agent luôn an toàn và tiết kiệm ngân sách token.

### 1.6. Chốt chặn Cứng Giới hạn Dung lượng 50KB (Hard Cap 50KB) — `[Đã hoàn thành]`
- Cơ chế chốt chặn an toàn cuối cùng giới hạn mọi chuỗi phản hồi công cụ không vượt quá 50KB.
- Tự động cắt tỉa phần giữa (head + tail preservation) và gắn cảnh báo nếu payload vượt ngưỡng.
- Bảo vệ tuyệt đối phiên làm việc khỏi sự cố crash do tràn bộ nhớ hoặc vượt quá context window của LLM.

### 1.7. Quản lý Vòng đời & Xóa Log Tự động (Log Retention Policy) — `[Đã hoàn thành]`
- Tự động dọn dẹp thư mục log định kỳ theo cơ chế FIFO (First-In-First-Out) với 3 tiêu chí an toàn song song.
- Duy trì tối đa 200 files, tổng dung lượng không quá 256 MiB và tuổi thọ log tối đa 7 ngày (604.800.000 ms).
- Đảm bảo ổ đĩa không bị quá tải khi chạy nhiều lượt tương tác dài mà vẫn lưu trữ đủ vết để audit khi cần.

---

## 2. Quản lý Gói & Kỹ năng (Skill & Package Management)

### 2.1. Installation scope and manifests
- Local audited installs publish `.openarms/packages/<id>/package.json` atomically with files.
- Global installs publish `$XDG_CONFIG_HOME/opencode/packages/<id>`; selecting that directory is explicit, never merged or preferred automatically.
- New IDs remain OFF; the registry is a compatibility export, not runtime authority.

### 2.2. Tải Kỹ năng từ Xa (Remote Skill Fetcher) — `[Đã hoàn thành]`
- Hỗ trợ tải và nạp kỹ năng từ xa qua HTTP/HTTPS URL hoặc kho lưu trữ Git an toàn.
- Tự động giải nén các định dạng archive (ZIP, Tarball) và đưa vào sandbox phân tích trước khi nạp.
- Giúp lập trình viên và agent dễ dàng mở rộng khả năng từ các nguồn cộng đồng uy tín.

### 2.3. Quét An ninh & Kiểm duyệt Kỹ năng (Security & Permission Scanner) — `[Đã hoàn thành]`
- Phân tích tĩnh mã nguồn kỹ năng nhằm phát hiện mã độc hại, URL đáng ngờ hoặc can thiệp trái phép.
- Xác minh quyền thực thi nhạy cảm (truy cập mạng, ghi file hệ thống, quyền root) trước khi kích hoạt.
- Cung cấp báo cáo audit chi tiết giúp người dùng ra quyết định tin cậy trước khi tích hợp vào agent.

### 2.4. Dịch ngược Kỹ năng Bằng AI 2 Tầng (2-Tier AI Skill Decompiler) — `[Đã hoàn thành]`
- Tự động phân tích codebase dự án để dịch ngược thành các kỹ năng chuyên biệt thông qua 2 tầng xử lý.
- Tầng 1 trích xuất mô hình dữ liệu/giao diện; Tầng 2 sinh mã lệnh kỹ năng tương thích hoàn toàn với OpenArms.
- Rút ngắn thời gian khởi tạo cấu hình và mở rộng tập kỹ năng tự động cho agent mà không cần viết tay.

### 2.5. Xác thực Toàn vẹn & Sổ bộ Kỹ năng (SHA-256 Registry & Integrity) — `[Đã hoàn thành]`
- Định danh và xác minh tính toàn vẹn của mọi gói kỹ năng thông qua chữ ký băm SHA-256 và Schema v2.
- Ngăn chặn tuyệt đối tấn công giả mạo (tampering) hoặc kỹ năng bị sửa đổi ngoài luồng sau khi cài đặt.
- Đảm bảo tính nhất quán và khả năng tái lập môi trường chính xác trên nhiều máy lập trình khác nhau.

### 2.6. Automatic enabled-skill injection
- Every enabled manifest ID is safely assembled into each system transform; no model-facing load or topic tool exists.
- References are independently toggleable entries, not implicit core dependencies. Packages provide bulk ON/OFF only.
- OFF affects future turns, not old context. Live-model compliance and comparative savings remain separate acceptance work.

### 2.7. Giao diện TUI Chọn Kỹ năng Tương tác (TUI Interactive Skills Picker) — `[Đã hoàn thành]`
- Cung cấp menu điều khiển trực quan ngay trong giao diện dòng lệnh (TUI) để tìm kiếm, bật/tắt kỹ năng.
- Xử lý bàn phím mượt mà, phân tách rõ ràng luồng phím giữa host terminal và container sandbox PTY.
- Mang lại trải nghiệm người dùng tiện lợi, dễ dàng kiểm soát tập công cụ đang hoạt động trong phiên.

---

## 3. Đo lường Ngân sách & Ngữ cảnh (Token Budget & Context Telemetry)

### 3.1. Thanh Trạng thái Tiêu hao Token Thời gian thực (Real-time Token Budget Widget) — `[Đã hoàn thành]`
- Hiển thị liên tục trên TUI tỷ lệ phần trăm token đã dùng, số token còn lại và chi phí ước tính sau mỗi lượt chat hoàn thành.
- Đổi màu cảnh báo trực quan theo các ngưỡng an toàn: Xanh (<50%), Vàng (50-74%), Cam (75-89%), Đỏ nhấp nháy (90-100%).
- Giúp lập trình viên nắm bắt mức độ tiêu tốn tài nguyên tức thì mà không cần thoát giao diện code.

### 3.2. Bảng Phân tích Chi tiết Token Theo Thành phần (Token Breakdown Popup) — `[Đã hoàn thành]`
- Cửa sổ popup chi tiết bóc tách lượng token tiêu hao thành từng phần: System prompt, User prompt, Tool outputs, Assistants.
- Theo dõi lượng token tiết kiệm được nhờ các bộ nén (compactor savings) để đánh giá hiệu quả tối ưu.
- Cung cấp dữ liệu minh bạch giúp phân tích và tinh chỉnh các bước làm việc gây lãng phí ngữ cảnh.

### 3.3. Chính sách & Cưỡng chế Vượt Ngân sách (Budget Policy Enforcement) — `[Chưa hoàn thành / Đề án]`
- Hệ thống đã thu thập telemetry và phát hiện vượt hạn mức, nhưng cơ chế cưỡng chế ngắt lệnh (Hard Cancel / Auto-enforce) chưa hoàn thành.
- Do API host OpenCode không hỗ trợ hủy yêu cầu an toàn mà gây crash state TUI, hệ thống đã hạ cấp về chế độ chỉ cảnh báo (Warning-only Fallback).
- Việc tự động khóa/chặn tương tác khi cạn ngân sách hiện vẫn dừng lại ở mức đề án thiết kế.

### 3.4. Chế độ Chạy Ẩn Đo lường Tác động (Shadow Mode Telemetry) — `[Đã hoàn thành]`
- Ghi nhận và đo lường song song hiệu quả nén mà không can thiệp trực tiếp vào kết quả trả về của công cụ.
- So sánh trực tiếp kích thước payload trước và sau nén để đánh giá tỷ lệ suy giảm thông tin (fidelity loss).
- Cho phép thử nghiệm an toàn các thuật toán nén mới trước khi áp dụng chính thức vào môi trường sản xuất.

---

## 4. Quản lý Vòng đời Phiên & Bàn giao (Session Lifecycle & Handoff)

### 4.1. Bàn giao Phiên Tinh gọn Chuẩn 30 Dòng (Compact Session Handoff - progress.md) — `[Đã hoàn thành]`
- Tự động tổng hợp tiến độ, các việc đã làm, quyết định kỹ thuật và bước tiếp theo vào `.openarms/progress.md`.
- Giới hạn nghiêm ngặt trong khung định dạng chuẩn tối đa ~30 dòng với 7 trường mục cốt lõi.
- Giúp phiên làm việc mới kế thừa toàn bộ tri thức của phiên trước mà chỉ tốn lượng token khởi tạo tối thiểu.

### 4.2. Khử khuẩn Dữ liệu & Xóa Vết Nhạy cảm (Handoff Context Sanitizer) — `[Đã hoàn thành]`
- Tự động quét và loại bỏ khóa bí mật, API key, token truy cập, thông tin định danh cá nhân trước khi bàn giao.
- Làm sạch các dữ liệu nhạy cảm hoặc chuỗi log tạm thời trong bộ nhớ ngữ cảnh chuyển giao.
- Đảm bảo tuân thủ tiêu chuẩn an toàn bảo mật khi lưu trữ hoặc chia sẻ tiến độ giữa các thành viên.

### 4.3. Tự động Khôi phục & Tiếp tục 1 Chạm (1-Click Auto-Resume) — `[Chưa hoàn thành / Đang hoàn thiện]`
- Logic điều phối chuyển giao 1-click đã được cài đặt (`AutoSessionRotator`), nhưng chưa nghiệm thu tương tác host thực tế.
- Khả năng Agent ở Turn 1 của phiên mới tự động phân tích `progress.md` và tự kích hoạt kỹ năng tương ứng (TSK-512) chưa được chứng minh trên model thực tế.
- Toàn bộ kịch bản kiểm thử đo lường KPI thực tế trên 30 tác vụ dài (Sprint 5.4) hoàn toàn chưa thực hiện.

### 4.4. Cơ chế Xoay Vòng Phiên Đa Tầng Tự động (Progressive Rotation Engine) — `[Chưa hoàn thành / Đề án]`
- Logic tính toán 3 tầng cảnh báo lũy tiến (50% - 75% - 100%) đã được viết trong `src/progressive-rotation.ts`.
- Tuy nhiên, tính năng tự động phát Toast gợi ý (75%) và mở Modal Dialog (100%) trên TUI đang bị TẮT (disabled) do host thiếu seam atomic completion.
- Hiện tại việc kích hoạt xoay vòng phiên hoàn toàn phụ thuộc vào thao tác thủ công chủ động của người dùng (`Ctrl+Space` -> Handoff).

---

## 5. Hạ tầng Kiểm thử & Đảm bảo Chất lượng (Testing Infrastructure & Quality Assurance)

### 5.1. Trình Chạy Kiểm thử Theo Chính sách Phân tầng (Policy-Driven Test Runner - T0 đến T3) — `[Đã hoàn thành]`
- Điều phối toàn diện các bài test tự động dựa trên ma trận rủi ro file thay đổi (`test-policy.json`).
- Phân tầng kiểm tra từ T0 (Cú pháp/Lint), T1 (Kiểm thử liên quan), T2 (Toàn diện) đến T3 (Khói tích hợp).
- Tối ưu hóa thời gian chạy CI/CD bằng cách chỉ thực thi đúng các test suite bị ảnh hưởng trực tiếp.

### 5.2. Môi trường Kiểm thử Độc lập Docker Sandbox PTY (Docker Sandbox PTY Integration) — `[Đã hoàn thành]`
- Chạy toàn bộ bài test TUI và môi trường giả lập bên trong Docker container cô lập tuyệt đối với host.
- Mô phỏng chân thực thiết bị đầu cuối tương tác thực tế (PTY) với bàn phím, kích thước màn hình và mã thoát màu.
- Đảm bảo kiểm thử chính xác 100% các tính năng giao diện người dùng mà không gây tác dụng phụ lên máy thật.
