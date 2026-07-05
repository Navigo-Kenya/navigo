// plugins/withAndroidWidget.js
// Adds the Navigo Glance widget receiver to AndroidManifest.xml and
// injects the Glance gradle dependency into app/build.gradle.
const {
  withAndroidManifest,
  withAppBuildGradle,
} = require("expo/config-plugins");

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

  return config;
};
