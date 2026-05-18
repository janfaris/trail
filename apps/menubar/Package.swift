// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "TrailBar",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "TrailBar",
            path: "Sources/TrailBar",
            linkerSettings: [
                .linkedLibrary("sqlite3")
            ]
        )
    ]
)
