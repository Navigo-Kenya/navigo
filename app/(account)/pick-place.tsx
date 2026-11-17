import { MapService } from "@/services/map";
import { useSavedStore } from "@/store/savedStore";
import { UnifiedLocation } from "@/store/journeyStore";
import { useStopSearch } from "@/hooks/useStopSearch";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import MapView, { MapPressEvent, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icons/Icon";
import { StopTypeBadge } from "@/components/app/StopTypeBadge";

const ORANGE = "#FF6F00";
const BLACK  = "#1C1C1E";
const GREY   = "#8E8E93";

const DEFAULT_REGION: Region = {
  latitude:      -1.2921,
  longitude:      36.8219,
  latitudeDelta:  0.06,
  longitudeDelta: 0.06,
};

function makeC(dark: boolean) {
  return {
    bg:       dark ? "#0F0F0F" : "#FFFFFF",
    card:     dark ? "#1C1C1E" : "#FFFFFF",
    text:     dark ? "#FFFFFF" : BLACK,
    sub:      dark ? GREY      : "#6B7280",
    hairline: dark ? "#2C2C2E" : "#E5E7EB",
    input:    dark ? "#1C1C1E" : "#FFFFFF",
    border:   dark ? "#3A3A3C" : "#E5E7EB",
    pressed:  dark ? "#2C2C2E" : "#F2F2F7",
  };
}

function mapboxThumb(lng: number, lat: number, w = 600, h = 300): string {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${lng},${lat},15/${w}x${h}@2x?access_token=${token}`;
}

interface PlacePreview {
  name:     string;
  lat:      number;
  lng:      number;
  type:     "stop" | "location";
  place_id: string | null;
  category: string | null;
}

export default function PickPlaceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dark = useColorScheme() === "dark";
  const C = makeC(dark);

  const { pin } = useLocalSearchParams<{ pin: "home" | "work" }>();
  const title = pin === "work" ? "Set Work" : "Set Home";
  const icon  = pin === "work" ? "briefcase-outline" : "home-outline";

  const { places: savedPlaces, addPlace, removePlace } = useSavedStore();
  const existing = savedPlaces.find((p) => p.pin === pin);

  // ── Search mode ────────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const { stops, places: placeResults, isSearchingStops, isSearchingPlaces } = useStopSearch(query, null);
  const loading = isSearchingStops || isSearchingPlaces;

  // ── Preview (after search selection) ──────────────────────────────────────
  const [preview, setPreview] = useState<PlacePreview | null>(null);

  // ── Map picker mode ────────────────────────────────────────────────────────
  const [mapMode, setMapMode] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region>(DEFAULT_REGION);
  const [pinAddress, setPinAddress] = useState<string>("");
  const [geocoding, setGeocoding] = useState(false);
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!mapMode) return;
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(async () => {
      setGeocoding(true);
      const name = await MapService.reverseGeocode(mapRegion.latitude, mapRegion.longitude);
      setPinAddress(name);
      setGeocoding(false);
    }, 600);
    return () => { if (geocodeTimer.current) clearTimeout(geocodeTimer.current); };
  }, [mapRegion.latitude, mapRegion.longitude, mapMode]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const save = async (
    name: string, lat: number, lng: number,
    type: "stop" | "location", place_id: string | null, category: string | null,
  ) => {
    if (saving) return;
    setSaving(true);
    try {
      await addPlace({ name, lat, lng, type, place_id, pin, list: null, category, note: null });
      router.back();
    } catch {
      Alert.alert("Error", "Could not save this place. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const selectStop = (loc: UnifiedLocation) => {
    setQuery("");
    setPreview({
      name:     loc.name,
      lat:      loc.lat,
      lng:      loc.lng,
      type:     loc._type,
      place_id: loc.id ?? null,
      category: loc.route_nams ? "Transit stop" : null,
    });
  };

  const selectPlace = async (placeId: string, description: string) => {
    if (saving) return;
    setSaving(true);
    try {
      const details = await MapService.getPlaceDetails(placeId);
      if (!details) throw new Error("No details");
      setQuery("");
      setPreview({
        name:     details.name || description.split(",")[0],
        lat:      details.lat,
        lng:      details.lng,
        type:     "location",
        place_id: placeId,
        category: description,
      });
    } catch {
      Alert.alert("Error", "Could not get place details. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const confirmMapPin = () =>
    save(
      pinAddress || `${mapRegion.latitude.toFixed(5)}, ${mapRegion.longitude.toFixed(5)}`,
      mapRegion.latitude, mapRegion.longitude,
      "location", null, "Pin on map",
    );

  const handleRemove = () => {
    if (!existing) return;
    Alert.alert(
      `Remove ${pin === "work" ? "Work" : "Home"}`,
      `Remove "${existing.name}" as your ${pin} address?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove", style: "destructive", onPress: async () => {
            await removePlace(existing.id);
            router.back();
          }
        },
      ]
    );
  };

  const showStops  = stops.length > 0;
  const showPlaces = placeResults.length > 0;
  const showEmpty  = query.trim().length >= 2 && !loading && !showStops && !showPlaces;

  // ── Preview screen (after search selection) ────────────────────────────────
  if (preview) {
    return (
      <View style={[s.root, { backgroundColor: C.bg, paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={() => setPreview(null)} hitSlop={12} style={[s.backBtn, { backgroundColor: C.card }]}>
            <Icon name="arrow-back" size={20} color={C.text} />
          </Pressable>
          <View style={s.headerCenter}>
            <Icon name={icon} size={18} color={ORANGE} />
            <Text style={[s.headerTitle, { color: C.text }]}>{title}</Text>
          </View>
          <View style={{ width: 38 }} />
        </View>

        {/* Mapbox snapshot */}
        <Image
          source={{ uri: mapboxThumb(preview.lng, preview.lat) }}
          style={s.previewThumb}
          contentFit="cover"
        />

        {/* Place info card */}
        <View style={[s.previewCard, { backgroundColor: C.card }]}>
          <View style={[s.previewIconBox, { backgroundColor: preview.type === "stop" ? "#FFF3E0" : "#EFF6FF" }]}>
            <Icon
              name={preview.type === "stop" ? "bus-outline" : "location-outline"}
              size={20}
              color={preview.type === "stop" ? ORANGE : "#3B82F6"}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.previewName, { color: C.text }]} numberOfLines={2}>{preview.name}</Text>
            {preview.category ? (
              <Text style={[s.previewSub, { color: C.sub }]} numberOfLines={1}>{preview.category}</Text>
            ) : null}
          </View>
        </View>

        {/* Pin label */}
        <View style={[s.pinLabel, { backgroundColor: C.hairline }]}>
          <Icon name={icon} size={14} color={GREY} />
          <Text style={[s.pinLabelText, { color: C.sub }]}>
            Will be set as your <Text style={{ fontWeight: "700", color: C.text }}>{pin === "work" ? "Work" : "Home"}</Text> location
          </Text>
        </View>

        {/* Confirm button */}
        <View style={[s.previewBottom, { paddingBottom: insets.bottom + 20 }]}>
          <Pressable
            style={({ pressed }) => [s.confirmBtn, { opacity: pressed ? 0.88 : 1, backgroundColor: ORANGE }]}
            onPress={() => save(preview.name, preview.lat, preview.lng, preview.type, preview.place_id, preview.category)}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Text style={s.confirmBtnText}>Set as {pin === "work" ? "Work" : "Home"}</Text>
            }
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.cancelBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => setPreview(null)}
          >
            <Text style={[s.cancelBtnText, { color: C.sub }]}>Choose a different place</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Map picker ─────────────────────────────────────────────────────────────
  if (mapMode) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={mapRegion}
          onRegionChangeComplete={(r) => setMapRegion(r)}
          showsUserLocation
          showsMyLocationButton={false}
        />

        {/* Centered pin */}
        <View pointerEvents="none" style={s.pinWrap}>
          <Icon name="location" size={44} color={ORANGE} style={s.pinIcon} />
          <View style={s.pinShadow} />
        </View>

        {/* Top bar */}
        <View style={[s.mapTopBar, { paddingTop: insets.top + 8 }]}>
          <Pressable
            style={[s.mapBtn, { backgroundColor: dark ? "#1C1C1E" : "#FFFFFF" }]}
            onPress={() => setMapMode(false)}
          >
            <Icon name="arrow-back" size={20} color={C.text} />
          </Pressable>
          <View style={[s.addressPill, { backgroundColor: dark ? "#1C1C1E" : "#FFFFFF" }]}>
            {geocoding
              ? <ActivityIndicator size="small" color={ORANGE} />
              : <Text style={[s.addressText, { color: C.text }]} numberOfLines={1}>{pinAddress || "Move map to choose location"}</Text>
            }
          </View>
        </View>

        {/* Bottom confirm bar */}
        <View style={[s.mapBottomBar, { paddingBottom: insets.bottom + 16, backgroundColor: dark ? "#1C1C1E" : "#FFFFFF" }]}>
          <View style={s.mapConfirmInfo}>
            <Icon name={icon} size={18} color={ORANGE} />
            <Text style={[s.mapConfirmLabel, { color: C.sub }]}>
              Setting as <Text style={{ color: C.text, fontWeight: "700" }}>{pin === "work" ? "Work" : "Home"}</Text>
            </Text>
          </View>
          <Text style={[s.mapConfirmAddress, { color: C.text }]} numberOfLines={2}>
            {pinAddress || "Move the map to position the pin"}
          </Text>
          <Pressable
            style={({ pressed }) => [s.confirmBtn, { opacity: pressed ? 0.85 : 1, backgroundColor: ORANGE }]}
            onPress={confirmMapPin}
            disabled={saving || geocoding}
          >
            {saving
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Text style={s.confirmBtnText}>Confirm location</Text>
            }
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Search / default view ──────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: C.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[s.backBtn, { backgroundColor: C.card }]}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <View style={s.headerCenter}>
          <Icon name={icon} size={18} color={ORANGE} />
          <Text style={[s.headerTitle, { color: C.text }]}>{title}</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {/* Search input */}
      <View style={[s.inputWrap, { backgroundColor: C.input, borderColor: C.border }]}>
        <Icon name="search-outline" size={18} color={C.sub} />
        <TextInput
          style={[s.input, { color: C.text }]}
          placeholder="Search stops or places…"
          placeholderTextColor={C.sub}
          value={query}
          onChangeText={setQuery}
          autoFocus
          returnKeyType="search"
        />
        {loading && <ActivityIndicator size="small" color={ORANGE} />}
        {!loading && query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Icon name="close-circle" size={18} color={C.sub} />
          </Pressable>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {/* Set on map */}
        <Pressable
          style={({ pressed }) => [s.row, s.mapRow, { backgroundColor: pressed ? C.pressed : C.card, borderColor: ORANGE + "44" }]}
          onPress={() => { setQuery(""); setMapMode(true); setPinAddress(""); }}
        >
          <View style={[s.rowIcon, { backgroundColor: ORANGE + "18" }]}>
            <Icon name="map-outline" size={18} color={ORANGE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.rowTitle, { color: ORANGE }]}>Set on map</Text>
            <Text style={[s.rowSub, { color: C.sub }]}>Drop a pin anywhere on the map</Text>
          </View>
          <Icon name="chevron-forward" size={16} color={ORANGE} />
        </Pressable>

        {/* Remove existing pin row */}
        {existing && (
          <Pressable
            style={({ pressed }) => [s.row, s.removeRow, { backgroundColor: pressed ? C.pressed : C.card }]}
            onPress={handleRemove}
          >
            <View style={[s.rowIcon, { backgroundColor: "#FF3B3018" }]}>
              <Icon name="trash-outline" size={18} color="#FF3B30" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowTitle, { color: "#FF3B30" }]}>Remove {pin === "work" ? "Work" : "Home"}</Text>
              <Text style={[s.rowSub, { color: C.sub }]}>{existing.name}</Text>
            </View>
          </Pressable>
        )}

        {/* Stop results */}
        {showStops && (
          <>
            <Text style={[s.section, { color: C.sub }]}>STOPS</Text>
            {stops.map((loc) => (
              <Pressable
                key={loc.id}
                style={({ pressed }) => [s.row, { backgroundColor: pressed ? C.pressed : C.card }]}
                onPress={() => selectStop(loc)}
                disabled={saving}
              >
                <StopTypeBadge stop={loc as any} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={1}>{loc.name}</Text>
                  {loc.route_nams ? (
                    <Text style={[s.rowSub, { color: C.sub }]} numberOfLines={1}>{loc.route_nams}</Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </>
        )}

        {/* Place results */}
        {showPlaces && (
          <>
            <Text style={[s.section, { color: C.sub }]}>PLACES</Text>
            {placeResults.map((place) => (
              <Pressable
                key={place.place_id}
                style={({ pressed }) => [s.row, { backgroundColor: pressed ? C.pressed : C.card }]}
                onPress={() => selectPlace(place.place_id, place.description)}
                disabled={saving}
              >
                <View style={[s.rowIcon, { backgroundColor: C.hairline }]}>
                  <Icon name="location-outline" size={16} color={C.sub} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={1}>{place.main_text}</Text>
                  <Text style={[s.rowSub, { color: C.sub }]} numberOfLines={1}>{place.secondary_text}</Text>
                </View>
              </Pressable>
            ))}
          </>
        )}

        {/* Empty state */}
        {showEmpty && (
          <View style={s.empty}>
            <Icon name="search-outline" size={40} color={C.sub} />
            <Text style={[s.emptyText, { color: C.sub }]}>No results for "{query}"</Text>
          </View>
        )}

        {/* Idle hint */}
        {query.trim().length < 2 && (
          <View style={s.empty}>
            <Icon name={icon} size={44} color={C.sub} />
            <Text style={[s.emptyText, { color: C.sub }]}>
              Search for a stop or place, or drop a pin on the map.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Saving overlay */}
      {saving && (
        <View style={s.savingOverlay}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1 },
  header:  { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: "700" },

  inputWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
  input:     { flex: 1, fontSize: 15 },

  section:   { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginHorizontal: 16, marginTop: 16, marginBottom: 4 },
  mapRow:    { marginHorizontal: 16, marginBottom: 10, borderRadius: 14, borderWidth: 1.5 },
  removeRow: { marginBottom: 8 },
  row:       { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowTitle:  { fontSize: 15, fontWeight: "500" },
  rowSub:    { fontSize: 12, marginTop: 1 },

  empty:     { alignItems: "center", paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyText: { fontSize: 14, textAlign: "center" },

  savingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },

  // Preview
  previewThumb: { width: "100%", height: 220 },
  previewCard: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              12,
    marginHorizontal: 16,
    marginTop:        -20,
    borderRadius:     16,
    padding:          14,
    shadowColor:      "#000",
    shadowOpacity:    0.10,
    shadowRadius:     12,
    shadowOffset:     { width: 0, height: 4 },
    elevation:        6,
  },
  previewIconBox: {
    width:          44,
    height:         44,
    borderRadius:   12,
    alignItems:     "center",
    justifyContent: "center",
    flexShrink:     0,
  },
  previewName: { fontSize: 16, fontWeight: "700" },
  previewSub:  { fontSize: 13, marginTop: 2 },
  pinLabel: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              6,
    marginHorizontal: 16,
    marginTop:        12,
    paddingHorizontal: 12,
    paddingVertical:  8,
    borderRadius:     10,
  },
  pinLabelText: { fontSize: 13 },
  previewBottom: {
    position:         "absolute",
    bottom:           0,
    left:             0,
    right:            0,
    paddingHorizontal: 20,
    paddingTop:       16,
    gap:              10,
  },
  confirmBtn:     { paddingVertical: 16, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  confirmBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  cancelBtn:      { alignItems: "center", paddingVertical: 4 },
  cancelBtnText:  { fontSize: 14 },

  // Map picker
  pinWrap: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },
  pinIcon:   { marginBottom: -8 },
  pinShadow: { width: 12, height: 4, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.25)" },

  mapTopBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  mapBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4,
    flexShrink: 0,
  },
  addressPill: {
    flex: 1, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4,
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  addressText: { fontSize: 14, fontWeight: "500", flex: 1 },

  mapBottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 20, gap: 6,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 8,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  mapConfirmInfo:    { flexDirection: "row", alignItems: "center", gap: 6 },
  mapConfirmLabel:   { fontSize: 13 },
  mapConfirmAddress: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
});
