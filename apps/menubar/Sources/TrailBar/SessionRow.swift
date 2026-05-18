import SwiftUI
import AppKit

struct SessionRow: View {
    let session: SessionSummary
    var onPrimary: (SessionSummary) -> Void
    var onShare: (SessionSummary) -> Void
    var onView: (SessionSummary) -> Void
    var onCopyURL: (SessionSummary) -> Void
    var onCopyID: (SessionSummary) -> Void

    private var truncated: String {
        let p = session.firstPrompt
        if p.count <= 60 { return p }
        return String(p.prefix(60)) + "…"
    }

    private var toolSymbol: String {
        switch session.tool.lowercased() {
        case "claude", "claude-code": return "sparkles"
        case "codex": return "chevron.left.forwardslash.chevron.right"
        case "cursor": return "cursorarrow.rays"
        case "hermes": return "bolt.fill"
        case "copilot": return "person.2.fill"
        default: return "terminal"
        }
    }

    var body: some View {
        Button {
            onPrimary(session)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: toolSymbol)
                VStack(alignment: .leading, spacing: 0) {
                    Text(truncated).lineLimit(1)
                    Text("\(session.tool) · \(session.eventCount) ev · \(session.ageString)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if session.isShared {
                    Image(systemName: "arrow.up.right.square")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .contextMenu {
            Button("View in Terminal") { onView(session) }
            if session.isShared {
                Button("Open Share URL") { onPrimary(session) }
                Button("Copy Share URL") { onCopyURL(session) }
            } else {
                Button("Share…") { onShare(session) }
            }
            Divider()
            Button("Copy Session ID") { onCopyID(session) }
        }
    }
}
