// NavigoLiveActivityModule.swift
import ExpoModulesCore
import ActivityKit

public class NavigoLiveActivityModule: Module {
    // Type-erased so the file compiles on iOS < 16.
    private var activityId: String? = nil

    public func definition() -> ModuleDefinition {
        Name("NavigoLiveActivity")

        // Synchronous check — no async needed.
        Function("isSupported") { () -> Bool in
            if #available(iOS 16.2, *) {
                return ActivityAuthorizationInfo().areActivitiesEnabled
            }
            return false
        }

        AsyncFunction("startActivity") { (destination: String, state: [String: Any]) async -> Bool in
            guard #available(iOS 16.1, *) else { return false }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }

            // End any running activity first.
            if let id = self.activityId {
                for activity in Activity<NavigoActivityAttributes>.activities where activity.id == id {
                    await activity.end(dismissalPolicy: .immediate)
                }
                self.activityId = nil
            }

            let attrs = NavigoActivityAttributes(
                destination: destination,
                sessionId: UUID().uuidString
            )
            let contentState = NavigoLiveActivityModule.buildState(from: state)

            do {
                let activity = try Activity<NavigoActivityAttributes>.request(
                    attributes: attrs,
                    contentState: contentState,
                    pushType: nil
                )
                self.activityId = activity.id
                return true
            } catch {
                return false
            }
        }

        AsyncFunction("updateActivity") { (state: [String: Any]) async -> Bool in
            guard #available(iOS 16.1, *) else { return false }
            guard let id = self.activityId else { return false }

            for activity in Activity<NavigoActivityAttributes>.activities where activity.id == id {
                let contentState = NavigoLiveActivityModule.buildState(from: state)
                await activity.update(using: contentState)
                return true
            }
            return false
        }

        AsyncFunction("endActivity") { () async -> Bool in
            guard #available(iOS 16.1, *) else { return false }
            guard let id = self.activityId else { return false }

            for activity in Activity<NavigoActivityAttributes>.activities where activity.id == id {
                await activity.end(dismissalPolicy: .immediate)
                self.activityId = nil
                return true
            }
            self.activityId = nil
            return false
        }
    }

    @available(iOS 16.1, *)
    private static func buildState(from dict: [String: Any]) -> NavigoActivityAttributes.ContentState {
        NavigoActivityAttributes.ContentState(
            instruction:          dict["instruction"] as? String ?? "",
            remainingDistanceText: dict["remainingDistanceText"] as? String ?? "",
            eta:                  dict["eta"] as? String ?? "",
            progress:             dict["progress"] as? Double ?? 0,
            isPaused:             dict["isPaused"] as? Bool ?? false
        )
    }
}
