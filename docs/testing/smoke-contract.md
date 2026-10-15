# Hợp đồng smoke và cache — Sprint 0.2

Các ca chạy đầy đủ, kết quả mong đợi và chẩn đoán ở [hướng dẫn sandbox](how_to_test/Sandbox.md).

## Danh sách điều kiện kiểm tra (TSK-007)

| Điều kiện kiểm tra | Nơi phụ trách | Chi phí | Lý do/ranh giới |
|---|---|---|---|
| Parse JSON template server/TUI; plugin URL và target tồn tại | `sandbox/smoke-static.mjs` | thấp, host | Phát hiện template/path lỗi trước Docker |
| Quyền skill/read trong template | static | thấp | Policy khai báo trong template |
| Context/target build Compose, mount volume và mount installed chỉ đọc | static | thấp | Cách nối cấu hình có thể kiểm chứng offline |
| Hợp đồng phiên bản/nhãn build Dockerfile, XDG path mong đợi và source COPY | static | thấp | Kiểm tra khai báo, không chạy binary |
| Quy tắc bỏ qua build context và đường dẫn fixture | static | thấp | Tránh build context/fixture lỗi |
| Khai báo source `load_verified_skill`, tham số skill và không có legacy tool | static | thấp | Hợp đồng source; không khẳng định host đã đăng ký tool |
| Phiên bản OpenCode binary thực tế | `sandbox/smoke-runtime.mjs` | vừa, container process | Phân biệt binary cài trong image với version declaration |
| OpenCode `debug paths` thực tế | runtime | vừa | Xác minh OpenCode thực thi XDG isolation, không chỉ ENV text |
| Server start và `/global/health` | runtime | cao, OpenCode server | Cần process thật và request HTTP |
| `/config`: URL server plugin, quyền skill/read thực tế | runtime | cao | Config host sau khởi tạo; ranh giới khác template static |
| `/experimental/tool/ids`: có `load_verified_skill`, không có legacy tool | runtime | cao | Tích hợp SDK/host thật; ranh giới khác khai báo source |
| Chặn `/skills` và render picker | `sandbox/tui-smoke.py` | cao, host PTY + container | Chỉ harness TUI kiểm tra render/input |
| Cuộn/quay vòng bằng phím, mở lại dialog và tương tác hover chuột | TUI | cao | Điều hướng terminal thật; server smoke không kiểm tra lại |

`sandbox/smoke.mjs` chỉ là điểm vào chẩn đoán tương thích, import runtime.
Runtime smoke không kiểm tra JSON template TUI. Những assertion tương tự ở
static/runtime bảo vệ hai ranh giới khác nhau: khai báo và hành vi host thực tế;
unit tests không thay thế được hai ranh giới tích hợp này.

## Thực thi và phạm vi

[Sprint 2.4](how_to_test/Sprint_24.md) có production dialog/action contract fixture
với mock UI callbacks; không chạy renderer và không thay T1–T4 PTY. Actual host
entrypoint vẫn `sandbox/tui-smoke.py` qua Compose cli 120×32/entrypoint/tui.json.
Runtime/TUI fingerprint library:true vẫn authority-blocked; không thiếu SDK giả định.

CI integrity fixture Sprint 2.1 là gate standalone gọi production CLI trên dữ
liệu tổng hợp, **không phải OpenCode smoke**. Non-smoke xác minh code/fixtures,
không hash live library; smoke/build fingerprint library giữ nguyên. Tổng task
Sprint 2.1 vẫn có required smoke bị chặn bởi quyền actual skill content, không
coi full/CI fixture là pass thay thế. [Chi tiết](how_to_test/Sprint_21.md).

[Sprint 2.2 core](how_to_test/Sprint_22.md) là evidence standalone lịch sử.
[Sprint 2.3](how_to_test/Sprint_23.md) thay tool/source/S/R contracts; runtime/TUI
fingerprints vẫn cần library thật nên bị chặn khi không có quyền content.
Classifier core thuần yêu cầu full,
không tự thêm runtime/TUI smoke. Historical smoke block của task 2.1 vẫn pending;
fixtures loader không đóng operational/host gate hoặc thay library fingerprint.

```bash
npm run test:smoke-static                  # host only, không Docker
npm run test:smoke-runtime                 # static -> optional build -> server
npm run test:tui-smoke                     # static -> optional build -> TUI
node scripts/arms-test.mjs --force tui-smoke
node scripts/arms-test.mjs smoke --installed
node scripts/arms-test.mjs smoke-runtime --rebuild
```

Các lệnh độc lập ở trên chỉ dùng khi chủ động kiểm chứng/chẩn đoán boundary,
không chạy thêm nếu một verify đã bao phủ chúng. `smoke` là alias runtime.
`--force` bỏ stamp pass, vẫn dùng lại image hợp lệ. `--rebuild` bỏ stamp pass và
buộc build một lần trong lượt gọi. Static thất bại không chạy tiếp build/OpenCode.

Bộ phân loại hiện tại trong `scripts/test-policy.json` version 3: server adapter, runtime
composition/package loader và server config/harness yêu cầu static + runtime;
TUI adapter/service/facade/config/harness yêu cầu static + TUI. Shared/core thuần
không mặc định TUI smoke; Docker/Compose/shared sandbox hoặc dependency manifest
yêu cầu cả hai boundary. Docs/unrelated skill content không trigger smoke.
Integration path mới chưa map trả `needs-review`.

