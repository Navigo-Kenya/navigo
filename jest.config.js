/** Unit tests for pure logic (NavigationEngine, route ranking).
 *  jest-expo handles the babel transform; no native mocks needed since the
 *  tested modules are dependency-free TypeScript. */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.test.ts"],
  // Keep unit runs fast: skip full RN transform ignores except what expo needs.
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)",
  ],
};
