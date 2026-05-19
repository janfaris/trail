import SwiftUI
import AppKit

@main
struct TrailBarApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        // Empty scene — UI is owned by AppDelegate's NSStatusItem.
        // SwiftUI MenuBarExtra is unreliable on macOS 26 (Control Center
        // sometimes hides the item silently), so we drive NSStatusBar directly.
        Settings { EmptyView() }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var popover: NSPopover!
    let store = SessionStore()

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Prevent AppKit's automatic termination — without this, macOS may
        // kill the process when no windows are open (we are window-less).
        ProcessInfo.processInfo.disableAutomaticTermination("Menu bar app")
        ProcessInfo.processInfo.disableSuddenTermination()

        // Status item — variableLength so the text "Trail" always fits.
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            button.title = "Trail"
            button.image = NSImage(systemSymbolName: "list.bullet.rectangle",
                                   accessibilityDescription: "Trail")
            button.imagePosition = .imageLeading
            button.action = #selector(togglePopover(_:))
            button.target = self
        }

        // Popover hosts the SwiftUI MenuView.
        popover = NSPopover()
        popover.contentSize = NSSize(width: 380, height: 480)
        popover.behavior = .transient
        popover.contentViewController = NSHostingController(
            rootView: MenuView(store: store)
        )

        // Update the badge in the title whenever today's count changes.
        store.onCountsChanged = { [weak self] in
            guard let self, let button = self.statusItem.button else { return }
            let n = self.store.todayCount
            button.title = n > 0 ? "Trail \(n)" : "Trail"
        }
    }

    @objc private func togglePopover(_ sender: AnyObject?) {
        guard let button = statusItem.button else { return }
        if popover.isShown {
            popover.performClose(sender)
        } else {
            Task { @MainActor in self.store.refresh() }
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            popover.contentViewController?.view.window?.makeKey()
        }
    }
}
