// app/(account)/notifications.tsx
import { ScreenHeader } from "@/components/app/ScreenHeader";
import { CacheService, CACHE_KEYS, CACHE_TTL } from "@/services/cache";
import { SettingsService, UserSettings } from "@/services/settings";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { useEffect, useState, useCallback } from "react";
import {
  Alert,
  AppState,
  AppStateStatus,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ORANGE = "#FF6F00";
const GREEN  = "#10B981";
const GREY   = "#8E8E93";

function makeC(dark: boolean) {
  return {
    bg:        dark ? "#0F0F0F" : "#F6F7F8",
    card:      dark ? "#1C1C1E" : "#FFFFFF",
    text:      dark ? "#FFFFFF" : "#1C1C1E",
    subText:   dark ? GREY      : "#4B5563",
    hairline:  dark ? "#2C2C2E" : "#E5E7EB",
    icon:      dark ? "#EBEBF5" : "#1C1C1E",
    switchOff: dark ? "#3A3A3C" : "#D1D5DB",
    masterBg:  dark ? "#1C1C1E" : "#FFFFFF",
    permDeniedBg:   dark ? "rgba(255,59,48,0.12)" : "#FFF5F5",
    permGrantedBg:  dark ? "rgba(16,185,129,0.10)" : "#F0FFF4",
    permDeniedText: "#FF3B30",
    permGrantedText: GREEN,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, C, disabled, children }: {
  title: string;
  C: ReturnType<typeof makeC>;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[s.section, { backgroundColor: C.card, opacity: disabled ? 0.42 : 1 }]}>
      <Text style={[s.sectionTitle, { color: C.subText }]}>{title}</Text>
      {children}
    </View>
  );
}

function Divider({ C }: { C: ReturnType<typeof makeC> }) {
  return <View style={[s.divider, { backgroundColor: C.hairline }]} />;
}

