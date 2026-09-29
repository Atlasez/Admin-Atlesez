import AppKit
import Combine
import CryptoKit
import Darwin
import Foundation
import Security
import SwiftUI
import WebKit

private let adminOrigin = URL(string: "https://admin.atlasez.org")!
private let initialDestination = "/admin/atlas/"
private let sessionCookieName = "atlasez_admin_session"
private let keychainService = "org.atlasez.admin"
private let keychainAccount = "admin-session"

@main
struct AtlasezAdminApp: App {
    @StateObject private var model = AdminAppModel()

    var body: some Scene {
        WindowGroup("Atlasez運営") {
            AdminWindow(model: model)
                .frame(minWidth: 980, minHeight: 680)
                .task { model.startIfNeeded() }
        }
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandMenu("ページ") {
                Button("戻る") { model.goBack() }.keyboardShortcut("[", modifiers: .command)
                Button("進む") { model.goForward() }.keyboardShortcut("]", modifiers: .command)
                Button("再読み込み") { model.reload() }.keyboardShortcut("r", modifiers: .command)
                Divider()
                Button("運営トップ") { model.navigate(to: initialDestination) }
                Button("アクションセンター") { model.navigate(to: "/admin/action-center/") }
                Button("記事・フィードバック") { model.navigate(to: "/admin/articles/") }
            }
            CommandGroup(replacing: .appTermination) {
                Button("ログアウト") { model.logout() }
                Divider()
                Button("Atlasez運営を終了") { NSApplication.shared.terminate(nil) }
                    .keyboardShortcut("q")
            }
        }
    }
}

