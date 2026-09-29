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
    application.terminate(nil)
}

let application = NSApplication.shared
application.setActivationPolicy(.accessory)
application.activate(ignoringOtherApps: true)

guard let chromeURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.google.Chrome") else {
    if !NSWorkspace.shared.open(adminURL) {
        showBrowserFallback(message: "既定のブラウザを開けませんでした。ブラウザを確認して、もう一度お試しください。")
    }
    exit(EXIT_SUCCESS)
}

let configuration = NSWorkspace.OpenConfiguration()
NSWorkspace.shared.open([adminURL], withApplicationAt: chromeURL, configuration: configuration) { _, error in
    DispatchQueue.main.async {
        if let error {
            showBrowserFallback(
                message: "Google Chromeで管理サイトを開けませんでした。既定のブラウザで続けますか？\n\n\(error.localizedDescription)"
            )
            return
        }

        application.terminate(nil)
    }
}

application.run()
