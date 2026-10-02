import AppKit
import CryptoKit
import Foundation
import Darwin
import WebKit

private func expect(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
    if try !condition() { throw NSError(domain: "AdminAppTests: " + message, code: 1) }
}

private func sendRequest(_ server: LoopbackCallbackServer, target: String, fragmented: Bool = false) throws -> String {
    let url = URL(string: server.redirectURI)!
    let fd = socket(AF_INET, SOCK_STREAM, 0)
    defer { Darwin.close(fd) }
    var timeout = timeval(tv_sec: 3, tv_usec: 0)
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = UInt16(url.port!).bigEndian
    address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
    let result = withUnsafePointer(to: &address) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
    try expect(result == 0, "loopback connect")
    let request = "GET \(target) HTTP/1.1\r\nHost: 127.0.0.1:\(url.port!)\r\n\r\n"
    let chunks = fragmented ? [String(request.prefix(11)), String(request.dropFirst(11))] : [request]
    for chunk in chunks {
        let data = Data(chunk.utf8)
        data.withUnsafeBytes { _ = send(fd, $0.baseAddress, $0.count, 0) }
        if fragmented { Thread.sleep(forTimeInterval: 0.01) }
    }
    var bytes = [UInt8](repeating: 0, count: 4096)
    let count = bytes.withUnsafeMutableBytes { recv(fd, $0.baseAddress, $0.count, 0) }
    return count > 0 ? String(decoding: bytes.prefix(count), as: UTF8.self) : ""
}

private func loopbackTests() throws {
    let server = try LoopbackCallbackServer(expectedState: "expected", lifetime: 3, clientTimeout: 0.15)
    let done = DispatchSemaphore(value: 0)
    final class Result: @unchecked Sendable { var value: LoopbackCallbackServer.Callback? }
    let callback = Result()
    DispatchQueue.global().async { callback.value = server.waitForCallback(); done.signal() }
    for target in ["/callback?code=a&code=b&state=expected", "/callback?code=a&state=bad", "/callback?code=&state=expected", "/callback?code=a&state=expected&state=expected", "/favicon.ico", "/callback?code=%0A&state=expected"] {
        try expect(try sendRequest(server, target: target).contains("400 Bad Request"), "reject malformed callback without ending listener: \(target)")
    }
    try expect(try sendRequest(server, target: "/callback?code=valid-code_123&state=expected", fragmented: true).contains("200 OK"), "partial HTTP request assembled")
    try expect(done.wait(timeout: .now() + 2) == .success, "callback finishes")
    try expect(callback.value?.code == "valid-code_123", "only matching callback accepted")
    let expired = try LoopbackCallbackServer(expectedState: "x", lifetime: 0.1)
    let start = Date()
    try expect(expired.waitForCallback() == nil && Date().timeIntervalSince(start) < 1, "authentication deadline")
    let cancelled = try LoopbackCallbackServer(expectedState: "x")
    let cancellationDone = DispatchSemaphore(value: 0)
    DispatchQueue.global().async { _ = cancelled.waitForCallback(); cancellationDone.signal() }
    cancelled.close(); cancelled.close()
    try expect(cancellationDone.wait(timeout: .now() + 1) == .success, "idempotent cancellation unblocks listener")
}

