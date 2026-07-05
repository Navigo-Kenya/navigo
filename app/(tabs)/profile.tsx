import { AuthService } from "@/services/auth";
import { formatBytes } from "@/services/offlineTiles";
import { useAuthStore } from "@/store/authStore";
import { useSavedStore } from "@/store/savedStore";
import { usePrefsStore } from "@/store/prefsStore";
import { useOfflineMapStore } from "@/store/offlineMapStore";
import { useContributionStore } from "@/store/contributionStore";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";

const ORANGE  = "#FF6F00";
const BLACK   = "#1C1C1E";
const HAIRLINE = "#E5E7EB";
const GREY    = "#8E8E93";

function Row({
  icon,
  label,
  value,
  onPress,
  C,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string | React.ReactNode;
  onPress?: () => void;
  C: ReturnType<typeof makeC>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && onPress ? { backgroundColor: C.pressed, marginHorizontal: -14, paddingHorizontal: 14 } : null]}
      accessibilityRole="button"
    >
      <View style={s.rowLeft}>
        <Ionicons name={icon} size={18} color={C.icon} />
        <Text style={[s.rowLabel, { color: C.text }]}>{label}</Text>
      </View>
      <View style={s.rowRight}>
        {typeof value === "string" ? (
          <Text style={[s.rowValue, { color: C.subText }]}>{value}</Text>
        ) : (
          value
        )}
        <Ionicons name="chevron-forward" size={18} color={GREY} />
      </View>
    </Pressable>
  );
}

function Pill({ children, C }: { children: React.ReactNode; C: ReturnType<typeof makeC> }) {
  return (
    <View style={[s.pill, { backgroundColor: C.pill }]}>
      <Text style={s.pillText}>{children}</Text>
    </View>
  );
}

function makeC(dark: boolean) {
  return {
    bg:      dark ? "#0F0F0F" : "#FFFFFF",
    card:    dark ? "#1C1C1E" : "#FFFFFF",
    text:    dark ? "#FFFFFF" : BLACK,
    subText: dark ? GREY     : "#4B5563",
    hairline:dark ? "#2C2C2E" : HAIRLINE,
    icon:    dark ? "#EBEBF5" : BLACK,
    pill:    dark ? "rgba(255,111,0,0.18)" : "#FFF3E0",
    pressed: dark ? "#2C2C2E" : "#F2F2F7",
  };
}

const NAV_HINT_LABEL: Record<string, string> = {
  off:      "Off",
  concise:  "Concise",
  detailed: "Detailed",
};

const WALK_LABEL: Record<number, string> = {
  500:  "500 m",
  1000: "1 km",
  1500: "1.5 km",
  2000: "2 km",
};

const RANKING_LABEL: Record<string, string> = {
  fastest:          "Fastest",
  cheapest:         "Cheapest",
  least_walking:    "Least walking",
  fewest_transfers: "Fewest transfers",
};

const DUCKING_LABEL: Record<string, string> = {
  duck:  "Lower volume",
  pause: "Pause music",
  mix:   "Play together",
};

