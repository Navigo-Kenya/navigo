// app/(account)/offline-maps.tsx
// Vector offline maps: pick a region on a Mapbox map and download it as
// native style packs (light + dark). Mapbox then serves those tiles
// automatically whenever the device is offline — no manual tile plumbing.
import { ScreenHeader } from "@/components/app/ScreenHeader";
import { formatBytes } from "@/services/offlineTiles";
import {
  PACK_MAX_ZOOM,
  PACK_MIN_ZOOM,
  cleanupLegacyRasterTiles,
  deleteRegionPacks,
  downloadRegionPacks,
  estimateRegion,
} from "@/services/offlinePacks";
import { useAuthStore } from "@/store/authStore";
import { useOfflineMapStore, type OfflineBBox } from "@/store/offlineMapStore";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MapView, Camera } from "@rnmapbox/maps";

const ORANGE = "#FF6F00";

function makeC(dark: boolean) {
  return {
    bg:       dark ? "#0F0F0F" : "#F6F7F8",
    card:     dark ? "#1C1C1E" : "#FFFFFF",
    text:     dark ? "#FFFFFF" : "#1C1C1E",
    subText:  dark ? "#8E8E93" : "#4B5563",
    hairline: dark ? "#2C2C2E" : "#E5E7EB",
    track:    dark ? "#2C2C2E" : "#E5E7EB",
    soft:     dark ? "rgba(255,111,0,0.15)" : "#FFF3E0",
    pressed:  dark ? "#2C2C2E" : "#F2F2F7",
  };
}

const PRESETS: { label: string; center: [number, number]; zoom: number }[] = [
  { label: "Nairobi CBD",     center: [36.8172, -1.2864], zoom: 13 },
  { label: "Greater Nairobi", center: [36.8219, -1.2921], zoom: 10.5 },
];

