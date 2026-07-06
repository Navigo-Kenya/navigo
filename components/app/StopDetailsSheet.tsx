// components/app/StopDetailsSheet.tsx
import { ContributionService, StopPhoto, StopReview } from "@/services/contribution";
import { useContributionStore } from "@/store/contributionStore";
import { useSavedStore } from "@/store/savedStore";
import { StopRoute, StopService } from "@/services/stop";
import { useAuthStore } from "@/store/authStore";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
  useColorScheme,
} from "react-native";
import { MapView as MapboxMapView, Camera as MapboxCamera } from "@rnmapbox/maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ORANGE = "#FF6F00";
const GREEN  = "#10B981";
const RED    = "#EF4444";
const GREY   = "#8E8E93";
const AMBER  = "#F59E0B";

const SCREEN_H = Dimensions.get("window").height;
const MAX_Y    = SCREEN_H * 0.06;
const MIN_Y    = SCREEN_H - 320;

type Stop = { id: string; name: string; lat: number; lng: number; location_t?: number };

function makeC(dark: boolean) {
  return {
    bg:          dark ? "#1C1C1E" : "#FFFFFF",
    card:        dark ? "#2C2C2E" : "#F6F7F8",
    text:        dark ? "#FFFFFF" : "#1C1C1E",
    sub:         dark ? GREY      : "#6B7280",
    border:      dark ? "#3A3A3C" : "#E5E7EB",
    handle:      dark ? "#48484A" : "#D1D1D6",
    softOrange:  dark ? "rgba(255,111,0,0.16)"  : "#FFF3E0",
    softRed:     dark ? "rgba(239,68,68,0.15)"  : "#FEF2F2",
    softGreen:   dark ? "rgba(16,185,129,0.15)" : "#F0FDF4",
    softBlue:    dark ? "rgba(59,130,246,0.15)" : "#EFF6FF",
    softPurple:  dark ? "rgba(139,92,246,0.15)" : "#F5F3FF",
    sheetBg:     dark ? "#1C1C1E" : "#FFFFFF",
    input:       dark ? "#3A3A3C" : "#F3F4F6",
  };
}

// ── Location Picker Modal ────────────────────────────────────────────────────
function LocationPickerModal({
  visible,
  onClose,
  onConfirm,
  initialLat = -1.2921,
  initialLng = 36.8219,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (loc: { lat: number; lng: number }) => void;
  initialLat?: number;
  initialLng?: number;
}) {
  const insets      = useSafeAreaInsets();
  const cameraRef   = useRef<MapboxCamera>(null);
  const centerRef   = useRef({ lat: initialLat, lng: initialLng });
  const [displayCoords, setDisplayCoords] = useState({ lat: initialLat, lng: initialLng });
  const [gpsLoading, setGpsLoading]       = useState(false);

  const onRegionDidChange = (feature: any) => {
    const [lng, lat] = feature?.geometry?.coordinates ?? [initialLng, initialLat];
    centerRef.current = { lat, lng };
    setDisplayCoords({ lat, lng });
  };

  const handleMyLocation = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission needed", "Enable location in Settings."); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      cameraRef.current?.setCamera({
        centerCoordinate: [longitude, latitude],
        zoomLevel: 16,
        animationDuration: 500,
      });
      centerRef.current = { lat: latitude, lng: longitude };
      setDisplayCoords({ lat: latitude, lng: longitude });
    } catch { Alert.alert("Error", "Could not get your location."); }
    finally { setGpsLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        <MapboxMapView
          style={StyleSheet.absoluteFill}
          styleURL={process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ?? "mapbox://styles/mapbox/streets-v12"}
          logoEnabled={false}
          attributionEnabled={false}
          onRegionDidChange={onRegionDidChange}
        >
          <MapboxCamera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: [initialLng, initialLat],
              zoomLevel: 15,
            }}
          />
        </MapboxMapView>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, lpm.pinContainer]}>
          <Ionicons name="location" size={44} color={ORANGE} style={{ marginBottom: -4 }} />
          <View style={lpm.pinShadow} />
        </View>
        <View style={[lpm.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable style={lpm.topBtn} onPress={onClose}>
            <Ionicons name="arrow-back" size={20} color="#1C1C1E" />
            <Text style={lpm.topBtnText}>Cancel</Text>
          </Pressable>
          <Pressable style={lpm.topBtn} onPress={handleMyLocation} disabled={gpsLoading}>
            {gpsLoading
              ? <ActivityIndicator size="small" color="#1C1C1E" />
              : <Ionicons name="locate-outline" size={20} color="#1C1C1E" />}
            <Text style={lpm.topBtnText}>My Location</Text>
          </Pressable>
        </View>
        <View style={[lpm.bottomCard, { paddingBottom: insets.bottom + 16 }]}>
          <View style={lpm.coordChip}>
            <Ionicons name="location-outline" size={14} color={GREY} />
            <Text style={lpm.coordText}>
              {displayCoords.lat.toFixed(6)}, {displayCoords.lng.toFixed(6)}
            </Text>
          </View>
          <Pressable style={lpm.confirmBtn} onPress={() => { onConfirm(centerRef.current); onClose(); }}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
            <Text style={lpm.confirmText}>Confirm Location</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const lpm = StyleSheet.create({
  pinContainer: { alignItems: "center", justifyContent: "center" },
  pinShadow: { width: 10, height: 5, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.25)" },
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", justifyContent: "space-between",
    paddingHorizontal: 14, paddingBottom: 10,
  },
  topBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  topBtnText: { fontWeight: "600", fontSize: 14, color: "#1C1C1E" },
  bottomCard: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#FFFFFF", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 16, paddingHorizontal: 16, gap: 12,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 }, elevation: 8,
  },
  coordChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#F3F4F6", borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 8, alignSelf: "center",
  },
  coordText: { fontSize: 13, fontWeight: "500", color: "#6B7280" },
  confirmBtn: {
    backgroundColor: ORANGE, height: 50, borderRadius: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  confirmText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});

