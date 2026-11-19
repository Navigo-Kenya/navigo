// app/(account)/pick-place.tsx
//
// Set Home or Work, the way Google Maps does it:
//   1. Find it: search a place or a stage, use where you are now, choose on
//      the map, or pick one you've saved or searched before.
//   2. Confirm it on the map: the pin sits on the place and can be nudged
//      onto the gate (it keeps the place's name while it stays close; moved
//      further, it takes the street address under it). "Set as Home".
// Mapbox, like every other map in the app.
import { MapService } from "@/services/map";
import { distanceM, formatDistance } from "@/services/exploreSearch";
import { hereWithoutAsking, type LatLng } from "@/services/here";
import { useSavedStore } from "@/store/savedStore";
import type { UnifiedLocation } from "@/store/journeyStore";
import { useStopSearch } from "@/hooks/useStopSearch";
import { pinName, placeKey } from "@/utils/savedPlaces";
import { StopTypeBadge } from "@/components/app/StopTypeBadge";
import { PressableScale } from "@/components/ui/PressableScale";
import { Icon, type IconName } from "@/components/icons/Icon";
import { Camera as MapboxCamera, MapView as MapboxMapView } from "@rnmapbox/maps";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ORANGE = "#FF6F00";
const BLUE = "#2563EB";
/** Kencom, when nothing better is known. */
const NAIROBI: LatLng = { lat: -1.2864, lng: 36.8252 };

function makeC(dark: boolean) {
  return {
    bg: dark ? "#0F0F10" : "#FFFFFF",
    card: dark ? "#1C1C1F" : "#FFFFFF",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    line: dark ? "#232326" : "#EEF0F3",
    input: dark ? "#232326" : "#F3F4F6",
    pressed: dark ? "#1C1C1F" : "#F7F7F8",
  };
}
type Palette = ReturnType<typeof makeC>;

/** What was picked, before it's confirmed on the map. */
interface Chosen {
  name: string;
  lat: number;
  lng: number;
  type: "stop" | "location";
  place_id: string | null;
  category: string | null;
}

function Row({ C, icon, color, tile, title, sub, right, onPress }: {
  C: Palette;
  icon?: IconName;
  color?: string;
  tile?: React.ReactNode;
  title: string;
  sub?: string | null;
  right?: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, { backgroundColor: pressed ? C.pressed : "transparent" }]} accessibilityRole="button" accessibilityLabel={title}>
      {tile ?? (
        <View style={[s.rowIcon, { backgroundColor: (color ?? C.sub) + "1A" }]}>
          <Icon name={icon ?? "location"} size={18} color={color ?? C.sub} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[s.rowSub, { color: C.sub }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right ? <Text style={[s.rowRight, { color: C.sub }]}>{right}</Text> : null}
    </Pressable>
  );
}

