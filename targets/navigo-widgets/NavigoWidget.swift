// NavigoWidget.swift: WidgetKit home-screen widget
import SwiftUI
import WidgetKit

private let kAppGroup = "group.com.navigo.ke"
private let kWidgetKey = "navigo_widget_data_v1"
private let kOrange    = Color(red: 1, green: 0.435, blue: 0)

// ── Data model ────────────────────────────────────────────────────────────────

struct NavigoWidgetData: Codable {
    struct Pin: Codable {
        let name: String
        let lat: Double
        let lng: Double
    }
    var home: Pin?
    var work: Pin?
    var streakDays: Int
    var lastDestination: String?
    var updatedAt: Double

    static let empty = NavigoWidgetData(home: nil, work: nil, streakDays: 0,
                                        lastDestination: nil, updatedAt: 0)
}

func loadWidgetData() -> NavigoWidgetData {
    guard
        let defaults = UserDefaults(suiteName: kAppGroup),
        let json     = defaults.string(forKey: kWidgetKey),
        let data     = json.data(using: .utf8)
    else { return .empty }

    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    return (try? decoder.decode(NavigoWidgetData.self, from: data)) ?? .empty
}

// ── Timeline provider ─────────────────────────────────────────────────────────

struct NavigoWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> NavigoWidgetEntry {
        NavigoWidgetEntry(date: Date(), data: .empty)
    }
    func getSnapshot(in context: Context, completion: @escaping (NavigoWidgetEntry) -> Void) {
        completion(NavigoWidgetEntry(date: Date(), data: loadWidgetData()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<NavigoWidgetEntry>) -> Void) {
        let entry = NavigoWidgetEntry(date: Date(), data: loadWidgetData())
        // Widget refreshes when the app calls WidgetCenter.reloadAllTimelines().
        completion(Timeline(entries: [entry], policy: .never))
    }
}

struct NavigoWidgetEntry: TimelineEntry {
    let date: Date
    let data: NavigoWidgetData
}

// ── Views ─────────────────────────────────────────────────────────────────────

struct NavigoWidgetView: View {
    var entry: NavigoWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Navigo")
                    .font(.caption.bold())
                    .foregroundColor(kOrange)
                Spacer()
                if entry.data.streakDays > 0 {
                    Text("🔥 \(entry.data.streakDays)")
                        .font(.caption2)
                }
            }

            Divider()

            QuickRow(icon: "house.fill",
                     label: entry.data.home?.name ?? "Set home pin",
                     active: entry.data.home != nil)

            QuickRow(icon: "briefcase.fill",
                     label: entry.data.work?.name ?? "Set work pin",
                     active: entry.data.work != nil)

            if let dest = entry.data.lastDestination {
                QuickRow(icon: "arrow.uturn.backward",
                         label: dest,
                         active: true,
                         secondary: true)
            }
        }
        .padding(12)
        .background(Color(.systemBackground))
    }
}

struct QuickRow: View {
    let icon: String
    let label: String
    let active: Bool
    var secondary: Bool = false

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundColor(secondary ? .secondary : kOrange)
                .frame(width: 16)
            Text(label)
                .font(.caption)
                .foregroundColor(active ? .primary : .secondary)
                .lineLimit(1)
        }
    }
}

// ── Widget declaration ────────────────────────────────────────────────────────

struct NavigoWidget: Widget {
    let kind = "NavigoWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NavigoWidgetProvider()) { entry in
            if #available(iOS 17.0, *) {
                NavigoWidgetView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                NavigoWidgetView(entry: entry)
            }
        }
        .configurationDisplayName("Navigo")
        .description("Quick access to your home, work, and last destination.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
