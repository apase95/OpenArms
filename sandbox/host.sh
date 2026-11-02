#!/usr/bin/env bash
# Khởi chạy OpenArms trên máy Host với lớp bảo vệ Bubblewrap (bwrap)
# - Profile test riêng biệt (.dev-env)
# - Khóa Read-Only tuyệt đối với ~/.config/opencode và ~/.local/share/opencode
# - Tự động probe kiểm tra quyền Read-Only trước khi mở OpenCode

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_DIR="$REPO_ROOT/.dev-env"
DEV_CONFIG="$DEV_DIR/config/opencode"
DEV_DATA="$DEV_DIR/data/opencode"
DEV_STATE="$DEV_DIR/state/opencode"
DEV_PROJECT="${1:-$DEV_DIR/test-project}"

# Kiểm tra bwrap đã cài chưa
if ! command -v bwrap >/dev/null 2>&1; then
  echo "LỖI: bubblewrap (bwrap) chưa được cài đặt trên hệ thống."
  exit 1
fi

mkdir -p "$DEV_CONFIG" "$DEV_DATA" "$DEV_STATE" "$DEV_PROJECT"

# 1. Kế thừa auth.json từ máy host để có sẵn model provider mà không cần login lại
if [ -f "$HOME/.local/share/opencode/auth.json" ] && [ ! -f "$DEV_DATA/auth.json" ]; then
  cp "$HOME/.local/share/opencode/auth.json" "$DEV_DATA/auth.json"
fi

# 2. Cấu hình nạp plugin OpenArms cho môi trường này
cat <<EOF > "$DEV_CONFIG/opencode.json"
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": [
    "file://$REPO_ROOT/plugins/skill-router-server.ts"
  ]
}
EOF

cat <<EOF > "$DEV_CONFIG/tui.json"
{
  "\$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "file://$REPO_ROOT/plugins/skill-router-tui.tsx"
  ]
}
EOF

# 3. Sao chép fixture mẫu nếu project trống
if [ -z "$(ls -A "$DEV_PROJECT" 2>/dev/null)" ]; then
  cp -r "$REPO_ROOT/sandbox/fixtures/docs-project/"* "$DEV_PROJECT/" 2>/dev/null || true
fi

echo "=================================================================="
echo " OpenArms - Môi trường Host Cô Lập với Bubblewrap Guard"
echo "------------------------------------------------------------------"
echo " Project:       $DEV_PROJECT"
echo " Config test:   $DEV_CONFIG (Đọc / Ghi)"
echo " Data test:     $DEV_DATA   (Đọc / Ghi)"
echo " Khóa bảo vệ:   $HOME/.config/opencode (CHỈ ĐỌC - READ-ONLY)"
echo "                $HOME/.local/share/opencode (CHỈ ĐỌC - READ-ONLY)"
echo "=================================================================="

# 4. Kiểm tra probe an toàn bên trong bwrap trước khi khởi động OpenCode
PROBE_RESULT=$(bwrap \
  --bind / / \
  --dev /dev \
  --proc /proc \
  --ro-bind "$HOME/.config/opencode" "$HOME/.config/opencode" \
  bash -c "touch '$HOME/.config/opencode/.probe_test' 2>&1" || true)

if [[ "$PROBE_RESULT" != *"Read-only file system"* ]]; then
  echo "❌ NGUY HIỂM: Thử nghiệm khóa Read-Only thất bại! Kết quả: $PROBE_RESULT"
  echo "Dừng khởi động để đảm bảo an toàn tuyệt đối cho cấu hình host."
  exit 1
fi

echo "✔ Xác thực an toàn: Đã khóa Read-Only thư mục global thành công!"
echo "------------------------------------------------------------------"

# 5. Khởi chạy OpenCode trong bwrap sandbox
exec bwrap \
  --bind / / \
  --dev /dev \
  --proc /proc \
  --ro-bind "$HOME/.config/opencode" "$HOME/.config/opencode" \
  --ro-bind "$HOME/.local/share/opencode" "$HOME/.local/share/opencode" \
  --bind "$DEV_DIR" "$DEV_DIR" \
  --setenv XDG_CONFIG_HOME "$DEV_DIR/config" \
  --setenv XDG_DATA_HOME "$DEV_DIR/data" \
  --setenv XDG_STATE_HOME "$DEV_DIR/state" \
  opencode "$DEV_PROJECT"
