#!/bin/bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_path="${1:-$repo_root/dist-macos/Atlasez-Admin.dmg}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This package can only be built on macOS." >&2
  exit 1
fi

for tool in swiftc lipo hdiutil iconutil sips codesign install_name_tool curl unzip ditto; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Required macOS build tool not found: $tool" >&2
    exit 1
  fi
done

source_icon="$repo_root/public/images/atlasez-logo.png"
launcher_source="$repo_root/macos/AtlasezAdminLauncher.swift"
core_source="$repo_root/macos/AdminAppCore.swift"
info_plist="$repo_root/macos/Info.plist"

for file in "$source_icon" "$launcher_source" "$core_source" "$info_plist"; do
  if [[ ! -f "$file" ]]; then
    echo "Required source file not found: $file" >&2
    exit 1
  fi
done

mkdir -p "$(dirname "$output_path")"
output_path="$(cd "$(dirname "$output_path")" && pwd)/$(basename "$output_path")"
temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/atlasez-admin-dmg.XXXXXX")"
trap 'rm -rf "$temp_dir"' EXIT

sparkle_version="2.10.0"
sparkle_sha256="17e28312b8e18ab7cdbbe09a6fb28cc55a5479ec6c371dbc07cdecd2a14fd959"
sparkle_archive="$temp_dir/Sparkle.zip"
sparkle_url="https://github.com/sparkle-project/Sparkle/releases/download/$sparkle_version/Sparkle-for-Swift-Package-Manager.zip"
curl --fail --location --silent --show-error "$sparkle_url" --output "$sparkle_archive"
printf '%s  %s\n' "$sparkle_sha256" "$sparkle_archive" | shasum --check --status || {
  echo "Sparkle $sparkle_version checksum verification failed." >&2
  exit 1
}
unzip -q "$sparkle_archive" -d "$temp_dir/sparkle"
sparkle_framework="$temp_dir/sparkle/Sparkle.xcframework/macos-arm64_x86_64/Sparkle.framework"
if [[ ! -d "$sparkle_framework" ]]; then
  echo "Universal Sparkle framework was not found in the verified release archive." >&2
  exit 1
fi

app_name="Atlasez運営.app"
app_path="$temp_dir/staging/$app_name"
contents_path="$app_path/Contents"
macos_path="$contents_path/MacOS"
resources_path="$contents_path/Resources"
frameworks_path="$contents_path/Frameworks"
iconset_path="$temp_dir/AppIcon.iconset"

mkdir -p "$macos_path" "$resources_path" "$frameworks_path" "$iconset_path"
cp "$info_plist" "$contents_path/Info.plist"
ditto "$sparkle_framework" "$frameworks_path/Sparkle.framework"
cp "$temp_dir/sparkle/LICENSE" "$resources_path/Sparkle-LICENSE.txt"

app_version="${ADMIN_APP_VERSION:-1.0.5}"
build_version="${ADMIN_APP_BUILD_VERSION:-6}"
if [[ ! "$app_version" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ || ! "$build_version" =~ ^[0-9]+$ ]]; then
  echo "ADMIN_APP_VERSION and ADMIN_APP_BUILD_VERSION must be numeric version strings." >&2
  exit 1
fi
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $app_version" "$contents_path/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $build_version" "$contents_path/Info.plist"

swiftc -O -parse-as-library -target arm64-apple-macosx13.0 -framework AppKit -framework SwiftUI \
  -framework WebKit -framework Security -framework CryptoKit -F "$(dirname "$sparkle_framework")" -framework Sparkle \
  "$launcher_source" "$core_source" -o "$temp_dir/AtlasezAdmin-arm64"
swiftc -O -parse-as-library -target x86_64-apple-macosx13.0 -framework AppKit -framework SwiftUI \
  -framework WebKit -framework Security -framework CryptoKit -F "$(dirname "$sparkle_framework")" -framework Sparkle \
  "$launcher_source" "$core_source" -o "$temp_dir/AtlasezAdmin-x86_64"
lipo -create "$temp_dir/AtlasezAdmin-arm64" "$temp_dir/AtlasezAdmin-x86_64" \
  -output "$macos_path/AtlasezAdmin"
install_name_tool -add_rpath @executable_path/../Frameworks "$macos_path/AtlasezAdmin"

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

if [[ -n "${ATLASEZ_APP_OUTPUT:-}" ]]; then
  mkdir -p "$(dirname "$ATLASEZ_APP_OUTPUT")"
  ditto "$app_path" "$ATLASEZ_APP_OUTPUT"
fi

cat > "$temp_dir/staging/インストール方法.txt" <<'EOF'
Atlasez運営 for Mac

1. Atlasez運営.app を「Applications」へドラッグしてください。
2. アプリを開くと、Chromeとは独立した専用ウィンドウで運営サイトの画面が開きます。
3. Googleログイン時だけ既定ブラウザを使います。認証後はアプリに戻り、セッション情報はこのMacのKeychainに保存されます。
4. 更新はアプリが自動で確認し、利用可能な更新があれば確認画面を表示します。

このアプリはインターネット接続が必要です。オフライン機能はありません。

初回起動時にmacOSが開発元を確認できないと表示する場合は、アプリをControlキーを押しながらクリックし、「開く」を選んでください。
この配布物はDeveloper ID署名・Apple公証を行っていません。
EOF

ln -s /Applications "$temp_dir/staging/Applications"
hdiutil create -volname "Atlasez運営" -srcfolder "$temp_dir/staging" \
  -ov -format UDZO "$output_path" >/dev/null

echo "Created $output_path"
