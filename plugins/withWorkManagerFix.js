// plugins/withWorkManagerFix.js
//
// Forces androidx.work:work-runtime and work-runtime-ktx to the same version.
// Starting in work-runtime:2.8.0 the Kotlin extension classes (OneTimeWorkRequestKt,
// PeriodicWorkRequestKt) were merged into the main JAR. Any transitive dependency still
// pulling work-runtime-ktx:<2.8.0 causes a "Duplicate class" build failure because those
// classes now exist in both JARs simultaneously.
const { withAppBuildGradle } = require("@expo/config-plugins");

const GUARD = "// work-runtime-duplicate-fix";
const PATCH = `
${GUARD}
configurations.all {
    resolutionStrategy {
        force 'androidx.work:work-runtime:2.8.0'
        force 'androidx.work:work-runtime-ktx:2.8.0'
    }
}
`;

module.exports = function withWorkManagerFix(config) {
  return withAppBuildGradle(config, (c) => {
    if (c.modResults.contents.includes(GUARD)) return c;
    c.modResults.contents += PATCH;
    return c;
  });
};
