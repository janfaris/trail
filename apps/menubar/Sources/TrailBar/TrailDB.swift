import Foundation
import SQLite3

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

enum TrailDBError: Error {
    case openFailed(String)
    case prepareFailed(String)
}

struct TrailDB {
    static var defaultPath: String {
        (NSHomeDirectory() as NSString).appendingPathComponent(".trail/db.sqlite")
    }

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoFormatterNoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static func parseDate(_ s: String) -> Date {
        if let d = isoFormatter.date(from: s) { return d }
        if let d = isoFormatterNoFrac.date(from: s) { return d }
        return Date(timeIntervalSince1970: 0)
    }

    static func recent(limit: Int = 8, path: String = defaultPath) throws -> [SessionSummary] {
        var db: OpaquePointer?
        guard sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK, let db else {
            let msg = db.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown"
            sqlite3_close(db)
            throw TrailDBError.openFailed(msg)
        }
        defer { sqlite3_close(db) }

        let sql = """
        SELECT
          s.id,
          s.tool,
          s.started_at,
          COALESCE(s.share_slug, ''),
          (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id),
          replace(replace(replace(COALESCE((
            SELECT json_extract(e.payload, '$.text')
            FROM events e
            WHERE e.session_id = s.id AND e.kind = 'prompt'
            ORDER BY e.at ASC LIMIT 1
          ), s.summary, s.id), char(10), ' '), char(13), ' '), char(9), ' ')
        FROM sessions s
        ORDER BY s.started_at DESC
        LIMIT ?;
        """

        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw TrailDBError.prepareFailed(String(cString: sqlite3_errmsg(db)))
        }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_int(stmt, 1, Int32(limit))

        var out: [SessionSummary] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let id = String(cString: sqlite3_column_text(stmt, 0))
            let tool = sqlite3_column_text(stmt, 1).map { String(cString: $0) } ?? ""
            let startedStr = sqlite3_column_text(stmt, 2).map { String(cString: $0) } ?? ""
            let shareSlug = sqlite3_column_text(stmt, 3).map { String(cString: $0) } ?? ""
            let eventCount = Int(sqlite3_column_int(stmt, 4))
            let prompt = sqlite3_column_text(stmt, 5).map { String(cString: $0) } ?? ""
            out.append(SessionSummary(
                id: id,
                tool: tool,
                startedAt: parseDate(startedStr),
                shareSlug: shareSlug.isEmpty ? nil : shareSlug,
                eventCount: eventCount,
                firstPrompt: prompt
            ))
        }
        return out
    }

    static func todayCount(path: String = defaultPath) throws -> Int {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd'T'00:00:00.000'Z'"
        df.timeZone = TimeZone(identifier: "UTC")
        let iso = df.string(from: Date())
        return try scalarInt(sql: "SELECT COUNT(*) FROM sessions WHERE started_at >= ?", bind: iso, path: path)
    }

    static func totalCount(path: String = defaultPath) throws -> Int {
        return try scalarInt(sql: "SELECT COUNT(*) FROM sessions", bind: nil, path: path)
    }

    private static func scalarInt(sql: String, bind: String?, path: String) throws -> Int {
        var db: OpaquePointer?
        guard sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK, let db else {
            sqlite3_close(db)
            throw TrailDBError.openFailed("scalar open")
        }
        defer { sqlite3_close(db) }
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw TrailDBError.prepareFailed(String(cString: sqlite3_errmsg(db)))
        }
        defer { sqlite3_finalize(stmt) }
        if let b = bind {
            sqlite3_bind_text(stmt, 1, b, -1, SQLITE_TRANSIENT)
        }
        var n = 0
        if sqlite3_step(stmt) == SQLITE_ROW {
            n = Int(sqlite3_column_int(stmt, 0))
        }
        return n
    }
}