## Đầu vào và fingerprint

`scripts/smoke-policy.json` version 1 định nghĩa đầu vào độc lập cho static,
runtime/TUI. SHA-256 dùng byte, path tương đối chuẩn hóa, loại file/bit thực thi,
mode, phiên bản runner/policy và allowlist environment liên quan. Resolve đồ thị
import từ điểm vào server/TUI để bao phủ dependency bắc cầu. Source/config chỉ
thuộc TUI không làm mất hiệu lực runtime stamp; dependency chung làm mất cả hai.
Không dùng mtime, branch hoặc path workspace tuyệt đối.

Phiên bản gồm Node host/image đã pin, OpenCode pin và plugin SDK trong lockfile;
runtime thêm phiên bản Docker server/định danh daemon; TUI thêm Python và nền
tảng/kiến trúc host. Runtime đối chiếu OpenCode pin với binary thật. Fingerprint
không lưu source hoặc environment nguyên trạng.

Allowlist environment: `NODE_VERSION`, `OPENCODE_VERSION`, `SANDBOX_FIXTURE`,
`TERM` (TERM không ảnh hưởng key runtime). Env host ưu tiên hơn `sandbox/.env`,
sau đó mặc định Compose; chỉ hỗ trợ giá trị dotenv literal. `ROUTER_LIBRARY`
chọn installed nhưng không đưa path tuyệt đối vào key: byte registry/thư viện
được băm theo định danh thư viện tương đối. Installed/repository có fingerprint
riêng; byte thư viện installed đổi phải làm stamp mất hiệu lực. Symlink thoát
root/vòng lặp, COPY/interpolation chưa hỗ trợ báo lỗi config, không tạo
fingerprint yếu hoặc âm thầm dùng lại.

## Stamp đã đạt, log và gọi đồng thời

- Stamp pass: `.openarms/test-results/<mode>/<sha256>.json`, chỉ owner có quyền,
  rename atomic; chứa mode/fingerprint, thời điểm đầu/cuối, thời lượng,
  exit/signal, phiên bản và path full log smoke.
- Log smoke: `.openarms/logs/<mode>-<short-key>-<run-id>.log`, tên riêng, chỉ owner;
  ghi/đóng luồng raw stdout/stderr trước stamp. Sprint 0.3 chỉ trả summary rút gọn;
  cách kiểm tra retention và chốt retry ở
  [Hướng dẫn kiểm thử Sprint 0.3](how_to_test/Sprint_03.md).
- Không cache fail, timeout, signal, lỗi ghi log/cleanup hoặc input đổi giữa
  đầu/cuối; thiếu/hỏng stamp hoặc mất log thì chạy lại.
- Khóa theo fingerprint ngăn caller đồng thời cùng chạy OpenCode. Caller khác
  chờ owner rồi dùng lại pass; phát hiện/khôi phục khi owner chết. Chờ khóa có timeout.
- Cache hit trả `SKIP: <mode> unchanged inputs, previous pass <short-key>` và ghi
  metadata `cached: true`. Override/force/rebuild cũng được ghi metadata.
- `CI` khác rỗng tự bỏ stamp pass cục bộ; cache chưa có artifact chứng minh nguồn
  để chuyển từ máy làm việc sang CI.

Runtime/TUI do runner quản lý dùng Compose project tạm riêng, volume config/state/
cache/data/project sạch mỗi lần, `down --volumes` sau chạy. Không dùng volume
`sandbox start` thủ công hoặc project installed thủ công. Trạng thái volume thay
đổi vì vậy không khiến cache hit giả định nhầm đầu vào còn nguyên.

## Tái sử dụng image

Key build băm Dockerfile, Compose, `.dockerignore`, mọi byte source COPY trong
build context sau quy tắc bỏ qua, tham số build Node/OpenCode và chế độ thư viện.
Tag image là `openarms-sandbox:<repository|installed>-<full-build-key>`; nhãn Docker
`org.openarms.build-fingerprint` và `org.openarms.library-mode` phải khớp trước
khi dùng lại. Không chỉ tin file kết quả cục bộ hoặc tag image.

Khóa build phối hợp caller đồng thời. Runner chỉ build target runtime qua `cli`,
tránh build/export cùng image ở cả `cli`/`smoke`. Smoke có cache bỏ toàn build/
startup; smoke không cache nhưng image phù hợp chỉ kiểm tra/dùng lại image.
`--rebuild` là đường ngoại lệ tường minh. Thư viện installed mount chỉ đọc và băm
ở key smoke; path thư viện không cần copy vào image, nhưng mode image vẫn tách
để không dùng lại nhầm cấu trúc installed/repository.

Key build có thể đổi vì file COPY không liên quan server (ví dụ source TUI hoặc
README sandbox), trong khi stamp runtime còn hiệu lực: key smoke bảo vệ ranh
giới đã test, key build bảo vệ snapshot đưa vào container. Không gộp hai key,
nếu không edit chỉ TUI sẽ vô cớ làm server smoke mất hiệu lực.
