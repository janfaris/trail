import SwiftUI
import AppKit

@main
struct TrailBarApp: App {
    init() {}
    var body: some Scene {
        MenuBarExtra("Trail", systemImage: "list.bullet.rectangle") {
            Text("Hello")
            Divider()
            Button("Quit") { NSApplication.shared.terminate(nil) }
                .keyboardShortcut("q")
        }
    }
}
