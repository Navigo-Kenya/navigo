// plugins/withAndroidWidget.js
// Adds the Navigo Glance widget receiver to AndroidManifest.xml,
// injects the Glance gradle dependency, and writes the appwidget-provider
// XML so AAPT can always find it in the app's own res/xml/ directory.
const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
} = require("expo/config-plugins");
const fs   = require("fs");
const path = require("path");

const RECEIVER = {
  $: {
    "android:name": "com.navigo.widget.NavigoWidgetReceiver",
    "android:exported": "true",
  },
  "intent-filter": [
    {
      action: [
        { $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } },
      ],
    },
  ],
  "meta-data": [
    {
      $: {
        "android:name": "android.appwidget.provider",
        "android:resource": "@xml/navigo_widget_info",
      },
    },
  ],
};

// Mirrors modules/navigo-widget-data/android/src/main/res/xml/navigo_widget_info.xml
// Written here so AAPT finds it in the app's own res even before library merging occurs.
const WIDGET_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="160dp"
    android:minHeight="110dp"
    android:targetCellWidth="2"
    android:targetCellHeight="2"
    android:updatePeriodMillis="0"
    android:initialLayout="@layout/glance_default_loading_layout"
    android:widgetCategory="home_screen"
    android:description="@string/app_name"
    android:resizeMode="horizontal|vertical"
    android:previewImage="@mipmap/ic_launcher" />
`;

module.exports = function withAndroidWidget(config) {
  // 1. Add receiver to AndroidManifest
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    if (!app.receiver) app.receiver = [];
    const exists = app.receiver.some(
      (r) => r.$?.["android:name"] === RECEIVER.$["android:name"]
    );
    if (!exists) app.receiver.push(RECEIVER);
    return cfg;
  });

  // 2. Inject Glance dependency into app/build.gradle
  config = withAppBuildGradle(config, (cfg) => {
    const dep = `    implementation "androidx.glance:glance-appwidget:1.1.0"`;
    if (!cfg.modResults.contents.includes("glance-appwidget")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n${dep}`
      );
    }
    return cfg;
  });

  // 3. Write navigo_widget_info.xml into the app's own res/xml/ directory so
  //    AAPT can resolve @xml/navigo_widget_info during resource linking.
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app", "src", "main", "res", "xml"
      );
      await fs.promises.mkdir(xmlDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(xmlDir, "navigo_widget_info.xml"),
        WIDGET_INFO_XML,
        "utf8"
      );
      return cfg;
    },
  ]);

  return config;
};
