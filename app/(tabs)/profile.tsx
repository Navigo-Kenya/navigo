// app/(tabs)/profile.tsx
//
// The Profile tab: who you are in the community (level, points, streak,
// badges, rank), then your settings, each with a sheet that says what every
// option does, then your account and the legal bits.
import { AuthService } from "@/services/auth";
import { formatBytes } from "@/services/offlineTiles";
import { useAuthStore } from "@/store/authStore";
import { useSavedStore } from "@/store/savedStore";
import { usePrefsStore, type TravelPrefs } from "@/store/prefsStore";
import { useOfflineMapStore } from "@/store/offlineMapStore";
import { useContributionStore } from "@/store/contributionStore";
import { NavigoBadge, familyOf, tierOf } from "@/components/badges/NavigoBadge";
import { levelProgress } from "@/components/badges/levels";
import { OptionSheet, type Option } from "@/components/ui/OptionSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { Icon, type IconName } from "@/components/icons/Icon";
import Constants from "expo-constants";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, View, useColorScheme } from "react-native";

const ORANGE = "#FF6F00";
const SITE = "https://navigo.co.ke";

function makeC(dark: boolean) {
  return {
    bg:      dark ? "#18181B" : "#FFFFFF",
    card:    dark ? "#1F1F23" : "#F7F7F9",
    text:    dark ? "#F4F4F5" : "#111827",
    sub:     dark ? "#A1A1AA" : "#6B7280",
    line:    dark ? "#2A2A2F" : "#E9EAEE",
    icon:    dark ? "#E4E4E7" : "#374151",
    pressed: dark ? "#27272A" : "#EEEFF2",
    tile:    dark ? "#232328" : "#FFFFFF",
  };
}
type P = ReturnType<typeof makeC>;

type PickKey = "navHints" | "units" | "navView" | "mapLight" | "routeRanking" | "maxWalkMeters" | "voiceDucking" | "voiceOutput";

/** Every choice, with what it does. */
const CHOICES: { [K in PickKey]: { title: string; subtitle?: string; options: Option<TravelPrefs[K]>[] } } = {
  navHints: {
    title: "Navigation hints",
    subtitle: "Landmarks and tips while you travel.",
    options: [
      { value: "off", label: "Off", description: "Only the turns and stops." },
      { value: "concise", label: "Concise", description: "The landmark at each turn and stop." },
      { value: "detailed", label: "Detailed", description: "Landmarks, where to stand, what to look for." },
    ],
  },
  units: {
    title: "Distance units",
    options: [
      { value: "km", label: "Kilometres", description: "500 m, 1.2 km" },
      { value: "mi", label: "Miles", description: "500 ft, 0.8 mi" },
    ],
  },
  navView: {
    title: "Navigation view",
    options: [
      { value: "tilted", label: "3D", description: "A tilted view ahead, with buildings and your vehicle." },
      { value: "flat", label: "Flat", description: "Seen from above." },
    ],
  },
  mapLight: {
    title: "Map light",
    subtitle: "In dark mode the map stays dark.",
    options: [
      { value: "auto", label: "Time of day", description: "Dawn, day, dusk and night, from the sun where you're looking." },
      { value: "day", label: "Always day", description: "Daylight at any hour." },
    ],
  },
  routeRanking: {
    title: "Route sorting",
    subtitle: "Which route comes first when you plan a trip.",
    options: [
      { value: "fastest", label: "Fastest", description: "Arrive soonest." },
      { value: "cheapest", label: "Cheapest", description: "The lowest fare first." },
      { value: "least_walking", label: "Least walking", description: "The shortest walks to and between stages." },
      { value: "fewest_transfers", label: "Fewest transfers", description: "As few changes as possible." },
    ],
  },
  maxWalkMeters: {
    title: "Longest walk",
    subtitle: "How far you're happy to walk to a stage.",
    options: [500, 1000, 1500, 2000, 2500, 3000].map((m) => ({
      value: m as TravelPrefs["maxWalkMeters"],
      label: m < 1000 ? `${m} m` : `${m / 1000} km`,
      description: `About ${Math.round(m / 75)} min on foot`,
    })),
  },
  voiceDucking: {
    title: "When music is playing",
    subtitle: "What voice guidance does to your music while it speaks.",
    options: [
      { value: "duck", label: "Lower its volume", description: "The music keeps playing, quieter." },
      { value: "pause", label: "Pause it", description: "Paused while the voice speaks, then back." },
      { value: "mix", label: "Play together", description: "Both at full volume." },
    ],
  },
  voiceOutput: {
    title: "Play voice through",
    options: [
      { value: "default", label: "Speaker", description: "Or your earphones when they're in." },
      { value: "earpiece", label: "Earpiece", description: "Held to your ear, like a call." },
    ],
  },
};

