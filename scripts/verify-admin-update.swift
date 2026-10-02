import CryptoKit
import Foundation

// Verify the generated, public release assets with the exact key shipped in the app.
// Also exercise rejection of modified feed/archive bytes and an unrelated key.
struct VerificationError: Error, CustomStringConvertible {
    let description: String
}
func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw VerificationError(description: message) }
}
func capture(_ pattern: String, in value: String) throws -> String {
    let expression = try NSRegularExpression(pattern: pattern)
    guard let match = expression.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)),
          let range = Range(match.range(at: 1), in: value) else { throw VerificationError(description: "Missing signed update field") }
    return String(value[range])
}
do {
    let args = CommandLine.arguments
    try require(args.count == 4, "Usage: swift verify-admin-update.swift appcast.xml archive.zip Info.plist")
    let feed = try Data(contentsOf: URL(fileURLWithPath: args[1]))
    let archive = try Data(contentsOf: URL(fileURLWithPath: args[2]))
    let plist = try PropertyListSerialization.propertyList(from: Data(contentsOf: URL(fileURLWithPath: args[3])), format: nil) as! [String: Any]
    let key = try Curve25519.Signing.PublicKey(rawRepresentation: Data(base64Encoded: plist["SUPublicEDKey"] as! String)!)
    try require(plist["SURequireSignedFeed"] as? Bool == true && plist["SUVerifyUpdateBeforeExtraction"] as? Bool == true, "Signed feeds and validation before extraction must remain enabled")
    let trailer = Data("<!-- sparkle-signatures:\n".utf8)
    guard let range = feed.range(of: trailer, options: .backwards) else { throw VerificationError(description: "Unsigned update feed") }
    let signedFeed = Data(feed[..<range.lowerBound])
    let signatures = String(decoding: feed[range.lowerBound...], as: UTF8.self)
    let feedSignature = Data(base64Encoded: try capture("edSignature: ([A-Za-z0-9+/=]+)", in: signatures))!
    let feedLength = Int(try capture("length: ([0-9]+)", in: signatures))!
    try require(feedLength == signedFeed.count && key.isValidSignature(feedSignature, for: signedFeed), "Feed signature does not match the app's public key")
    let xml = String(decoding: signedFeed, as: UTF8.self)
    let archiveSignature = Data(base64Encoded: try capture("sparkle:edSignature=\"([A-Za-z0-9+/=]+)\"", in: xml))!
    let archiveLength = Int(try capture("<enclosure[^>]* length=\"([0-9]+)\"", in: xml))!
    let build = try capture("<sparkle:version>([^<]+)</sparkle:version>", in: xml)
    let version = try capture("<sparkle:shortVersionString>([^<]+)</sparkle:shortVersionString>", in: xml)
    try require(build == plist["CFBundleVersion"] as? String && version == plist["CFBundleShortVersionString"] as? String, "Feed and bundle versions differ")
    try require(archiveLength == archive.count && key.isValidSignature(archiveSignature, for: archive), "Archive signature or length is invalid")
    var damagedFeed = signedFeed
    damagedFeed[damagedFeed.startIndex] ^= 1
    var damagedArchive = archive
    damagedArchive[damagedArchive.startIndex] ^= 1
    try require(!key.isValidSignature(feedSignature, for: damagedFeed), "Modified feed was accepted")
    try require(!key.isValidSignature(archiveSignature, for: damagedArchive), "Modified archive was accepted")
    try require(!key.isValidSignature(archiveSignature, for: archive.dropLast()), "Interrupted download was accepted")
    let unrelatedKey = Curve25519.Signing.PrivateKey().publicKey
    try require(!unrelatedKey.isValidSignature(archiveSignature, for: archive), "Wrong signing key was accepted")
    print("PASS: signed feed, signed archive, bundle versions; modified feed/archive, interrupted download and wrong key rejected")
} catch {
    fputs("Update verification failed: \(error)\n", stderr)
    exit(1)
}