@MainActor
final class AdminAppModel: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    @Published var webView: WKWebView?
    @Published var isLoading = true
    @Published var needsSignIn = false
    @Published var isAuthenticating = false
    @Published var authError: String?

    private var pendingState: String?
    private var pendingVerifier: String?
    private var pendingDestination = initialDestination
    private var didStart = false
    private var popoutWindows: [NSWindow] = []
    private var callbackServer: LoopbackCallbackServer?

    func startIfNeeded() {
        guard !didStart else { return }
        didStart = true
        if let token = readSessionToken() {
            installSession(token: token, expiresAt: nil, then: pendingDestination)
        } else {
            needsSignIn = true
        }
    }

    func signIn() { startLogin(returningTo: pendingDestination) }

    func attach(_ view: WKWebView) {
        webView = view
        view.navigationDelegate = self
        view.allowsBackForwardNavigationGestures = true
        if didStart, let token = readSessionToken() {
            installSession(token: token, expiresAt: nil, then: pendingDestination)
        }
    }

    func navigate(to path: String) {
        guard path.hasPrefix("/"), !path.hasPrefix("//") else { return }
        pendingDestination = path
        guard let url = URL(string: path, relativeTo: adminOrigin)?.absoluteURL else { return }
        webView?.load(URLRequest(url: url))
    }

    func goBack() { if webView?.canGoBack == true { webView?.goBack() } }
    func goForward() { if webView?.canGoForward == true { webView?.goForward() } }
    func reload() { webView?.reload() }

    func logout() {
        guard let webView else { return }
        webView.evaluateJavaScript("fetch('/auth/logout',{method:'POST',credentials:'include'})") { [weak self] _, _ in
            guard let self else { return }
            self.deleteSessionToken()
            self.webView?.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
                guard let self else { return }
                let host = adminOrigin.host ?? "admin.atlasez.org"
                cookies.filter { $0.name == sessionCookieName && $0.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")) == host }
                    .forEach { self.webView?.configuration.websiteDataStore.httpCookieStore.delete($0) }
                self.needsSignIn = true
            }
        }
    }

    private func handleLoopbackCallback(code: String, state: String) {
        guard let expectedState = pendingState, state == expectedState,
              let verifier = pendingVerifier else {
            authError = "ログインの確認に失敗しました。もう一度ログインしてください。"
            return
        }
        callbackServer?.close()
        callbackServer = nil
        pendingState = nil
        pendingVerifier = nil
        redeem(code: code, verifier: verifier)
    }

    func cancelSignIn() {
        callbackServer?.close()
        callbackServer = nil
        pendingState = nil
        pendingVerifier = nil
        isAuthenticating = false
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        isLoading = true
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoading = false
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        isLoading = false
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        isLoading = false
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard navigationAction.targetFrame == nil,
              let url = navigationAction.request.url else { return nil }
        guard url.host == adminOrigin.host else {
            NSWorkspace.shared.open(url)
            return nil
        }
        let popup = WKWebView(frame: .zero, configuration: configuration)
        popup.navigationDelegate = self
        popup.uiDelegate = self
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1050, height: 760),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Atlasez運営"
        window.contentView = popup
        window.minSize = NSSize(width: 720, height: 520)
        window.center()
        window.makeKeyAndOrderFront(nil)
        popoutWindows.append(window)
        return popup
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        guard url.host == adminOrigin.host else {
            if ["http", "https"].contains(url.scheme?.lowercased() ?? "") { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel)
            return
        }
        if url.path == "/auth/google/login" {
            let destination = url.queryItems["returnTo"] ?? pendingDestination
            decisionHandler(.cancel)
            startLogin(returningTo: safeDestination(destination))
            return
        }
        decisionHandler(.allow)
    }

    private func startLogin(returningTo destination: String) {
        guard !isAuthenticating else { return }
        isAuthenticating = true
        pendingDestination = safeDestination(destination)
        do {
            let verifier = try randomBase64URL(bytes: 32)
            let state = try randomBase64URL(bytes: 32)
            let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncodedString()
            let callbackServer = try LoopbackCallbackServer()
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
                    guard let self else { return }
                    self.isAuthenticating = false
                    guard let result else {
                        if self.pendingState == state { self.authError = "ブラウザから認証結果を受け取れませんでした。もう一度お試しください。" }
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

    private func redeem(code: String, verifier: String) {
        var request = URLRequest(url: adminOrigin.appendingPathComponent("auth/native-app/redeem"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["code": code, "verifier": verifier])
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            Task { @MainActor in
                guard let self else { return }
                guard error == nil,
                      let response = response as? HTTPURLResponse,
                      (200..<300).contains(response.statusCode),
                      let data,
                      let payload = try? JSONDecoder().decode(NativeSession.self, from: data) else {
                    self.authError = "アプリのログインを確立できませんでした。再度ログインしてください。"
                    return
                }
                guard self.saveSessionToken(payload.sessionToken) else {
                    self.authError = "ログイン情報を安全に保存できませんでした。Keychainの状態を確認してください。"
                    return
                }
                self.installSession(token: payload.sessionToken, expiresAt: payload.expiresAt, then: self.pendingDestination)
            }
        }.resume()
    }

    private func installSession(token: String, expiresAt: String?, then path: String) {
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
            authError = "アプリのセッションを設定できませんでした。"
            return
        }
        WKWebsiteDataStore.default().httpCookieStore.setCookie(cookie) { [weak self] in
            guard let self, let url = URL(string: self.safeDestination(path), relativeTo: adminOrigin)?.absoluteURL else { return }
            self.needsSignIn = false
            self.webView?.load(URLRequest(url: url))
        }
    }

    private func safeDestination(_ value: String) -> String {
        guard value.hasPrefix("/"), !value.hasPrefix("//"), !value.contains("\\") else { return initialDestination }
        return value
    }

    private func randomBase64URL(bytes count: Int) throws -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        guard SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess else { throw AuthError.randomFailure }
        return Data(bytes).base64URLEncodedString()
    }

    private func readSessionToken() -> String? {
        var query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService, kSecAttrAccount as String: keychainAccount, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        query.removeAll()
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    private func saveSessionToken(_ token: String) -> Bool {
        let data = Data(token.utf8)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService, kSecAttrAccount as String: keychainAccount]
        SecItemDelete(query as CFDictionary)
        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess
    }

    private func deleteSessionToken() {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService, kSecAttrAccount as String: keychainAccount]
        SecItemDelete(query as CFDictionary)
    }

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

