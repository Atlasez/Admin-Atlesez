import AppKit
import Combine
import CryptoKit
import Darwin
import Foundation
import Network
import Security
import SwiftUI
import WebKit
import Sparkle

private let adminOrigin = AdminAppPolicy.origin
private let initialDestination = AdminAppPolicy.home
private let sessionCookieName = "atlasez_admin_session"
#if ADMIN_APP_TESTING
private let keychainService = "org.atlasez.admin.tests.\(ProcessInfo.processInfo.processIdentifier)"
#else
private let keychainService = "org.atlasez.admin"
#endif

#if !ADMIN_APP_TESTING
@main
struct AtlasezAdminApp: App {
    @StateObject private var model = AdminAppModel()
    @NSApplicationDelegateAdaptor(AdminAppDelegate.self) private var appDelegate

    var body: some Scene {
        Window("Atlasez運営", id: "main") {
            AdminWindow(model: model)
                .frame(minWidth: 820, minHeight: 600)
                .task { model.startIfNeeded() }
        }
        .defaultSize(width: 1440, height: 900)
        .windowResizability(.contentMinSize)
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(after: .appInfo) {
                Button("アップデートを確認…") { appDelegate.checkForUpdates() }
            }
            CommandGroup(after: .toolbar) {
                Button("現在のページを再読み込み") { model.retry() }.keyboardShortcut("r")
                Button("ポータルを開く") { model.navigate(to: initialDestination) }
            }
        }
    }
}
#endif

@MainActor
final class AdminAppDelegate: NSObject, NSApplicationDelegate {
    private var updaterController: SPUStandardUpdaterController?
    private weak var mainWindow: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        updaterController = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(windowDidChangeScreen(_:)), name: NSWindow.didChangeScreenNotification, object: nil)
        DispatchQueue.main.async { [weak self] in
            guard let self, let window = NSApp.windows.first(where: { $0.isVisible && $0.styleMask.contains(.titled) }) else { return }
            self.mainWindow = window
            window.isReleasedWhenClosed = false
            window.setFrameAutosaveName("AtlasezAdminMainWindow")
            _ = window.setFrameUsingName("AtlasezAdminMainWindow")
            self.keepVisible(window)
        }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        guard let window = mainWindow else { return true }
        if !window.isVisible || window.isMiniaturized {
            window.deminiaturize(nil)
            keepVisible(window)
            window.makeKeyAndOrderFront(nil)
        }
        return true
    }
    func checkForUpdates() { updaterController?.checkForUpdates(nil) }
    func applicationWillTerminate(_ notification: Notification) { NotificationCenter.default.removeObserver(self) }
    @objc private func windowDidChangeScreen(_ notification: Notification) {
        guard let window = notification.object as? NSWindow else { return }
        keepVisible(window)
    }
    private func keepVisible(_ window: NSWindow) {
        guard !window.styleMask.contains(.fullScreen), let screen = window.screen ?? NSScreen.main else { return }
        let available = screen.visibleFrame
        let frame = AdminAppPolicy.visibleFrame(window.frame, in: available)
        if frame != window.frame { window.setFrame(frame, display: true) }
    }
}