function label<K extends PickKey>(key: K, value: TravelPrefs[K]): string {
  return (CHOICES[key].options as Option<TravelPrefs[K]>[]).find((o) => o.value === value)?.label ?? String(value);
}

// ── Rows ──────────────────────────────────────────────────────────────────────

function Row({ icon, title, value, onPress, C, danger }: {
  icon: IconName;
  title: string;
  value?: string | React.ReactNode;
  onPress?: () => void;
  C: P;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && onPress ? { backgroundColor: C.pressed } : null]}
      accessibilityRole="button"
    >
      <View style={[s.rowIcon, { backgroundColor: danger ? "rgba(239,68,68,0.12)" : C.tile }]}>
        <Icon name={icon} size={17} color={danger ? "#EF4444" : C.icon} />
      </View>
      <Text style={[s.rowTitle, { color: danger ? "#EF4444" : C.text }]} numberOfLines={1}>{title}</Text>
      <View style={s.rowRight}>
        {typeof value === "string" ? <Text style={[s.rowValue, { color: C.sub }]} numberOfLines={1}>{value}</Text> : value}
        {onPress && !danger ? <Icon name="chevron-forward" size={16} color={C.sub} /> : null}
      </View>
    </Pressable>
  );
}

function ToggleRow({ icon, title, sub, value, onChange, C }: {
  icon: IconName;
  title: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  C: P;
}) {
  return (
    <View style={s.row}>
      <View style={[s.rowIcon, { backgroundColor: C.tile }]}>
        <Icon name={icon} size={17} color={C.icon} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[s.rowSub, { color: C.sub }]} numberOfLines={2}>{sub}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: ORANGE, false: undefined }} thumbColor={Platform.OS === "android" ? "#FFFFFF" : undefined} />
    </View>
  );
}

