// NavigoLiveActivityWidget.swift — ActivityKit lock-screen + Dynamic Island views
import SwiftUI
import WidgetKit
import ActivityKit

private let kOrange = Color(red: 1, green: 0.435, blue: 0)

// ── Lock-screen / StandBy view ────────────────────────────────────────────────

@available(iOS 16.1, *)
struct NavigoLockScreenView: View {
    let context: ActivityViewContext<NavigoActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "bus.fill").foregroundColor(kOrange)
                Text("→ \(context.attributes.destination)")
                    .font(.headline).lineLimit(1)
                Spacer()
                Text(context.state.eta)
                    .font(.subheadline.monospacedDigit())
                    .foregroundColor(.secondary)
            }
            ProgressView(value: context.state.progress).tint(kOrange)
            Text(context.state.isPaused ? "Trip paused" : context.state.instruction)
                .font(.subheadline)
                .foregroundColor(context.state.isPaused ? kOrange : .primary)
                .lineLimit(2)
            if !context.state.remainingDistanceText.isEmpty {
                Text("\(context.state.remainingDistanceText) remaining")
                    .font(.caption).foregroundColor(.secondary)
            }
        }
        .padding()
    }
}

// ── Dynamic Island views ──────────────────────────────────────────────────────

@available(iOS 16.2, *)
struct NavigoCompactLeading: View {
    let context: ActivityViewContext<NavigoActivityAttributes>
    var body: some View {
        Image(systemName: "bus.fill").foregroundColor(kOrange)
    }
}

@available(iOS 16.2, *)
struct NavigoCompactTrailing: View {
    let context: ActivityViewContext<NavigoActivityAttributes>
    var body: some View {
        Text(context.state.eta)
            .font(.caption2.monospacedDigit())
            .foregroundColor(kOrange)
    }
}

@available(iOS 16.2, *)
struct NavigoMinimal: View {
    let context: ActivityViewContext<NavigoActivityAttributes>
    var body: some View {
        Image(systemName: "bus.fill").foregroundColor(kOrange)
    }
}

@available(iOS 16.2, *)
struct NavigoExpanded: View {
    let context: ActivityViewContext<NavigoActivityAttributes>
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: "bus.fill").foregroundColor(kOrange)
                Text(context.attributes.destination).font(.headline).lineLimit(1)
                Spacer()
                Text(context.state.eta)
                    .font(.subheadline.monospacedDigit())
            }
            ProgressView(value: context.state.progress).tint(kOrange)
            Text(context.state.isPaused ? "Trip paused" : context.state.instruction)
                .font(.subheadline).lineLimit(2)
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
    }
}

// ── ActivityConfiguration declaration ────────────────────────────────────────

@available(iOS 16.1, *)
struct NavigoLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: NavigoActivityAttributes.self) { context in
            NavigoLockScreenView(context: context)
                .background(.black.opacity(0.9))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "bus.fill").foregroundColor(kOrange).padding(.leading, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.eta)
                        .font(.caption.monospacedDigit()).padding(.trailing, 6)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    NavigoExpanded(context: context)
                }
            } compactLeading: {
                NavigoCompactLeading(context: context)
            } compactTrailing: {
                NavigoCompactTrailing(context: context)
            } minimal: {
                NavigoMinimal(context: context)
            }
        }
    }
}