// Minimal RFC 6455 echo peer, bound to loopback. It closes the first connection
// to exercise real WebKit WebSocket reconnects without contacting production.
private final class CollaborationFixture: @unchecked Sendable {
    let port: UInt16
    private let fd: Int32
    init() throws {
        let socketFD = socket(AF_INET, SOCK_STREAM, 0)
        try expect(socketFD >= 0, "collaboration fixture socket")
        var succeeded = false
        defer { if !succeeded { Darwin.close(socketFD) } }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
        let bound = withUnsafePointer(to: &address) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(socketFD, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
        try expect(bound == 0 && listen(socketFD, 2) == 0, "collaboration fixture listens")
        var actual = sockaddr_in()
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let named = withUnsafeMutablePointer(to: &actual) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(socketFD, $0, &length) } }
        try expect(named == 0, "collaboration fixture port")
        fd = socketFD
        port = UInt16(bigEndian: actual.sin_port)
        succeeded = true
    }
    private func read(_ client: Int32, count: Int) throws -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: count)
        var offset = 0
        while offset < count {
            let received = bytes.withUnsafeMutableBytes { recv(client, $0.baseAddress!.advanced(by: offset), count - offset, 0) }
            try expect(received > 0, "collaboration peer received complete frame")
            offset += received
        }
        return bytes
    }
    private func sendData(_ client: Int32, data: Data) {
        data.withUnsafeBytes { _ = send(client, $0.baseAddress, $0.count, 0) }
    }
    func serve() throws {
        for connection in 1...2 {
            let client = accept(fd, nil, nil)
            try expect(client >= 0, "collaboration peer accepts")
            defer { Darwin.close(client) }
            var timeout = timeval(tv_sec: 3, tv_usec: 0)
            setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
            var noPipe: Int32 = 1
            setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &noPipe, socklen_t(MemoryLayout<Int32>.size))
            var headers = Data()
            while headers.range(of: Data("\r\n\r\n".utf8)) == nil && headers.count < 8192 { headers.append(contentsOf: try read(client, count: 1)) }
            let keyLine = String(decoding: headers, as: UTF8.self).components(separatedBy: "\r\n").first { $0.lowercased().hasPrefix("sec-websocket-key:") }
            try expect(keyLine != nil, "WebKit sends WebSocket handshake")
            let key = keyLine!.dropFirst(18).trimmingCharacters(in: .whitespaces)
            let acceptKey = Data(Insecure.SHA1.hash(data: Data((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").utf8))).base64EncodedString()
            sendData(client, data: Data("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: \(acceptKey)\r\n\r\n".utf8))
            let header = try read(client, count: 2)
            let size = Int(header[1] & 0x7f)
            try expect(header[0] == 0x81 && header[1] & 0x80 != 0 && size < 126, "WebKit sends a masked text frame")
            let mask = try read(client, count: 4)
            let payload = try read(client, count: size).enumerated().map { $0.element ^ mask[$0.offset % 4] }
            let response = Data((String(decoding: payload, as: UTF8.self) + ":\(connection)").utf8)
            sendData(client, data: Data([0x81, UInt8(response.count)]) + response)
        }
    }
    func close() { shutdown(fd, SHUT_RDWR) }
    deinit { Darwin.close(fd) }
}

@MainActor
private final class RecordingWebView: WKWebView {
    var requestedURL: URL?
    var requestCount = 0
    override func load(_ request: URLRequest) -> WKNavigation? { requestedURL = request.url; requestCount += 1; return nil }
}

private final class RedemptionFixtureProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.15) { [self] in
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(#"{"sessionToken":"fixture-redeemed-session","expiresAt":"2099-01-01T00:00:00Z"}"#.utf8))
            client?.urlProtocolDidFinishLoading(self)
        }
    }
    override func stopLoading() {}
}