export default function Profile() {
  const router = useRouter();
  const { user, logout, avatarTs } = useAuthStore();
  const dark = useColorScheme() === "dark";
  const C = makeC(dark);
  const { places, fetch: fetchSaved, reset: resetSaved } = useSavedStore();
  const { prefs, loaded: prefsLoaded, load: loadPrefs, set: setPref } = usePrefsStore();
  const { stats, fetch: fetchContrib, reset: resetContrib } = useContributionStore();
  const offlinePack = useOfflineMapStore((s) => s.pack);

  useEffect(() => { fetchSaved().catch(() => {}); }, [fetchSaved]);
  useEffect(() => { if (!prefsLoaded) loadPrefs(); }, [prefsLoaded, loadPrefs]);
  useEffect(() => { fetchContrib().catch(() => {}); }, [fetchContrib]);

  const pickPref = <K extends keyof typeof prefs>(
    key: K,
    title: string,
    options: { label: string; value: typeof prefs[K] }[],
  ) => {
    Alert.alert(
      title,
      undefined,
      [
        ...options.map((o) => ({
          text: o.value === prefs[key] ? `✓ ${o.label}` : o.label,
          onPress: () => setPref(key, o.value),
        })),
        { text: "Cancel", style: "cancel" as const },
      ],
    );
  };

  const home = places.find((p) => p.pin === "home");
  const work = places.find((p) => p.pin === "work");
  const favCount = places.filter((p) => p.list === "favorites").length;

  const handleLogout = async () => {
    try { await AuthService.logout(); } catch {}
    resetSaved();
    resetContrib();
    await logout();
    router.replace("/(auth)/login" as any);
  };

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <ScrollView
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={s.sheetBody}
    >
      {/* Header */}
      <View style={s.header}>
        {user?.avatar ? (
          <Image source={{ uri: `${user.avatar}?_v=${avatarTs}` }} style={s.avatar} contentFit="cover" />
        ) : (
          <View style={[s.avatar, s.avatarFallback]}>
            <Text style={s.avatarInitials}>{initials}</Text>
          </View>
        )}
        <View style={{ gap: 4 }}>
          <Text style={[s.userName, { color: C.text }]}>{user?.name ?? "—"}</Text>
          <Text style={[s.userEmail, { color: C.subText }]}>{user?.email ?? ""}</Text>
          {user?.phone_number ? (
            <Text style={[s.userPhone, { color: C.subText }]}>{user.phone_number}</Text>
          ) : null}
        </View>
      </View>

      {/* Travel preferences */}
      <View style={[s.section, { backgroundColor: C.card }]}>
        <Text style={[s.sectionTitle, { color: C.subText }]}>TRAVEL PREFERENCES</Text>
        <Row
          C={C} icon="walk-outline" label="Navigation hints"
          value={NAV_HINT_LABEL[prefs.navHints]}
          onPress={() => pickPref("navHints", "Navigation hints", [
            { label: "Off",      value: "off"      },
            { label: "Concise",  value: "concise"  },
            { label: "Detailed", value: "detailed" },
          ])}
        />
        <View style={[s.sep, { backgroundColor: C.hairline }]} />
        <Row
          C={C} icon="analytics-outline" label="Units"
          value={prefs.units === "km" ? "Kilometers" : "Miles"}
          onPress={() => pickPref("units", "Distance units", [
            { label: "Kilometers", value: "km" },
            { label: "Miles",      value: "mi" },
          ])}
        />
        <View style={[s.sep, { backgroundColor: C.hairline }]} />
        <Row
          C={C} icon="map-outline" label="Navigation view"
          value={prefs.navView === "tilted" ? "3D (Tilted)" : "Flat (2D)"}
          onPress={() => pickPref("navView", "Navigation view", [
            { label: "3D (Tilted)", value: "tilted" },
            { label: "Flat (2D)",   value: "flat"   },
          ])}
        />
        <View style={[s.sep, { backgroundColor: C.hairline }]} />
        <Row
          C={C} icon="swap-vertical-outline" label="Route sorting"
          value={RANKING_LABEL[prefs.routeRanking]}
          onPress={() => pickPref("routeRanking", "Preferred route sorting", [
            { label: "Fastest",          value: "fastest"          },
            { label: "Cheapest",         value: "cheapest"         },
            { label: "Least walking",    value: "least_walking"    },
            { label: "Fewest transfers", value: "fewest_transfers" },
          ])}
        />
        <View style={[s.sep, { backgroundColor: C.hairline }]} />
        <Row
          C={C} icon="walk" label="Max walking distance"
          value={WALK_LABEL[prefs.maxWalkMeters]}
          onPress={() => pickPref("maxWalkMeters", "Max walking distance", [
            { label: "500 m",  value: 500  },
            { label: "1 km",   value: 1000 },
            { label: "1.5 km", value: 1500 },
            { label: "2 km",   value: 2000 },
          ])}
        />
        <View style={[s.sep, { backgroundColor: C.hairline }]} />
        <Row
          C={C} icon="receipt-outline" label="Fare estimates"
          value={prefs.showFares ? "On" : "Off"}
          onPress={() => {
            if (prefs.showFares) {
              setPref("showFares", false);
            } else {
              Alert.alert(
                "Fare estimates",
                "These estimates are based on typical Nairobi distance pricing and are highly approximate. Actual fares on the ground can vary significantly by time of day, traffic, and conductor. We're actively working on making them more accurate.",
                [
                  { text: "Show anyway", onPress: () => setPref("showFares", true) },
                  { text: "Cancel", style: "cancel" },
                ],
              );
            }
          }}
        />
        <View style={[s.sep, { backgroundColor: C.hairline }]} />
        <Row
          C={C} icon="cloud-download-outline" label="Offline maps"
          value={offlinePack ? formatBytes(offlinePack.bytes) : "Off"}
          onPress={() => router.push("/(account)/offline-maps" as any)}
        />
      </View>

      {/* Voice guidance */}
      <View style={[s.section, { backgroundColor: C.card }]}>
        <Text style={[s.sectionTitle, { color: C.subText }]}>VOICE GUIDANCE</Text>
        <Row
          C={C} icon="musical-notes-outline" label="When music is playing"
          value={DUCKING_LABEL[prefs.voiceDucking]}
          onPress={() => pickPref("voiceDucking", "When music is playing", [
            { label: "Lower its volume", value: "duck"  },
            { label: "Pause it",         value: "pause" },
            { label: "Play together",    value: "mix"   },
          ])}
        />
        {Platform.OS === "android" && (
          <>
            <View style={[s.sep, { backgroundColor: C.hairline }]} />
            <Row
              C={C} icon="volume-medium-outline" label="Play voice through"
              value={prefs.voiceOutput === "earpiece" ? "Earpiece" : "Speaker"}
              onPress={() => pickPref("voiceOutput", "Play voice through", [
                { label: "Speaker (default)", value: "default"  },
                { label: "Earpiece",          value: "earpiece" },
              ])}
            />
          </>
        )}
      </View>

      {/* Saved places */}
      <View style={[s.section, { backgroundColor: C.card }]}>
        <Text style={[s.sectionTitle, { color: C.subText }]}>SAVED PLACES</Text>
        <Row C={C} icon="home-outline" label="Home" value={home?.name ?? "Add"} onPress={() => router.push({ pathname: "/(account)/pick-place", params: { pin: "home" } } as any)} />
        <View style={[s.sep, { backgroundColor: C.hairline }]} />
        <Row C={C} icon="briefcase-outline" label="Work" value={work?.name ?? "Add"} onPress={() => router.push({ pathname: "/(account)/pick-place", params: { pin: "work" } } as any)} />
        <View style={[s.sep, { backgroundColor: C.hairline }]} />
        <Row C={C} icon="star-outline" label="Favorites" value={<Pill C={C}>{favCount}</Pill>} onPress={() => router.push({ pathname: "/(account)/saved-places", params: { filter: "favorites" } } as any)} />
      </View>

      {/* Community */}
      <View style={[s.section, { backgroundColor: C.card }]}>
        <Text style={[s.sectionTitle, { color: C.subText }]}>COMMUNITY</Text>
        <Row
          C={C} icon="add-circle-outline" label="Your submissions"
          value={<Pill C={C}>{stats?.submissions_count ?? 0}</Pill>}
          onPress={() => router.push("/(account)/submissions" as any)}
        />
        <View style={[s.sep, { backgroundColor: C.hairline }]} />
        <Row
          C={C} icon="trophy-outline" label="Safiri Points"
          value={<Pill C={C}>{stats?.points ?? 0}</Pill>}
          onPress={() => router.push("/(account)/badges" as any)}
        />
      </View>

      {/* Account */}
      <View style={[s.section, { backgroundColor: C.card }]}>
        <Text style={[s.sectionTitle, { color: C.subText }]}>ACCOUNT</Text>
        <Row C={C} icon="person-outline" label="Profile details" onPress={() => router.push("/(account)/profile-details" as any)} />
        <View style={[s.sep, { backgroundColor: C.hairline }]} />
        <Row C={C} icon="notifications-outline" label="Notifications" onPress={() => router.push("/(account)/notifications" as any)} />
        <View style={[s.sep, { backgroundColor: C.hairline }]} />
        <Row C={C} icon="shield-checkmark-outline" label="Privacy & security" onPress={() => router.push("/(account)/privacy" as any)} />
      </View>

      {/* Footer */}
      <View style={{ gap: 4 }}>
        <Pressable
          onPress={() => {}}
          style={({ pressed }) => [s.linkBtn, { opacity: pressed ? 0.5 : 1 }]}
          accessibilityRole="button"
        >
          <Ionicons name="document-text-outline" size={18} color={C.icon} />
          <Text style={[s.linkText, { color: C.text }]}>Terms & Privacy</Text>
        </Pressable>
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [s.linkBtn, { opacity: pressed ? 0.5 : 1 }]}
          accessibilityRole="button"
        >
          <Ionicons name="log-out-outline" size={18} color="#FF3B30" />
          <Text style={[s.linkText, { color: "#FF3B30" }]}>Sign out</Text>
        </Pressable>
        <Text style={s.version}>v0.1.0</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  sheetBody: {
    paddingHorizontal: 10,
    paddingTop:        4,
    paddingBottom:     90,
    gap:               16,
  },

  /* Header */
  header: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           14,
    paddingVertical: 8,
  },
  avatar: {
    width:        64,
    height:       64,
    borderRadius: 999,
  },
  avatarFallback: {
    backgroundColor: ORANGE,
    justifyContent:  "center",
    alignItems:      "center",
  },
  avatarInitials: { color: "#FFF", fontSize: 22, fontWeight: "700" },
  userName:       { fontSize: 22, fontWeight: "700" },
  userEmail:      { fontSize: 14, opacity: 0.85 },
  userPhone:      { fontSize: 13, opacity: 0.6 },

  /* Sections */
  section: {
    borderRadius:      14,
    paddingHorizontal: 14,
    paddingTop:        12,
    paddingBottom:     4,
  },
  sectionTitle: {
    fontSize:      11,
    fontWeight:    "700",
    letterSpacing: 0.5,
    marginBottom:  6,
  },
  sep: {
    height:     StyleSheet.hairlineWidth,
    marginLeft: 28,
  },

  /* Rows */
  row: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    paddingVertical: 13,
  },
  rowLeft:  { flexDirection: "row", alignItems: "center", gap: 10 },
  rowLabel: { fontSize: 15 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowValue: { fontSize: 14 },

  /* Pills */
  pill: {
    paddingHorizontal: 8,
    paddingVertical:   2,
    borderRadius:      999,
  },
  pillText: { color: ORANGE, fontWeight: "700", fontSize: 12 },

  /* Footer */
  linkBtn: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
    paddingVertical: 8,
  },
  linkText: { fontSize: 15 },
  version:  { color: GREY, fontSize: 12, marginTop: 4 },
});
