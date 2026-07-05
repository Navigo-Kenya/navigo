import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold, useFonts } from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";
import { useNetworkStore } from "@/store/networkStore";
import { registerLocationTask } from "@/tasks/locationTask";
// Side-effect import: defines the alight-geofence TaskManager task at module
// scope so the OS can relaunch it even when the JS nav loop is dead.
import "@/services/alightGeofence";
import { requestNotificationPermission, registerPushToken, syncTokenWithBackend, setupNotificationTapHandler } from "@/services/notifications";
import { useNotificationStore } from "@/store/notificationStore";
import { useAuthStore } from "@/store/authStore";
import api from "@/services/apiClient";
import { syncQuickActions } from "@/services/quickActions";
import { useSavedStore } from "@/store/savedStore";
import { useQuickActionRouting } from "expo-quick-actions/router";
import Mapbox from "@rnmapbox/maps";
import * as Sentry from "@sentry/react-native";

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");

// Crash/ANR reporting — inert until EXPO_PUBLIC_SENTRY_DSN is set in .env
// (create the Sentry org, then drop both DSNs in; no code change needed).
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  tracesSampleRate: 0.1,
});

// Register background location task at module-eval time, before any component mounts.
registerLocationTask();

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            5 * 60 * 1000,  // 5 min before background refresh
      gcTime:              30 * 60 * 1000,  // 30 min in cache after unmount
      retry:                1,
      refetchOnWindowFocus: false,           // not applicable in React Native
      refetchOnReconnect:   true,
    },
  },
});

function RootLayout() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const setOnline         = useNetworkStore((s) => s.setOnline);
  const setPushToken      = useNotificationStore((s) => s.setPushToken);
  const setPermGranted    = useNotificationStore((s) => s.setPermissionGranted);

  // Home-screen quick actions deep-link into the router (params.href).
  useQuickActionRouting();
  useEffect(() => {
    (async () => {
      try {
        if (useAuthStore.getState().isAuthenticated) {
          await useSavedStore.getState().fetch();
        }
      } catch { /* guest / offline — static shortcuts only */ }
      syncQuickActions();
    })();
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected ?? true);
    });
    // Warm up OTP JVM silently so the first journey plan is fast
    api.get('/otp/warmup').catch(() => {});
    return unsub;
  }, [setOnline]);

  useEffect(() => {
    let tapHandlerCleanup: (() => void) | undefined;

    (async () => {
      const granted = await requestNotificationPermission();
      setPermGranted(granted);
      if (!granted) return;

      const token = await registerPushToken();
      if (token) {
        setPushToken(token);
        // Only sync with backend if the user is already authenticated.
        // If not yet authenticated, setAuth() (after login) and initialize()
        // (for returning users) will both pick up the token from the store.
        if (useAuthStore.getState().isAuthenticated) {
          syncTokenWithBackend(token).catch(() => {});
        }
      }

      tapHandlerCleanup = setupNotificationTapHandler();
    })();

    return () => tapHandlerCleanup?.();
  }, [setPermGranted, setPushToken]);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: "#0A0A0A" }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <QueryClientProvider client={qc}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        <Stack.Screen name="journey" options={{ headerShown: false }} />
        <Stack.Screen name="(account)" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="kwame" options={{ animation: "slide_from_bottom", gestureEnabled: true }} />
        <Stack.Screen name="kwame-settings" options={{ animation: "slide_from_right", headerShown: false }} />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

// Sentry.wrap adds the error boundary + touch-event breadcrumbs.
export default Sentry.wrap(RootLayout);