function locationLabel(t: number | undefined): string {
  switch (t) {
    case 0:  return "Bus Stop";
    case 1:  return "Bus Station";
    case 2:  return "Station Entrance";
    case 3:  return "Generic Node";
    default: return "Transit Stop";
  }
}

// ── Inline mini bottom sheet ─────────────────────────────────────────────────
function MiniSheet({
  visible,
  onClose,
  title,
  children,
  C,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  C: ReturnType<typeof makeC>;
}) {
  const anim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 0 : 400,
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
    }).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={ms.backdrop} />
        </TouchableWithoutFeedback>
        <Animated.View style={[ms.sheet, { backgroundColor: C.sheetBg, transform: [{ translateY: anim }] }]}>
          <View style={ms.handle} />
          <View style={ms.header}>
            <Text style={[ms.title, { color: C.text }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={C.sub} />
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ms = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: "85%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#C7C7CC",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title:  { fontSize: 18, fontWeight: "700" },
  body:   { paddingHorizontal: 20, paddingBottom: 20 },
  label:  { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 8 },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  textArea: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    fontSize: 15,
    minHeight: 76,
    textAlignVertical: "top",
  },
  pillRow:     { flexDirection: "row", gap: 8 },
  pill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
  },
  pillText:    { fontWeight: "600", fontSize: 14 },
  hint:        { fontSize: 12, textAlign: "center", marginTop: 12, marginBottom: 8 },
  submitBtn: {
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    backgroundColor: ORANGE,
  },
  submitText:  { color: "#FFF", fontWeight: "700", fontSize: 16 },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  ratingLabel: { fontSize: 14, fontWeight: "500" },
  stars:       { flexDirection: "row", gap: 6 },
  ratingCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 14,
  },
  dividerThin: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  starRow: { flexDirection: "row", gap: 5 },
});