@MainActor
final class AdminAppModel: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, NSWindowDelegate, WKHTTPCookieStoreObserver {
    @Published var webView: WKWebView?
    @Published var isLoading = true
    @Published var needsSignIn = false
    @Published var isAuthenticating = false
    @Published var sessionExpired = false
    @Published var isRestoringSession = false
    @Published var authError: String?
    @Published var pageError: String?
    private var epoch = AuthenticationEpoch()
    private let sessionStore = AdminSessionStore(service: keychainService)
    private var restorationTimeout: Timer?
    private var keychainTimeout: Timer?
    private var redemption: URLSessionDataTask?
    private let authenticationSession: URLSession
    private var loadingTimeout: Timer?
    private var failedURL: URL?
    private var downloadDestinations: [ObjectIdentifier: (temporary: URL, destination: URL)] = [:]
    private var pendingState: String?
    private var pendingVerifier: String?
    private var pendingDestination = initialDestination
    private var didStart = false
    private var popoutWindows: [NSWindow] = []
    private var trustedPopups: Set<ObjectIdentifier> = []
    private var callbackServer: LoopbackCallbackServer?
    let websiteDataStore: WKWebsiteDataStore
    private let networkMonitor = NWPathMonitor()
    private var previousNetworkStatus: NWPath.Status?
    private var hasInstalledSession = false
    init(dataStore: WKWebsiteDataStore? = nil, authenticationSession: URLSession = .shared) {
        self.authenticationSession = authenticationSession
        websiteDataStore = dataStore ?? .default()
        super.init()
        websiteDataStore.httpCookieStore.add(self)
        networkMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                guard let self else { return }
                let previous = self.previousNetworkStatus
                self.previousNetworkStatus = path.status
                if previous == .unsatisfied && path.status == .satisfied && self.pageError != nil { self.retry() }
            }
        }
        networkMonitor.start(queue: DispatchQueue(label: "org.atlasez.admin.network"))
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(didWake), name: NSWorkspace.didWakeNotification, object: nil)
    }
    @objc private func didWake() { if pageError != nil { retry() } }
    deinit { networkMonitor.cancel(); NSWorkspace.shared.notificationCenter.removeObserver(self) }

    func retry() {
        pageError = nil
        if needsSignIn { signIn(); return }
        if let url = failedURL, AdminAppPolicy.isAdmin(url) {
            webView?.load(URLRequest(url: url, timeoutInterval: 45))
        } else if webView?.url != nil { webView?.reload() }
        else { navigate(to: pendingDestination) }
    }
    func startIfNeeded() {
        guard !didStart else { return }
        didStart = true
        needsSignIn = true
        isLoading = false
        isRestoringSession = true
        let attempt = epoch.value
        restorationTimeout = Timer.scheduledTimer(withTimeInterval: 5, repeats: false) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.epoch.accepts(attempt), self.isRestoringSession else { return }
                self.isRestoringSession = false
            }
        }
        websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
            guard let self, self.epoch.accepts(attempt), self.isRestoringSession else { return }
            let cached = cookies.contains { cookie in
                cookie.name == sessionCookieName && cookie.isSecure
                    && (cookie.domain == adminOrigin.host || cookie.domain == "." + (adminOrigin.host ?? ""))
                    && (cookie.expiresDate.map { $0 > Date() } ?? true)
            }
            if cached {
                self.restorationTimeout?.invalidate()
                self.isRestoringSession = false
                self.hasInstalledSession = true
                self.needsSignIn = false
                self.navigate(to: self.pendingDestination)
                return
            }
            let store = self.sessionStore
            Task { @MainActor [weak self] in
                let token = await Task.detached { store.read() }.value
                guard let self, self.epoch.accepts(attempt), self.isRestoringSession else { return }
                self.restorationTimeout?.invalidate()
                self.isRestoringSession = false
                if let token { self.installSession(token: token, expiresAt: nil, then: self.pendingDestination) }
            }
        }
    }

    func signIn() { startLogin(returningTo: pendingDestination) }

    func attach(_ view: WKWebView) {
        webView = view
        view.navigationDelegate = self
        // Trackpad swipes should not unexpectedly navigate away from the current work.
        view.allowsBackForwardNavigationGestures = false
        if didStart, hasInstalledSession, !needsSignIn { navigate(to: pendingDestination) }
    }

    func navigate(to path: String) {
        let path = safeDestination(path)
        pendingDestination = path
        pageError = nil
        guard let url = URL(string: path, relativeTo: adminOrigin)?.absoluteURL else { return }
        failedURL = url
        webView?.load(URLRequest(url: url, timeoutInterval: 45))
    }

    private func handleLoopbackCallback(code: String, state: String) {
        guard let expectedState = pendingState, state == expectedState,
              let verifier = pendingVerifier else {
            authError = "ログインの確認に失敗しました。もう一度ログインしてください。"
            return
        }
        callbackServer?.close()
        callbackServer = nil
        redeem(code: code, verifier: verifier, attempt: epoch.value)
    }

    func cancelSignIn() {
        keychainTimeout?.invalidate()
        restorationTimeout?.invalidate()
        isRestoringSession = false
        epoch.invalidate()
        redemption?.cancel()
        redemption = nil
        callbackServer?.close()
        callbackServer = nil
        pendingState = nil
        pendingVerifier = nil
        isAuthenticating = false
    }

    func webView(_ view: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        guard view === webView else { return }
        pageError = nil
        isLoading = true
        loadingTimeout?.invalidate()
        loadingTimeout = Timer.scheduledTimer(withTimeInterval: 45, repeats: false) { [weak self, weak view] _ in
            Task { @MainActor in
                guard let self, let view, self.isLoading else { return }
                view.stopLoading()
                self.showPageError(view, message: "ページの読み込みが時間内に完了しませんでした。接続を確認して再試行してください。")
            }
        }
    }
    func webView(_ view: WKWebView, didFinish navigation: WKNavigation!) {
        guard view === webView else { return }
        loadingTimeout?.invalidate()
        isLoading = false
        pageError = nil
        failedURL = nil
    }
    func webView(_ view: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if let http = response.response as? HTTPURLResponse,
           let url = http.url, AdminAppPolicy.isAdmin(url), url.path == "/auth/logout", http.statusCode == 303 {
            cancelSignIn()
            deleteSessionToken()
        }
        if let http = response.response as? HTTPURLResponse, http.statusCode >= 500 {
            showPageError(view, message: "サーバーから正常な応答を受け取れませんでした。少し待って再試行してください。")
            decisionHandler(.cancel); return
        }
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }
    func webView(_ view: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { navigationFailed(view, error: error) }
    func webView(_ view: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { navigationFailed(view, error: error) }
    func webViewWebContentProcessDidTerminate(_ view: WKWebView) {
        showPageError(view, message: "画面の表示が停止しました。「再試行」で現在のページを開き直せます。")
    }
    private func navigationFailed(_ view: WKWebView, error: Error) {
        let nsError = error as NSError
        guard !(nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled) else { return }
        if view === webView, let url = nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL, AdminAppPolicy.isAdmin(url) { failedURL = url }
        showPageError(view, message: "ページを開けませんでした。インターネット接続を確認して再試行してください。")
    }
    private func showPageError(_ view: WKWebView, message: String) {
        if view === webView {
            loadingTimeout?.invalidate()
            isLoading = false
            pageError = message
        } else if let window = view.window {
            let alert = NSAlert()
            alert.messageText = message
            alert.addButton(withTitle: "再試行")
            alert.addButton(withTitle: "閉じる")
            alert.beginSheetModal(for: window) { result in if result == .alertFirstButtonReturn { view.reload() } }
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard navigationAction.targetFrame == nil else { return nil }
        let url = navigationAction.request.url
        // The existing editor uses window.open("") then document.write() to clone a
        // pane. Its about:blank window inherits the authenticated opener's origin.
        let inheritedBlank = (url == nil || url?.absoluteString.isEmpty == true || url?.absoluteString == "about:blank") && isAdminFrame(navigationAction.sourceFrame)
        guard inheritedBlank || url.map(AdminAppPolicy.isAdmin) == true else {
            if let url, ["http", "https"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
            return nil
        }
        let popup = WKWebView(frame: .zero, configuration: configuration)
        popup.navigationDelegate = self
        popup.uiDelegate = self
        trustedPopups.insert(ObjectIdentifier(popup))
        popup.allowsBackForwardNavigationGestures = false
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1050, height: 760),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.setFrameAutosaveName("AtlasezAdminPopoutWindow")
        window.title = "Atlasez運営"
        window.contentView = popup
        window.minSize = NSSize(width: 720, height: 520)
        if !window.setFrameUsingName("AtlasezAdminPopoutWindow") { window.center() }
        window.makeKeyAndOrderFront(nil)
        popoutWindows.append(window)
        return popup
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if ["", "about:blank"].contains(url.absoluteString), isAdminFrame(action.sourceFrame) || trustedPopups.contains(ObjectIdentifier(webView)) {
            decisionHandler(.allow); return
        }
        if action.shouldPerformDownload, AdminAppPolicy.isAdmin(url) || (["blob", "data"].contains(url.scheme ?? "") && (isAdminFrame(action.sourceFrame) || trustedPopups.contains(ObjectIdentifier(webView)))) {
            decisionHandler(.download); return
        }
        guard AdminAppPolicy.isAdmin(url) else {
            if ["http", "https"].contains(url.scheme?.lowercased() ?? "") { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel)
            return
        }
        if url.path == "/auth/google/login" {
            let destination = AdminAppPolicy.query(url)?["returnTo"] ?? pendingDestination
            decisionHandler(.cancel)
            pendingDestination = safeDestination(destination)
            requireSignIn()
            return
        }
        if webView === self.webView, action.targetFrame?.isMainFrame == true { failedURL = url }
        decisionHandler(.allow)
    }

    private func isAdminFrame(_ frame: WKFrameInfo) -> Bool {
        let origin = frame.securityOrigin
        return origin.protocol == "https" && origin.host == adminOrigin.host && (origin.port == 0 || origin.port == 443)
    }
    func webViewDidClose(_ view: WKWebView) { view.window?.close() }
    func windowWillClose(_ notification: Notification) {
        guard let window = notification.object as? NSWindow else { return }
        if let view = window.contentView as? WKWebView { trustedPopups.remove(ObjectIdentifier(view)) }
        popoutWindows.removeAll { $0 === window }
    }
    func webView(_ view: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard isAdminFrame(frame) || (frame.isMainFrame && trustedPopups.contains(ObjectIdentifier(view))), let window = view.window else { completionHandler(nil); return }
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.urls : nil) }
    }
    func webView(_ view: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard let window = view.window else { completionHandler(); return }
        let alert = NSAlert(); alert.messageText = message
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }
    func webView(_ view: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard let window = view.window else { completionHandler(false); return }
        let alert = NSAlert(); alert.messageText = message
        alert.addButton(withTitle: "続ける"); alert.addButton(withTitle: "キャンセル")
        alert.beginSheetModal(for: window) { result in completionHandler(result == .alertFirstButtonReturn) }
    }
    func webView(_ view: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { beginDownload(download) }
    func webView(_ view: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { beginDownload(download) }
    private func beginDownload(_ download: WKDownload) {
        download.delegate = self
        isLoading = false
        loadingTimeout?.invalidate()
    }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = URL(fileURLWithPath: suggestedFilename).lastPathComponent
        panel.canCreateDirectories = true
        panel.begin { [weak self] result in
            guard let self, result == .OK, let destination = panel.url else { completionHandler(nil); return }
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent("atlasez-download-" + UUID().uuidString, isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let temporary = folder.appendingPathComponent("download")
                self.downloadDestinations[ObjectIdentifier(download)] = (temporary, destination)
                completionHandler(temporary)
            } catch { self.authError = "保存先を準備できませんでした。"; completionHandler(nil) }
        }
    }
    func downloadDidFinish(_ download: WKDownload) {
        guard let paths = downloadDestinations.removeValue(forKey: ObjectIdentifier(download)) else { return }
        defer { try? FileManager.default.removeItem(at: paths.temporary.deletingLastPathComponent()) }
        do {
            try AdminAppPolicy.finishDownload(from: paths.temporary, to: paths.destination)
        } catch { authError = "ファイルを保存できませんでした。保存先を確認してダウンロードし直してください。" }
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let paths = downloadDestinations.removeValue(forKey: ObjectIdentifier(download)) { try? FileManager.default.removeItem(at: paths.temporary.deletingLastPathComponent()) }
        if (error as NSError).code != NSURLErrorCancelled { authError = "ダウンロードに失敗しました。接続を確認してやり直してください。" }
    }

    func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
        guard hasInstalledSession, !isAuthenticating, !needsSignIn else { return }
        let attempt = epoch.value
        cookieStore.getAllCookies { [weak self] cookies in
            guard let self, self.epoch.accepts(attempt), !self.isAuthenticating, !self.needsSignIn else { return }
            let hasSession = cookies.contains { $0.name == sessionCookieName && ($0.domain == adminOrigin.host || $0.domain == "." + (adminOrigin.host ?? "")) }
            if !hasSession { self.requireSignIn() }
        }
    }
    private func requireSignIn() {
        // A saved native session can expire or be revoked while the app is closed.
        // Do not launch the user's default browser as a side effect of opening the app;
        // let them explicitly start OAuth from the in-app sign-in screen instead.
        cancelSignIn()
        loadingTimeout?.invalidate()
        pageError = nil
        isLoading = false
        sessionExpired = true
        needsSignIn = true
        deleteSessionToken()
        let cookieStore = websiteDataStore.httpCookieStore
        let attempt = epoch.value
        cookieStore.getAllCookies { [weak self] cookies in
            guard let self, self.epoch.accepts(attempt) else { return }
            let adminHost = adminOrigin.host ?? ""
            for cookie in cookies where cookie.name == sessionCookieName
                && (cookie.domain == adminHost || cookie.domain == ".\(adminHost)") {
                cookieStore.delete(cookie)
            }
        }
    }

    private func startLogin(returningTo destination: String) {
        guard !isAuthenticating else { return }
        restorationTimeout?.invalidate()
        isRestoringSession = false
        epoch.invalidate()
        let attempt = epoch.value
        isAuthenticating = true
        authError = nil
        pendingDestination = safeDestination(destination)
        do {
            let verifier = try randomBase64URL(bytes: 32)
            let state = try randomBase64URL(bytes: 32)
            let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncodedString()
            let callbackServer = try LoopbackCallbackServer(expectedState: state)
            self.callbackServer = callbackServer
            pendingVerifier = verifier
            pendingState = state
            var components = URLComponents(url: adminOrigin.appendingPathComponent("auth/native-app/start"), resolvingAgainstBaseURL: false)!
            components.queryItems = [
                URLQueryItem(name: "state", value: state),
                URLQueryItem(name: "challenge", value: challenge),
                URLQueryItem(name: "redirect_uri", value: callbackServer.redirectURI),
            ]
            guard let url = components.url else { throw AuthError.invalidURL }
            guard NSWorkspace.shared.open(url) else { throw AuthError.authenticationUnavailable }
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                let result = callbackServer.waitForCallback()
                Task { @MainActor in
                    guard let self, self.epoch.accepts(attempt) else { return }
                    guard let result else {
                        self.cancelSignIn()
                        self.authError = "認証の待ち時間を超えました。もう一度ログインしてください。"
                        return
                    }
                    self.handleLoopbackCallback(code: result.code, state: result.state)
                }
            }
        } catch {
            callbackServer?.close()
            callbackServer = nil
            isAuthenticating = false
            authError = "ログインを開始できませんでした。\n\(error.localizedDescription)"
        }
    }

    private func redeem(code: String, verifier: String, attempt: UUID) {
        var request = URLRequest(url: adminOrigin.appendingPathComponent("auth/native-app/redeem"))
        request.timeoutInterval = 30
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["code": code, "verifier": verifier])
        redemption = authenticationSession.dataTask(with: request) { [weak self] data, response, error in
            Task { @MainActor in
                guard let self, self.epoch.accepts(attempt) else { return }
                self.redemption = nil
                guard error == nil,
                      let response = response as? HTTPURLResponse,
                      (200..<300).contains(response.statusCode),
                      let data,
                      let payload = try? JSONDecoder().decode(NativeSession.self, from: data) else {
                    self.isAuthenticating = false
                    self.authError = "アプリのログインを確立できませんでした。再度ログインしてください。"
                    return
                }
                self.keychainTimeout = Timer.scheduledTimer(withTimeInterval: 15, repeats: false) { [weak self] _ in
                    Task { @MainActor in
                        guard let self, self.epoch.accepts(attempt), self.isAuthenticating else { return }
                        self.cancelSignIn()
                        self.authError = "Keychainの応答が時間内に完了しませんでした。再試行してください。"
                    }
                }
                let store = self.sessionStore
                let account = await Task.detached { store.stage(payload.sessionToken) }.value
                guard self.epoch.accepts(attempt) else {
                    if let account { Task.detached { store.discard(account) } }
                    return
                }
                self.keychainTimeout?.invalidate()
                guard let account else {
                    self.isAuthenticating = false
                    self.authError = "ログイン情報を安全に保存できませんでした。Keychainの状態を確認してください。"
                    return
                }
                self.installSession(token: payload.sessionToken, expiresAt: payload.expiresAt, then: self.pendingDestination, stagedAccount: account)
            }
        }
        redemption?.resume()
    }

    private func installSession(token: String, expiresAt: String?, then path: String, stagedAccount: String? = nil) {
        let expiration = expiresAt.flatMap(ISO8601DateFormatter().date(from:)) ?? Date().addingTimeInterval(60 * 60 * 24 * 7)
        var properties: [HTTPCookiePropertyKey: Any] = [
            .domain: adminOrigin.host ?? "admin.atlasez.org",
            .path: "/",
            .name: sessionCookieName,
            .value: token,
            .secure: "TRUE",
            .expires: expiration,
            .version: "0",
        ]
        properties[HTTPCookiePropertyKey("HttpOnly")] = "TRUE"
        guard let cookie = HTTPCookie(properties: properties) else {
            if let stagedAccount { let store = sessionStore; Task.detached { store.discard(stagedAccount) } }
            isAuthenticating = false
            authError = "アプリのセッションを設定できませんでした。"
            return
        }
        let attempt = epoch.value
        websiteDataStore.httpCookieStore.setCookie(cookie) { [weak self] in
            guard let self else { return }
            guard self.epoch.accepts(attempt), let url = URL(string: self.safeDestination(path), relativeTo: adminOrigin)?.absoluteURL else {
                if let stagedAccount { let store = self.sessionStore; Task.detached { store.discard(stagedAccount) } }
                let cookieStore = self.websiteDataStore.httpCookieStore
                cookieStore.getAllCookies { cookies in
                    for existing in cookies where existing.name == cookie.name && existing.domain == cookie.domain && existing.value == token { cookieStore.delete(existing) }
                }
                return
            }
            if let stagedAccount {
                let store = self.sessionStore
                let previous = store.activate(stagedAccount)
                Task.detached { store.discard(previous) }
            }
            self.isAuthenticating = false
            self.pendingState = nil
            self.pendingVerifier = nil
            self.hasInstalledSession = true
            self.sessionExpired = false
            self.needsSignIn = false
            self.webView?.load(URLRequest(url: url, timeoutInterval: 45))
        }
    }

    private func safeDestination(_ value: String) -> String { AdminAppPolicy.destination(value) }

    private func randomBase64URL(bytes count: Int) throws -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        guard SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess else { throw AuthError.randomFailure }
        return Data(bytes).base64URLEncodedString()
    }

    private func deleteSessionToken() {
        let store = sessionStore
        let account = store.detach()
        Task.detached { store.discard(account) }
    }

    #if ADMIN_APP_TESTING
    func testRedeem() { epoch.invalidate(); isAuthenticating = true; redeem(code: "fixture-code", verifier: "fixture-verifier", attempt: epoch.value) }
    func testSaveSession(_ token: String) -> Bool {
        guard let account = sessionStore.stage(token) else { return false }
        let old = sessionStore.activate(account); sessionStore.discard(old); return true
    }
    func testReadSession() -> String? { sessionStore.read() }
    func testClearSession() { sessionStore.discard(sessionStore.detach()) }
    func testRequireSignIn() { requireSignIn() }
    #endif

    private enum AuthError: LocalizedError {
        case invalidURL, authenticationUnavailable, randomFailure
        var errorDescription: String? {
            switch self {
            case .invalidURL: "ログインURLが不正です。"
            case .authenticationUnavailable: "macOSのログイン画面を開けませんでした。"
            case .randomFailure: "安全なログイン情報を生成できませんでした。"
            }
        }
    }
}

