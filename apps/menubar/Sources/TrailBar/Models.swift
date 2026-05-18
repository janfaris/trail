import Foundation

struct SessionSummary: Identifiable, Hashable {
    let id: String
    let tool: String
    let startedAt: Date
    let shareSlug: String?
    let eventCount: Int
    let firstPrompt: String

    var isShared: Bool { !(shareSlug?.isEmpty ?? true) }

    var ageString: String {
        let secs = Int(Date().timeIntervalSince(startedAt))
        if secs < 60 { return "\(secs)s" }
        if secs < 3600 { return "\(secs/60)m" }
        if secs < 86400 { return "\(secs/3600)h" }
        return "\(secs/86400)d"
    }

    var shareURL: URL? {
        guard let slug = shareSlug, !slug.isEmpty else { return nil }
        return URL(string: "https://gettrail.vercel.app/s/\(slug)")
    }
}
