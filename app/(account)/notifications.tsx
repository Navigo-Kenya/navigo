// app/(account)/notifications.tsx
//
// Notifications, each switch tied to something that sends them (the API's
// push job reads these settings: SendPushNotificationJob::allowed):
//   - Morning briefing and departure reminders: the 6 a.m. briefing job
//   - Service alerts: the console's alerts and broadcast alerts
//   - Points, badges and contributions: approvals, rejections, trending reports
//   - Tips, News: the console's broadcasts
//   - Sound: pushes ring or arrive silently
// Switches for alerts nothing sends yet (route changes, stop updates, "bus
// arriving", nearby contributions) are gone until they exist. The phone's
// own permission comes first: "Turn on" asks for it and registers the
// phone for pushes.
import { ScreenHeader } from "@/components/app/ScreenHeader";
import { CacheService, CACHE_KEYS, CACHE_TTL } from "@/services/cache";
import { SettingsService, UserSettings } from "@/services/settings";
import { registerPushToken, requestNotificationPermission, syncTokenWithBackend } from "@/services/notifications";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/icons/Icon";
import { PressableScale } from "@/components/ui/PressableScale";

const ORANGE = "#FF6F00";

function makeC(dark: boolean) {
  return {
    bg:    dark ? "#0F0F10" : "#F6F7F8",
    card:  dark ? "#1C1C1F" : "#FFFFFF",
    text:  dark ? "#F4F4F5" : "#111827",
    sub:   dark ? "#A1A1AA" : "#6B7280",
    line:  dark ? "#2A2A2F" : "#EEF0F3",
    field: dark ? "#27272A" : "#F3F4F6",
    warn:  dark ? "rgba(255,111,0,0.14)" : "#FFF4EB",
  };
}
type N = UserSettings["notifications"];
type Key = keyof N;

const DEFAULTS: N = {
  master: true, sound: true, route_changes: true, disruptions: true, stop_updates: false,
  bus_arriving: true, journey_reminder: true, turn_by_turn: false, nearby_contrib: true,
  points_earned: true, tips: false, app_news: false,
};

