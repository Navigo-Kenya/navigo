// NavigoWidgetDataModule.swift
// Writes JSON widget state to the App Group shared UserDefaults so the
// WidgetKit extension can read it without launching the main app.
import ExpoModulesCore
import WidgetKit

private let kAppGroup = "group.com.navigo.ke"
private let kWidgetKey = "navigo_widget_data_v1"

public class NavigoWidgetDataModule: Module {
    public func definition() -> ModuleDefinition {
        Name("NavigoWidgetData")

        Function("writeWidgetData") { (json: String) in
            guard let defaults = UserDefaults(suiteName: kAppGroup) else { return }
            defaults.set(json, forKey: kWidgetKey)
            // Ask WidgetKit to reload all timelines so the widget re-renders.
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