export default function PickPlaceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dark = useColorScheme() === "dark";
  const C = makeC(dark);
  const { pin: pinParam } = useLocalSearchParams<{ pin: "home" | "work" }>();
  const pin = pinParam === "work" ? "work" : "home";
  const label = pin === "work" ? "Work" : "Home";
  const pinIcon: IconName = pin === "work" ? "business" : "home";

  const { places: saved, addPlace, removePlace } = useSavedStore();
  const existing = saved.find((p) => p.pin === pin);

  const [here, setHere] = useState<LatLng | null>(null);
  useEffect(() => { hereWithoutAsking().then(setHere); }, []);

  const [query, setQuery] = useState("");
  const me = useMemo(() => (here ? { latitude: here.lat, longitude: here.lng } : null), [here]);
  const { recents, stops, places, isSearchingStops, isSearchingPlaces } = useStopSearch(query, me);
  const searching = isSearchingStops || isSearchingPlaces;
  const [fetching, setFetching] = useState(false);

  // ── Confirm on the map ─────────────────────────────────────────────────────
  const [confirm, setConfirm] = useState<{ chosen: Chosen | null; start: LatLng } | null>(null);
  const [center, setCenter] = useState<LatLng>(NAIROBI);
  const [address, setAddress] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const cameraRef = useRef<MapboxCamera>(null);
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!confirm) return;
    if (geoTimer.current) clearTimeout(geoTimer.current);
    setGeocoding(true);
    geoTimer.current = setTimeout(async () => {
      const name = await MapService.reverseGeocode(center.lat, center.lng).catch(() => "");
      setAddress(name || null);
      setGeocoding(false);
    }, 500);
    return () => { if (geoTimer.current) clearTimeout(geoTimer.current); };
  }, [center.lat, center.lng, confirm]);

  const openConfirm = (chosen: Chosen | null, start: LatLng) => {
    Haptics.selectionAsync();
    setAddress(null);
    setCenter(start);
    setConfirm({ chosen, start });
  };

  const chooseStop = (loc: UnifiedLocation) =>
    openConfirm(
      { name: loc.name, lat: loc.lat, lng: loc.lng, type: loc._type, place_id: loc.id ?? null, category: loc._type === "stop" ? "Stage" : (loc as any).category ?? null },
      { lat: loc.lat, lng: loc.lng }
    );

  const choosePrediction = async (placeId: string, main: string, secondary: string) => {
    setFetching(true);
    try {
      const d = await MapService.getPlaceDetails(placeId);
      if (!d) throw new Error("no details");
      openConfirm(
        { name: d.name || main, lat: d.lat, lng: d.lng, type: "location", place_id: placeId, category: d.category || secondary || null },
        { lat: d.lat, lng: d.lng }
      );
    } catch {
      Alert.alert("Couldn't open that place", "Check your connection and try again.");
    } finally {
      setFetching(false);
    }
  };

  const locateMe = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location is off", "Allow location access to use where you are, or choose on the map.");
        return;
      }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      openConfirm(null, { lat: p.coords.latitude, lng: p.coords.longitude });
    } catch {
      Alert.alert("Couldn't find you", "Try again outside, or choose on the map.");
    } finally {
      setLocating(false);
    }
  };

  const chooseOnMap = () =>
    openConfirm(null, existing ? { lat: existing.lat, lng: existing.lng } : here ?? NAIROBI);

  const save = async () => {
    if (!confirm || saving) return;
    const chosen = confirm.chosen;
    const name = pinName(chosen, center, address);
    const keepsPlace = chosen && name === chosen.name;
    setSaving(true);
    try {
      await addPlace({
        name,
        lat: center.lat,
        lng: center.lng,
        type: keepsPlace ? chosen.type : "location",
        place_id: keepsPlace ? chosen.place_id : null,
        category: keepsPlace ? chosen.category : "Pin on map",
        pin,
        list: null,
        note: null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert("Couldn't save it", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!existing) return;
    Alert.alert(`Remove ${label}?`, `"${existing.name}" will no longer be your ${label.toLowerCase()}.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => { await removePlace(existing.id).catch(() => {}); router.back(); } },
    ]);
  };

  // Suggestions while nothing is typed: your saved places, then recent searches.
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; chosen: Chosen; icon: IconName; color: string; sub: string }[] = [];
    for (const p of saved) {
      if (p.pin === pin) continue;
      const k = placeKey(p);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        key: `s${p.id}`,
        chosen: { name: p.name, lat: p.lat, lng: p.lng, type: p.type, place_id: p.place_id, category: p.category },
        icon: p.pin === "home" ? "home" : p.pin === "work" ? "business" : p.type === "stop" ? "bus" : "bookmark",
        color: p.pin ? ORANGE : p.type === "stop" ? BLUE : "#10B981",
        sub: p.pin ? (p.pin === "home" ? "Home" : "Work") : p.category ?? "Saved",
      });
      if (out.length >= 5) break;
    }
    for (const r of recents) {
      const k = placeKey({ place_id: r.id ?? null, lat: r.lat, lng: r.lng });
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        key: `r${r.id}`,
        chosen: { name: r.name, lat: r.lat, lng: r.lng, type: r._type, place_id: r.id ?? null, category: (r as any).category ?? null },
        icon: "time",
        color: "#6B7280",
        sub: "Recent search",
      });
      if (out.length >= 9) break;
    }
    return out;
  }, [saved, recents, pin]);

  const dist = (lat: number, lng: number) => (here ? formatDistance(distanceM(here.lat, here.lng, lat, lng)) : null);
  const typed = query.trim().length >= 2;

  // ── The map step ───────────────────────────────────────────────────────────
  if (confirm) {
    const chosen = confirm.chosen;
    const name = pinName(chosen, center, address);
    const movedAway = chosen && name !== chosen.name;
    const sub = chosen && !movedAway ? address ?? chosen.category : null;
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]}>
        <MapboxMapView
          style={StyleSheet.absoluteFill}
          styleURL={dark ? "mapbox://styles/mapbox/dark-v11" : process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ?? "mapbox://styles/mapbox/streets-v12"}
          logoEnabled={false}
          attributionEnabled={false}
          scaleBarEnabled={false}
          compassEnabled={false}
          pitchEnabled={false}
          onRegionDidChange={(f: any) => {
            const [lng, lat] = f?.geometry?.coordinates ?? [];
            if (Number.isFinite(lat) && Number.isFinite(lng)) setCenter({ lat, lng });
          }}
        >
          <MapboxCamera ref={cameraRef} defaultSettings={{ centerCoordinate: [confirm.start.lng, confirm.start.lat], zoomLevel: 17.5 }} />
        </MapboxMapView>

        {/* The pin: the map moves under it. */}
        <View pointerEvents="none" style={s.pinWrap}>
          <View style={s.pinHead}>
            <Icon name={pinIcon} size={18} color="#FFFFFF" />
          </View>
          <View style={s.pinStem} />
          <View style={s.pinShadow} />
        </View>

        <View style={[s.mapTop, { paddingTop: insets.top + 8 }]}>
          <PressableScale onPress={() => setConfirm(null)} style={[s.roundBtn, { backgroundColor: C.card }]} accessibilityRole="button" accessibilityLabel="Back">
            <Icon name="arrow-back" size={20} color={C.text} />
          </PressableScale>
          <View style={[s.mapTitle, { backgroundColor: C.card }]}>
            <Icon name={pinIcon} size={15} color={ORANGE} />
            <Text style={[s.mapTitleText, { color: C.text }]}>Set {label}</Text>
          </View>
          <View style={{ width: 42 }} />
        </View>

        <View style={[s.sheet, { backgroundColor: C.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={s.sheetTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.sheetName, { color: C.text }]} numberOfLines={2}>
                {geocoding && !chosen ? "Finding the address…" : name}
              </Text>
              {sub ? <Text style={[s.sheetSub, { color: C.sub }]} numberOfLines={1}>{sub}</Text> : null}
            </View>
            <PressableScale
              onPress={async () => {
                const p = await hereWithoutAsking();
                if (p) cameraRef.current?.setCamera({ centerCoordinate: [p.lng, p.lat], zoomLevel: 17.5, animationDuration: 450 });
                else locateMe();
              }}
              style={[s.roundBtn, { backgroundColor: C.input }]}
              accessibilityRole="button"
              accessibilityLabel="Where I am"
            >
              <Icon name="locate" size={18} color={BLUE} />
            </PressableScale>
          </View>
          <Text style={[s.hint, { color: C.sub }]}>
            {movedAway
              ? `Moved ${formatDistance(distanceM(chosen!.lat, chosen!.lng, center.lat, center.lng))} from ${chosen!.name}.`
              : "Move the map to put the pin on your gate or entrance."}
          </Text>
          {movedAway ? (
            <Pressable
              onPress={() => cameraRef.current?.setCamera({ centerCoordinate: [chosen!.lng, chosen!.lat], zoomLevel: 17.5, animationDuration: 400 })}
              hitSlop={6}
            >
              <Text style={s.link}>Back to {chosen!.name}</Text>
            </Pressable>
          ) : null}
          <PressableScale onPress={save} disabled={saving || (geocoding && !chosen)} style={[s.cta, { opacity: saving ? 0.7 : 1 }]} accessibilityRole="button">
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.ctaText}>Set as {label}</Text>}
          </PressableScale>
        </View>
      </View>
    );
  }

  // ── The find step ──────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: C.bg, paddingTop: insets.top }]}>
      <View style={s.header}>
        <PressableScale onPress={() => router.back()} style={[s.roundBtn, { backgroundColor: C.input }]} accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="arrow-back" size={20} color={C.text} />
        </PressableScale>
        <View style={s.headerMid}>
          <Text style={[s.headerTitle, { color: C.text }]}>Set {label}</Text>
          {existing ? <Text style={[s.headerSub, { color: C.sub }]} numberOfLines={1}>Now: {existing.name}</Text> : null}
        </View>
        <View style={{ width: 42 }} />
      </View>

      <View style={[s.search, { backgroundColor: C.input }]}>
        <Icon name="search" size={18} color={C.sub} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Search your ${label.toLowerCase()} address or stage`}
          placeholderTextColor={C.sub}
          style={[s.searchInput, { color: C.text }]}
          autoFocus
          returnKeyType="search"
        />
        {searching || fetching ? <ActivityIndicator size="small" color={ORANGE} /> : null}
        {!searching && !fetching && query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear">
            <Icon name="close-circle" size={18} color={C.sub} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {!typed ? (
          <>
            <Row C={C} icon="locate" color={BLUE} title="Use where I am now" sub={locating ? "Finding you…" : "Your current location"} onPress={locateMe} />
            <Row C={C} icon="map" color={ORANGE} title="Choose on the map" sub="Put the pin on it yourself" onPress={chooseOnMap} />
            {suggestions.length ? <Text style={[s.section, { color: C.sub }]}>SUGGESTIONS</Text> : null}
            {suggestions.map((x) => (
              <Row
                key={x.key}
                C={C}
                icon={x.icon}
                color={x.color}
                title={x.chosen.name}
                sub={x.sub}
                right={dist(x.chosen.lat, x.chosen.lng)}
                onPress={() => openConfirm(x.chosen, { lat: x.chosen.lat, lng: x.chosen.lng })}
              />
            ))}
          </>
        ) : (
          <>
            {stops.length ? <Text style={[s.section, { color: C.sub }]}>STAGES</Text> : null}
            {stops.map((loc) => (
              <Row
                key={`st${loc.id}`}
                C={C}
                tile={<StopTypeBadge stop={loc as any} size={36} />}
                title={loc.name}
                sub={loc.route_nams ?? "Stage"}
                right={dist(loc.lat, loc.lng)}
                onPress={() => chooseStop(loc)}
              />
            ))}
            {places.length ? <Text style={[s.section, { color: C.sub }]}>PLACES</Text> : null}
            {places.map((p) => (
              <Row
                key={`pl${p.place_id}`}
                C={C}
                icon="location"
                color="#EF4444"
                title={p.main_text}
                sub={p.secondary_text}
                onPress={() => choosePrediction(p.place_id, p.main_text, p.secondary_text)}
              />
            ))}
            {!searching && !stops.length && !places.length ? (
              <View style={s.none}>
                <Text style={[s.noneText, { color: C.sub }]}>{`Nothing found for "${query.trim()}".`}</Text>
                <Pressable onPress={chooseOnMap} hitSlop={6}>
                  <Text style={s.link}>Choose on the map instead</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}

        {existing && !typed ? (
          <Pressable onPress={remove} style={s.remove} accessibilityRole="button">
            <Icon name="trash-outline" size={16} color="#DC2626" />
            <Text style={s.removeText}>Remove {label}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8 },
  headerMid: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800" },
  headerSub: { fontSize: 12, marginTop: 1, maxWidth: 240 },
  roundBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },

  search: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 14, marginTop: 4, marginBottom: 6, paddingHorizontal: 14, height: 50, borderRadius: 16 },
  searchInput: { flex: 1, fontSize: 15.5 },

  section: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 11 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15.5, fontWeight: "600" },
  rowSub: { fontSize: 12.5, marginTop: 1 },
  rowRight: { fontSize: 12.5, fontWeight: "600" },

  none: { alignItems: "center", gap: 8, paddingTop: 30 },
  noneText: { fontSize: 14 },
  link: { color: ORANGE, fontSize: 14, fontWeight: "700" },
  remove: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 22 },
  removeText: { color: "#DC2626", fontSize: 14.5, fontWeight: "700" },

  pinWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  pinHead: { width: 40, height: 40, borderRadius: 20, backgroundColor: ORANGE, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#FFFFFF", marginTop: -58, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, elevation: 6 },
  pinStem: { width: 3, height: 14, backgroundColor: ORANGE, borderRadius: 2 },
  pinShadow: { width: 12, height: 4, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.28)" },

  mapTop: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  mapTitle: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 19, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
  mapTitleText: { fontSize: 14.5, fontWeight: "800" },

  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 18, gap: 8, shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  sheetTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  sheetName: { fontSize: 19, fontWeight: "800", letterSpacing: -0.3 },
  sheetSub: { fontSize: 13.5, marginTop: 2 },
  hint: { fontSize: 13, lineHeight: 18 },
  cta: { height: 52, borderRadius: 16, backgroundColor: ORANGE, alignItems: "center", justifyContent: "center", marginTop: 6 },
  ctaText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