/** The switches, each with what sends it. */
const GROUPS: { title: string; rows: { key: Key; icon: IconName; label: string; desc: string }[] }[] = [
  {
    title: "YOUR TRIPS",
    rows: [
      { key: "journey_reminder", icon: "time", label: "Morning briefing", desc: "At 6 a.m.: your usual trip, how the roads look and when to leave." },
      { key: "disruptions", icon: "warning", label: "Service alerts", desc: "Disruptions announced on the network: closures, suspended lines, emergencies." },
    ],
  },
  {
    title: "COMMUNITY",
    rows: [
      { key: "points_earned", icon: "trophy", label: "Points and contributions", desc: "When a contribution is approved or not, and when people confirm your report." },
    ],
  },
  {
    title: "FROM NAVIGO",
    rows: [
      { key: "tips", icon: "sparkles", label: "Tips", desc: "Now and then, a way to get more out of Navigo." },
      { key: "app_news", icon: "megaphone", label: "News and new features", desc: "What's new in Navigo." },
    ],
  },
];

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dark = useColorScheme() === "dark";
  const C = makeC(dark);
  const [n, setN] = useState<N>(DEFAULTS);
  const [os, setOs] = useState<{ granted: boolean; canAsk: boolean } | null>(null);
  const [turningOn, setTurningOn] = useState(false);

  // Cache first, then the server.
  useEffect(() => {
    CacheService.get<N>(CACHE_KEYS.SETTINGS_NOTIFICATIONS, CACHE_TTL.SETTINGS)
      .then((cached) => { if (cached && "journey_reminder" in cached) setN({ ...DEFAULTS, ...cached }); })
      .catch(() => {});
    SettingsService.get()
      .then((st) => {
        const next = { ...DEFAULTS, ...st.notifications };
        setN(next);
        CacheService.set(CACHE_KEYS.SETTINGS_NOTIFICATIONS, next);
      })
      .catch(() => {});
  }, []);

  const checkOs = useCallback(async () => {
    const p = await Notifications.getPermissionsAsync().catch(() => null);
    setOs(p ? { granted: p.status === "granted", canAsk: p.canAskAgain !== false } : null);
  }, []);
  useEffect(() => {
    checkOs();
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") checkOs(); });
    return () => sub.remove();
  }, [checkOs]);

  const turnOn = async () => {
    if (os && !os.canAsk) { Linking.openSettings().catch(() => {}); return; }
    setTurningOn(true);
    try {
      if (await requestNotificationPermission()) {
        const token = await registerPushToken();
        if (token) await syncTokenWithBackend(token);
      }
    } catch {
      // The banner stays: the permission state says what happened.
    } finally {
      setTurningOn(false);
      checkOs();
    }
  };

  const set = (key: Key, value: boolean) => {
    const prev = n;
    const next = { ...n, [key]: value };
    setN(next);
    CacheService.set(CACHE_KEYS.SETTINGS_NOTIFICATIONS, next);
    SettingsService.update({ notifications: { [key]: value } as Partial<N> }).catch(() => {
      setN(prev);
      CacheService.set(CACHE_KEYS.SETTINGS_NOTIFICATIONS, prev);
      Alert.alert("Couldn't save", "Check your connection and try again.");
    });
  };

  const muted = !n.master;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader
        title="Notifications"
        C={{ bg: C.bg, text: C.text, hairline: C.line }}
        rightLabel="Inbox"
        rightAction={() => router.push("/(account)/notification-inbox" as any)}
      />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        {/* The phone's permission comes first. */}
        {os && !os.granted ? (
          <View style={[s.banner, { backgroundColor: C.warn }]}>
            <Icon name="notifications" size={20} color={ORANGE} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.bannerTitle, { color: C.text }]}>Notifications are off on this phone</Text>
              <Text style={[s.bannerSub, { color: C.sub }]}>
                {os.canAsk ? "Turn them on to get the alerts below." : `Allow them for Navigo in your phone's settings${Platform.OS === "ios" ? " → Notifications" : ""}.`}
              </Text>
            </View>
            <PressableScale onPress={turnOn} style={s.bannerBtn}>
              {turningOn ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={s.bannerBtnText}>{os.canAsk ? "Turn on" : "Settings"}</Text>}
            </PressableScale>
          </View>
        ) : null}

        {/* Everything at once. */}
        <View style={[s.master, { backgroundColor: C.card }]}>
          <View style={[s.masterIcon, { backgroundColor: muted ? C.field : ORANGE }]}>
            <Icon name="notifications" size={20} color={muted ? C.sub : "#FFFFFF"} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.masterTitle, { color: C.text }]}>Push notifications</Text>
            <Text style={[s.rowDesc, { color: C.sub }]}>
              {muted ? "All muted. Emergency alerts still get through." : "On, as chosen below."}
            </Text>
          </View>
          <Switch value={n.master} onValueChange={(v) => set("master", v)} trackColor={{ true: ORANGE, false: undefined }} thumbColor={Platform.OS === "android" ? "#FFFFFF" : undefined} />
        </View>

        {GROUPS.map((g) => (
          <View key={g.title} style={{ gap: 6, opacity: muted ? 0.45 : 1 }} pointerEvents={muted ? "none" : "auto"}>
            <Text style={[s.sectionTitle, { color: C.sub }]}>{g.title}</Text>
            <View style={[s.card, { backgroundColor: C.card }]}>
              {g.rows.map((r, i) => (
                <View key={r.key}>
                  {i > 0 ? <View style={[s.sep, { backgroundColor: C.line }]} /> : null}
                  <View style={s.row}>
                    <View style={[s.rowIcon, { backgroundColor: C.field }]}>
                      <Icon name={r.icon} size={17} color={C.text} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.rowLabel, { color: C.text }]}>{r.label}</Text>
                      <Text style={[s.rowDesc, { color: C.sub }]}>{r.desc}</Text>
                    </View>
                    <Switch value={n[r.key]} onValueChange={(v) => set(r.key, v)} trackColor={{ true: ORANGE, false: undefined }} thumbColor={Platform.OS === "android" ? "#FFFFFF" : undefined} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={{ gap: 6, opacity: muted ? 0.45 : 1 }} pointerEvents={muted ? "none" : "auto"}>
          <Text style={[s.sectionTitle, { color: C.sub }]}>HOW THEY ARRIVE</Text>
          <View style={[s.card, { backgroundColor: C.card }]}>
            <View style={s.row}>
              <View style={[s.rowIcon, { backgroundColor: C.field }]}>
                <Icon name="musical-notes" size={17} color={C.text} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.rowLabel, { color: C.text }]}>Sound</Text>
                <Text style={[s.rowDesc, { color: C.sub }]}>Off: notifications arrive silently. Emergencies always ring.</Text>
              </View>
              <Switch value={n.sound} onValueChange={(v) => set("sound", v)} trackColor={{ true: ORANGE, false: undefined }} thumbColor={Platform.OS === "android" ? "#FFFFFF" : undefined} />
            </View>
          </View>
        </View>

        <View style={[s.info, { backgroundColor: C.card }]}>
          <Icon name="navigate" size={18} color={ORANGE} />
          <Text style={[s.infoText, { color: C.sub }]}>
            {"During a trip, “get off at the next stop”, arrival and wrong-way alerts come from your phone itself, so they work offline. They’re part of navigation, not these settings."}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: 14, gap: 16 },
  banner: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, padding: 14 },
  bannerTitle: { fontSize: 15, fontWeight: "800" },
  bannerSub: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  bannerBtn: { backgroundColor: ORANGE, height: 36, paddingHorizontal: 14, borderRadius: 18, alignItems: "center", justifyContent: "center", minWidth: 80 },
  bannerBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  master: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, padding: 14 },
  masterIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  masterTitle: { fontSize: 16.5, fontWeight: "800" },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, paddingHorizontal: 4 },
  card: { borderRadius: 18, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 15.5, fontWeight: "600" },
  rowDesc: { fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 56 },
  info: { flexDirection: "row", gap: 10, borderRadius: 18, padding: 14, alignItems: "flex-start" },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
