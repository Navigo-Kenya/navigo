// app/(account)/privacy.tsx
import { ScreenHeader } from "@/components/app/ScreenHeader";
import { SettingsService, UserSettings } from "@/services/settings";
import { useAuthStore } from "@/store/authStore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Linking,
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
const GREY   = "#8E8E93";
const DANGER = "#FF3B30";

// AsyncStorage keys for device-local settings
const SK_SCREEN_LOCK = "navigo_screen_lock";
const SK_BG_LOCATION = "navigo_bg_location";
const SK_PRECISE     = "navigo_precise_location";

function makeC(dark: boolean) {
  return {
    bg:        dark ? "#0F0F0F" : "#F6F7F8",
    card:      dark ? "#1C1C1E" : "#FFFFFF",
    text:      dark ? "#FFFFFF" : "#1C1C1E",
    subText:   dark ? GREY      : "#4B5563",
    hairline:  dark ? "#2C2C2E" : "#E5E7EB",
    icon:      dark ? "#EBEBF5" : "#1C1C1E",
    pressed:   dark ? "#2C2C2E" : "#F2F2F7",
    switchOff: dark ? "#3A3A3C" : "#D1D5DB",
    softRed:   dark ? "rgba(255,59,48,0.12)"  : "#FFF5F5",
    softOrange:dark ? "rgba(255,111,0,0.15)"  : "#FFF3E0",
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, C, children }: {
  title: string;
  C: ReturnType<typeof makeC>;
  children: React.ReactNode;
}) {
  return (
    <View style={[s.section, { backgroundColor: C.card }]}>
      <Text style={[s.sectionTitle, { color: C.subText }]}>{title}</Text>
      {children}
    </View>
  );
}

function Divider({ C }: { C: ReturnType<typeof makeC> }) {
  return <View style={[s.divider, { backgroundColor: C.hairline }]} />;
}

function NavRow({ icon, label, description, value, onPress, C, danger }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  value?: string | React.ReactNode;
  onPress?: () => void;
  C: ReturnType<typeof makeC>;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        s.row,
        pressed && onPress ? { backgroundColor: C.pressed, marginHorizontal: -14, paddingHorizontal: 14 } : null,
      ]}
    >
      <Ionicons name={icon} size={18} color={danger ? DANGER : C.icon} />
      <View style={s.rowBody}>
        <Text style={[s.rowLabel, { color: danger ? DANGER : C.text }]}>{label}</Text>
        {description ? <Text style={[s.rowDesc, { color: C.subText }]}>{description}</Text> : null}
      </View>
      {value ? (
        typeof value === "string"
          ? <Text style={[s.rowValue, { color: C.subText }]}>{value}</Text>
          : value
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={danger ? DANGER : C.subText} style={{ marginLeft: 4 }} /> : null}
    </Pressable>
  );
}

function ToggleRow({ icon, label, description, value, onChange, C }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  C: ReturnType<typeof makeC>;
}) {
  return (
    <View style={s.row}>
      <Ionicons name={icon} size={18} color={C.icon} style={{ marginTop: description ? 2 : 0 }} />
      <View style={s.rowBody}>
        <Text style={[s.rowLabel, { color: C.text }]}>{label}</Text>
        {description ? <Text style={[s.rowDesc, { color: C.subText }]}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: C.switchOff, true: ORANGE }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={C.switchOff}
      />
    </View>
  );
}