private struct NativeSession: Decodable {
    let sessionToken: String
    let expiresAt: String
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

private struct AdminWindow: View {
    @ObservedObject var model: AdminAppModel

    var body: some View {
        ZStack {
            workspace.opacity(model.needsSignIn ? 0 : 1)
                .allowsHitTesting(!model.needsSignIn)
                .accessibilityHidden(model.needsSignIn)
            if model.needsSignIn { signInPanel }
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .alert("操作を完了できません", isPresented: Binding(get: { model.authError != nil }, set: { if !$0 { model.authError = nil } })) {
            if model.needsSignIn { Button("ログインを再試行") { model.authError = nil; model.signIn() } }
            Button("閉じる", role: .cancel) { model.authError = nil }
        } message: { Text(model.authError ?? "") }
    }

    private var signInPanel: some View {
        VStack(spacing: 18) {
            Image(systemName: "square.grid.2x2.fill")
                .font(.system(size: 42, weight: .medium))
                .foregroundStyle(Color.accentColor)
            Text("Atlasez 運営")
                .font(.system(size: 26, weight: .semibold))
            Text(signInMessage)
                .foregroundStyle(.secondary)
            Button { model.signIn() } label: {
                Label(model.isAuthenticating ? "ログイン画面を確認" : "Googleでログイン", systemImage: "person.crop.circle.badge.checkmark")
                    .frame(minWidth: 190)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .disabled(model.isAuthenticating || model.isRestoringSession)
            if model.isAuthenticating {
                Button("キャンセル") { model.cancelSignIn() }.buttonStyle(.link)
            }
            Text("ログイン情報はこのMacのKeychainに保護して保存されます。")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var signInMessage: String {
        if model.isRestoringSession { return "保存済みのログイン状態を確認しています…" }
        if model.isAuthenticating {
            return "安全なGoogleログインを開いています…"
        }
        if model.sessionExpired {
            return "ログイン状態を確認できませんでした。下のボタンから再ログインできます。"
        }
        return "運営用アカウントでログインしてください。ログイン時のみブラウザが開き、認証後はアプリに戻ります。"
    }

    private var workspace: some View {
        ZStack(alignment: .topTrailing) {
            AdminWebView(model: model)
            if let error = model.pageError {
                VStack(spacing: 16) {
                    Image(systemName: "wifi.exclamationmark").font(.largeTitle)
                    Text(error).multilineTextAlignment(.center)
                    Button("再試行") { model.retry() }.buttonStyle(.borderedProminent)
                }
                .padding(28)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(nsColor: .windowBackgroundColor))
            }
            if model.isLoading {
                ProgressView()
                    .controlSize(.small)
                    .padding(8)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            }
        }
    }
}

private struct AdminWebView: NSViewRepresentable {
    @ObservedObject var model: AdminAppModel
    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = model.websiteDataStore
        let view = WKWebView(frame: .zero, configuration: configuration)
        model.attach(view)
        view.uiDelegate = model
        return view
    }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
