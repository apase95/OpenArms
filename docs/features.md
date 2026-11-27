# Features — bật/tắt chức năng OpenArms theo project

[← Mục lục](README.md)

Trang này sở hữu menu chính và feature flags. ON/OFF từng skill nằm ở
[Skills](skills.md#project-switches); parsing/log artifacts nằm ở [Output](output.md).

## 1. Menu chính

Sau khi restart cả client/server để nạp cùng checkout, gõ **`/arms-skills`** hoặc chọn
**OpenArms** trong command palette:

```text
OpenArms
  Skills management
  Output compaction
  Features
```

- **Skills management** mở catalog names → ON/OFF/REQUEST nếu feature đang ON.
- **Output compaction** mở thông tin trạng thái; đây là pipeline tự chạy, không command runner.
- **Features** luôn nằm cuối và luôn truy cập được, kể cả mọi chức năng khác đã OFF.

Trong **Features**, chọn tên chức năng để mở bảng có title `Tên · ON/OFF` và chỉ hai dòng:

```text
ON
OFF
```

Không REQUEST, preview hoặc auto-submit trong feature controls. Back/Done nằm trái/phải
ở footer mọi dialog; Back về tầng trước, ở menu chính thì đóng. Done/Esc đóng, không hoàn
tác lựa chọn đã lưu. Phím tắt footer: Alt+← / Alt+Enter. Không sửa UI native của OpenCode.

`/arms-skills` là **lệnh OpenArms duy nhất**, luôn mở menu tổng, không còn shortcut riêng
mở catalog. Skills management vẫn tôn trọng feature OFF. `/skills` thuộc OpenCode,
hoạt động theo native permissions của host.

## 2. Hai feature thực sự có trong runtime

| Feature / ID | ON (mặc định) | OFF |
|---|---|---|
| Skills management / `skills-management` | Browser, project skill switches, request và skill deny hooks hoạt động | Không mở browser/toggle/request qua OpenArms; config hook không thêm skill deny mới, before-hook không enforce opt-outs của OpenArms |
| Output compaction / `output-compaction` | Supported tool text đi qua compaction, lưu observed original nếu thay đổi | Passthrough nguyên output/title/metadata; không normalize, cap, lưu artifact hay prune logs từ lần hook tiếp theo |
| Compact transcript / `compact-transcript` | Tool call hiện một dòng khi chạy; giữ đường dẫn file đã sửa và ẩn Thought | Khôi phục renderer mặc định của OpenCode |

**Compact transcript** chỉ có tác dụng trên OpenCode chạy với [bản vá host](architecture.md#compact-transcript-bản-vá-host-tùy-chọn). Gõ `/arms-skills` → **Features** → **Compact transcript** → **ON** hoặc **OFF**. Bản vá đọc lại lựa chọn của dự án đang mở khoảng mỗi giây; không cần restart sau khi đổi. Todos, câu hỏi tương tác và dữ liệu phiên không đổi.

Log cutting, normalization và raw-output artifacts thuộc **một pipeline**, không tách
thành các flags giả hoặc cho phép cắt output mà âm thầm mất evidence. Không có flag cho
Features: luôn giữ đường để bật lại các chức năng khác.

### Phân biệt feature OFF và skill OFF

**Feature Skills management OFF sẽ ngừng áp dụng opt-outs của OpenArms**, không phải deny
tất cả skills. OpenCode vẫn được dùng native skills theo quyền gốc của nó. Các deny đã
nạp vào permission cache trước khi OFF có thể còn hiệu lực: **restart host** để dựng lại
config, không tự sửa/cấp allow. Native deny/ask của người dùng không bị gỡ.

Không xóa `.openarms/skills.json`. Khi ON lại feature, choices từng skill được áp dụng
lại. Không xóa skill instructions đã load hoặc hủy tool đang chạy. Toggle là checkpoint
cho những lần kiểm tra tiếp theo, không transaction/cancel toàn bộ pipeline in-flight.

Output OFF không xóa log cũ hoặc thay đổi phần output đã được publish trước đó. Host vẫn
có giới hạn native riêng; passthrough không bảo đảm host phục hồi bytes đã truncate.

## 3. Phạm vi và persistence

Feature flags theo **project/worktree**, không global. Chỉ hỗ trợ TUI/server local cùng
filesystem, cùng checkout; remote attach tách filesystem chưa được hỗ trợ. Cần cả hai
plugins active, UI cập nhật flag không chứng minh backend cũ đã reload đúng code.

File `<projectRoot>/.openarms/features.json`:

```json
{
  "version": 1,
  "disabled": ["output-compaction"]
}
```

Root là worktree khác `/`, nếu không dùng directory. Cùng worktree/subdirectory dùng chung
flags; project khác độc lập. Missing file mặc định mọi feature ON, đọc mặc định không ghi
file. Không tự tạo config global, thay model, sửa host DB hoặc migrate legacy state.

Private store dùng directory 0700/file 0600, kiểm tra symlink và schema, exclusive lock
`.features.lock`, temp write/fsync/rename; không chmod, sửa `.gitignore`, auto-retry hoặc
xóa stale lock. Không cho đổi flags tại `/`, home hoặc global OpenCode config directory.
Đây là owner-controlled workspace, không bảo đảm chống hostile concurrent mutation.
Root protection/storage dùng chung implementation với skill preferences nhưng hai files
và locks độc lập, không ghi đè choices của nhau.

## 4. Lỗi và navigation

- Không đọc được/JSON sai/version hoặc ID lạ: không giả định tất cả ON. UI báo
  `FEATURE_STATE_UNAVAILABLE`, không hiển thị ON/OFF giả hoặc tự reset state.
- Server không xác định được feature state: **output passthrough, không lưu raw text**;
  native skill calls fail closed với `SKILL_POLICY_UNAVAILABLE`. Các tool khác không bị
  chặn bởi skill guard. Review preferences thay vì suy ra runtime đang ON.
- `FEATURE_WRITE_UNCONFIRMED`: review project path/private permissions/lock, refresh
  trước retry vì save có thể đã commit; không có success giả hoặc raw error body.
- `FEATURE_TARGET_CHANGED`: mở lại `/arms-skills` ở đúng project/session; callback cũ không bắt đầu
  save mới. Save đã in-flight vẫn có thể hoàn tất tại project ban đầu.
- Back/Done/Esc hoặc dispose vô hiệu callbacks cũ; completion không reopen/clear dialog mới.
  Đóng menu không tự hủy save/append đã gửi và không hoàn tác lựa chọn đã lưu.

**Tiếp theo:** [Skills](skills.md), [Output](output.md), [Verification](verification.md).