// ── Delay Report mini-sheet ──────────────────────────────────────────────────
function DelaySheet({
  stop,
  onClose,
  C,
}: {
  stop: Stop;
  onClose: () => void;
  C: ReturnType<typeof makeC>;
}) {
  const [severity, setSeverity] = useState<"minor" | "major" | "cancelled">("minor");
  const [note, setNote]         = useState("");
  const [loading, setLoading]   = useState(false);
  const { submit } = useContributionStore();

  const SEVS: { key: "minor" | "major" | "cancelled"; label: string; color: string }[] = [
    { key: "minor",     label: "Minor",     color: AMBER },
    { key: "major",     label: "Major",     color: RED   },
    { key: "cancelled", label: "Cancelled", color: GREY  },
  ];

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await submit({
        type: "delay_report",
        title: `${severity.charAt(0).toUpperCase() + severity.slice(1)} delay at ${stop.name}`,
        data: { severity, note: note.trim() || undefined },
      });
      onClose();
      setNote(""); setSeverity("minor");
      if (res.points_awarded > 0)
        Alert.alert("", `+${res.points_awarded} Safiri Points earned!`);
    } catch {
      Alert.alert("Error", "Could not submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[ms.body, { gap: 0 }]} keyboardShouldPersistTaps="handled">
      <Text style={[ms.label, { color: C.sub, marginBottom: 8 }]}>SEVERITY</Text>
      <View style={[ms.pillRow, { marginBottom: 18 }]}>
        {SEVS.map((sv) => (
          <Pressable
            key={sv.key}
            onPress={() => setSeverity(sv.key)}
            style={[
              ms.pill,
              { borderColor: severity === sv.key ? sv.color : C.border },
              severity === sv.key && { backgroundColor: sv.color + "18" },
            ]}
          >
            <Text style={[ms.pillText, { color: severity === sv.key ? sv.color : C.sub }]}>
              {sv.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[ms.label, { color: C.sub, marginBottom: 8 }]}>NOTE (OPTIONAL)</Text>
      <TextInput
        style={[ms.textArea, { backgroundColor: C.card, color: C.text, borderColor: C.border, marginBottom: 0 }]}
        placeholder={`Any detail about the delay at ${stop.name}…`}
        placeholderTextColor={C.sub}
        multiline
        numberOfLines={3}
        value={note}
        onChangeText={setNote}
        maxLength={250}
      />

      <Text style={[ms.hint, { color: C.sub }]}>Awards +3 Safiri Points immediately</Text>

      <Pressable style={[ms.submitBtn, { backgroundColor: RED }, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={ms.submitText}>Submit Delay Report</Text>}
      </Pressable>
    </ScrollView>
  );
}

// ── Review mini-sheet ────────────────────────────────────────────────────────
function ReviewSheet({
  stop,
  onClose,
  C,
  existingReview,
}: {
  stop: Stop;
  onClose: () => void;
  C: ReturnType<typeof makeC>;
  existingReview?: StopReview;
}) {
  const [safety, setSafety]   = useState(existingReview?.data.safety ?? 0);
  const [comfort, setComfort] = useState(existingReview?.data.comfort ?? 0);
  const [clean, setClean]     = useState(existingReview?.data.cleanliness ?? 0);
  const [text, setText]       = useState(existingReview?.data.text ?? "");
  const [loading, setLoading] = useState(false);
  const { submit } = useContributionStore();

  useEffect(() => {
    setSafety(existingReview?.data.safety ?? 0);
    setComfort(existingReview?.data.comfort ?? 0);
    setClean(existingReview?.data.cleanliness ?? 0);
    setText(existingReview?.data.text ?? "");
  }, [existingReview]);

  const StarRating = ({ value, onSet }: { value: number; onSet: (n: number) => void }) => (
    <View style={ms.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onSet(n)} hitSlop={6}>
          <Ionicons name={n <= value ? "star" : "star-outline"} size={24} color={n <= value ? AMBER : C.sub} />
        </Pressable>
      ))}
    </View>
  );

  const handleSubmit = async () => {
    if (!safety || !comfort || !clean) {
      Alert.alert("Rate all categories", "Please give a rating in all three categories.");
      return;
    }
    setLoading(true);
    try {
      const res = await submit({
        type: "stop_review",
        stop_id: stop.id,
        title: `Review: ${stop.name}`,
        data: { safety, comfort, cleanliness: clean, text: text.trim() || undefined },
      });
      onClose();
      setSafety(0); setComfort(0); setClean(0); setText("");
      if (res.points_awarded > 0)
        Alert.alert("", `+${res.points_awarded} Safiri Points earned!`);
    } catch {
      Alert.alert("Error", "Could not submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isEdit = !!existingReview;

  return (
    <ScrollView contentContainerStyle={ms.body} keyboardShouldPersistTaps="handled">
      <View style={[ms.ratingCard, { backgroundColor: C.card, borderColor: C.border }]}>
        {(
          [
            { label: "Safety",      value: safety,  set: setSafety  },
            { label: "Comfort",     value: comfort, set: setComfort },
            { label: "Cleanliness", value: clean,   set: setClean   },
          ] as const
        ).map((row, i) => (
          <React.Fragment key={row.label}>
            {i > 0 && <View style={[ms.dividerThin, { backgroundColor: C.border }]} />}
            <View style={ms.ratingRow}>
              <Text style={[ms.ratingLabel, { color: C.text }]}>{row.label}</Text>
              <StarRating value={row.value} onSet={row.set} />
            </View>
          </React.Fragment>
        ))}
      </View>

      <Text style={[ms.label, { color: C.sub, marginBottom: 8 }]}>COMMENTS (OPTIONAL)</Text>
      <TextInput
        style={[ms.textArea, { backgroundColor: C.card, color: C.text, borderColor: C.border }]}
        placeholder={`Share your experience at ${stop.name}…`}
        placeholderTextColor={C.sub}
        multiline
        numberOfLines={3}
        value={text}
        onChangeText={setText}
        maxLength={400}
      />

      <Text style={[ms.hint, { color: C.sub }]}>
        {isEdit ? "Updates your existing review" : "Awards +10 Safiri Points immediately"}
      </Text>

      <Pressable style={[ms.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#FFF" size="small" />
          : <Text style={ms.submitText}>{isEdit ? "Update Review" : "Submit Review"}</Text>}
      </Pressable>
    </ScrollView>
  );
}

// ── Edit mini-sheet ──────────────────────────────────────────────────────────
function EditSheet({
  stop,
  routes,
  onClose,
  onOpenMapPicker,
  C,
}: {
  stop: Stop;
  routes: StopRoute[];
  onClose: () => void;
  onOpenMapPicker: (cb: (loc: { lat: number; lng: number }) => void) => void;
  C: ReturnType<typeof makeC>;
}) {
  const [field, setField]       = useState<"name" | "location" | "routes">("name");
  const [current, setCurrent]   = useState("");
  const [proposed, setProposed] = useState("");
  const [note, setNote]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const { submit } = useContributionStore();

  const FIELDS: { key: "name" | "location" | "routes"; label: string }[] = [
    { key: "name",     label: "Name"     },
    { key: "location", label: "Location" },
    { key: "routes",   label: "Routes"   },
  ];

  useEffect(() => {
    switch (field) {
      case "name":     setCurrent(stop.name); break;
      case "location": setCurrent(`${stop.lat.toFixed(6)}, ${stop.lng.toFixed(6)}`); break;
      case "routes":   setCurrent(routes.map((r) => r.short_name).join(", ")); break;
    }
    setProposed("");
  }, [field, stop, routes]);

  const handleMyLocation = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission needed", "Enable location in Settings."); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setProposed(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
    } catch { Alert.alert("Error", "Could not get your location."); }
    finally { setGpsLoading(false); }
  };

  const handleSubmit = async () => {
    if (!proposed.trim()) { Alert.alert("Missing info", "Please enter a proposed value."); return; }
    setLoading(true);
    try {
      await submit({
        type: "stop_edit",
        title: `Edit ${field}: ${stop.name}`,
        data: {
          field,
          current_value:  current.trim()  || undefined,
          proposed_value: proposed.trim(),
          note:           note.trim()     || undefined,
        },
      });
      onClose();
      setCurrent(""); setProposed(""); setNote(""); setField("name");
      Alert.alert("Submitted", "Your edit has been submitted for review. You'll earn +15 pts if approved.");
    } catch {
      Alert.alert("Error", "Could not submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={ms.body} keyboardShouldPersistTaps="handled">
      <Text style={[ms.label, { color: C.sub, marginBottom: 8 }]}>WHAT TO EDIT</Text>
      <View style={[ms.pillRow, { marginBottom: 18 }]}>
        {FIELDS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setField(f.key)}
            style={[
              ms.pill,
              { borderColor: field === f.key ? ORANGE : C.border },
              field === f.key && { backgroundColor: ORANGE + "18" },
            ]}
          >
            <Text style={[ms.pillText, { color: field === f.key ? ORANGE : C.sub }]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[ms.label, { color: C.sub, marginBottom: 8 }]}>CURRENT VALUE</Text>
      <TextInput
        style={[ms.input, { backgroundColor: C.card, color: C.text, borderColor: C.border, marginBottom: 14, opacity: 0.65 }]}
        value={current}
        editable={false}
        placeholder="Auto-filled from stop data"
        placeholderTextColor={C.sub}
      />

      <Text style={[ms.label, { color: C.sub, marginBottom: 8 }]}>PROPOSED VALUE</Text>
      <TextInput
        style={[ms.input, { backgroundColor: C.card, color: C.text, borderColor: C.border, marginBottom: field === "location" ? 10 : 14 }]}
        placeholder="What it should say…"
        placeholderTextColor={C.sub}
        value={proposed}
        onChangeText={setProposed}
      />

      {field === "location" && (
        <View style={[ms.pillRow, { marginBottom: 14 }]}>
          <Pressable
            style={[ms2.locationBtn, { borderColor: C.border, backgroundColor: C.card }]}
            onPress={handleMyLocation}
            disabled={gpsLoading}
          >
            {gpsLoading
              ? <ActivityIndicator size="small" color={ORANGE} />
              : <Ionicons name="locate-outline" size={15} color={C.text} />}
            <Text style={[ms2.locationBtnText, { color: C.text }]}>My Location</Text>
          </Pressable>
          <Pressable
            style={[ms2.locationBtn, { borderColor: C.border, backgroundColor: C.card }]}
            onPress={() => onOpenMapPicker((loc) => setProposed(`${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`))}
          >
            <Ionicons name="map-outline" size={15} color={C.text} />
            <Text style={[ms2.locationBtnText, { color: C.text }]}>Pick on Map</Text>
          </Pressable>
        </View>
      )}

      <Text style={[ms.label, { color: C.sub, marginBottom: 8 }]}>NOTE (OPTIONAL)</Text>
      <TextInput
        style={[ms.textArea, { backgroundColor: C.card, color: C.text, borderColor: C.border }]}
        placeholder="Any context for this correction…"
        placeholderTextColor={C.sub}
        multiline
        numberOfLines={2}
        value={note}
        onChangeText={setNote}
        maxLength={250}
      />

      <Text style={[ms.hint, { color: C.sub }]}>Awards +15 Safiri Points if approved</Text>

      <Pressable style={[ms.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={ms.submitText}>Submit Edit</Text>}
      </Pressable>
    </ScrollView>
  );
}

const ms2 = StyleSheet.create({
  locationBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1,
  },
  locationBtnText: { fontWeight: "600", fontSize: 13 },
});

// ── Action chip ──────────────────────────────────────────────────────────────
function Chip({
  icon,
  label,
  onPress,
  color,
  bg,
  disabled,
  loading,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
  bg?: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  const c = color ?? ORANGE;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        chip.root,
        { backgroundColor: bg ?? (c + "14"), opacity: pressed || disabled ? 0.6 : 1 },
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color={c} style={{ width: 16, height: 16 }} />
        : <Ionicons name={icon} size={16} color={c} />}
      <Text style={[chip.label, { color: c }]}>{loading ? "Loading…" : label}</Text>
    </Pressable>
  );
}

const chip = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  label: { fontSize: 13, fontWeight: "600" },
});

// ── Section header ───────────────────────────────────────────────────────────
function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={sec.wrapper}>
      <Text style={sec.title}>{title}</Text>
      {sub && <Text style={sec.sub}>{sub}</Text>}
    </View>
  );
}