function Section({ title, children, C }: { title: string; children: React.ReactNode; C: P }) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View style={{ gap: 6 }}>
      {title ? <Text style={[s.sectionTitle, { color: C.sub }]}>{title}</Text> : null}
      <View style={[s.card, { backgroundColor: C.card }]}>
        {items.map((child, i) => (
          <View key={i}>
            {i > 0 ? <View style={[s.sep, { backgroundColor: C.line }]} /> : null}
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

function Stat({ value, label: l, icon, C, onPress }: { value: string; label: string; icon: IconName; C: P; onPress?: () => void }) {
  return (
    <PressableScale onPress={onPress} disabled={!onPress} containerStyle={{ flex: 1 }} style={[s.stat, { backgroundColor: C.card }]}>
      <Icon name={icon} size={16} color={ORANGE} />
      <Text style={[s.statValue, { color: C.text }]} numberOfLines={1}>{value}</Text>
      <Text style={[s.statLabel, { color: C.sub }]} numberOfLines={1}>{l}</Text>
    </PressableScale>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function Profile() {
  const router = useRouter();
  const { user, logout, avatarTs } = useAuthStore();
  const dark = useColorScheme() === "dark";
  const C = makeC(dark);
  const { places, fetch: fetchSaved, reset: resetSaved } = useSavedStore();
  const { prefs, loaded: prefsLoaded, load: loadPrefs, set: setPref } = usePrefsStore();
  const { stats, badges, fetch: fetchContrib, reset: resetContrib } = useContributionStore();
  const offlinePack = useOfflineMapStore((st) => st.pack);
  const [picking, setPicking] = useState<PickKey | null>(null);

  useEffect(() => { fetchSaved().catch(() => {}); }, [fetchSaved]);
  useEffect(() => { if (!prefsLoaded) loadPrefs(); }, [prefsLoaded, loadPrefs]);
  useEffect(() => { fetchContrib().catch(() => {}); }, [fetchContrib]);

  const home = places.find((p) => p.pin === "home");
  const work = places.find((p) => p.pin === "work");
  const savedCount = new Set(places.filter((p) => p.pin === null).map((p) => p.place_id ?? String(p.id))).size;

  const points = stats?.points ?? 0;
  const { level, next, ratio, toNext } = levelProgress(points);
  const allBadges = useMemo(() => [...badges.earned, ...badges.locked], [badges]);
  const recentBadges = useMemo(
    () => [...badges.earned].sort((a, b) => (Date.parse(b.earned_at ?? "") || 0) - (Date.parse(a.earned_at ?? "") || 0)).slice(0, 4),
    [badges.earned]
  );

  const initials = user?.name ? user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() : "?";
  const version = Constants.expoConfig?.version ?? "1.0.0";

  const handleLogout = () => {
    Alert.alert("Sign out?", "Your saved places stay on your account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          try { await AuthService.logout(); } catch {}
          resetSaved();
          resetContrib();
          await logout();
          router.replace("/(auth)/login" as any);
        },
      },
    ]);
  };

  const toggleFares = (on: boolean) => {
    if (!on) { setPref("showFares", false); return; }
    Alert.alert(
      "Fare estimates",
      "Estimates come from typical Nairobi distance pricing and are approximate: fares on the ground change with the time of day, traffic and the conductor.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Show estimates", onPress: () => setPref("showFares", true) },
      ]
    );
  };

  const open = (url: string) => { WebBrowser.openBrowserAsync(url).catch(() => {}); };
  const pick = picking ? CHOICES[picking] : null;

  return (
    <View style={[s.body, { backgroundColor: C.bg }]}>
      {/* Who you are */}
      <LinearGradient colors={[ORANGE, "#E65100"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
        <View style={s.heroTop}>
          <Pressable onPress={() => router.push("/(account)/profile-details" as any)} accessibilityLabel="Edit your profile">
            {user?.avatar ? (
              <Image source={{ uri: `${user.avatar}?_v=${avatarTs}` }} style={s.avatar} contentFit="cover" />
            ) : (
              <View style={[s.avatar, s.avatarFallback]}>
                <Text style={s.initials}>{initials}</Text>
              </View>
            )}
            <View style={[s.levelBadge, { backgroundColor: level.color }]}>
              <Text style={s.levelBadgeText}>{level.n}</Text>
            </View>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.name} numberOfLines={1}>{user?.name ?? "—"}</Text>
            <Text style={s.levelLine} numberOfLines={1}>Level {level.n} · {level.name}</Text>
          </View>
          <PressableScale onPress={() => router.push("/(account)/profile-details" as any)} style={s.editBtn}>
            <Icon name="create" size={15} color="#FFFFFF" />
            <Text style={s.editText}>Edit</Text>
          </PressableScale>
        </View>
        <Pressable onPress={() => router.push("/(account)/badges" as any)} style={{ gap: 6 }} accessibilityRole="button" accessibilityLabel="Levels and badges">
          <View style={s.track}><View style={[s.fill, { width: `${Math.round(ratio * 100)}%` }]} /></View>
          <Text style={s.next}>
            {next ? `${points.toLocaleString()} points · ${toNext.toLocaleString()} to ${next.name}` : `${points.toLocaleString()} points · top level`}
          </Text>
        </Pressable>
      </LinearGradient>

      <View style={s.stats}>
        <Stat C={C} icon="sparkles" value={points.toLocaleString()} label="Points" onPress={() => router.push("/(account)/badges" as any)} />
        <Stat C={C} icon="megaphone" value={String(stats?.submissions_count ?? 0)} label="Contributions" onPress={() => router.push("/(account)/submissions" as any)} />
        <Stat C={C} icon="trophy" value={String(stats?.badges_count ?? badges.earned.length)} label="Badges" onPress={() => router.push("/(account)/badges" as any)} />
        <Stat C={C} icon="flame" value={String(stats?.streak_days ?? 0)} label={stats?.contributed_today ? "Days ✓ today" : "Day streak"} />
      </View>

      {/* Badges and rank */}
      <View style={[s.card, { backgroundColor: C.card, padding: 14, gap: 12 }]}>
        <Pressable onPress={() => router.push("/(account)/badges" as any)} style={s.cardHead} accessibilityRole="button">
          <Text style={[s.cardTitle, { color: C.text }]}>Your badges</Text>
          <Text style={s.link}>All badges</Text>
        </Pressable>
        {recentBadges.length ? (
          <View style={s.badgeRow}>
            {recentBadges.map((b) => (
              <Pressable key={b.slug} onPress={() => router.push("/(account)/badges" as any)} style={s.badgeCell}>
                <NavigoBadge family={familyOf(b)} tier={tierOf(b, allBadges)} color={b.color} icon={b.icon} size={58} />
                <Text style={[s.badgeName, { color: C.sub }]} numberOfLines={1}>{b.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={[s.rowSub, { color: C.sub }]}>
            Report a jam, add a stage photo or review a stage: your first badge is one contribution away.
          </Text>
        )}
        <View style={[s.sep, { backgroundColor: C.line, marginLeft: 0 }]} />
        <Pressable onPress={() => router.push("/(account)/leaderboard" as any)} style={s.rankRow} accessibilityRole="button">
          <Icon name="trophy" size={18} color="#F59E0B" />
          <Text style={[s.rankText, { color: C.text }]}>
            {stats?.rank?.weekly ? `#${stats.rank.weekly} this week` : stats?.rank?.all ? `#${stats.rank.all} all time` : "Leaderboard"}
          </Text>
          <Text style={[s.rowValue, { color: C.sub }]}>
            {stats?.rank?.weekly && stats.rank.all ? `#${stats.rank.all} all time` : "See who leads"}
          </Text>
          <Icon name="chevron-forward" size={16} color={C.sub} />
        </Pressable>
      </View>

      <Section title="TRIPS & MAP" C={C}>
        <Row C={C} icon="sparkles" title="Navigation hints" value={label("navHints", prefs.navHints)} onPress={() => setPicking("navHints")} />
        <Row C={C} icon="map" title="Navigation view" value={label("navView", prefs.navView)} onPress={() => setPicking("navView")} />
        <Row C={C} icon="time" title="Map light" value={label("mapLight", prefs.mapLight ?? "auto")} onPress={() => setPicking("mapLight")} />
        <ToggleRow C={C} icon="globe" title="Weather on the map" sub="Rain and snow where they're falling" value={prefs.mapWeather !== false} onChange={(v) => setPref("mapWeather", v)} />
        <Row C={C} icon="swap-vertical" title="Route sorting" value={label("routeRanking", prefs.routeRanking)} onPress={() => setPicking("routeRanking")} />
        <Row C={C} icon="walk" title="Longest walk" value={label("maxWalkMeters", prefs.maxWalkMeters)} onPress={() => setPicking("maxWalkMeters")} />
        <ToggleRow C={C} icon="pricetag" title="Fare estimates" sub="Approximate, from typical distance pricing" value={prefs.showFares} onChange={toggleFares} />
        <Row C={C} icon="location" title="Units" value={label("units", prefs.units)} onPress={() => setPicking("units")} />
        <Row C={C} icon="cloud-download" title="Offline maps" value={offlinePack ? formatBytes(offlinePack.bytes) : "Off"} onPress={() => router.push("/(account)/offline-maps" as any)} />
      </Section>

      <Section title="VOICE" C={C}>
        <Row C={C} icon="megaphone" title="When music is playing" value={label("voiceDucking", prefs.voiceDucking)} onPress={() => setPicking("voiceDucking")} />
        {Platform.OS === "android" ? (
          <Row C={C} icon="call" title="Play voice through" value={label("voiceOutput", prefs.voiceOutput)} onPress={() => setPicking("voiceOutput")} />
        ) : null}
      </Section>

      <Section title="YOUR PLACES" C={C}>
        <Row C={C} icon="home" title="Home" value={home?.name ?? "Set"} onPress={() => router.push({ pathname: "/(account)/pick-place", params: { pin: "home" } } as any)} />
        <Row C={C} icon="business" title="Work" value={work?.name ?? "Set"} onPress={() => router.push({ pathname: "/(account)/pick-place", params: { pin: "work" } } as any)} />
        <Row C={C} icon="bookmark" title="Saved places" value={savedCount ? String(savedCount) : "None yet"} onPress={() => router.push("/(account)/saved-places" as any)} />
        <Row C={C} icon="trail-sign" title="Your roads" value="Reports on them" onPress={() => router.push("/(account)/your-roads" as any)} />
      </Section>

      <Section title="ACCOUNT" C={C}>
        <Row C={C} icon="person" title="Profile details" onPress={() => router.push("/(account)/profile-details" as any)} />
        <Row C={C} icon="notifications" title="Notifications" onPress={() => router.push("/(account)/notifications" as any)} />
        <Row C={C} icon="shield-checkmark" title="Privacy & security" onPress={() => router.push("/(account)/privacy" as any)} />
      </Section>

      <Section title="ABOUT" C={C}>
        <Row C={C} icon="document-text" title="Terms of service" onPress={() => open(`${SITE}/terms`)} />
        <Row C={C} icon="lock-closed" title="Privacy policy" onPress={() => open(`${SITE}/privacy`)} />
        <Row C={C} icon="chatbubbles" title="Community guidelines" onPress={() => open(`${SITE}/community`)} />
        <Row C={C} icon="information-circle" title="Version" value={version} />
      </Section>

      <Section title="" C={C}>
        <Row C={C} icon="log-out" title="Sign out" onPress={handleLogout} danger />
      </Section>

      {pick && picking ? (
        <OptionSheet
          visible
          title={pick.title}
          subtitle={pick.subtitle}
          options={pick.options as Option<any>[]}
          value={(prefs as any)[picking] ?? (picking === "mapLight" ? "auto" : undefined)}
          onSelect={(v) => setPref(picking, v as never)}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 24, gap: 14 },
  hero: { borderRadius: 24, padding: 16, gap: 14 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 62, height: 62, borderRadius: 31, borderWidth: 2.5, borderColor: "rgba(255,255,255,0.85)" },
  avatarFallback: { backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  initials: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  levelBadge: { position: "absolute", right: -4, bottom: -4, width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  levelBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  name: { color: "#FFFFFF", fontSize: 21, fontWeight: "800", letterSpacing: -0.3 },
  levelLine: { color: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: "600", marginTop: 2 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.18)" },
  editText: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "700" },
  track: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.3)", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: "#FFFFFF" },
  next: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  stats: { flexDirection: "row", gap: 8 },
  stat: { borderRadius: 16, paddingVertical: 12, paddingHorizontal: 6, alignItems: "center", gap: 3 },
  statValue: { fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  statLabel: { fontSize: 11, fontWeight: "600" },
  card: { borderRadius: 18, overflow: "hidden" },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  link: { color: ORANGE, fontSize: 13.5, fontWeight: "700" },
  badgeRow: { flexDirection: "row", gap: 6 },
  badgeCell: { flex: 1, alignItems: "center", gap: 4 },
  badgeName: { fontSize: 11.5, fontWeight: "600", textAlign: "center" },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  rankText: { fontSize: 15, fontWeight: "700", flex: 1 },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, paddingHorizontal: 4 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 56 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 11, minHeight: 52 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15.5, fontWeight: "500", flexShrink: 1 },
  rowSub: { fontSize: 12.5, marginTop: 1, lineHeight: 17 },
  rowRight: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, minWidth: 0 },
  rowValue: { fontSize: 14, flexShrink: 1, textAlign: "right" },
});