@main
struct AdminAppTests {
    @MainActor static func main() async {
        do { try await runTests() }
        catch { fputs("Native regression failed: \(error)\n", stderr); exit(1) }
    }
    @MainActor static func runTests() async throws {
        try expect(AdminAppPolicy.destination("/admin/editor/?id=1") == "/admin/editor/?id=1", "keep current editor destination")
        for value in ["//evil.test", "/%2f/evil.test", "/\\evil.test", "/%5cevil.test", "/%0aevil", "https://admin.atlasez.org/"] {
            try expect(AdminAppPolicy.destination(value) == AdminAppPolicy.home, "reject unsafe return destination")
        }
        for url in ["http://admin.atlasez.org/", "https://admin.atlasez.org:444/", "https://user@admin.atlasez.org/", "https://admin.atlasez.org.evil.test/"] {
            try expect(!AdminAppPolicy.isAdmin(URL(string: url)!), "exact HTTPS origin")
        }
        var epoch = AuthenticationEpoch()
        let cancelledAttempt = epoch.value
        epoch.invalidate()
        try expect(!epoch.accepts(cancelledAttempt), "late callback / redemption / cookie install ignored after cancel")
        try expect(epoch.accepts(epoch.value), "new attempt accepted")
        try loopbackTests()
        let secondScreen = CGRect(x: -1920, y: 0, width: 1920, height: 1080)
        let originalFrame = CGRect(x: -1800, y: 100, width: 1000, height: 700)
        try expect(AdminAppPolicy.visibleFrame(originalFrame, in: secondScreen) == originalFrame, "moving between screens preserves user size and position")
        let recoveredFrame = AdminAppPolicy.visibleFrame(CGRect(x: 5000, y: 2000, width: 2200, height: 1400), in: secondScreen)
        try expect(secondScreen.contains(recoveredFrame), "disconnected screen returns window to visible area")
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let temporary = folder.appendingPathComponent("partial")
        let destination = folder.appendingPathComponent("export.csv")
        let csv = Data("name\nfixture\n".utf8)
        try csv.write(to: temporary)
        try AdminAppPolicy.finishDownload(from: temporary, to: destination)
        try expect(try Data(contentsOf: destination) == csv, "complete CSV download saved")
        let pdf = Data("%PDF-1.4 fixture".utf8)
        try pdf.write(to: temporary)
        try AdminAppPolicy.finishDownload(from: temporary, to: destination)
        try expect(try Data(contentsOf: destination) == pdf, "authorized replacement preserves downloaded bytes")
        do {
            try AdminAppPolicy.finishDownload(from: temporary, to: destination)
            throw NSError(domain: "Expected missing temporary file failure", code: 1)
        } catch {
            try expect(try Data(contentsOf: destination) == pdf, "failed download does not remove existing destination")
        }
        print("PASS: origin, callback parsing, fragmented requests, cancellation and deadlines")

        // Uses the actual AppKit / WebKit model with a separate Keychain service and
        // ephemeral cookies. Never calls production OAuth or changes the user's session.
        _ = NSApplication.shared
        NSApp.setActivationPolicy(.accessory)
        let store = WKWebsiteDataStore.nonPersistent()
        let model = AdminAppModel(dataStore: store)
        defer { model.testClearSession() }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = store
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 900, height: 650), configuration: configuration)
        model.attach(view)
        view.uiDelegate = model
        model.startIfNeeded()
        try expect(model.needsSignIn, "startup without credential shows sign-in")
        try expect(model.testSaveSession("fixture-session"), "Keychain save")
        try expect(model.testSaveSession("replacement-session"), "Keychain update in place")
        try expect(model.testReadSession() == "replacement-session", "preserve existing session on app update")
        model.testClearSession()
        view.loadHTMLString("<html><title>Native fixture</title><h1>ファイル操作の検証</h1><label>添付ファイル<input type=file multiple onchange=\"document.getElementById('selected').textContent=Array.from(this.files).map(f=>f.name).join(', ')\"></label><p id='selected'>未選択</p><a download='fixture.csv' href='data:text/csv,name%0Atest'>CSVを保存</a><br><a download='fixture.pdf' href='data:application/pdf,%25PDF-1.4%20fixture'>PDFを保存</a><br><button onclick=\"const w=window.open('','fixture-pane','popup'); if(w){w.document.write('&lt;h1&gt;編集枠の別ウィンドウ&lt;/h1&gt;');w.document.close()}\">別ウィンドウを開く</button></html>", baseURL: AdminAppPolicy.origin)
        let pageDeadline = Date().addingTimeInterval(5)
        var fixtureReady = false
        while Date() < pageDeadline {
            fixtureReady = (try? await view.evaluateJavaScript("document.title")) as? String == "Native fixture"
            if fixtureReady { break }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        try expect(fixtureReady, "native fixture loads before interaction")
        let countBeforePopup = NSApp.windows.count
        _ = try await view.evaluateJavaScript("const pane=window.open('', 'regression-pane', 'popup'); if(pane){pane.document.write('<h1>Native popout</h1>');pane.document.close();} pane !== null")
        try await Task.sleep(nanoseconds: 300_000_000)
        let popupWindow = NSApp.windows.first { ($0.contentView as? WKWebView) != nil && $0.contentView !== view }
        try expect(NSApp.windows.count > countBeforePopup && popupWindow != nil, "editor's inherited about:blank popout opens")
        let popupView = popupWindow!.contentView as! WKWebView
        let popupText = try await popupView.evaluateJavaScript("document.body.textContent") as? String
        try expect(popupText?.contains("Native popout") == true, "editor can copy a pane into the popout")
        popupWindow?.close()
        print("PASS: native editor popout opens and receives copied content")
        model.needsSignIn = false
        model.webView(view, didFailProvisionalNavigation: nil, withError: URLError(.notConnectedToInternet))
        try expect(model.pageError != nil && !model.isLoading, "offline error has recovery state")
        model.webView(view, didFailProvisionalNavigation: nil, withError: URLError(.cancelled))
        try expect(model.pageError != nil, "cancelled navigation cannot erase recovery message")
        model.webViewWebContentProcessDidTerminate(view)
        try expect(model.pageError?.contains("停止") == true, "WebKit termination recovery")
        model.webView(view, didFinish: nil)
        try expect(model.pageError == nil && !model.isLoading, "successful load clears error")
        model.testRequireSignIn()
        try expect(model.needsSignIn && model.testReadSession() == nil, "expired session clears credential and shows explicit login")
        let recoveryStore = WKWebsiteDataStore.nonPersistent()
        let recoveryModel = AdminAppModel(dataStore: recoveryStore)
        let recoveryConfiguration = WKWebViewConfiguration()
        recoveryConfiguration.websiteDataStore = recoveryStore
        let recoveryView = RecordingWebView(frame: .zero, configuration: recoveryConfiguration)
        recoveryModel.attach(recoveryView)
        recoveryModel.navigate(to: "/admin/editor/?id=fixture")
        recoveryModel.webView(recoveryView, didFailProvisionalNavigation: nil, withError: URLError(.notConnectedToInternet))
        NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.didWakeNotification, object: nil)
        try expect(recoveryView.requestCount == 2 && recoveryView.requestedURL?.absoluteString == "https://admin.atlasez.org/admin/editor/?id=fixture", "wake retries failed editor destination instead of home")
        recoveryModel.webView(recoveryView, didFinish: nil)
        NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.didWakeNotification, object: nil)
        try expect(recoveryView.requestCount == 2, "wake does not reload healthy unsaved work")
        let sessionConfiguration = URLSessionConfiguration.ephemeral
        sessionConfiguration.protocolClasses = [RedemptionFixtureProtocol.self]
        let authenticationSession = URLSession(configuration: sessionConfiguration)
        defer { authenticationSession.invalidateAndCancel() }
        let loginModel = AdminAppModel(dataStore: .nonPersistent(), authenticationSession: authenticationSession)
        defer { loginModel.testClearSession() }
        loginModel.needsSignIn = true
        loginModel.testRedeem()
        loginModel.cancelSignIn()
        try await Task.sleep(nanoseconds: 350_000_000)
        try expect(loginModel.testReadSession() == nil && loginModel.needsSignIn, "cancel while redeeming cannot save a late session")
        loginModel.testRedeem()
        let loginDeadline = Date().addingTimeInterval(5)
        while loginModel.isAuthenticating && Date() < loginDeadline { try await Task.sleep(nanoseconds: 20_000_000) }
        try expect(loginModel.testReadSession() == "fixture-redeemed-session" && !loginModel.needsSignIn && !loginModel.isAuthenticating, "new login after cancellation installs the session")
        loginModel.testRequireSignIn()
        try expect(loginModel.testReadSession() == nil && loginModel.needsSignIn, "logout removes redeemed session")
        let collaborationPeer = try CollaborationFixture()
        defer { collaborationPeer.close() }
        let peerFinished = DispatchSemaphore(value: 0)
        DispatchQueue.global().async {
            do { try collaborationPeer.serve() } catch { fputs("Collaboration fixture failed: \(error)\n", stderr) }
            peerFinished.signal()
        }
        let collaborationView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        collaborationView.loadHTMLString("<script>let attempt=0;function join(){attempt++;const ws=new WebSocket('ws://127.0.0.1:\(collaborationPeer.port)/presence');ws.onopen=()=>ws.send('fixture-presence');ws.onmessage=e=>window.collaborationResult=e.data;ws.onclose=()=>{if(attempt<2)join()}}join()</script>", baseURL: URL(string: "http://127.0.0.1:\(collaborationPeer.port)/"))
        let collaborationDeadline = Date().addingTimeInterval(8)
        var reconnected = false
        while Date() < collaborationDeadline {
            reconnected = (try? await collaborationView.evaluateJavaScript("window.collaborationResult")) as? String == "fixture-presence:2"
            if reconnected { break }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        try expect(reconnected && peerFinished.wait(timeout: .now() + 1) == .success, "native collaboration transport reconnects and receives presence after disconnect")
        print("PASS: real WebKit WebSocket presence round-trip and reconnect")
        print("PASS: native startup, Keychain replacement, offline, cancellation, renderer termination, expiry")
        if Bundle.main.bundleIdentifier == "org.atlasez.admin.regressionfixture" {
            let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 720), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false
            window.title = "Atlasez Native Regression Fixture"
            window.contentView = view
            window.center(); window.makeKeyAndOrderFront(nil)
            NSApp.setActivationPolicy(.regular); NSApp.activate(ignoringOtherApps: true)
            NSApp.run()
        }
        exit(0)
    }
}