private final class LoopbackCallbackServer: @unchecked Sendable {
    struct Callback { let code: String; let state: String }
    let redirectURI: String
    private let socketFD: Int32
    private let port: UInt16
    private let lock = NSLock()
    private var closed = false

    init() throws {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = 0
        address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
        let bound = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bound == 0, listen(fd, 4) == 0 else {
            let code = errno
            Darwin.close(fd)
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(code))
        }
        var actual = sockaddr_in()
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let named = withUnsafeMutablePointer(to: &actual) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                getsockname(fd, $0, &length)
            }
        }
        guard named == 0 else {
            let code = errno
            Darwin.close(fd)
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(code))
        }
        socketFD = fd
        port = UInt16(bigEndian: actual.sin_port)
        redirectURI = "http://127.0.0.1:\(port)/callback"
    }

    func waitForCallback() -> Callback? {
        while !isClosed {
            var peer = sockaddr_in()
            var peerLength = socklen_t(MemoryLayout<sockaddr_in>.size)
            let client = withUnsafeMutablePointer(to: &peer) { pointer in
                pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    accept(socketFD, $0, &peerLength)
                }
            }
            guard client >= 0 else { return nil }
            defer { Darwin.close(client) }
            guard peer.sin_addr.s_addr == inet_addr("127.0.0.1") else {
                respond(client, status: "403 Forbidden", text: "この接続は許可されていません。")
                continue
            }
            var bytes = [UInt8](repeating: 0, count: 8192)
            let count = bytes.withUnsafeMutableBytes { recv(client, $0.baseAddress, $0.count, 0) }
            guard count > 0,
                  let request = String(bytes: bytes.prefix(count), encoding: .utf8),
                  let firstLine = request.components(separatedBy: "\r\n").first else { continue }
            let parts = firstLine.split(separator: " ")
            guard parts.count >= 2, parts[0] == "GET",
                  let callbackURL = URL(string: "http://127.0.0.1:\(port)\(parts[1])"),
                  callbackURL.path == "/callback" else {
                respond(client, status: "404 Not Found", text: "Atlasez運営アプリに戻ってください。")
                continue
            }
            let items = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?.queryItems ?? []
            let query = Dictionary(uniqueKeysWithValues: items.compactMap { item in item.value.map { (item.name, $0) } })
            guard let code = query["code"], let state = query["state"] else {
                respond(client, status: "400 Bad Request", text: "認証情報を確認できませんでした。アプリに戻って再試行してください。")
                continue
            }
            respond(client, status: "200 OK", text: "ログインが完了しました。このタブを閉じてAtlasez運営アプリに戻ってください。")
            close()
            return Callback(code: code, state: state)
        }
        return nil
    }

    func close() {
        lock.lock()
        defer { lock.unlock() }
        guard !closed else { return }
        closed = true
        shutdown(socketFD, SHUT_RDWR)
        Darwin.close(socketFD)
    }

    private var isClosed: Bool { lock.lock(); defer { lock.unlock() }; return closed }

    private func respond(_ client: Int32, status: String, text: String) {
        let body = "<!doctype html><html lang=\"ja\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Atlasez運営</title><body style=\"font:16px system-ui;max-width:38rem;margin:15vh auto;padding:1rem;line-height:1.7\"><h1>Atlasez運営</h1><p>\(text)</p></body></html>"
        let data = Data(body.utf8)
        let header = "HTTP/1.1 \(status)\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: \(data.count)\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'\r\n\r\n"
        var response = Data(header.utf8)
        response.append(data)
        response.withUnsafeBytes { _ = send(client, $0.baseAddress, $0.count, 0) }
    }

    deinit { close() }
}