const sec = StyleSheet.create({
  wrapper: { marginTop: 22, marginBottom: 10 },
  title:   { fontSize: 12, fontWeight: "700", color: GREY, letterSpacing: 0.5, textTransform: "uppercase" },
  sub:     { fontSize: 12, color: GREY, marginTop: 2 },
});

// ── Contribute row ───────────────────────────────────────────────────────────
function ContribRow({
  iconBg,
  icon,
  iconColor,
  title,
  subtitle,
  points,
  onPress,
  C,
}: {
  iconBg: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  subtitle: string;
  points: string;
  onPress: () => void;
  C: ReturnType<typeof makeC>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [cr.row, pressed && { backgroundColor: C.card }]}
    >
      <View style={[cr.iconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={17} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[cr.title, { color: C.text }]}>{title}</Text>
        <Text style={[cr.sub, { color: C.sub }]}>{subtitle}</Text>
      </View>
      <Text style={cr.pts}>{points}</Text>
      <Ionicons name="chevron-forward" size={15} color={C.sub} />
    </Pressable>
  );
}

const cr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: { fontSize: 14, fontWeight: "600" },
  sub:   { fontSize: 12, marginTop: 1 },
  pts:   { fontSize: 11, fontWeight: "700", color: GREEN },
});

// ── Aggregate rating summary ─────────────────────────────────────────────────
function AggregateRating({ reviews, C }: { reviews: StopReview[]; C: ReturnType<typeof makeC> }) {
  if (reviews.length === 0) return null;
  const avg = (key: "safety" | "comfort" | "cleanliness") =>
    reviews.reduce((sum, r) => sum + (r.data[key] ?? 0), 0) / reviews.length;

  const categories: { label: string; key: "safety" | "comfort" | "cleanliness" }[] = [
    { label: "Safety",      key: "safety"      },
    { label: "Comfort",     key: "comfort"     },
    { label: "Cleanliness", key: "cleanliness" },
  ];

  return (
    <View style={[ar.card, { backgroundColor: C.card, borderColor: C.border }]}>
      <Text style={[ar.heading, { color: C.text }]}>
        {reviews.length} {reviews.length === 1 ? "Review" : "Reviews"}
      </Text>
      {categories.map((cat, i) => {
        const val = avg(cat.key);
        return (
          <View key={cat.key}>
            {i > 0 && <View style={[ar.divider, { backgroundColor: C.border }]} />}
            <View style={ar.row}>
              <Text style={[ar.label, { color: C.sub }]}>{cat.label}</Text>
              <View style={[ar.barBg, { backgroundColor: C.input }]}>
                <View style={[ar.barFill, { width: `${(val / 5) * 100}%` as any }]} />
              </View>
              <Text style={[ar.score, { color: C.text }]}>{val.toFixed(1)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const ar = StyleSheet.create({
  card:    { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginBottom: 14 },
  heading: { fontSize: 13, fontWeight: "700", paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  row:     { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  label:   { fontSize: 13, width: 88 },
  barBg:   { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: ORANGE, borderRadius: 3 },
  score:   { fontSize: 13, fontWeight: "600", width: 28, textAlign: "right" },
});

// ── Review card ──────────────────────────────────────────────────────────────
function ReviewCard({
  review,
  isOwn = false,
  onEdit,
  C,
}: {
  review: StopReview;
  isOwn?: boolean;
  onEdit?: () => void;
  C: ReturnType<typeof makeC>;
}) {
  const name     = review.user?.name ?? "Anonymous";
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const avatar   = review.user?.avatar;
  const showImg  = avatar && !avatar.startsWith("data:");

  const date = new Date(review.created_at);
  const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const MiniStars = ({ value }: { value: number }) => (
    <View style={rv.miniStars}>
      {[1,2,3,4,5].map((n) => (
        <Ionicons key={n} name={n <= value ? "star" : "star-outline"} size={11} color={n <= value ? AMBER : C.sub} />
      ))}
    </View>
  );

  return (
    <View style={[rv.card, { backgroundColor: C.card, borderColor: C.border }, isOwn && rv.ownCard]}>
      <View style={rv.header}>
        <View style={rv.avatarRow}>
          {showImg ? (
            <Image source={{ uri: avatar }} style={rv.avatar} contentFit="cover" />
          ) : (
            <View style={[rv.avatar, { backgroundColor: ORANGE, alignItems: "center", justifyContent: "center" }]}>
              <Text style={rv.initials}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[rv.name, { color: C.text }]}>{name}</Text>
            <Text style={[rv.date, { color: C.sub }]}>{dateStr}</Text>
          </View>
        </View>
        {isOwn && (
          <View style={rv.ownBadgeRow}>
            <View style={rv.ownBadge}>
              <Text style={rv.ownBadgeText}>Your Review</Text>
            </View>
            {onEdit && (
              <Pressable style={rv.editBtn} onPress={onEdit} hitSlop={8}>
                <Ionicons name="create-outline" size={14} color={ORANGE} />
                <Text style={rv.editBtnText}>Edit</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      <View style={[rv.ratingGrid, { borderTopColor: C.border }]}>
        {([
          { label: "Safety",      key: "safety"      as const },
          { label: "Comfort",     key: "comfort"     as const },
          { label: "Cleanliness", key: "cleanliness" as const },
        ]).map((cat) => (
          <View key={cat.key} style={rv.ratingItem}>
            <Text style={[rv.ratingLbl, { color: C.sub }]}>{cat.label}</Text>
            <MiniStars value={review.data[cat.key] ?? 0} />
          </View>
        ))}
      </View>

      {review.data.text ? (
        <Text style={[rv.comment, { color: C.text, borderTopColor: C.border }]}>
          {review.data.text}
        </Text>
      ) : null}
    </View>
  );
}

const rv = StyleSheet.create({
  card:        { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginBottom: 10 },
  ownCard:     { borderColor: ORANGE + "60" },
  header:      { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", padding: 12 },
  avatarRow:   { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatar:      { width: 36, height: 36, borderRadius: 18 },
  initials:    { color: "#FFF", fontWeight: "700", fontSize: 13 },
  name:        { fontSize: 14, fontWeight: "600" },
  date:        { fontSize: 11, marginTop: 1 },
  ownBadgeRow: { alignItems: "flex-end", gap: 6 },
  ownBadge:    { backgroundColor: ORANGE + "18", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  ownBadgeText:{ fontSize: 10, fontWeight: "700", color: ORANGE },
  editBtn:     { flexDirection: "row", alignItems: "center", gap: 4 },
  editBtnText: { fontSize: 12, fontWeight: "600", color: ORANGE },
  ratingGrid:  { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingHorizontal: 12, gap: 6 },
  ratingItem:  { flex: 1, alignItems: "center", gap: 4 },
  ratingLbl:   { fontSize: 10, fontWeight: "600" },
  miniStars:   { flexDirection: "row", gap: 1 },
  comment:     { fontSize: 13, lineHeight: 19, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
});

// ── DEFAULT_LISTS & LIST_LABEL ───────────────────────────────────────────────
const DEFAULT_LISTS = [
  { key: "favorites",    label: "Favorites"    },
  { key: "want_to_go",   label: "Want to go"   },
  { key: "travel_plans", label: "Travel plans" },
  { key: "labeled",      label: "Labeled"      },
] as const;

const LIST_LABEL: Record<string, string> = {
  favorites:    "Favorites",
  want_to_go:   "Want to go",
  travel_plans: "Travel plans",
  labeled:      "Labeled",
};

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function StopDetailsSheet({
  stop,
  onClose,
  onGoToStop,
}: {
  stop: Stop;
  onClose: () => void;
  onGoToStop?: () => Promise<void>;
}): React.JSX.Element | null {
  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const lastY      = useRef(MIN_Y);
  const [expanded, setExpanded] = useState(false);

  const dark   = useColorScheme() === "dark";
  const C      = makeC(dark);
  const router = useRouter();

  const { user } = useAuthStore();
  const { places, addPlace, removePlace, customLists } = useSavedStore();
  const savedEntry = places.find((p) => p.place_id === stop.id && p.pin === null);
  const [saving, setSaving]                   = useState(false);
  const [directionsLoading, setDirectionsLoading] = useState(false);

  const [routes, setRoutes]               = useState<StopRoute[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);

  const [activeTab, setActiveTab]                 = useState<"info" | "reviews">("info");
  const [reviews, setReviews]                     = useState<StopReview[]>([]);
  const [reviewsLoading, setReviewsLoading]       = useState(false);
  const [photos, setPhotos]                       = useState<StopPhoto[]>([]);
  const [photosLoading, setPhotosLoading]         = useState(false);

  const [activeSheet, setActiveSheet] = useState<"delay" | "review" | "edit" | null>(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const locationPickerCallbackRef = useRef<((loc: { lat: number; lng: number }) => void) | null>(null);

  const openLocationPicker = (cb: (loc: { lat: number; lng: number }) => void) => {
    locationPickerCallbackRef.current = cb;
    setLocationPickerVisible(true);
  };

  // ── Sheet animation ────────────────────────────────────────────────────────
  const expandSheet = () => {
    Animated.spring(translateY, { toValue: MAX_Y, useNativeDriver: true, damping: 22, stiffness: 200 }).start();
    lastY.current = MAX_Y;
    setExpanded(true);
  };

  const collapseSheet = () => {
    Animated.spring(translateY, { toValue: MIN_Y, useNativeDriver: true, damping: 22, stiffness: 200 }).start();
    lastY.current = MIN_Y;
    setExpanded(false);
  };

  const handleClose = () => {
    Animated.timing(translateY, { toValue: SCREEN_H, duration: 240, useNativeDriver: true }).start(onClose);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_, g) => Math.abs(g.dy) > 5,
      onPanResponderMove: (_, g) => {
        translateY.setValue(Math.max(MAX_Y, lastY.current + g.dy));
      },
      onPanResponderRelease: (_, g) => {
        if      (g.vy < -0.5 || g.dy < -40) expandSheet();
        else if (g.vy >  0.5 || g.dy >  40) collapseSheet();
        else if (lastY.current === MAX_Y)    expandSheet();
        else                                 collapseSheet();
      },
    })
  ).current;

  useEffect(() => {
    Animated.spring(translateY, { toValue: MIN_Y, useNativeDriver: true, damping: 22, stiffness: 200 }).start();
    lastY.current = MIN_Y;
    setExpanded(false);
    setActiveTab("info");
  }, [stop.id, translateY]);

  useEffect(() => {
    setRoutesLoading(true);
    StopService.getStopDetails(stop.id)
      .then((d) => setRoutes(d.routes))
      .catch(() => setRoutes([]))
      .finally(() => setRoutesLoading(false));

    setReviewsLoading(true);
    ContributionService.getStopReviews(stop.id)
      .then(setReviews)
      .catch(() => setReviews([]))
      .finally(() => setReviewsLoading(false));

    setPhotosLoading(true);
    ContributionService.getStopPhotos(stop.id)
      .then(setPhotos)
      .catch(() => setPhotos([]))
      .finally(() => setPhotosLoading(false));
  }, [stop.id]);

  const refreshReviews = () => {
    ContributionService.getStopReviews(stop.id).then(setReviews).catch(() => {});
  };

  const handleReviewClose = () => {
    setActiveSheet(null);
    refreshReviews();
  };

  // ── Save helpers ──────────────────────────────────────────────────────────
  const saveToList = (listKey: string) => {
    setSaving(true);
    addPlace({
      name: stop.name, lat: stop.lat, lng: stop.lng,
      type: "stop", place_id: stop.id, pin: null,
      list: listKey, category: "Transit stop", note: null,
    })
      .catch(() => Alert.alert("Error", "Could not save this stop."))
      .finally(() => setSaving(false));
  };

  const handleSave = () => {
    const all = [
      ...DEFAULT_LISTS,
      ...customLists.map((l) => ({ key: l, label: l })),
    ];
    Alert.alert("Save to list", stop.name, [
      ...all.map((l) => ({ text: l.label, onPress: () => saveToList(l.key) })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const handleChangeList = () => {
    const all = [
      ...DEFAULT_LISTS,
      ...customLists.map((l) => ({ key: l, label: l })),
    ];
    Alert.alert("Move to list", stop.name, [
      ...all.map((l) => ({
        text: l.label,
        onPress: () => {
          if (!savedEntry) return;
          removePlace(savedEntry.id);
          saveToList(l.key);
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const handleUnsave = () => {
    if (!savedEntry) return;
    Alert.alert(
      "Remove from saved",
      `Remove "${stop.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => removePlace(savedEntry.id) },
      ],
    );
  };

  const savedListLabel = savedEntry?.list ? (LIST_LABEL[savedEntry.list] ?? savedEntry.list) : "Saved";

  const goToAddPhoto = () => {
    router.push({
      pathname: "/(account)/add-photo" as any,
      params: { stopName: stop.name, stopId: stop.id },
    });
  };

  const myReview = reviews.find((r) => r.user_id === user?.id);
  const hasReview = !!myReview;

  return (
    <>
      <Animated.View
        style={[s.panel, { backgroundColor: C.bg, height: SCREEN_H - MAX_Y, transform: [{ translateY }] }]}
      >
        {/* ── DRAG HANDLE + HEADER ── */}
        <View {...panResponder.panHandlers}>
          <View style={s.handleWrap}>
            <View style={[s.handle, { backgroundColor: C.handle }]} />
          </View>

          <View style={s.header}>
            <View style={[s.typeIcon, { backgroundColor: C.softOrange }]}>
              <Ionicons name="bus" size={19} color={ORANGE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.stopName, { color: C.text }]} numberOfLines={2}>
                {stop.name}
              </Text>
              <Text style={[s.stopMeta, { color: C.sub }]}>
                {locationLabel(stop.location_t)} · {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
              </Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={14} style={[s.closeBtn, { backgroundColor: C.card }]}>
              <Ionicons name="close" size={16} color={C.text} />
            </Pressable>
          </View>

          {/* ── ACTION CHIPS ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chipsRow}
          >
            <Chip
              icon="navigate-outline"
              label="Directions"
              color={ORANGE}
              loading={directionsLoading}
              onPress={async () => {
                if (!onGoToStop || directionsLoading) return;
                setDirectionsLoading(true);
                try { await onGoToStop(); } finally { setDirectionsLoading(false); }
              }}
            />
            {savedEntry ? (
              <>
                <Chip icon="bookmark"         label={savedListLabel}        color={GREEN} onPress={handleChangeList} />
                <Chip icon="bookmark-outline" label="Remove"                color={RED}   onPress={handleUnsave} />
              </>
            ) : (
              <Chip icon="bookmark-outline" label={saving ? "Saving…" : "Save"} color={ORANGE} onPress={handleSave} disabled={saving} />
            )}
            <Chip icon="camera-outline" label="Add Photo" color="#8B5CF6" onPress={goToAddPhoto} />
            <Chip icon="time-outline"   label="Delay"     color={RED}     onPress={() => setActiveSheet("delay")} />
          </ScrollView>

          {/* ── TAB BAR ── */}
          <View style={[s.tabBar, { borderBottomColor: C.border }]}>
            {(["info", "reviews"] as const).map((tab) => (
              <Pressable key={tab} style={s.tabItem} onPress={() => setActiveTab(tab)}>
                <Text style={[s.tabLabel, { color: activeTab === tab ? ORANGE : C.sub }]}>
                  {tab === "info"
                    ? "Info"
                    : `Reviews${reviews.length > 0 ? ` (${reviews.length})` : ""}`}
                </Text>
                {activeTab === tab && <View style={s.tabUnderline} />}
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── SCROLLABLE CONTENT ── */}
        <View style={{ flex: 1 }}>
          <ScrollView
            scrollEnabled={expanded}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            bounces={false}
            style={{ flex: 1 }}
          >
            {/* ── INFO TAB ── */}
            {activeTab === "info" && (
              <>
                {/* Routes */}
                <SectionTitle title="Routes passing by" />
                {routesLoading ? (
                  <ActivityIndicator size="small" color={ORANGE} style={{ alignSelf: "flex-start" }} />
                ) : routes.length > 0 ? (
                  <View style={s.routesRow}>
                    {routes.map((r) => (
                      <View key={r.id} style={[s.routeBadge, { backgroundColor: C.bg, borderColor: C.border }]}>
                        <Ionicons name="bus-outline" size={11} color={C.sub} />
                        <Text style={[s.routeText, { color: C.text }]}>{r.short_name}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={s.emptyNote}>No route data available.</Text>
                )}

                {/* Photos */}
                <SectionTitle
                  title="Photos"
                  sub={
                    photos.length > 0
                      ? `${photos.length} photo${photos.length !== 1 ? "s" : ""}`
                      : "Be the first to document this stop"
                  }
                />
                {photosLoading ? (
                  <ActivityIndicator size="small" color={ORANGE} style={{ alignSelf: "flex-start" }} />
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {photos.map((p) => (
                      <Image
                        key={p.id}
                        source={{ uri: p.data.photo_url }}
                        style={s.photoTile}
                        contentFit="cover"
                      />
                    ))}
                    {/* Add Photo placeholder tile */}
                    <Pressable
                      onPress={goToAddPhoto}
                      style={({ pressed }) => [s.photoPlaceholder, { opacity: pressed ? 0.7 : 1, borderColor: ORANGE + "60" }]}
                    >
                      <Ionicons name="camera" size={20} color={ORANGE} />
                      <Text style={s.photoPlaceholderText}>Add photo</Text>
                    </Pressable>
                  </ScrollView>
                )}

                {/* Community contributions */}
                <SectionTitle title="Contribute" sub="Help the community and earn Safiri Points" />
                <View style={[s.contribCard, { backgroundColor: C.card, borderColor: C.border }]}>
                  <ContribRow
                    C={C}
                    iconBg={C.softPurple}
                    icon="camera-outline"
                    iconColor="#8B5CF6"
                    title="Add a Photo"
                    subtitle="Help others find this stop"
                    points="+5 pts on approval"
                    onPress={goToAddPhoto}
                  />
                  <View style={[s.contribSep, { backgroundColor: C.border }]} />
                  <ContribRow
                    C={C}
                    iconBg={C.softRed}
                    icon="time-outline"
                    iconColor={RED}
                    title="Report a Delay"
                    subtitle="Warn commuters about delays here"
                    points="+3 pts now"
                    onPress={() => setActiveSheet("delay")}
                  />
                  <View style={[s.contribSep, { backgroundColor: C.border }]} />
                  <ContribRow
                    C={C}
                    iconBg={C.softOrange}
                    icon="star-outline"
                    iconColor={AMBER}
                    title={hasReview ? "Edit Your Review" : "Write a Review"}
                    subtitle="Rate safety, comfort, cleanliness"
                    points={hasReview ? "Update anytime" : "+10 pts now"}
                    onPress={() => setActiveSheet("review")}
                  />
                  <View style={[s.contribSep, { backgroundColor: C.border }]} />
                  <ContribRow
                    C={C}
                    iconBg={C.softBlue}
                    icon="create-outline"
                    iconColor="#3B82F6"
                    title="Correct Stop Info"
                    subtitle="Wrong name, location or routes"
                    points="+15 pts on approval"
                    onPress={() => setActiveSheet("edit")}
                  />
                </View>
              </>
            )}

            {/* ── REVIEWS TAB ── */}
            {activeTab === "reviews" && (
              <View style={{ paddingTop: 4 }}>
                {reviewsLoading ? (
                  <ActivityIndicator color={ORANGE} style={{ padding: 32 }} />
                ) : reviews.length === 0 ? (
                  <View style={s.emptyReviews}>
                    <Ionicons name="chatbubble-outline" size={40} color={C.sub} />
                    <Text style={[s.emptyNote, { textAlign: "center", marginTop: 10, fontWeight: "600" }]}>
                      No reviews yet
                    </Text>
                    <Text style={[s.emptyNote, { color: C.sub, marginTop: 4, textAlign: "center" }]}>
                      Be the first to share your experience.
                    </Text>
                  </View>
                ) : (
                  <>
                    <AggregateRating reviews={reviews} C={C} />
                    {myReview && (
                      <ReviewCard
                        review={myReview}
                        isOwn
                        onEdit={() => setActiveSheet("review")}
                        C={C}
                      />
                    )}
                    {reviews
                      .filter((r) => r.user_id !== user?.id)
                      .map((r) => <ReviewCard key={r.id} review={r} C={C} />)}
                  </>
                )}

                <Pressable
                  style={[s.writeReviewBtn, { backgroundColor: C.card, borderColor: C.border }]}
                  onPress={() => setActiveSheet("review")}
                >
                  <Ionicons name="star-outline" size={16} color={AMBER} />
                  <Text style={[s.writeReviewText, { color: C.text }]}>
                    {hasReview ? "Edit Your Review" : "Write a Review"}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={C.sub} />
                </Pressable>
              </View>
            )}
          </ScrollView>

          {!expanded && (
            <Pressable style={StyleSheet.absoluteFill} onPress={expandSheet} />
          )}
        </View>
      </Animated.View>

      {/* ── MINI SHEETS ── */}
      <MiniSheet
        visible={activeSheet === "delay"}
        onClose={() => setActiveSheet(null)}
        title={`Delay at ${stop.name}`}
        C={C}
      >
        <DelaySheet stop={stop} onClose={() => setActiveSheet(null)} C={C} />
      </MiniSheet>

      <MiniSheet
        visible={activeSheet === "review"}
        onClose={handleReviewClose}
        title={myReview ? `Edit Review: ${stop.name}` : `Review ${stop.name}`}
        C={C}
      >
        <ReviewSheet stop={stop} onClose={handleReviewClose} C={C} existingReview={myReview} />
      </MiniSheet>

      <MiniSheet
        visible={activeSheet === "edit"}
        onClose={() => setActiveSheet(null)}
        title={`Correct ${stop.name}`}
        C={C}
      >
        <EditSheet
          stop={stop}
          routes={routes}
          onClose={() => setActiveSheet(null)}
          onOpenMapPicker={openLocationPicker}
          C={C}
        />
      </MiniSheet>

      <LocationPickerModal
        visible={locationPickerVisible}
        onClose={() => setLocationPickerVisible(false)}
        onConfirm={(loc) => {
          locationPickerCallbackRef.current?.(loc);
          locationPickerCallbackRef.current = null;
        }}
        initialLat={stop.lat}
        initialLng={stop.lng}
      />
    </>
  );
}

// ── Main styles ──────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  panel: {
    position:             "absolute",
    top: 0, left: 0, right: 0,
    borderTopLeftRadius:  26,
    borderTopRightRadius: 26,
    shadowColor:          "#000",
    shadowOffset:         { width: 0, height: -4 },
    shadowOpacity:        0.1,
    shadowRadius:         18,
    elevation:            24,
    zIndex:               20,
    flexDirection:        "column",
    overflow:             "hidden",
  },

  handleWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 14 },
  handle:     { width: 40, height: 4, borderRadius: 2 },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingBottom: 14,
    gap: 12,
  },
  typeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stopName: { fontSize: 17, fontWeight: "700", lineHeight: 22, letterSpacing: -0.3 },
  stopMeta: { fontSize: 12, marginTop: 3 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  chipsRow: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },

  tabBar:      { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabItem:     { flex: 1, alignItems: "center", paddingVertical: 10, position: "relative" },
  tabLabel:    { fontSize: 14, fontWeight: "600" },
  tabUnderline:{ position: "absolute", bottom: 0, left: 20, right: 20, height: 2, backgroundColor: ORANGE, borderRadius: 1 },

  scrollContent: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 60 },

  routesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  routeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  routeText: { fontSize: 12, fontWeight: "700" },
  emptyNote: { fontSize: 13, color: GREY, fontStyle: "italic" },

  photoTile: { width: 110, height: 82, borderRadius: 12, marginRight: 10 },
  photoPlaceholder: {
    width: 110, height: 82, borderRadius: 12, marginRight: 10,
    borderWidth: 1.5, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", gap: 4,
  },
  photoPlaceholderText: { fontSize: 11, color: ORANGE, fontWeight: "600" },

  contribCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  contribSep: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },

  emptyReviews:    { alignItems: "center", paddingVertical: 36 },
  writeReviewBtn:  { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 12 },
  writeReviewText: { flex: 1, fontWeight: "600", fontSize: 14 },
});
