import SwiftUI
import AppKit

@main
struct TrailBarApp: App {
    @StateObject private var store = SessionStore()

    var body: some Scene {
        MenuBarExtra("Trail", systemImage: "list.bullet.rectangle") {
            Text("\(store.recent.count) sessions loaded")
            Text("Today: \(store.todayCount) · Total: \(store.totalCount)")
            Divider()
            Button("Refresh") { store.refresh() }
            Button("Quit") { NSApplication.shared.terminate(nil) }
                .keyboardShortcut("q")
        }
    }
}
