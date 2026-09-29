#!/bin/bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_path="${1:-$repo_root/dist-macos/Atlasez-Admin.dmg}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This package can only be built on macOS." >&2
  exit 1
fi

for tool in swiftc lipo hdiutil iconutil sips codesign; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Required macOS build tool not found: $tool" >&2
    exit 1
  fi
done

source_icon="$repo_root/public/images/atlasez-logo.png"
launcher_source="$repo_root/macos/AtlasezAdminLauncher.swift"
info_plist="$repo_root/macos/Info.plist"

for file in "$source_icon" "$launcher_source" "$info_plist"; do
  if [[ ! -f "$file" ]]; then
    echo "Required source file not found: $file" >&2
    exit 1
  fi
done

mkdir -p "$(dirname "$output_path")"
output_path="$(cd "$(dirname "$output_path")" && pwd)/$(basename "$output_path")"
temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/atlasez-admin-dmg.XXXXXX")"
trap 'rm -rf "$temp_dir"' EXIT

app_name="Atlasez運営.app"
app_path="$temp_dir/staging/$app_name"
contents_path="$app_path/Contents"
macos_path="$contents_path/MacOS"
resources_path="$contents_path/Resources"
iconset_path="$temp_dir/AppIcon.iconset"

mkdir -p "$macos_path" "$resources_path" "$iconset_path"
cp "$info_plist" "$contents_path/Info.plist"

swiftc -O -target arm64-apple-macosx13.0 -framework AppKit \
  "$launcher_source" -o "$temp_dir/AtlasezAdmin-arm64"
swiftc -O -target x86_64-apple-macosx13.0 -framework AppKit \
  "$launcher_source" -o "$temp_dir/AtlasezAdmin-x86_64"
lipo -create "$temp_dir/AtlasezAdmin-arm64" "$temp_dir/AtlasezAdmin-x86_64" \
  -output "$macos_path/AtlasezAdmin"

for size in 16 32 128 256 512; do
  double_size=$((size * 2))
  sips -z "$size" "$size" "$source_icon" \
    --out "$iconset_path/icon_${size}x${size}.png" >/dev/null
  sips -z "$double_size" "$double_size" "$source_icon" \
    --out "$iconset_path/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset_path" -o "$resources_path/AppIcon.icns"

codesign --force --deep --sign - "$app_path"
codesign --verify --deep --strict "$app_path"

cat > "$temp_dir/staging/インストール方法.txt" <<'EOF'
Atlasez運営 for Mac

1. Atlasez運営.app を「Applications」へドラッグしてください。
2. アプリを開くと、運営サイトがGoogle Chromeの専用ウィンドウで開きます。
3. 既存のChromeプロファイルを使用するため、ログイン状態・Google認証・サイト機能はChrome版と共有されます。

Google Chromeがない場合は、Chromeをインストールするか、表示される案内から既定のブラウザで開いてください。
このアプリはインターネット接続が必要です。オフライン機能はありません。

初回起動時にmacOSが開発元を確認できないと表示する場合は、アプリをControlキーを押しながらクリックし、「開く」を選んでください。
この配布物はDeveloper ID署名・Apple公証を行っていません。
EOF

ln -s /Applications "$temp_dir/staging/Applications"
hdiutil create -volname "Atlasez運営" -srcfolder "$temp_dir/staging" \
  -ov -format UDZO "$output_path" >/dev/null

echo "Created $output_path"