function SessionBadge({ count, C }: { count: number; C: ReturnType<typeof makeC> }) {
  return (
    <View style={[s.sessionBadge, { backgroundColor: C.softOrange }]}>
      <Text style={s.sessionBadgeText}>{count}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function Privacy() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dark   = useColorScheme() === "dark";
  const C      = makeC(dark);

  const { user, logout } = useAuthStore();
  const hasPassword = !user?.oauth_provider;

  // Server-persisted settings
  const [twoFA,            setTwoFA]            = useState(false);
  const [analytics,        setAnalytics]        = useState(true);
  const [anonymousReports, setAnonymousReports] = useState(false);

  // Device-local settings (AsyncStorage)
  const [screenLock, setScreenLock] = useState(false);
  const [bgLocation, setBgLocation] = useState(true);
  const [precise,    setPrecise]    = useState(true);

  // Actual OS-level location permission status (null = still checking)
  const [fgPermGranted, setFgPermGranted] = useState<boolean | null>(null);

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => setFgPermGranted(status === "granted"))
      .catch(() => setFgPermGranted(null));
  }, []);

  useEffect(() => {
    // Load server settings
    SettingsService.get()
      .then((s) => {
        setTwoFA(s.privacy.two_fa);
        setAnalytics(s.privacy.analytics);
        setAnonymousReports(s.privacy.anonymous_reports ?? false);
      })
      .catch(() => {});

    // Load device-local settings
    AsyncStorage.multiGet([SK_SCREEN_LOCK, SK_BG_LOCATION, SK_PRECISE])
      .then(([[, sl], [, bl], [, p]]) => {
        if (sl !== null) setScreenLock(sl === "true");
        if (bl !== null) setBgLocation(bl === "true");
        if (p  !== null) setPrecise(p === "true");
      });
  }, []);

  // Optimistic server save with revert on failure
  const savePrivacy = (
    key: keyof UserSettings['privacy'],
    value: boolean,
    revert: () => void,
  ) => {
    SettingsService.update({ privacy: { [key]: value } as Partial<UserSettings['privacy']> })
      .catch(() => {
        revert();
        Alert.alert("Save failed", "Could not update your setting. Please try again.");
      });
  };

  const handleExportData = () => {
    Alert.alert(
      "Download your data",
      "We'll prepare a file with all your account data and send it to your email address. This may take up to 24 hours.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Request export",
          onPress: () => Alert.alert(
            "Request sent",
            "You'll receive an email at " + (user?.email ?? "your address") + " when it's ready."
          ),
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently erase your account, travel history, and all saved data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete permanently",
          style: "destructive",
          onPress: async () => {
            try {
              // DELETE /auth/account, endpoint to be implemented on backend
            } catch {}
            await logout();
            router.replace("/(auth)/get-started" as any);
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Privacy & Security" C={C} />

      <ScrollView
        style={{ backgroundColor: C.bg }}
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Security ─────────────────────────────────────────────────────── */}
        <Section title="SECURITY" C={C}>
          {hasPassword && (
            <>
              <NavRow
                C={C}
                icon="lock-closed-outline"
                label="Change password"
                description="Last changed: never"
                onPress={() => router.push("/(auth)/forgot-password" as any)}
              />
              <Divider C={C} />
            </>
          )}
          <ToggleRow
            C={C}
            icon="shield-outline"
            label="Two-factor authentication"
            description="Require a code from your phone when signing in"
            value={twoFA}
            onChange={(v) => {
              setTwoFA(v);
              savePrivacy("two_fa", v, () => setTwoFA(!v));
            }}
          />
          <Divider C={C} />
          <ToggleRow
            C={C}
            icon="phone-portrait-outline"
            label="Screen lock"
            description="Require biometrics or PIN to open Navigo"
            value={screenLock}
            onChange={(v) => {
              setScreenLock(v);
              AsyncStorage.setItem(SK_SCREEN_LOCK, String(v));
            }}
          />
          <Divider C={C} />
          <NavRow
            C={C}
            icon="desktop-outline"
            label="Active sessions"
            description="Devices signed in to your account"
            value={<SessionBadge count={1} C={C} />}
            onPress={() => Alert.alert("Active sessions", "Session management coming soon.")}
          />
        </Section>

        {/* ── Location ─────────────────────────────────────────────────────── */}
        <Section title="LOCATION" C={C}>
          {fgPermGranted === false && (
            <Pressable
              style={[s.permBanner, { backgroundColor: C.softOrange }]}
              onPress={() => Linking.openSettings()}
            >
              <Ionicons name="warning-outline" size={16} color={ORANGE} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.permBannerTitle, { color: ORANGE }]}>
                  Location access not granted
                </Text>
                <Text style={[s.permBannerDesc, { color: C.subText }]}>
                  Navigo can't show your position or nearby stops. Tap to open Settings and enable location.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={ORANGE} />
            </Pressable>
          )}
          <ToggleRow
            C={C}
            icon="location-outline"
            label="Background location"
            description="Track your position for live navigation when the app is in the background"
            value={bgLocation}
            onChange={(v) => {
              if (!v) {
                Alert.alert(
                  "Disable background location?",
                  "Live turn-by-turn navigation will stop working when the app is minimized.",
                  [
                    { text: "Keep enabled", style: "cancel" },
                    {
                      text: "Disable",
                      style: "destructive",
                      onPress: () => {
                        setBgLocation(false);
                        AsyncStorage.setItem(SK_BG_LOCATION, "false");
                      },
                    },
                  ]
                );
              } else {
                setBgLocation(true);
                AsyncStorage.setItem(SK_BG_LOCATION, "true");
              }
            }}
          />
          <Divider C={C} />
          <ToggleRow
            C={C}
            icon="navigate-outline"
            label="Precise location"
            description="Required for accurate stop detection and routing"
            value={precise}
            onChange={(v) => {
              setPrecise(v);
              AsyncStorage.setItem(SK_PRECISE, String(v));
            }}
          />
        </Section>

        {/* ── Your Data ────────────────────────────────────────────────────── */}
        <Section title="YOUR DATA" C={C}>
          <NavRow
            C={C}
            icon="cloud-download-outline"
            label="Download my data"
            description="Get a copy of everything Navigo has stored"
            onPress={handleExportData}
          />
          <Divider C={C} />
          <NavRow
            C={C}
            icon="sparkles-outline"
            label="Kwame memory"
            description="See and delete what the assistant remembers about you"
            onPress={() => router.push("/(account)/kwame-memory" as any)}
          />
          {__DEV__ && (
            <>
              <Divider C={C} />
              <NavRow
                C={C}
                icon="analytics-outline"
                label="Dev: navigation traces"
                description="Replay recorded nav sessions through the engine"
                onPress={() => router.push("/(account)/dev-replay" as any)}
              />
            </>
          )}
          <Divider C={C} />
          <ToggleRow
            C={C}
            icon="bar-chart-outline"
            label="Share usage analytics"
            description="Help improve Navigo with anonymous crash reports and feature usage"
            value={analytics}
            onChange={(v) => {
              setAnalytics(v);
              savePrivacy("analytics", v, () => setAnalytics(!v));
            }}
          />
          <Divider C={C} />
          <ToggleRow
            C={C}
            icon="eye-off-outline"
            label="Anonymous incident reports"
            description="Hide your name and level from reports you submit. Your contributions are still tracked."
            value={anonymousReports}
            onChange={(v) => {
              setAnonymousReports(v);
              savePrivacy("anonymous_reports" as any, v, () => setAnonymousReports(!v));
            }}
          />
        </Section>

        {/* ── Danger Zone ──────────────────────────────────────────────────── */}
        <View style={[s.section, { backgroundColor: C.card }]}>
          <Text style={[s.sectionTitle, { color: C.subText }]}>DANGER ZONE</Text>
          <NavRow
            C={C}
            icon="trash-outline"
            label="Delete account"
            description="Permanently erase all your data from Navigo and associated services"
            onPress={handleDeleteAccount}
            danger
          />
        </View>

        {/* ── Privacy note ─────────────────────────────────────────────────── */}
        <View style={s.legalNote}>
          <Ionicons name="information-circle-outline" size={14} color={C.subText} />
          <Text style={[s.legalText, { color: C.subText }]}>
            Your data is processed in accordance with our Privacy Policy. Location data is never sold to third parties.
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  body: {
    paddingHorizontal: 16,
    paddingTop:        20,
    gap:               16,
  },

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
    paddingVertical: 13,
  },
  rowBody:  { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15 },
  rowDesc:  { fontSize: 12, lineHeight: 17 },
  rowValue: { fontSize: 14 },

  sessionBadge: {
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      99,
    marginRight:       2,
  },
  sessionBadgeText: { fontSize: 12, fontWeight: "700", color: ORANGE },

  legalNote: {
    flexDirection: "row",
    alignItems:    "flex-start",
    gap:            6,
    paddingHorizontal: 4,
    paddingBottom:  8,
  },
  legalText: { flex: 1, fontSize: 12, lineHeight: 18 },

  permBanner: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:              10,
    borderRadius:     10,
    padding:          12,
    marginBottom:     10,
  },
  permBannerTitle: { fontSize: 13, fontWeight: "600" },
  permBannerDesc:  { fontSize: 12, lineHeight: 17 },
});
