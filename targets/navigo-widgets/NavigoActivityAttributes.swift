// NavigoActivityAttributes.swift
// Must be byte-for-byte identical to the copy in the main module.
import ActivityKit
import Foundation

@available(iOS 16.1, *)
struct NavigoActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var instruction: String
        var remainingDistanceText: String
        var eta: String
        var progress: Double
        var isPaused: Bool
    }
    var destination: String
    var sessionId: String
}
