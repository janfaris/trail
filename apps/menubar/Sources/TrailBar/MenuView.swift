import SwiftUI
import AppKit

struct MenuView: View {
    @ObservedObject var store: SessionStore

    var body: some View {
        Text("Today: \(store.todayCount) · Total: \(store.totalCount)")
            .font(.caption)
            .foregroundStyle(.secondary)
        Divider()
        if store.recent.isEmpty {
            Text("No sessions yet").foregroundStyle(.secondary)
        } else {
            Section("Recent") {
                ForEach(store.recent) { s in
                    SessionRow(
                        session: s,
                        onPrimary: handlePrimary,
                        onShare: handleShare,
                        onView: handleView,
                        onCopyURL: handleCopyURL,
                        onCopyID: handleCopyID
                    )
                }
            }
        }
        if let err = store.lastError {
            Divider()
            Text("Error: \(err)").font(.caption).foregroundStyle(.red)
        }
        Divider()
        Button("Open Profile") {
            if let url = URL(string: "https://gettrail.vercel.app/u/jankarlo.faris") {
                NSWorkspace.shared.open(url)
            }
        }
        Button("Refresh") { store.refresh() }
        Divider()
        Button("Quit Trail") { NSApplication.shared.terminate(nil) }
            .keyboardShortcut("q")
    }

    // Placeholder action handlers; wired up properly in Task 6.
    private func handlePrimary(_ s: SessionSummary) {
        if let url = s.shareURL { NSWorkspace.shared.open(url) }
    }
    private func handleShare(_ s: SessionSummary) {}
    private func handleView(_ s: SessionSummary) {}
    private func handleCopyURL(_ s: SessionSummary) {
        guard let url = s.shareURL else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(url.absoluteString, forType: .string)
    }
    private func handleCopyID(_ s: SessionSummary) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(s.id, forType: .string)
    }
}
