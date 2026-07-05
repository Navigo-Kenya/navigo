// plugins/withLiveActivity.js
// Adds iOS Live Activity entitlements and Info.plist flags needed for
// ActivityKit and the App Group shared container.
const { withEntitlementsPlist, withInfoPlist } = require("expo/config-plugins");

const APP_GROUP = "group.com.navigo.ke";

/** Merges an array value into an entitlements key, deduplicating entries. */
function mergeArray(entitlements, key, values) {
  const existing = entitlements[key] ?? [];
  const merged = Array.from(new Set([...existing, ...values]));
  entitlements[key] = merged;
  return entitlements;
}

module.exports = function withLiveActivity(config) {
  // 1. Entitlements — App Group + Live Activities
  config = withEntitlementsPlist(config, (cfg) => {
    cfg.modResults = mergeArray(
      cfg.modResults,
      "com.apple.security.application-groups",
      [APP_GROUP]
    );
    return cfg;
  });

  // 2. Info.plist — opt-in to Live Activities and frequent updates
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults["NSSupportsLiveActivities"] = true;
    cfg.modResults["NSSupportsLiveActivitiesFrequentUpdates"] = true;
    return cfg;
  });

  return config;
};