function ToggleRow({ icon, label, description, value, onChange, C, disabled }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  C: ReturnType<typeof makeC>;
  disabled?: boolean;
}) {
  return (
    <View style={[s.row, disabled && { pointerEvents: "none" }]}>
      <Ionicons name={icon} size={18} color={C.icon} style={{ marginTop: description ? 2 : 0 }} />
      <View style={s.rowBody}>
        <Text style={[s.rowLabel, { color: C.text }]}>{label}</Text>
        {description ? <Text style={[s.rowDesc, { color: C.subText }]}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={disabled ? undefined : onChange}
        trackColor={{ false: C.switchOff, true: ORANGE }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={C.switchOff}
      />
    </View>
  );
}

// ─── OS permission banner ─────────────────────────────────────────────────────

function OsPermissionBanner({ granted, C }: { granted: boolean | null; C: ReturnType<typeof makeC> }) {
  if (granted === null) return null; // still loading, show nothing

  if (granted) {
    return (
      <View style={[s.permBanner, { backgroundColor: C.permGrantedBg }]}>
        <Ionicons name="checkmark-circle" size={18} color={GREEN} />
        <Text style={[s.permText, { color: C.permGrantedText }]}>
          Notifications are enabled on this device
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => Linking.openSettings()}
      style={({ pressed }) => [s.permBanner, { backgroundColor: C.permDeniedBg, opacity: pressed ? 0.75 : 1 }]}
    >
      <Ionicons name="alert-circle" size={18} color={C.permDeniedText} />
      <Text style={[s.permText, { color: C.permDeniedText, flex: 1 }]}>
        Notifications are blocked by your device. Tap to open Settings and allow them.
      </Text>
      <Ionicons name="chevron-forward" size={14} color={C.permDeniedText} />
    </Pressable>
  );
}

// ─── Key mapping (frontend camelCase → API snake_case) ────────────────────────

const DEFAULTS: NotifPrefs = {
  master:          true,
  sound:           true,
  routeChanges:    true,
  disruptions:     true,
  stopUpdates:     false,
  busArriving:     true,
  journeyReminder: true,
  turnByTurn:      false,
  nearbyContrib:   true,
  pointsEarned:    true,
  tips:            false,
  appNews:         false,
};

type NotifPrefs = {
  master:          boolean;
  sound:           boolean;
  routeChanges:    boolean;
  disruptions:     boolean;
  stopUpdates:     boolean;
  busArriving:     boolean;
  journeyReminder: boolean;
  turnByTurn:      boolean;
  nearbyContrib:   boolean;
  pointsEarned:    boolean;
  tips:            boolean;
  appNews:         boolean;
};

type PrefKey = keyof NotifPrefs;

const API_KEY: Record<PrefKey, keyof UserSettings['notifications']> = {
  master:          'master',
  sound:           'sound',
  routeChanges:    'route_changes',
  disruptions:     'disruptions',
  stopUpdates:     'stop_updates',
  busArriving:     'bus_arriving',
  journeyReminder: 'journey_reminder',
  turnByTurn:      'turn_by_turn',
  nearbyContrib:   'nearby_contrib',
  pointsEarned:    'points_earned',
  tips:            'tips',
  appNews:         'app_news',
};

function serverToLocal(n: UserSettings['notifications']): NotifPrefs {
  return {
    master:          n.master,
    sound:           n.sound,
    routeChanges:    n.route_changes,
    disruptions:     n.disruptions,
    stopUpdates:     n.stop_updates,
    busArriving:     n.bus_arriving,
    journeyReminder: n.journey_reminder,
    turnByTurn:      n.turn_by_turn,
    nearbyContrib:   n.nearby_contrib,
    pointsEarned:    n.points_earned,
    tips:            n.tips,
    appNews:         n.app_news,
  };
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const dark   = useColorScheme() === "dark";
  const C      = makeC(dark);

  const [p, setP]       = useState<NotifPrefs>(DEFAULTS);
  const [osGranted, setOsGranted] = useState<boolean | null>(null);

  // ── Load settings: cache-first then network ───────────────────────────────
  useEffect(() => {
    // Instant: show cached value if available
    CacheService.get<NotifPrefs>(CACHE_KEYS.SETTINGS_NOTIFICATIONS, CACHE_TTL.SETTINGS)
      .then((cached) => { if (cached) setP(cached); });

    // Background: fetch fresh from server, update cache + UI
    SettingsService.get()
      .then((s) => {
        const local = serverToLocal(s.notifications);
        setP(local);
        CacheService.set(CACHE_KEYS.SETTINGS_NOTIFICATIONS, local);
      })
      .catch(() => {}); // cached value remains visible on network failure
  }, []);

  // ── Check OS notification permission ─────────────────────────────────────
  const checkOsPermission = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setOsGranted(status === "granted");
  }, []);

  useEffect(() => {
    checkOsPermission();
    // Re-check when user returns from OS settings
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") checkOsPermission();
    });
    return () => sub.remove();
  }, [checkOsPermission]);

  // ── Optimistic toggle ─────────────────────────────────────────────────────
  const toggle = useCallback((key: PrefKey) => {
    const newVal = !p[key];
    const next = { ...p, [key]: newVal };
    setP(next);
    CacheService.set(CACHE_KEYS.SETTINGS_NOTIFICATIONS, next);

    SettingsService.update({
      notifications: { [API_KEY[key]]: newVal } as Partial<UserSettings['notifications']>,
    }).catch(() => {
      const reverted = { ...next, [key]: !newVal };
      setP(reverted);
      CacheService.set(CACHE_KEYS.SETTINGS_NOTIFICATIONS, reverted);
      Alert.alert("Save failed", "Could not update your notification setting. Please try again.");
    });
  }, [p]);

  const sub = !p.master;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Notifications" C={C} />

      <ScrollView
        style={{ backgroundColor: C.bg }}
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Device permission status ──────────────────────────────────── */}
        <OsPermissionBanner granted={osGranted} C={C} />

        {/* ── Master card ───────────────────────────────────────────────── */}
        <View style={[s.masterCard, { backgroundColor: C.masterBg }]}>
          <View style={s.masterLeft}>
            <View style={[s.masterIconBox, { backgroundColor: sub ? C.switchOff : ORANGE }]}>
              <Ionicons name="notifications" size={20} color="#FFFFFF" />
            </View>
            <View style={{ gap: 2 }}>
              <Text style={[s.masterLabel, { color: C.text }]}>Push Notifications</Text>
              <Text style={[s.masterDesc, { color: C.subText }]}>
                {p.master ? "All alerts enabled" : "All notifications muted"}
              </Text>
            </View>
          </View>
          <Switch
            value={p.master}
            onValueChange={() => toggle("master")}
            trackColor={{ false: C.switchOff, true: ORANGE }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={C.switchOff}
          />
        </View>

        {/* ── Sound ─────────────────────────────────────────────────────── */}
        <Section title="GENERAL" C={C} disabled={sub}>
          <ToggleRow
            C={C} disabled={sub}
            icon="volume-high-outline"
            label="Notification sound"
            description="Play a sound for incoming alerts"
            value={p.sound}
            onChange={() => toggle("sound")}
          />
        </Section>

        {/* ── Transit Alerts ────────────────────────────────────────────── */}
        <Section title="TRANSIT ALERTS" C={C} disabled={sub}>
          <ToggleRow
            C={C} disabled={sub}
            icon="git-branch-outline"
            label="Route changes"
            description="When your usual routes are altered"
            value={p.routeChanges}
            onChange={() => toggle("routeChanges")}
          />
          <Divider C={C} />
          <ToggleRow
            C={C} disabled={sub}
            icon="warning-outline"
            label="Service disruptions"
            description="Delays, cancellations, and incidents"
            value={p.disruptions}
            onChange={() => toggle("disruptions")}
          />
          <Divider C={C} />
          <ToggleRow
            C={C} disabled={sub}
            icon="ban-outline"
            label="Stop updates"
            description="Temporary closures and construction"
            value={p.stopUpdates}
            onChange={() => toggle("stopUpdates")}
          />
        </Section>

        {/* ── Journey ───────────────────────────────────────────────────── */}
        <Section title="JOURNEY UPDATES" C={C} disabled={sub}>
          <ToggleRow
            C={C} disabled={sub}
            icon="bus-outline"
            label="Bus arriving soon"
            description="Alert 2 minutes before your bus arrives"
            value={p.busArriving}
            onChange={() => toggle("busArriving")}
          />
          <Divider C={C} />
          <ToggleRow
            C={C} disabled={sub}
            icon="alarm-outline"
            label="Journey reminders"
            description="Morning briefing + nudge before saved departures"
            value={p.journeyReminder}
            onChange={() => toggle("journeyReminder")}
          />
          <Divider C={C} />
          <ToggleRow
            C={C} disabled={sub}
            icon="walk-outline"
            label="Turn-by-turn audio"
            description="Voice guidance while walking to a stop"
            value={p.turnByTurn}
            onChange={() => toggle("turnByTurn")}
          />
        </Section>

        {/* ── Community ─────────────────────────────────────────────────── */}
        <Section title="COMMUNITY" C={C} disabled={sub}>
          <ToggleRow
            C={C} disabled={sub}
            icon="people-outline"
            label="Nearby contributions"
            description="New stops and routes added near you"
            value={p.nearbyContrib}
            onChange={() => toggle("nearbyContrib")}
          />
          <Divider C={C} />
          <ToggleRow
            C={C} disabled={sub}
            icon="trophy-outline"
            label="Points earned"
            description="When you receive Safiri reward points"
            value={p.pointsEarned}
            onChange={() => toggle("pointsEarned")}
          />
        </Section>

        {/* ── From Navigo ────────────────────────────────────────────────── */}
        <Section title="FROM NAVIGO" C={C} disabled={sub}>
          <ToggleRow
            C={C} disabled={sub}
            icon="bulb-outline"
            label="Tips & tricks"
            description="Helpful hints to get more out of Navigo"
            value={p.tips}
            onChange={() => toggle("tips")}
          />
          <Divider C={C} />
          <ToggleRow
            C={C} disabled={sub}
            icon="newspaper-outline"
            label="App news"
            description="New features and important announcements"
            value={p.appNews}
            onChange={() => toggle("appNews")}
          />
        </Section>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  body: {
    paddingHorizontal: 16,
    paddingTop:        16,
    gap:               16,
  },

  permBanner: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:               8,
    borderRadius:      12,
    paddingHorizontal: 14,
    paddingVertical:   12,
  },
  permText: { fontSize: 13, lineHeight: 18, fontWeight: "500" },

  masterCard: {
    flexDirection:    "row",
    alignItems:       "center",
    justifyContent:   "space-between",
    borderRadius:     18,
    paddingHorizontal: 16,
    paddingVertical:   16,
    shadowColor:      "#000",
    shadowOpacity:    0.07,
    shadowRadius:     12,
    shadowOffset:     { width: 0, height: 3 },
    elevation:         4,
  },
  masterLeft:    { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  masterIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  masterLabel:   { fontSize: 16, fontWeight: "700" },
  masterDesc:    { fontSize: 13 },

  section: {
    borderRadius:      14,
    paddingHorizontal: 14,
    paddingTop:        12,
    paddingBottom:      4,
  },
  sectionTitle: {
    fontSize:      11,
    fontWeight:    "700",
    letterSpacing:  0.5,
    marginBottom:   8,
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 28 },

  row: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:             12,
    paddingVertical: 12,
  },
  rowBody:  { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15 },
  rowDesc:  { fontSize: 12, lineHeight: 17 },
});
