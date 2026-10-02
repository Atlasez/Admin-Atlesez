import Foundation
import Darwin
import Security

final class AdminSessionStore: @unchecked Sendable {
    private let service: String
    private let accountKey: String
    private var account: String { UserDefaults.standard.string(forKey: accountKey) ?? "admin-session" }
    // Legacy macOS Keychain items can require permission after an ad-hoc signed app
    // changes. Refuse interactive access; never let a hidden prompt stop app startup.
    private static let nonInteractive: Void = { _ = SecKeychainSetUserInteractionAllowed(false) }()

    init(service: String) { self.service = service; accountKey = service + ".active-session-account" }
    private func query(_ account: String) -> [String: Any] {
        _ = Self.nonInteractive
        return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }
    func read() -> String? {
        var query = query(account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    // A new record avoids authorizing an updated ad-hoc binary to read an older
    // record. Only publish its account after the current login attempt completes.
    func stage(_ token: String) -> String? {
        let account = UUID().uuidString
        var attributes = query(account)
        attributes[kSecValueData as String] = Data(token.utf8)
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess ? account : nil
    }
    func activate(_ stagedAccount: String) -> String {
        let previous = account
        UserDefaults.standard.set(stagedAccount, forKey: accountKey)
        return previous
    }
    func detach() -> String {
        let previous = account
        UserDefaults.standard.removeObject(forKey: accountKey)
        return previous
    }
    func discard(_ account: String) { SecItemDelete(query(account) as CFDictionary) }
}

enum AdminAppPolicy {
    static let origin = URL(string: "https://admin.atlasez.org")!
    static let home = "/admin/portal/"

    static func isAdmin(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && url.host?.lowercased() == origin.host
            && (url.port == nil || url.port == 443) && url.user == nil && url.password == nil
    }

    static func destination(_ value: String) -> String {
        let decoded = value.removingPercentEncoding ?? value
        guard decoded.hasPrefix("/"), !decoded.hasPrefix("//"), !decoded.contains("\\"),
              !decoded.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              let url = URL(string: value, relativeTo: origin)?.absoluteURL, isAdmin(url) else { return home }
        return value
    }

    static func visibleFrame(_ frame: CGRect, in available: CGRect) -> CGRect {
        var result = frame
        result.size.width = min(frame.width, available.width)
        result.size.height = min(frame.height, available.height)
        result.origin.x = max(available.minX, min(frame.minX, available.maxX - result.width))
        result.origin.y = max(available.minY, min(frame.minY, available.maxY - result.height))
        return result
    }

    static func finishDownload(from temporary: URL, to destination: URL) throws {
        if FileManager.default.fileExists(atPath: destination.path) {
            _ = try FileManager.default.replaceItemAt(destination, withItemAt: temporary)
        } else { try FileManager.default.moveItem(at: temporary, to: destination) }
    }

    // Duplicate parameters must never trap the process or select an ambiguous credential.
    static func query(_ url: URL) -> [String: String]? {
        var values: [String: String] = [:]
        for item in URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? [] {
            guard values[item.name] == nil, let value = item.value else { return nil }
            values[item.name] = value
        }
        return values
    }
}

struct AuthenticationEpoch {
    private(set) var value = UUID()
    mutating func invalidate() { value = UUID() }
    func accepts(_ candidate: UUID) -> Bool { candidate == value }
}

final class LoopbackCallbackServer: @unchecked Sendable {
    struct Callback { let code: String; let state: String }
    let redirectURI: String
    private let socketFD: Int32
    private let expectedState: String
    private let lifetime: TimeInterval
    private let clientTimeout: TimeInterval
    private let lock = NSLock()
    private var closed = false

    init(expectedState: String, lifetime: TimeInterval = 180, clientTimeout: TimeInterval = 2) throws {
        self.expectedState = expectedState
        self.lifetime = lifetime
        self.clientTimeout = clientTimeout
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
        let bound = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        guard bound == 0, listen(fd, 8) == 0, fcntl(fd, F_SETFL, O_NONBLOCK) == 0 else {
            let code = errno; Darwin.close(fd)
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(code))
        }
        var actual = sockaddr_in()
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let named = withUnsafeMutablePointer(to: &actual) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(fd, $0, &length) }
        }
        guard named == 0 else {
            let code = errno; Darwin.close(fd)
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(code))
        }
        socketFD = fd
        redirectURI = "http://127.0.0.1:\(UInt16(bigEndian: actual.sin_port))/callback"
    }

    func waitForCallback() -> Callback? {
        let deadline = ProcessInfo.processInfo.systemUptime + lifetime
        defer { close() }
        while ready(socketFD, until: deadline) {
            var peer = sockaddr_in()
            var length = socklen_t(MemoryLayout<sockaddr_in>.size)
            let client = withUnsafeMutablePointer(to: &peer) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { accept(socketFD, $0, &length) }
            }
            guard client >= 0 else { continue }
            defer { Darwin.close(client) }
            var noPipe: Int32 = 1
            setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &noPipe, socklen_t(MemoryLayout<Int32>.size))
            _ = fcntl(client, F_SETFL, O_NONBLOCK)
            guard peer.sin_addr.s_addr == inet_addr("127.0.0.1") else { continue }
            let readDeadline = min(deadline, ProcessInfo.processInfo.systemUptime + clientTimeout)
            guard let request = readRequest(client, until: readDeadline) else { continue }
            let lines = request.components(separatedBy: "\r\n")
            let parts = (lines.first ?? "").split(separator: " ")
            let host = URL(string: redirectURI)!.port!
            let hosts = lines.dropFirst().filter { $0.lowercased().hasPrefix("host:") }
            guard parts.count == 3, parts[0] == "GET", parts[2] == "HTTP/1.1",
                  hosts.count == 1, hosts[0].dropFirst(5).trimmingCharacters(in: .whitespaces) == "127.0.0.1:\(host)",
                  parts[1].hasPrefix("/callback?"),
                  let url = URL(string: "http://127.0.0.1:\(host)\(parts[1])"), url.path == "/callback",
                  let query = AdminAppPolicy.query(url), let code = query["code"],
                  !code.isEmpty, code.utf8.count <= 512,
                  code.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-").contains($0) }),
                  query["state"] == expectedState else {
                respond(client, status: "400 Bad Request", text: "認証情報を確認できませんでした。アプリから開いたログイン画面で続けてください。")
                continue
            }
            guard !isClosed else { return nil }
            respond(client, status: "200 OK", text: "認証結果を受け取りました。このタブを閉じてAtlasez運営アプリに戻ってください。")
            return Callback(code: code, state: expectedState)
        }
        return nil
    }

    // Only shutdown here. The reader retains this object; close the descriptor in deinit
    // so cancellation cannot race a recycled descriptor belonging to a newer attempt.
    func close() {
        lock.lock(); defer { lock.unlock() }
        guard !closed else { return }
        closed = true
        shutdown(socketFD, SHUT_RDWR)
    }
    private var isClosed: Bool { lock.lock(); defer { lock.unlock() }; return closed }

    private func ready(_ fd: Int32, until deadline: TimeInterval) -> Bool {
        while !isClosed && ProcessInfo.processInfo.systemUptime < deadline {
            var descriptor = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
            let result = poll(&descriptor, 1, 50)
            if result > 0 { return !isClosed && (descriptor.revents & Int16(POLLIN)) != 0 }
            if result < 0 && errno != EINTR { return false }
        }
        return false
    }
    private func readRequest(_ fd: Int32, until deadline: TimeInterval) -> String? {
        var data = Data()
        while data.count < 16384 && ready(fd, until: deadline) {
            var bytes = [UInt8](repeating: 0, count: 2048)
            let count = bytes.withUnsafeMutableBytes { recv(fd, $0.baseAddress, $0.count, 0) }
            if count < 0 && (errno == EAGAIN || errno == EINTR) { continue }
            guard count > 0 else { return nil }
            data.append(contentsOf: bytes.prefix(count))
            if data.range(of: Data("\r\n\r\n".utf8)) != nil { return String(data: data, encoding: .utf8) }
        }
        return nil
    }
    private func respond(_ fd: Int32, status: String, text: String) {
        let body = Data("<!doctype html><html lang=\"ja\"><meta charset=\"utf-8\"><title>Atlasez運営</title><h1>Atlasez運営</h1><p>\(text)</p></html>".utf8)
        var data = Data("HTTP/1.1 \(status)\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'none'\r\n\r\n".utf8)
        data.append(body)
        data.withUnsafeBytes { bytes in
            var offset = 0
            while offset < bytes.count && !isClosed {
                let count = send(fd, bytes.baseAddress!.advanced(by: offset), bytes.count - offset, 0)
                guard count > 0 else { break }
                offset += count
            }
        }
    }
    deinit { Darwin.close(socketFD) }
}