private extension URL {
    var queryItems: [String: String] {
        Dictionary(uniqueKeysWithValues: (URLComponents(url: self, resolvingAgainstBaseURL: false)?.queryItems ?? []).compactMap { item in item.value.map { (item.name, $0) } })
    }
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

private struct AdminWindow: View {
    @ObservedObject var model: AdminAppModel

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                Image(systemName: "square.grid.2x2.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color.accentColor)
                Text("Atlasez 運営")
                    .font(.system(size: 15, weight: .semibold))
                Spacer()
                Button { model.goBack() } label: { Image(systemName: "chevron.left") }.help("戻る")
                Button { model.goForward() } label: { Image(systemName: "chevron.right") }.help("進む")
                Button { model.reload() } label: { Image(systemName: "arrow.clockwise") }.help("再読み込み")
            }
            .buttonStyle(.borderless)
            .padding(.horizontal, 18)
            .frame(height: 52)
            .background(.bar)
            Divider()
            if model.needsSignIn {
                VStack(spacing: 18) {
                    Image(systemName: "square.grid.2x2.fill")
                        .font(.system(size: 42, weight: .medium))
                        .foregroundStyle(Color.accentColor)
                    Text("Atlasez 運営")
                        .font(.system(size: 26, weight: .semibold))
                    Text(model.isAuthenticating ? "安全なGoogleログインを開いています…" : "運営用アカウントでログインしてください。")
                        .foregroundStyle(.secondary)
                    Button { model.signIn() } label: {
                        Label(model.isAuthenticating ? "ログイン画面を確認" : "Googleでログイン", systemImage: "person.crop.circle.badge.checkmark")
                            .frame(minWidth: 190)
                            .padding(.vertical, 6)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.isAuthenticating)
                    if model.isAuthenticating {
                        Button("キャンセル") { model.cancelSignIn() }.buttonStyle(.link)
                    }
                    Text("ログイン情報はこのMacのKeychainに保護して保存されます。")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
              HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("運営")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 12)
                        .padding(.top, 12)
                    sidebarItem("アクションセンター", icon: "checklist", path: "/admin/action-center/")
                    sidebarItem("編集・フィードバック", icon: "text.badge.checkmark", path: "/admin/articles/")
                    sidebarItem("記事", icon: "doc.text", path: "/admin/articles/")
                    sidebarItem("管理トップ", icon: "gearshape", path: "/admin/manage/?project=atlas")
                    Spacer()
                    Button { model.logout() } label: {
                        Label("ログアウト", systemImage: "rectangle.portrait.and.arrow.right")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .padding(.bottom, 10)
                }
                .frame(width: 218)
                .background(Color(nsColor: .controlBackgroundColor).opacity(0.45))
                Divider()
                ZStack(alignment: .top) {
                    AdminWebView(model: model)
                    if model.isLoading {
                        ProgressView().controlSize(.small).padding(8).frame(maxWidth: .infinity, alignment: .trailing)
                    }
                }
              }
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .alert("ログインできません", isPresented: Binding(get: { model.authError != nil }, set: { if !$0 { model.authError = nil } })) {
            Button("再試行") { model.authError = nil; model.navigate(to: initialDestination) }
            Button("閉じる", role: .cancel) { model.authError = nil }
        } message: { Text(model.authError ?? "") }
    }

    private func sidebarItem(_ title: String, icon: String, path: String) -> some View {
        Button { model.navigate(to: path) } label: {
            Label(title, systemImage: icon)
                .font(.system(size: 13, weight: .medium))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct AdminWebView: NSViewRepresentable {
    @ObservedObject var model: AdminAppModel
    func makeNSView(context: Context) -> WKWebView {
        let view = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        model.attach(view)
        view.uiDelegate = model
        return view
    }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
