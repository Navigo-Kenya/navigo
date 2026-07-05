// NavigoWidgetBundle.swift — entry point for the widget extension bundle.
import SwiftUI
import WidgetKit

@main
struct NavigoWidgetBundle: WidgetBundle {
    var body: some Widget {
        NavigoWidget()
        if #available(iOS 16.1, *) {
            NavigoLiveActivityWidget()
        }
    }
}
