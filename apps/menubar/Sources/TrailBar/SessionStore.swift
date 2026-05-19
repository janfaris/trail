import Foundation
import Combine

@MainActor
final class SessionStore: ObservableObject {
    @Published var recent: [SessionSummary] = []
    @Published var todayCount: Int = 0 { didSet { onCountsChanged?() } }
    @Published var totalCount: Int = 0
    @Published var lastError: String?

    /// Callback fired on the main thread when counts change. Used by
    /// AppDelegate to update the NSStatusItem title without observing.
    var onCountsChanged: (() -> Void)?

    private var timer: Timer?
    private var fsSource: DispatchSourceFileSystemObject?
    private var fd: Int32 = -1
    private let queue = DispatchQueue(label: "app.gettrail.menubar.db", qos: .utility)
    private let dbPath: String

    init(dbPath: String = TrailDB.defaultPath) {
        self.dbPath = dbPath
        refresh()
        startTimer()
        startFileWatch()
    }

    deinit {
        timer?.invalidate()
        fsSource?.cancel()
        if fd >= 0 { close(fd) }
    }

    private func startTimer() {
        let t = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
        RunLoop.main.add(t, forMode: .common)
        self.timer = t
    }

    private func startFileWatch() {
        let f = open(dbPath, O_EVTONLY)
        guard f >= 0 else { return }
        self.fd = f
        let src = DispatchSource.makeFileSystemObjectSource(fileDescriptor: f, eventMask: [.write, .extend, .rename], queue: queue)
        src.setEventHandler { [weak self] in
            Task { @MainActor in self?.refresh() }
        }
        src.setCancelHandler { [f] in close(f) }
        src.resume()
        self.fsSource = src
    }

    func refresh() {
        let path = dbPath
        queue.async { [weak self] in
            guard let self else { return }
            do {
                let rows = try TrailDB.recent(limit: 8, path: path)
                let today = try TrailDB.todayCount(path: path)
                let total = try TrailDB.totalCount(path: path)
                Task { @MainActor in
                    self.recent = rows
                    self.todayCount = today
                    self.totalCount = total
                    self.lastError = nil
                }
            } catch {
                Task { @MainActor in
                    self.lastError = "\(error)"
                }
            }
        }
    }
}
