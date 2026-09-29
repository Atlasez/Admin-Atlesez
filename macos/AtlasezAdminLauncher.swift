import AppKit
import Foundation

private let adminURL = URL(string: "https://admin.atlasez.org/admin/atlas/?source=dmg")!

private func showBrowserFallback(message: String) {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = "Atlasez運営を開けません"
    alert.informativeText = message
    alert.addButton(withTitle: "既定のブラウザで開く")
    alert.addButton(withTitle: "キャンセル")

    if alert.runModal() == .alertFirstButtonReturn {
        NSWorkspace.shared.open(adminURL)
    }
}

let application = NSApplication.shared
application.setActivationPolicy(.accessory)
application.activate(ignoringOtherApps: true)

guard let chromeURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.google.Chrome") else {
    showBrowserFallback(
        message: "専用ウィンドウで開くにはGoogle Chromeが必要です。Chromeをインストールするか、既定のブラウザで続けてください。"
    )
    exit(EXIT_SUCCESS)
}

let launchChrome = Process()
launchChrome.executableURL = URL(fileURLWithPath: "/usr/bin/open")
launchChrome.arguments = ["-a", chromeURL.path, "--args", "--app=\(adminURL.absoluteString)"]

do {
    try launchChrome.run()
} catch {
    showBrowserFallback(
        message: "Google Chromeの起動に失敗しました。Chromeを確認するか、既定のブラウザで続けてください。\n\n\(error.localizedDescription)"
    )
}

exit(EXIT_SUCCESS)
