// NavigoActivityAttributes.swift
// Shared ActivityAttributes type — must be identical in the widget extension target.
import ActivityKit
import Foundation

@available(iOS 16.1, *)
public struct NavigoActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var instruction: String
        public var remainingDistanceText: String
        public var eta: String
        /// Route progress 0.0 – 1.0.
        public var progress: Double
        public var isPaused: Bool
    }

    public var destination: String
    public var sessionId: String
}