export default function OfflineMaps() {
  const dark   = useColorScheme() === "dark";
  const C      = makeC(dark);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const pack        = useOfflineMapStore((s) => s.pack);
  const progress    = useOfflineMapStore((s) => s.progress);
  const setPack     = useOfflineMapStore((s) => s.setPack);
  const clearPack   = useOfflineMapStore((s) => s.clearPack);
  const setStatus   = useOfflineMapStore((s) => s.setStatus);
  const setProgress = useOfflineMapStore((s) => s.setProgress);

  const mapRef    = useRef<MapView>(null);
  const cameraRef = useRef<Camera>(null);

  const [bbox, setBbox]               = useState<OfflineBBox | null>(null);
  const [regionName, setRegionName]   = useState("Greater Nairobi");
  const [downloading, setDownloading] = useState(false);

  // Legacy raster tiles from the old downloader are dead weight — clean once.
  useEffect(() => { cleanupLegacyRasterTiles(); }, []);

  const est = useMemo(() => (bbox ? estimateRegion(bbox) : null), [bbox]);

  // ── Guest wall ────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScreenHeader title="Offline maps" C={C} />
        <View style={s.wall}>
          <View style={[s.wallIcon, { backgroundColor: C.soft }]}>
            <Ionicons name="cloud-download-outline" size={34} color={ORANGE} />
          </View>
          <Text style={[s.wallTitle, { color: C.text }]}>Maps that work offline</Text>
          <Text style={[s.wallSub, { color: C.subText }]}>
            Sign in to download map areas and keep navigating Nairobi even without a connection.
          </Text>
          <Pressable style={s.primaryBtn} onPress={() => router.push("/(auth)/login" as any)}>
            <Text style={s.primaryBtnText}>Sign in</Text>
          </Pressable>
          <Pressable style={s.secondaryBtn} onPress={() => router.push("/(auth)/get-started" as any)}>
            <Text style={[s.secondaryBtnText, { color: C.subText }]}>Create an account</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const refreshBounds = async () => {
    try {
      const bounds = await mapRef.current?.getVisibleBounds();
      if (bounds) {
        const [[east, north], [west, south]] = bounds as [[number, number], [number, number]];
        setBbox({ north, south, east, west });
      }
    } catch {
      // map not ready yet
    }
  };

  const handlePreset = (p: (typeof PRESETS)[number]) => {
    setRegionName(p.label);
    cameraRef.current?.setCamera({
      centerCoordinate: p.center,
      zoomLevel: p.zoom,
      animationDuration: 500,
    });
  };

  const handleDownload = async () => {
    if (!bbox || !est) {
      Alert.alert("Pick an area", "Pan the map so your area fills the frame first.");
      return;
    }
    if (est.tooLarge) {
      Alert.alert("Area too large", "Zoom in to select a smaller area before downloading.");
      return;
    }

    setDownloading(true);
    setStatus("downloading");
    setProgress(0);
    try {
      const res = await downloadRegionPacks(bbox, setProgress);
      setPack({
        id:        `pack-${Date.now()}`,
        name:      regionName,
        bbox,
        minZoom:   PACK_MIN_ZOOM,
        maxZoom:   PACK_MAX_ZOOM,
        tileCount: res.tileCount,
        bytes:     res.bytes,
        createdAt: Date.now(),
        styles:    { light: true, dark: true },
        engine:    "mapbox",
      });
    } catch (e: any) {
      setStatus(pack ? "ready" : "idle");
      Alert.alert("Download failed", e?.message ?? "Could not download the offline map.");
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete offline map",
      "This removes the downloaded map data from your device. You can download it again anytime.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => { await deleteRegionPacks(); clearPack(); },
        },
      ],
    );
  };

  const pct = Math.round(progress * 100);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Offline maps" C={C} />
      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Existing pack */}
        {pack && (
          <View style={[s.section, { backgroundColor: C.card }]}>
            <Text style={[s.sectionTitle, { color: C.subText }]}>DOWNLOADED</Text>
            <View style={s.packRow}>
              <View style={[s.packIcon, { backgroundColor: C.soft }]}>
                <Ionicons name="map" size={20} color={ORANGE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.packName, { color: C.text }]}>{pack.name}</Text>
                <Text style={[s.packMeta, { color: C.subText }]}>
                  {formatBytes(pack.bytes)} · vector (light & dark) · {new Date(pack.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Pressable onPress={handleDelete} hitSlop={10} style={s.deleteBtn}>
                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              </Pressable>
            </View>
          </View>
        )}

        {/* Region picker */}
        <View style={[s.section, { backgroundColor: C.card }]}>
          <Text style={[s.sectionTitle, { color: C.subText }]}>
            {pack ? "DOWNLOAD ANOTHER AREA" : "SELECT AN AREA"}
          </Text>

          <View style={s.mapWrap}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              styleURL={dark ? "mapbox://styles/mapbox/dark-v11" : undefined}
              logoEnabled={false}
              attributionEnabled={false}
              scaleBarEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
              onMapIdle={refreshBounds}
            >
              <Camera
                ref={cameraRef}
                defaultSettings={{ centerCoordinate: [36.8219, -1.2921], zoomLevel: 10.5 }}
              />
            </MapView>
            {/* Selection frame hint */}
            <View pointerEvents="none" style={s.frame} />
          </View>

          <Text style={[s.hint, { color: C.subText }]}>
            Pan and zoom so the area you need fills the frame.
          </Text>

          <View style={s.presets}>
            {PRESETS.map((p) => (
              <Pressable key={p.label} onPress={() => handlePreset(p)} style={[s.chip, { backgroundColor: C.soft }]}>
                <Text style={s.chipText}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Estimate */}
          <View style={[s.estimate, { borderColor: C.hairline }]}>
            <Ionicons name="cloud-download-outline" size={16} color={C.subText} />
            <Text style={[s.estimateText, { color: C.text }]}>
              {!est
                ? "Move the map to pick an area"
                : est.tooLarge
                  ? "Area too large — zoom in"
                  : `Vector maps · z${PACK_MIN_ZOOM}–${PACK_MAX_ZOOM} · light & dark styles`}
            </Text>
          </View>

          {/* Progress / Download */}
          {downloading ? (
            <View style={s.dlBlock}>
              <View style={[s.progressTrack, { backgroundColor: C.track }]}>
                <View style={[s.progressFill, { width: `${pct}%` }]} />
              </View>
              <Text style={[s.dlPct, { color: C.subText }]}>{pct}%</Text>
            </View>
          ) : (
            <Pressable
              onPress={handleDownload}
              disabled={!!est?.tooLarge}
              style={[s.primaryBtn, est?.tooLarge && { opacity: 0.5 }]}
            >
              <Ionicons name="download-outline" size={18} color="#FFFFFF" />
              <Text style={s.primaryBtnText}>{pack ? "Update / download area" : "Download this area"}</Text>
            </Pressable>
          )}
        </View>

        <View style={s.note}>
          <Ionicons name="information-circle-outline" size={14} color={C.subText} />
          <Text style={[s.noteText, { color: C.subText }]}>
            When you lose connection, the map automatically uses your downloaded
            area — labels, streets and journeys keep working at every zoom.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },

  section: {
    borderRadius:      14,
    paddingHorizontal: 14,
    paddingTop:        12,
    paddingBottom:     14,
  },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 10 },

  // Map picker
  mapWrap: {
    height:        260,
    borderRadius:  12,
    overflow:      "hidden",
    position:      "relative",
  },
  frame: {
    ...StyleSheet.absoluteFillObject,
    margin:        20,
    borderWidth:   2,
    borderColor:   ORANGE,
    borderRadius:  10,
    borderStyle:   "dashed",
  },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 8 },

  presets: { flexDirection: "row", gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  chipText: { color: ORANGE, fontWeight: "700", fontSize: 12 },

  estimate: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             8,
    borderWidth:     StyleSheet.hairlineWidth,
    borderRadius:    10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop:       12,
  },
  estimateText: { fontSize: 13, fontWeight: "600" },

  dlBlock: { marginTop: 14, gap: 8 },
  progressTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill:  { height: 8, borderRadius: 4, backgroundColor: ORANGE },
  dlPct: { fontSize: 13, fontWeight: "600", textAlign: "center" },

  // Pack card
  packRow:  { flexDirection: "row", alignItems: "center", gap: 12 },
  packIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  packName: { fontSize: 15, fontWeight: "700" },
  packMeta: { fontSize: 12, marginTop: 2 },
  deleteBtn: { padding: 4 },

  // Buttons
  primaryBtn: {
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "center",
    gap:             8,
    height:          50,
    borderRadius:    14,
    backgroundColor: ORANGE,
    marginTop:       14,
  },
  primaryBtnText:   { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
  secondaryBtn:     { marginTop: 12, alignItems: "center" },
  secondaryBtnText: { fontSize: 14, fontWeight: "600" },

  // Guest wall
  wall: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 8 },
  wallIcon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  wallTitle: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  wallSub: { fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 300, marginBottom: 8 },

  // Note
  note: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 4 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
