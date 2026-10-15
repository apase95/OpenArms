# Thử OpenArms bằng tay: một thư viện cho mỗi project

Luồng hiện tại: **Status → Set library path → Use → yêu cầu đúng ID → Loaded**.
Không cần migrate registry, verify hash, Grant hay Revoke để dùng thư viện local.
Các báo cáo thử nghiệm cũ dùng verified loader là bằng chứng lịch sử, không phải
hướng dẫn cho luồng này. Tài liệu này là checklist, **không phải kết quả đã chạy**.

### Mục lục nhanh

- [Chuẩn bị](#chuẩn-bị) và luồng chính: cấu hình → chọn/load → đổi nguồn → gỡ/tắt.
- [Các tính năng mới — kiểm thử riêng](#các-tính-năng-mới--kiểm-thử-riêng): dialog đường dẫn, Home preview, usage, budget, thao tác thường dùng.
- [Ghi kết quả và kết thúc](#ghi-kết-quả-và-kết-thúc).

## Chuẩn bị

### Mở sandbox để thử bình thường

Chạy từ root repository:

```bash
npm run sandbox -- start
# Nếu dùng thư viện đã cài và bộ volume installed:
npm run sandbox -- start --installed
```

Nếu image hiện tại đã build, chỉ cần start để tiếp tục thử; không cần rebuild,
cài lại, reset auth hay chạy full/smoke chỉ để mở lại TUI. Sau khi sửa source,
build riêng runtime rồi start: `npm run sandbox -- build cli` (installed:
`npm run sandbox -- build --installed cli`). Build không ghi đè file config
template đã tồn tại trong volume; kiểm tra/sửa config có chủ đích.

Auth, config và lựa chọn của project/phiên hiện có được giữ lại. Để thử kỳ vọng
**Not configured** ở lần đầu, dùng project thử riêng chưa cấu hình; không reset
toàn sandbox. Chỉ đổi nguồn hoặc xóa dữ liệu khi đó là thao tác muốn thử rõ ràng.
Menu/status và các lệnh local không cần model. Thử load thật hoặc output qua model
cần provider trong sandbox; chỉ `npm run sandbox -- auth login` nếu chưa đăng nhập
hoặc auth hiện tại cần sửa (installed: `npm run sandbox -- auth --installed login`).

Retention tự chạy sau build hoặc validated image reuse, không phải mỗi lần start;
giữ mặc định 2 image mỗi mode, cộng image được chọn và mọi container reference.
Đây không phải quota byte và không dọn shared build cache. Nếu muốn kiểm tra storage,
có thể review dry-run không xóa dữ liệu; không cần build nhiều image lớn để thử.
Xem [vận hành và retention](testing.md#5-sandbox--vận-hành-và-kiểm-tra-thủ-công)
và [sandbox README](../../sandbox/README.md) để biết chi tiết.

### Dữ liệu và bằng chứng

- Dùng project và thư viện mẫu riêng; không dùng dữ liệu nhạy cảm.
- Root thư viện phải có `registry.json` và thư mục `skills/`. Registry v1 hoặc v2
  hợp lệ đều được hỗ trợ; các nguồn không được gộp lại.
- Lệnh `/…` nhập trong OpenCode. Menu và status không cần model; thử load qua AI
  cần provider. Thiếu provider thì ghi **Chưa thử được**, không ghi Đạt.
- Với mỗi mục ghi **Đạt / Có lỗi / Chưa thử được**, thao tác, kết quả thực và ảnh
  đã che dữ liệu. Không tự sửa file state.

## 1. Cấu hình lần đầu

1. Mở `/skills status` bằng cách gõ và Enter. Thử lại qua `/skills` → status.
2. Project chưa cấu hình phải hiện **Not configured**, không tự dùng thư viện
   bundled hay biến môi trường. Nút **Set / edit library path** ở phía trên khi
   chưa có skill hiển thị. Bấm nút hoặc nhấn **e**.
3. Nhập root tuyệt đối, Enter để gửi. Đây là ô nhập đường dẫn, không phải ô lọc.
4. Hộp xác nhận mặc định **Cancel**. Enter ngay hoặc Esc phải giữ nguyên mọi thứ.
5. Làm lại, chọn **Confirm** bằng phím ↓ rồi Enter.
6. Status phải hiện root đã chọn. Khởi động lại server/TUI không được mất root.

Ví dụ root trên máy chạy trực tiếp: `/home/me/my-library` (external),
`/home/me/project/local-library` (project-local), hoặc root cài bundled thực tế.
Không nhập tên ví dụ nếu thư mục đó không tồn tại.

**Trong sandbox:** đường dẫn là đường dẫn **bên trong container**. Bundled root
là `/opt/openarms`; installed mount là `/opt/installed-router`. Cả hai vẫn phải
được chọn rõ ràng. External folder trên host phải được đưa vào qua installed
mount được hỗ trợ; gõ `/home/me/my-library` trong container không tạo mount.
Không reset sandbox đang dùng chỉ để sửa cấu hình.

## 2. Chọn và load đúng ID

1. `/skills packages` xem package; `/skills list <package>` xem core/optional.
2. `/skills use <package> <optional-ID>` hoặc menu use. Core đi cùng package.
3. Status hiện **Selected** cho ID đã chọn. Chọn lại không tạo bản sao.
4. Nếu có model, gửi: “Dùng đúng skill ID `<ID>` đã chọn qua `load_skill`.
   Chỉ đề xuất, chưa sửa file. Nếu load lỗi, báo lỗi và dừng; không đọc skill
   qua file/web/subagent hay dùng nguồn khác.” Thay `<ID>` bằng ID có thật.
5. Chỉ load thành công mới tạo **Loaded**. Câu trả lời AI hay thao tác Use không
   phải bằng chứng load. **Missing** là không có/không chọn được skill; lỗi nguồn
   cần được phân biệt với project chưa cấu hình.

Không có Grant/Revoke, Once/Session/Project approval hoặc bước duyệt hash trong
luồng thường dùng. Chọn skill **không cấp quyền shell/file**; host quản lý riêng.
Khi có các dòng skill, đường dẫn và nút sửa nằm **bên dưới** danh sách.

## 3. Đổi nguồn: hủy trước, xác nhận sau

1. Chọn/load skill trong thư viện A, ghi lựa chọn ở hai phiên cùng project.
2. Mở Status → sửa root sang B → Enter → Cancel. Root, lựa chọn và lịch sử A
   phải còn nguyên. Esc cũng không thay đổi chúng.
3. Làm lại và Confirm. Mọi phiên thuộc project, kể cả Home, phải bỏ lựa chọn,
   lịch sử load và task lock của nguồn A. Project khác và usage/budget không đổi.
4. Phải thấy khuyến nghị mở **`/new`**: nội dung đã đưa vào model không thể thu hồi.
   Có thể chọn lại trong phiên hiện tại; không bắt buộc chặn chờ phiên mới.
5. B có cùng ID với A vẫn không được nhận trạng thái Loaded/Selected cũ.
   Chuyển lại A cũng phải chọn lại, không phục hồi dữ liệu nguồn cũ.

Thử root không tồn tại, thiếu registry/skills hoặc registry hỏng: báo nguồn
không hợp lệ/không khả dụng, không âm thầm fallback. Registry rỗng vẫn phải
có nút sửa ở phía trên. Không sửa registry thật để mô phỏng lỗi.

## 4. Gỡ, tắt và tự động chọn cho phiên mới

### Gỡ/tắt/xóa và mở lại phiên đã có

1. Trong một phiên thật đã có, chọn package và optional ID rồi ghi trạng thái.
   `/skills remove <package> <optional-ID>` chỉ gỡ optional; không gỡ riêng core.
2. Thử `/skills disable <package>` để tắt package và `/skills clear` để bỏ mọi
   lựa chọn phiên. Với hộp xác nhận, thử Cancel trước rồi làm lại và xác nhận;
   Cancel phải giữ nguyên lựa chọn. Chọn lại dữ liệu cần thiết giữa các bài thử.
3. Chuyển sang phiên khác rồi mở lại đúng phiên cũ, giữ nguyên nguồn thư viện:
    lựa chọn của từng phiên phải riêng biệt. Clear được xác nhận cũng ghi đè lựa
    chọn gần nhất thành rỗng; chọn lại trước khi thử kế thừa tự động.

Phần kế thừa/Home và usage/budget có checklist riêng ngay dưới đây.

## Các tính năng mới — kiểm thử riêng

- [Mới: Dialog đường dẫn và xác nhận](#mới-dialog-đường-dẫn-và-xác-nhận).
- [Mới: Home và kế thừa](#mới-home-và-kế-thừa).
- [Mới: Usage, budget và kết quả dài](#mới-usage-budget-và-kết-quả-dài).
- [Mới: Ma trận thao tác thường dùng](#mới-ma-trận-thao-tác-thường-dùng-không-cần-provider).

### Mới: Dialog đường dẫn và xác nhận

Checklist này là hướng dẫn tự thử, không phải bằng chứng đã chạy. Dùng thư viện
mẫu và ghi kết quả riêng ở chiều rộng terminal bình thường và hẹp (ví dụ 120 và
80 cột); không reset sandbox để thử.

1. Mở Status → **Set / edit library path** để thấy **Set library path**. Kiểm tra
   lề trái/phải của vùng nội dung và ô nhập so với panel: phải bằng nhau, không
   tràn cạnh phải hay cắt chữ khi thu hẹp terminal. Esc hủy editor, root không đổi.
2. Nhập root mẫu hợp lệ rồi Enter để mở **Change library path?**. Nội dung và
   vùng highlight của lựa chọn phải có lề trái/phải bằng nhau so với panel;
   không chỉ so độ dài chữ Cancel/Confirm. Hai lựa chọn nằm trên **hai hàng dọc
   liên tiếp**, Cancel rồi Confirm, không có hàng trống ở giữa.
3. **Cancel mặc định**: Enter ngay hoặc Esc giữ nguyên root, Selected và lịch sử
   load. Mở lại, nhấn **↓ rồi Enter** để chọn Confirm; thao tác này vẫn hợp lệ
   dù hai hàng liền nhau. Root đổi và state nguồn cũ bị xóa trong project; mở `/new`
   vì nội dung đã đưa vào model không thể thu hồi.
4. Lặp lại kiểm tra editor/xác nhận ở chiều rộng hẹp. Nếu thử bằng chuột, ghi
   kết quả riêng cho Cancel/Confirm; không suy ra mouse đã đạt từ thử bàn phím.

### Mới: Home và kế thừa

#### Phiên gốc mới: tự động Selected, không có hộp Restore

1. Chuẩn bị phiên gốc thật **S1** (đã gửi prompt thường), chọn ít nhất một package
   để có **Selected**. Ghi ID và, nếu đã load, trạng thái **Loaded** để so sánh.
   Giữ nguyên identity/revision thư viện trong toàn bài thử; không đổi root hoặc
   registry. Lựa chọn gần nhất phải không rỗng.
2. Gõ `/new`: giao diện về **Home**, chưa tạo phiên thật mới. `/skills` và các
   lệnh local ở Home cũng không tạo phiên thật. **Không chọn/use/add/remove/
    disable/clear ở Home** trong bài kế thừa này.
 3. **Trước prompt thường**, mở `/skills status`: Home phải hiện ngay các ID gần
    nhất là **Selected**, không **Loaded**. Lặp lại `/new` rồi status; kết quả giữ
    nguyên, không tạo Home draft hay request provider. Bước preview này không cần provider.
    Sau đó gửi một prompt thường vô hại, ví dụ “Chỉ trả lời OK, không dùng tool hay sửa
   file”, để tạo phiên gốc thật **S2**. Bước này cần provider; nếu không có thì
    ghi **Chưa thử được**. S2 tự nhận lựa chọn gần nhất dưới dạng **Selected**,
    không có hộp Restore và không nhận Loaded/grants/task lock/lịch sử của S1.
4. Đổi lựa chọn của S2; mở lại S1 phải giữ lựa chọn riêng. Tạo S3 cùng project và
    cùng identity/revision thư viện: S3 nhận lựa chọn gần nhất, không ghi đè S1/S2.
5. Đổi nguồn hoặc registry trong thư viện thử: phiên mới không nhận state nguồn
    cũ. Project khác cũng không được nhận lựa chọn của project này.

#### Home draft và các tình huống bổ sung

1. Trong bài riêng, `/new` rồi chủ động chọn skill ở Home **trước** prompt thường.
   Khi gửi prompt tạo phiên gốc thật tiếp theo, lựa chọn Home chuyển sang phiên
    đó đúng một lần và ưu tiên hơn lựa chọn gần nhất. Thử cả Home clear để chuyển
    lựa chọn rỗng. Phiên gốc tiếp theo dùng lựa chọn project gần nhất như bình thường.
 2. Chỉ đọc status không tạo draft và không ghi đè lựa chọn gần nhất. Home preview
    là baseline cho add/remove/disable/clear chủ động. Home không phải phiên thật; lệnh local không
    tạo phiên hoặc gửi request provider. Khởi động lại TUI reset draft Home cũ.
3. **Tùy chọn / Chưa thử được nếu không tạo được phiên phụ:** phiên phụ không tự
    nhận lựa chọn phiên cha hoặc project; phải chọn riêng.
4. **Race tùy chọn:** tạo phiên trong lúc đổi nguồn; không được ghi state nguồn
    cũ vào revision mới. Ghi kết quả thực, không suy ra từ fixture.

### Mới: Usage, budget và kết quả dài

1. Thử `/usage today`, `/usage session`, `/usage project`, `/usage model <ID>`
    và `/budget`; lệnh local không gửi model prompt.
   Gõ `/usage ` với dấu cách cuối, **chưa Enter**: picker today/session/project/model
   phải mở trong khoảng 75–100ms khi prompt đang focus. Esc giữ text hiển thị,
   không gửi prompt; sửa text rồi gõ lại để mở lại. Model chỉ liệt kê ID đã ghi nhận
   trong project, hoặc báo không có dữ liệu; không gọi provider để liệt kê.
2. Home không phải phiên thật: session report phải báo No active session.
3. No data không phải 0; estimated/partial không phải hóa đơn chính xác.
    Budget chưa đặt ngưỡng hiện No limit set. Giới hạn host không đổi vì chọn skill.
   `/budget` → **Edit project budget (e)**: đặt day/session cost USD, chọn warning
   percentages hoặc bỏ từng cost limit. Enter/Cancel/Esc trong xác nhận mặc định
   Cancel không ghi file; Save ghi `<project>/.openarms/budget-policy.json`.
   Thử 0, số âm, NaN, Infinity và phần trăm ngoài (0,100]: phải báo lỗi.
   Xóa limit phải tắt cả limit global kế thừa, giữ metric/settings khác.
   Warn chỉ toast report-only, estimated phải ghi approximate; observe mặc định
   chỉ báo cáo. Xem [contract budget](../budget-ux.md) cho confidence/dedup.
4. Đóng/mở lại bằng Esc, thu hẹp terminal và cuộn để đọc hết. Lệnh sai phải
   trả hướng dẫn local. Dữ liệu usage không được chứa nội dung prompt/output.
5. Với provider, thử output dài trên dữ liệu mẫu: giao diện vẫn dùng được,
   truncation phải có thông tin phù hợp; không coi tác vụ lỗi là thành công.

### Mới: Ma trận thao tác thường dùng (không cần provider)

Dùng `<package>`, `<core-ID>`, `<optional-ID>` thực từ thư viện mẫu đã cấu hình;
không nhập nguyên placeholder. Các bước dưới đây là hướng dẫn, không phải kết quả đã chạy.

| Thao tác | Kỳ vọng |
|---|---|
| `/skills help`, `/skills packages`, `/skills list <package>` | Cú pháp/package/ID hiện local; không đổi lựa chọn. |
| `/skills use <package>` rồi `/skills add <package> <optional-ID>` hai lần | Core Selected; optional chỉ xuất hiện một lần. Use local là bật/thêm, không toggle tắt; disable là thao tác tắt riêng. |
| `/skills add <package> definitely-invalid-ID` | Báo lỗi; status trước/sau không đổi. |
| `/skills remove <package> <core-ID>` | Core bị từ chối gỡ; lựa chọn không đổi. |
| `/skills` → use → gõ lọc package/skill, Esc | Esc đầu xóa query; Esc tiếp quay lại/đóng. Chỉ lọc/hủy không đổi lựa chọn. |
| `/usage today`, `/usage session`, `/usage project`, `/usage model <ID>` | Đúng scope local; Home session là No active session. Không có record model thì không giả lập số liệu. |
| `/usage ` → model khi chưa có record | Báo không có model đã ghi nhận trong project, không gọi provider để tìm ID. |

**Kiểm tra budget Save/Cancel:** `/budget` → e → Warning percentages → nhập
`80,50,80,100` → Enter → Cancel (mặc định); policy không đổi. Làm lại và Save:
ngưỡng được chuẩn hóa thành `50,80,100`, mode warn chỉ report-only. Thử `0,101`
hoặc `NaN`: lỗi và không lưu. Thử cost `0`/âm/Infinity tương tự. Sau mỗi bài
chọn lại giá trị muốn giữ; không bật warning/limit trên project thật chỉ để thử.

**Kiểm tra restart:** ghi lại ID phiên thật, Selected/Loaded và day/session cost
limit đã Save. Đóng/mở lại sandbox không reset, mở đúng phiên đó: lựa chọn, lịch sử
phiên và project budget còn nguyên. `/new` chỉ preview Selected; không sao chép Loaded.
Usage chỉ phản ánh record local đã có; không dùng bước này để kết luận billing provider.

| Checklist mới | Đạt / Có lỗi / Chưa thử được | Bằng chứng |
|---|---|---|
| Dialog editor/xác nhận: lề bằng nhau ở normal/narrow, hai hàng liền nhau, Cancel/Enter/Esc và ↓/Confirm | | |
| /new → Home Selected ngay, không Loaded/provider; draft một lần, nguồn riêng | | |
| /usage dấu cách cuối, Esc, model picker có/không record | | |
| Budget confidence, Cancel/Save/invalid, cảnh báo report-only/dedup | | |
| Help/Use/Add idempotence, invalid ID/core protection, filter/Esc, restart | | |

## Ghi kết quả và kết thúc

| Bài thử | Đạt / Có lỗi / Chưa thử được | Bằng chứng |
|---|---|---|
| Status gõ / picker, root lần đầu | | |
| Editor Enter / Esc / Cancel / Confirm | | |
| Nút phía trên / dưới, thư viện rỗng hoặc hỏng | | |
| Use, selected IDs, load_skill thực sự | | |
| Đổi A/B, phiên khác, cùng ID, khuyến nghị /new | | |
| Remove / Disable / Clear | | |
| Tự động Selected / reopen / race, Home một lần, phiên phụ | | |
| Usage / budget / output dài | | |

Gửi lỗi kèm thao tác, mong đợi, thực tế và môi trường host/container/provider.
Không ghi live-provider hay PTY đã đạt nếu chỉ chạy unit test tổng hợp.
Thoát giao diện và dùng `npm run sandbox -- stop` nếu đang dùng sandbox riêng.
Lệnh stop giữ dữ liệu; **không reset** nếu chưa muốn mất dữ liệu/đăng nhập.
