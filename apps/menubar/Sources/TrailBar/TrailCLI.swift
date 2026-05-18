import Foundation
import AppKit

enum TrailCLIError: Error {
    case binaryNotFound
    case nonZeroExit(Int32, String)
    case noURLInOutput(String)
}

struct TrailCLI {
    static let webBaseURL = "https://gettrail.vercel.app"

    static func binaryPath() -> URL? {
        let home = NSHomeDirectory()
        let local = URL(fileURLWithPath: home).appendingPathComponent(".local/bin/trail")
        if FileManager.default.isExecutableFile(atPath: local.path) {
            return local
        }
        // Fallback: ask the shell via /usr/bin/env which trail
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        p.arguments = ["which", "trail"]
        let out = Pipe()
        p.standardOutput = out
        p.standardError = Pipe()
        do { try p.run() } catch { return nil }
        p.waitUntilExit()
        let data = out.fileHandleForReading.readDataToEndOfFile()
        let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !path.isEmpty {
            let url = URL(fileURLWithPath: path)
            if FileManager.default.isExecutableFile(atPath: url.path) { return url }
        }
        return nil
    }

    /// Runs `trail share <id> --yes --copy --base-url <url>` off the main thread.
    static func share(id: String, completion: @escaping (Result<URL, Error>) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            guard let bin = binaryPath() else {
                DispatchQueue.main.async { completion(.failure(TrailCLIError.binaryNotFound)) }
                return
            }
            let p = Process()
            p.executableURL = bin
            p.arguments = ["share", id, "--yes", "--copy", "--base-url", webBaseURL]
            let outPipe = Pipe()
            let errPipe = Pipe()
            p.standardOutput = outPipe
            p.standardError = errPipe
            do {
                try p.run()
            } catch {
                DispatchQueue.main.async { completion(.failure(error)) }
                return
            }
            p.waitUntilExit()
            let out = String(data: outPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let err = String(data: errPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            if p.terminationStatus != 0 {
                DispatchQueue.main.async { completion(.failure(TrailCLIError.nonZeroExit(p.terminationStatus, err.isEmpty ? out : err))) }
                return
            }
            if let url = extractURL(from: out) ?? extractURL(from: err) {
                DispatchQueue.main.async { completion(.success(url)) }
            } else {
                DispatchQueue.main.async { completion(.failure(TrailCLIError.noURLInOutput(out))) }
            }
        }
    }

    static func viewInTerminal(id: String) {
        guard let bin = binaryPath() else { return }
        let script = """
        tell application "Terminal"
            activate
            do script "\(bin.path) view \(id)"
        end tell
        """
        var err: NSDictionary?
        if let apple = NSAppleScript(source: script) {
            apple.executeAndReturnError(&err)
        }
    }

    private static func extractURL(from text: String) -> URL? {
        for line in text.split(whereSeparator: { $0.isNewline || $0 == " " }) {
            let s = String(line).trimmingCharacters(in: .whitespacesAndNewlines)
            if s.hasPrefix("http://") || s.hasPrefix("https://"), let u = URL(string: s) {
                return u
            }
        }
        return nil
    }
}

@MainActor
enum NotificationHelper {
    static func info(_ title: String, _ body: String = "") {
        FileHandle.standardError.write("[TrailBar] \(title) \(body)\n".data(using: .utf8) ?? Data())
    }
}
