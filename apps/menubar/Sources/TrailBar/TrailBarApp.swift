import SwiftUI
import AppKit

@main
struct TrailBarApp: App {
    @StateObject private var store = SessionStore()

    var body: some Scene {
        MenuBarExtra {
            MenuView(store: store)
        } label: {
            let n = store.todayCount
            if n > 0 {
                Image(systemName: "list.bullet.rectangle")
                Text(" \(n)")
            } else {
                Image(systemName: "list.bullet.rectangle")
            }
        }
    }
}
