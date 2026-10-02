#!/bin/bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_path="${1:-$repo_root/dist-macos/test/Atlasez運営.app}"
app_path="$(cd "$(dirname "$app_path")" && pwd)/$(basename "$app_path")"
frameworks="$app_path/Contents/Frameworks"
output="$repo_root/dist-macos/tests"
mkdir -p "$output"
swiftc -parse-as-library -D ADMIN_APP_TESTING -framework AppKit -framework SwiftUI \
  -framework WebKit -framework Security -framework CryptoKit -F "$frameworks" -framework Sparkle \
  -Xlinker -rpath -Xlinker "$frameworks" \
  "$repo_root/macos/AdminAppCore.swift" "$repo_root/macos/AtlasezAdminLauncher.swift" \
  "$repo_root/tests/macos/AdminAppTests.swift" -o "$output/AdminAppTests"
if [[ "${2:-}" == "--fixture" ]]; then
  fixture="$output/Atlasez Native Regression Fixture.app"
  mkdir -p "$fixture/Contents/MacOS"
  cp "$app_path/Contents/Info.plist" "$fixture/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier org.atlasez.admin.regressionfixture' "$fixture/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c 'Set :CFBundleExecutable AdminAppTests' "$fixture/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c 'Set :CFBundleName Atlasez Native Regression Fixture' "$fixture/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c 'Add :CFBundleDisplayName string Atlasez Native Regression Fixture' "$fixture/Contents/Info.plist"
  cp "$output/AdminAppTests" "$fixture/Contents/MacOS/"
  codesign --force --sign - "$fixture"
else
  "$output/AdminAppTests"
fi
