// components/app/StopDetailsSheet.tsx
import {
  ContributionService,
  StopPhoto,
  StopReview,
} from "@/services/contribution";
import { useContributionStore } from "@/store/contributionStore";
import { useSavedStore } from "@/store/savedStore";
import {
  StopRoute,
  StopService,
  type StopDeparturesResponse,
  type StopRouteBoardItem,
} from "@/services/stop";
import { useAuthStore } from "@/store/authStore";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  MapView as MapboxMapView,
  Camera as MapboxCamera,
} from "@rnmapbox/maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ORANGE = "#FF6F00";
const BLUE = "#2563EB";
const GREEN = "#10B981";
const RED = "#DC2626";
const GREY = "#8E8E93";
const AMBER = "#F59E0B";

const SCREEN_H = Dimensions.get("window").height;
const FULL_Y = SCREEN_H * 0.08;
const HALF_Y = SCREEN_H * 0.36;
const PEEK_Y = SCREEN_H - 390;

type Stop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stop_code?: string | null;
  stop_type?: string | null;
  location_t?: number;
  platform_code?: string | null;
  landmark?: string | null;
  direction_label?: string | null;
};

function makeC(dark: boolean) {
  return {
    bg: dark ? "#18181B" : "#FFFFFF",
    card: dark ? "#27272A" : "#F4F4F5",
    text: dark ? "#F9FAFB" : "#111827",
    sub: dark ? "#9CA3AF" : "#6B7280",
    border: dark ? "#3F3F46" : "#E5E7EB",
    handle: dark ? "#52525B" : "#D1D5DB",
    softOrange: dark ? "rgba(255,111,0,0.16)" : "#FFF3E0",
    softRed: dark ? "rgba(239,68,68,0.15)" : "#FEF2F2",
    softGreen: dark ? "rgba(16,185,129,0.15)" : "#F0FDF4",
    softBlue: dark ? "rgba(59,130,246,0.15)" : "#EFF6FF",
    softPurple: dark ? "rgba(139,92,246,0.15)" : "#F5F3FF",
    sheetBg: dark ? "#18181B" : "#FFFFFF",
    input: dark ? "#3F3F46" : "#F3F4F6",
  };
}

function locationLabel(t: number | undefined, stopType?: string | null): string {
  const st = String(stopType ?? "").toLowerCase();
  if (st.includes("rail")) return "Railway Station";
  if (st.includes("metro")) return "Metro / Subway Station";
  if (st.includes("brt")) return "BRT Station";
  if (st.includes("ferry")) return "Ferry Terminal";
  switch (t) {
    case 0:
      return "Transit Stop & Stage";
    case 1:
      return "Major Transit Terminal";
    case 2:
      return "Station Entrance / Exit";
    default:
      return "Transit Stop";
  }
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
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<MapboxCamera>(null);
  const centerRef = useRef({ lat: initialLat, lng: initialLng });
  const [displayCoords, setDisplayCoords] = useState({
    lat: initialLat,
    lng: initialLng,
  });
  const [gpsLoading, setGpsLoading] = useState(false);

  const onRegionDidChange = (feature: any) => {
    const [lng, lat] = feature?.geometry?.coordinates ?? [
      initialLng,
      initialLat,
    ];
    centerRef.current = { lat, lng };
    setDisplayCoords({ lat, lng });
  };

  const handleMyLocation = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Enable location in Settings.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = pos.coords;
      cameraRef.current?.setCamera({
        centerCoordinate: [longitude, latitude],
        zoomLevel: 16,
        animationDuration: 500,
      });
      centerRef.current = { lat: latitude, lng: longitude };
      setDisplayCoords({ lat: latitude, lng: longitude });
    } catch {
      Alert.alert("Error", "Could not get your location.");
    } finally {
      setGpsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1 }}>
        <MapboxMapView
          style={StyleSheet.absoluteFill}
          styleURL={
            process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ??
            "mapbox://styles/mapbox/streets-v12"
          }
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
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, lpm.pinContainer]}
        >
          <Ionicons
            name="location"
            size={44}
            color={ORANGE}
            style={{ marginBottom: -4 }}
          />
          <View style={lpm.pinShadow} />
        </View>
        <View style={[lpm.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable style={lpm.topBtn} onPress={onClose}>
            <Ionicons name="arrow-back" size={20} color="#1C1C1E" />
            <Text style={lpm.topBtnText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={lpm.topBtn}
            onPress={handleMyLocation}
            disabled={gpsLoading}
          >
            {gpsLoading ? (
              <ActivityIndicator size="small" color="#1C1C1E" />
            ) : (
              <Ionicons name="locate-outline" size={20} color="#1C1C1E" />
            )}
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
          <Pressable
            style={lpm.confirmBtn}
            onPress={() => {
              onConfirm(centerRef.current);
              onClose();
            }}
          >
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
  pinShadow: {
    width: 10,
    height: 5,
    borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  topBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  topBtnText: { fontWeight: "600", fontSize: 14, color: "#1C1C1E" },
  bottomCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  coordChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: "center",
  },
  coordText: { fontSize: 13, fontWeight: "500", color: "#6B7280" },
  confirmBtn: {
    backgroundColor: ORANGE,
    height: 50,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  confirmText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});

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
  }, [visible, anim]);

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={ms.backdrop} />
        </TouchableWithoutFeedback>
        <Animated.View
          style={[
            ms.sheet,
            { backgroundColor: C.sheetBg, transform: [{ translateY: anim }] },
          ]}
        >
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
  title: { fontSize: 18, fontWeight: "700" },
  body: { paddingHorizontal: 20, paddingBottom: 20 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
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
  pillRow: { flexDirection: "row", gap: 8 },
  pill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
  },
  pillText: { fontWeight: "600", fontSize: 14 },
  hint: { fontSize: 12, textAlign: "center", marginTop: 12, marginBottom: 8 },
  submitBtn: {
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    backgroundColor: ORANGE,
  },
  submitText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  ratingLabel: { fontSize: 14, fontWeight: "500" },
  stars: { flexDirection: "row", gap: 6 },
  ratingCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 14,
  },
  dividerThin: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
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
  const [severity, setSeverity] = useState<"minor" | "major" | "cancelled">(
    "minor"
  );
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const { submit } = useContributionStore();

  const SEVS: {
    key: "minor" | "major" | "cancelled";
    label: string;
    color: string;
  }[] = [
    { key: "minor", label: "Minor", color: AMBER },
    { key: "major", label: "Major", color: RED },
    { key: "cancelled", label: "Cancelled", color: GREY },
  ];

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await submit({
        type: "delay_report",
        title: `${
          severity.charAt(0).toUpperCase() + severity.slice(1)
        } delay at ${stop.name}`,
        data: { severity, note: note.trim() || undefined },
      });
      onClose();
      setNote("");
      setSeverity("minor");
      if (res.points_awarded > 0)
        Alert.alert("", `+${res.points_awarded} Navigo Points earned!`);
    } catch {
      Alert.alert("Error", "Could not submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[ms.body, { gap: 0 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[ms.label, { color: C.sub, marginBottom: 8 }]}>
        SEVERITY
      </Text>
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
            <Text
              style={[
                ms.pillText,
                { color: severity === sv.key ? sv.color : C.sub },
              ]}
            >
              {sv.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[ms.label, { color: C.sub, marginBottom: 8 }]}>
        NOTE (OPTIONAL)
      </Text>
      <TextInput
        style={[
          ms.textArea,
          {
            backgroundColor: C.card,
            color: C.text,
            borderColor: C.border,
            marginBottom: 0,
          },
        ]}
        placeholder={`Any detail about the delay at ${stop.name}…`}
        placeholderTextColor={C.sub}
        multiline
        numberOfLines={3}
        value={note}
        onChangeText={setNote}
        maxLength={250}
      />

      <Text style={[ms.hint, { color: C.sub }]}>
        Awards +3 Navigo Points immediately
      </Text>

      <Pressable
        style={[
          ms.submitBtn,
          { backgroundColor: RED },
          loading && { opacity: 0.6 },
        ]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <Text style={ms.submitText}>Submit Delay Report</Text>
        )}
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
  const [safety, setSafety] = useState(existingReview?.data.safety ?? 0);
  const [comfort, setComfort] = useState(existingReview?.data.comfort ?? 0);
  const [clean, setClean] = useState(existingReview?.data.cleanliness ?? 0);
  const [text, setText] = useState(existingReview?.data.text ?? "");
  const [loading, setLoading] = useState(false);
  const { submit } = useContributionStore();

  useEffect(() => {
    setSafety(existingReview?.data.safety ?? 0);
    setComfort(existingReview?.data.comfort ?? 0);
    setClean(existingReview?.data.cleanliness ?? 0);
    setText(existingReview?.data.text ?? "");
  }, [existingReview]);

  const StarRating = ({
    value,
    onSet,
  }: {
    value: number;
    onSet: (n: number) => void;
  }) => (
    <View style={ms.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onSet(n)} hitSlop={6}>
          <Ionicons
            name={n <= value ? "star" : "star-outline"}
            size={24}
            color={n <= value ? AMBER : C.sub}
          />
        </Pressable>
      ))}
    </View>
  );

  const handleSubmit = async () => {
    if (!safety || !comfort || !clean) {
      Alert.alert(
        "Rate all categories",
        "Please give a rating in all three categories."
      );
      return;
    }
    setLoading(true);
    try {
      const res = await submit({
        type: "stop_review",
        stop_id: stop.id,
        title: `Review: ${stop.name}`,
        data: {
          safety,
          comfort,
          cleanliness: clean,
          text: text.trim() || undefined,
        },
      });
      onClose();
      setSafety(0);
      setComfort(0);
      setClean(0);
      setText("");
      if (res.points_awarded > 0)
        Alert.alert("", `+${res.points_awarded} Navigo Points earned!`);
    } catch {
      Alert.alert("Error", "Could not submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isEdit = !!existingReview;

  return (
    <ScrollView
      contentContainerStyle={ms.body}
      keyboardShouldPersistTaps="handled"
    >
      <View
        style={[
          ms.ratingCard,
          { backgroundColor: C.card, borderColor: C.border },
        ]}
      >
        {(
          [
            { label: "Safety", value: safety, set: setSafety },
            { label: "Comfort", value: comfort, set: setComfort },
            { label: "Cleanliness", value: clean, set: setClean },
          ] as const
        ).map((row, i) => (
          <React.Fragment key={row.label}>
            {i > 0 && (
              <View style={[ms.dividerThin, { backgroundColor: C.border }]} />
            )}
            <View style={ms.ratingRow}>
              <Text style={[ms.ratingLabel, { color: C.text }]}>
                {row.label}
              </Text>
              <StarRating value={row.value} onSet={row.set} />
            </View>
          </React.Fragment>
        ))}
      </View>

      <Text style={[ms.label, { color: C.sub, marginBottom: 8 }]}>
        COMMENTS (OPTIONAL)
      </Text>
      <TextInput
        style={[
          ms.textArea,
          { backgroundColor: C.card, color: C.text, borderColor: C.border },
        ]}
        placeholder={`Share your experience at ${stop.name}…`}
        placeholderTextColor={C.sub}
        multiline
        numberOfLines={3}
        value={text}
        onChangeText={setText}
        maxLength={400}
      />

      <Text style={[ms.hint, { color: C.sub }]}>
        {isEdit
          ? "Updates your existing review"
          : "Awards +10 Navigo Points immediately"}
      </Text>

      <Pressable
        style={[ms.submitBtn, loading && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <Text style={ms.submitText}>
            {isEdit ? "Update Review" : "Submit Review"}
          </Text>
        )}
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
  const [field, setField] = useState<"name" | "location" | "routes">("name");
  const [current, setCurrent] = useState("");
  const [proposed, setProposed] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const { submit } = useContributionStore();

  const FIELDS: { key: "name" | "location" | "routes"; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "location", label: "Location" },
    { key: "routes", label: "Routes" },
  ];

  useEffect(() => {
    switch (field) {
      case "name":
        setCurrent(stop.name);
        break;
      case "location":
        setCurrent(`${stop.lat.toFixed(6)}, ${stop.lng.toFixed(6)}`);
        break;
      case "routes":
        setCurrent(routes.map((r) => r.short_name).join(", "));
        break;
    }
    setProposed("");
  }, [field, stop, routes]);

  const handleMyLocation = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Enable location in Settings.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setProposed(
        `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`
      );
    } catch {
      Alert.alert("Error", "Could not get your location.");
    } finally {
      setGpsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!proposed.trim()) {
      Alert.alert("Missing info", "Please enter a proposed value.");
      return;
    }
    setLoading(true);
    try {
      await submit({
        type: "stop_edit",
        title: `Edit ${field}: ${stop.name}`,
        data: {
          field,
          current_value: current.trim() || undefined,
          proposed_value: proposed.trim(),
          note: note.trim() || undefined,
        },
      });
      onClose();
      setCurrent("");
      setProposed("");
      setNote("");
      setField("name");
      Alert.alert(
        "Submitted",
        "Your edit has been submitted for review. You'll earn +15 pts if approved."
      );
    } catch {
      Alert.alert("Error", "Could not submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={ms.body}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[ms.label, { color: C.sub, marginBottom: 8 }]}>
        WHAT TO EDIT
      </Text>
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
            <Text
              style={[
                ms.pillText,
                { color: field === f.key ? ORANGE : C.sub },
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[ms.label, { color: C.sub, marginBottom: 8 }]}>
        CURRENT VALUE
      </Text>
      <TextInput
        style={[
          ms.input,
          {
            backgroundColor: C.card,
            color: C.text,
            borderColor: C.border,
            marginBottom: 14,
            opacity: 0.65,
          },
        ]}
        value={current}
        editable={false}
      />

      <Text style={[ms.label, { color: C.sub, marginBottom: 8 }]}>
        PROPOSED VALUE
      </Text>
      <TextInput
        style={[
          ms.input,
          {
            backgroundColor: C.card,
            color: C.text,
            borderColor: C.border,
            marginBottom: field === "location" ? 10 : 14,
          },
        ]}
        placeholder="What it should say…"
        placeholderTextColor={C.sub}
        value={proposed}
        onChangeText={setProposed}
      />

      {field === "location" && (
        <View style={[ms.pillRow, { marginBottom: 14 }]}>
          <Pressable
            style={[
              ms2.locationBtn,
              { borderColor: C.border, backgroundColor: C.card },
            ]}
            onPress={handleMyLocation}
            disabled={gpsLoading}
          >
            {gpsLoading ? (
              <ActivityIndicator size="small" color={ORANGE} />
            ) : (
              <Ionicons name="locate-outline" size={15} color={C.text} />
            )}
            <Text style={[ms2.locationBtnText, { color: C.text }]}>
              My Location
            </Text>
          </Pressable>
          <Pressable
            style={[
              ms2.locationBtn,
              { borderColor: C.border, backgroundColor: C.card },
            ]}
            onPress={() =>
              onOpenMapPicker((loc) =>
                setProposed(`${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`)
              )
            }
          >
            <Ionicons name="map-outline" size={15} color={C.text} />
            <Text style={[ms2.locationBtnText, { color: C.text }]}>
              Pick on Map
            </Text>
          </Pressable>
        </View>
      )}

      <Text style={[ms.label, { color: C.sub, marginBottom: 8 }]}>
        NOTE (OPTIONAL)
      </Text>
      <TextInput
        style={[
          ms.textArea,
          { backgroundColor: C.card, color: C.text, borderColor: C.border },
        ]}
        placeholder="Any context for this correction…"
        placeholderTextColor={C.sub}
        multiline
        numberOfLines={2}
        value={note}
        onChangeText={setNote}
        maxLength={250}
      />

      <Pressable
        style={[ms.submitBtn, loading && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <Text style={ms.submitText}>Submit Edit</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const ms2 = StyleSheet.create({
  locationBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  locationBtnText: { fontWeight: "600", fontSize: 13 },
});

function AggregateRating({
  reviews,
  C,
}: {
  reviews: StopReview[];
  C: ReturnType<typeof makeC>;
}) {
  if (reviews.length === 0) return null;
  const avg = (key: "safety" | "comfort" | "cleanliness") =>
    reviews.reduce((sum, r) => sum + (r.data[key] ?? 0), 0) / reviews.length;

  const categories: {
    label: string;
    key: "safety" | "comfort" | "cleanliness";
  }[] = [
    { label: "Safety", key: "safety" },
    { label: "Comfort", key: "comfort" },
    { label: "Cleanliness", key: "cleanliness" },
  ];

  return (
    <View
      style={[
        ar.card,
        { backgroundColor: C.card, borderColor: C.border },
      ]}
    >
      <Text style={[ar.heading, { color: C.text }]}>
        {reviews.length} {reviews.length === 1 ? "Review" : "Reviews"}
      </Text>
      {categories.map((cat, i) => {
        const val = avg(cat.key);
        return (
          <View key={cat.key}>
            {i > 0 && (
              <View style={[ar.divider, { backgroundColor: C.border }]} />
            )}
            <View style={ar.row}>
              <Text style={[ar.label, { color: C.sub }]}>{cat.label}</Text>
              <View style={[ar.barBg, { backgroundColor: C.input }]}>
                <View
                  style={[ar.barFill, { width: `${(val / 5) * 100}%` as any }]}
                />
              </View>
              <Text style={[ar.score, { color: C.text }]}>
                {val.toFixed(1)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const ar = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    marginBottom: 14,
  },
  heading: {
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  label: { fontSize: 13, width: 88 },
  barBg: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: ORANGE, borderRadius: 3 },
  score: { fontSize: 13, fontWeight: "600", width: 28, textAlign: "right" },
});

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
  const name = review.user?.name ?? "Anonymous";
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const avatar = review.user?.avatar;
  const showImg = avatar && !avatar.startsWith("data:");
  const dateStr = new Date(review.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <View
      style={[
        rv.card,
        { backgroundColor: C.card, borderColor: C.border },
        isOwn && rv.ownCard,
      ]}
    >
      <View style={rv.header}>
        <View style={rv.avatarRow}>
          {showImg ? (
            <Image
              source={{ uri: avatar }}
              style={rv.avatar}
              contentFit="cover"
            />
          ) : (
            <View
              style={[
                rv.avatar,
                {
                  backgroundColor: ORANGE,
                  alignItems: "center",
                  justifyContent: "center",
                },
              ]}
            >
              <Text style={rv.initials}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[rv.name, { color: C.text }]}>{name}</Text>
            <Text style={[rv.date, { color: C.sub }]}>{dateStr}</Text>
          </View>
        </View>
        {isOwn && onEdit && (
          <Pressable style={rv.editBtn} onPress={onEdit} hitSlop={8}>
            <Ionicons name="create-outline" size={14} color={ORANGE} />
            <Text style={rv.editBtnText}>Edit</Text>
          </Pressable>
        )}
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
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    marginBottom: 10,
  },
  ownCard: { borderColor: ORANGE + "60" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  initials: { color: "#FFF", fontWeight: "700", fontSize: 12 },
  name: { fontSize: 14, fontWeight: "600" },
  date: { fontSize: 11, marginTop: 1 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  editBtnText: { fontSize: 12, fontWeight: "600", color: ORANGE },
  comment: {
    fontSize: 13,
    lineHeight: 19,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

const DEFAULT_LISTS = [
  { key: "favorites", label: "Favorites" },
  { key: "want_to_go", label: "Want to go" },
  { key: "travel_plans", label: "Travel plans" },
  { key: "labeled", label: "Labeled" },
] as const;

export default function StopDetailsSheet({
  stop,
  allStops = [],
  onSelectStop,
  onSelectRouteCorridor,
  onClose,
  onGoToStop,
  initialTab = "arrivals",
}: {
  stop: Stop;
  allStops?: Stop[];
  onSelectStop?: (nextStop: Stop) => void;
  onSelectRouteCorridor?: (routeId: string) => void;
  onClose: () => void;
  onGoToStop?: () => Promise<void>;
  initialTab?: "arrivals" | "info" | "reviews";
}): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const currentY = useRef(PEEK_Y);
  const [snapState, setSnapState] = useState<"peek" | "half" | "full">("peek");

  const dark = useColorScheme() === "dark";
  const C = makeC(dark);
  const router = useRouter();

  const { user } = useAuthStore();
  const { places, addPlace, removePlace, customLists } = useSavedStore();
  const savedEntry = places.find(
    (p) => p.place_id === stop.id && p.pin === null
  );
  const [saving, setSaving] = useState(false);
  const [directionsLoading, setDirectionsLoading] = useState(false);

  const [board, setBoard] = useState<StopDeparturesResponse | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [routes, setRoutes] = useState<StopRoute[]>([]);

  const [activeTab, setActiveTab] = useState<"arrivals" | "info" | "reviews">(
    initialTab
  );
  const [reviews, setReviews] = useState<StopReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [photos, setPhotos] = useState<StopPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  const [activeSheet, setActiveSheet] = useState<
    "delay" | "review" | "edit" | null
  >(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const locationPickerCallbackRef = useRef<
    ((loc: { lat: number; lng: number }) => void) | null
  >(null);

  const openLocationPicker = (
    cb: (loc: { lat: number; lng: number }) => void
  ) => {
    locationPickerCallbackRef.current = cb;
    setLocationPickerVisible(true);
  };

  // ── Neighbor Stops for Left/Right Swipe (Fixed dependencies!) ──────────
  const { prevStop, nextStop } = useMemo(() => {
    if (!allStops || allStops.length < 2) {
      return { prevStop: null, nextStop: null };
    }
    const others = allStops
      .filter((s) => s.id !== stop.id)
      .map((s) => ({
        stop: s,
        dist: Math.hypot(s.lat - stop.lat, s.lng - stop.lng),
        dx: s.lng - stop.lng,
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 8);

    const westNeighbors = others.filter((o) => o.dx <= 0);
    const eastNeighbors = others.filter((o) => o.dx > 0);

    return {
      prevStop: westNeighbors[0]?.stop ?? others[1]?.stop ?? null,
      nextStop: eastNeighbors[0]?.stop ?? others[0]?.stop ?? null,
    };
  }, [allStops, stop.id, stop.lat, stop.lng]);

  const prevStopRef = useRef<Stop | null>(null);
  const nextStopRef = useRef<Stop | null>(null);
  const onSelectStopRef = useRef(onSelectStop);
  useEffect(() => {
    prevStopRef.current = prevStop;
    nextStopRef.current = nextStop;
    onSelectStopRef.current = onSelectStop;
  }, [prevStop, nextStop, onSelectStop]);

  // ── 3-Step Vertical Drag + Horizontal Prev/Next Swipe Responder ──────────
  const snapTo = useCallback(
    (target: number, mode: "peek" | "half" | "full") => {
      currentY.current = target;
      setSnapState(mode);
      Animated.spring(translateY, {
        toValue: target,
        useNativeDriver: true,
        damping: 24,
        stiffness: 240,
      }).start();
    },
    [translateY]
  );

  const handleClose = useCallback(() => {
    Animated.timing(translateY, {
      toValue: SCREEN_H,
      duration: 220,
      useNativeDriver: true,
    }).start(onClose);
  }, [translateY, onClose]);

  const headerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 10 || Math.abs(g.dy) > 8,
      onPanResponderMove: (_, g) => {
        if (Math.abs(g.dy) >= Math.abs(g.dx)) {
          translateY.setValue(Math.max(FULL_Y, currentY.current + g.dy));
        }
      },
      onPanResponderRelease: (_, g) => {
        // 1. Horizontal Swipe -> Switch to Previous or Next Stop!
        if (
          Math.abs(g.dx) > 48 &&
          Math.abs(g.dx) > Math.abs(g.dy) * 1.3 &&
          onSelectStopRef.current
        ) {
          if (g.dx < 0 && nextStopRef.current) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onSelectStopRef.current(nextStopRef.current);
            return;
          }
          if (g.dx > 0 && prevStopRef.current) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onSelectStopRef.current(prevStopRef.current);
            return;
          }
        }

        // 2. Vertical Drag -> Snap to PEEK, HALF, or FULL (or dismiss if dragged far down)
        const destY = currentY.current + g.dy;
        if (g.vy > 1.2 && currentY.current >= PEEK_Y - 20) {
          handleClose();
          return;
        }
        if (g.vy < -0.5 || g.dy < -60) {
          if (currentY.current > HALF_Y + 20) snapTo(HALF_Y, "half");
          else snapTo(FULL_Y, "full");
        } else if (g.vy > 0.5 || g.dy > 60) {
          if (currentY.current < HALF_Y - 20) snapTo(HALF_Y, "half");
          else snapTo(PEEK_Y, "peek");
        } else {
          const dFull = Math.abs(destY - FULL_Y);
          const dHalf = Math.abs(destY - HALF_Y);
          const dPeek = Math.abs(destY - PEEK_Y);
          if (dFull <= dHalf && dFull <= dPeek) snapTo(FULL_Y, "full");
          else if (dHalf <= dFull && dHalf <= dPeek) snapTo(HALF_Y, "half");
          else snapTo(PEEK_Y, "peek");
        }
      },
    })
  ).current;

  useEffect(() => {
    snapTo(PEEK_Y, "peek");
  }, [stop.id, snapTo]);

  const loadDeparturesAndInfo = useCallback(async () => {
    setBoardLoading(true);
    try {
      const data = await StopService.getStopDepartures(stop.id);
      setBoard(data);
      setRoutes(
        data.routes.map((r) => ({
          id: r.route_id,
          short_name: r.route_short_name,
          long_name: r.route_long_name,
          route_color: r.route_color,
          route_type: r.route_type,
        }))
      );
    } catch {
      StopService.getStopDetails(stop.id)
        .then((d) => setRoutes(d.routes))
        .catch(() => {});
    } finally {
      setBoardLoading(false);
    }
  }, [stop.id]);

  useEffect(() => {
    loadDeparturesAndInfo();

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
  }, [stop.id, loadDeparturesAndInfo]);

  const saveToList = (listKey: string) => {
    setSaving(true);
    addPlace({
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
      type: "stop",
      place_id: stop.id,
      pin: null,
      list: listKey,
      category: "Transit stop",
      note: null,
    })
      .catch(() => Alert.alert("Error", "Could not save this stop."))
      .finally(() => setSaving(false));
  };

  const handleBookmarkPress = () => {
    Haptics.selectionAsync();
    if (savedEntry) {
      removePlace(savedEntry.id);
      return;
    }
    const all = [
      ...DEFAULT_LISTS,
      ...customLists.map((l) => ({ key: l, label: l })),
    ];
    Alert.alert("Save to list", stop.name, [
      ...all.map((l) => ({ text: l.label, onPress: () => saveToList(l.key) })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const stopCode =
    board?.stop?.stop_code ??
    stop.stop_code ??
    stop.id.slice(-5).toUpperCase();
  const directionLabel =
    board?.stop?.direction_label ??
    stop.direction_label ??
    locationLabel(stop.location_t, board?.stop?.stop_type ?? stop.stop_type);

  const myReview = reviews.find((r) => r.user_id === user?.id);

  return (
    <>
      <Animated.View
        style={[
          s.panel,
          {
            backgroundColor: C.bg,
            height: SCREEN_H - FULL_Y,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* ── DRAGGABLE & HORIZONTAL-SWIPEABLE KAKAOMAP HEADER ── */}
        <View {...headerPanResponder.panHandlers}>
          <View style={s.handleWrap}>
            <View style={[s.handle, { backgroundColor: C.handle }]} />
          </View>

          {/* Visible Prev / Next Stop Swipe Strip (KakaoMap Neighbor Switcher)[cite: 3] */}
          {onSelectStop && (prevStop || nextStop) && (
            <View style={s.neighborStrip}>
              {prevStop ? (
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    onSelectStop(prevStop);
                  }}
                  style={[s.neighborPill, { backgroundColor: C.card }]}
                >
                  <Ionicons name="chevron-back" size={13} color={ORANGE} />
                  <Text
                    style={[s.neighborText, { color: C.text }]}
                    numberOfLines={1}
                  >
                    {prevStop.name}
                  </Text>
                </Pressable>
              ) : (
                <View style={{ flex: 1 }} />
              )}

              <View style={s.swipeHintBadge}>
                <Ionicons name="swap-horizontal" size={12} color={C.sub} />
                <Text style={[s.swipeHintText, { color: C.sub }]}>Swipe</Text>
              </View>

              {nextStop ? (
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    onSelectStop(nextStop);
                  }}
                  style={[
                    s.neighborPill,
                    { backgroundColor: C.card, justifyContent: "flex-end" },
                  ]}
                >
                  <Text
                    style={[
                      s.neighborText,
                      { color: C.text, textAlign: "right" },
                    ]}
                    numberOfLines={1}
                  >
                    {nextStop.name}
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color={ORANGE} />
                </Pressable>
              ) : (
                <View style={{ flex: 1 }} />
              )}
            </View>
          )}

          {/* KakaoMap Stop Title + Stop Code · Direction + Close[cite: 3] */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <View style={s.titleRow}>
                <Text
                  style={[s.stopName, { color: C.text }]}
                  numberOfLines={1}
                >
                  {stop.name}
                </Text>
                {(board?.stop?.platform_code || stop.platform_code) && (
                  <View style={s.platBadge}>
                    <Text style={s.platBadgeText}>
                      Plat. {board?.stop?.platform_code ?? stop.platform_code}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={[s.stopMeta, { color: C.sub }]}
                numberOfLines={1}
              >
                {stopCode} · {directionLabel}
              </Text>
            </View>

            <Pressable
              onPress={handleBookmarkPress}
              hitSlop={10}
              style={[s.closeBtn, { backgroundColor: C.card }]}
            >
              <Ionicons
                name={savedEntry ? "bookmark" : "bookmark-outline"}
                size={16}
                color={savedEntry ? ORANGE : C.text}
              />
            </Pressable>

            <Pressable
              onPress={handleClose}
              hitSlop={14}
              style={[s.closeBtn, { backgroundColor: C.card }]}
            >
              <Ionicons name="close" size={18} color={C.text} />
            </Pressable>
          </View>

          {/* ── 3-TAB BAR: Live Arrivals | Stop Info & Photos | Reviews ── */}
          <View style={[s.tabBar, { borderBottomColor: C.border }]}>
            {(
              [
                {
                  key: "arrivals",
                  label: `Arrivals${
                    board?.routes?.length ? ` (${board.routes.length})` : ""
                  }`,
                },
                { key: "info", label: "Stop Info & Photos" },
                {
                  key: "reviews",
                  label: `Reviews${
                    reviews.length > 0 ? ` (${reviews.length})` : ""
                  }`,
                },
              ] as const
            ).map((tab) => (
              <Pressable
                key={tab.key}
                style={s.tabItem}
                onPress={() => {
                  Haptics.selectionAsync();
                  setActiveTab(tab.key);
                  if (tab.key !== "arrivals" && snapState === "peek") {
                    snapTo(HALF_Y, "half");
                  }
                }}
              >
                <Text
                  style={[
                    s.tabLabel,
                    { color: activeTab === tab.key ? ORANGE : C.sub },
                  ]}
                >
                  {tab.label}
                </Text>
                {activeTab === tab.key && <View style={s.tabUnderline} />}
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── TAB CONTENT AREA ── */}
        <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[
              s.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 20) + 120 },
            ]}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {/* ── TAB 1: KAKAOMAP LIVE ARRIVALS BOARD (IMG_6283.PNG)[cite: 3] ── */}
            {activeTab === "arrivals" && (
              <View>
                {boardLoading && !board ? (
                  <View style={s.loadingBox}>
                    <ActivityIndicator size="small" color={ORANGE} />
                    <Text style={{ color: C.sub, fontSize: 13 }}>
                      Fetching live departures…
                    </Text>
                  </View>
                ) : (board?.routes?.length ?? 0) === 0 ? (
                  <View style={s.loadingBox}>
                    <Text style={{ color: C.sub, fontSize: 13 }}>
                      No scheduled routes found for this stop right now.
                    </Text>
                  </View>
                ) : (
                  board!.routes.map((r: StopRouteBoardItem, idx: number) => (
                    <Pressable
                      key={`${r.route_id}-${r.direction_id}-${idx}`}
                      onPress={() => {
                        if (onSelectRouteCorridor) {
                          Haptics.selectionAsync();
                          onSelectRouteCorridor(r.route_id);
                        }
                      }}
                      style={[
                        s.arrivalRouteRow,
                        { borderBottomColor: C.border },
                      ]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={s.arrivalBadgeRow}>
                          <View
                            style={[
                              s.modeTag,
                              { backgroundColor: r.badge_color || BLUE },
                            ]}
                          >
                            <Text style={s.modeTagText}>{r.mode_badge}</Text>
                          </View>
                          <Text
                            style={[s.routeShortName, { color: C.text }]}
                          >
                            {r.route_short_name}
                          </Text>
                        </View>
                        <Text
                          style={[s.routeHeadsign, { color: C.sub }]}
                          numberOfLines={1}
                        >
                          {r.headsign}
                        </Text>
                      </View>

                      <View style={s.arrivalsRightCol}>
                        {r.arrivals.length === 0 ? (
                          <Text style={{ color: C.sub, fontSize: 12 }}>
                            No Data
                          </Text>
                        ) : (
                          r.arrivals.map((arr, aIdx) => (
                            <Text
                              key={aIdx}
                              style={s.arrivalLine}
                              numberOfLines={1}
                            >
                              <Text style={s.arrivalRedText}>
                                {arr.eta_label}
                              </Text>{" "}
                              <Text style={{ color: C.sub, fontSize: 11.5 }}>
                                ({arr.stops_away} stops left, {arr.crowding})
                              </Text>
                            </Text>
                          ))
                        )}
                      </View>
                    </Pressable>
                  ))
                )}

                <Pressable
                  onPress={() => setActiveSheet("edit")}
                  style={s.suggestEditsRow}
                >
                  <Text style={[s.suggestEditsText, { color: C.sub }]}>
                    Suggest edits &gt;
                  </Text>
                </Pressable>
              </View>
            )}

            {/* ── TAB 2: STOP DESCRIPTION, INFO, PHOTOS & CONTRIBUTE ── */}
            {activeTab === "info" && (
              <View style={{ paddingTop: 12, gap: 18 }}>
                {/* Stop Description & Accessibility Card */}
                <View
                  style={[
                    s.infoCard,
                    { backgroundColor: C.card, borderColor: C.border },
                  ]}
                >
                  <View style={s.infoRowItem}>
                    <Ionicons
                      name="information-circle-outline"
                      size={18}
                      color={ORANGE}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.infoTitle, { color: C.text }]}>
                        {locationLabel(
                          stop.location_t,
                          board?.stop?.stop_type ?? stop.stop_type
                        )}
                      </Text>
                      <Text style={[s.infoDesc, { color: C.sub }]}>
                        {board?.stop?.landmark || stop.landmark
                          ? `Landmark: Near ${
                              board?.stop?.landmark ?? stop.landmark
                            }`
                          : `Stop Code ${stopCode} · Coordinates ${stop.lat.toFixed(
                              5
                            )}, ${stop.lng.toFixed(5)}`}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      s.infoRowItem,
                      {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: C.border,
                        paddingTop: 10,
                      },
                    ]}
                  >
                    <Ionicons
                      name="body-outline"
                      size={18}
                      color={
                        board?.stop?.wheelchair_boarding ? GREEN : C.sub
                      }
                    />
                    <Text style={[s.infoDesc, { color: C.text }]}>
                      {board?.stop?.wheelchair_boarding
                        ? "Wheelchair accessible boarding available"
                        : "Standard curbside / stage boarding"}
                    </Text>
                  </View>
                </View>

                {/* Routes Passing By (Tap any badge to view full corridor on map) */}
                <View>
                  <Text style={[s.secHeading, { color: C.sub }]}>
                    LINES SERVING THIS STOP (TAP TO VIEW CORRIDOR)
                  </Text>
                  <View style={s.routesWrap}>
                    {routes.map((r) => (
                      <Pressable
                        key={r.id}
                        onPress={() => onSelectRouteCorridor?.(r.id)}
                        style={[
                          s.routeChip,
                          {
                            backgroundColor: C.card,
                            borderColor: C.border,
                          },
                        ]}
                      >
                        <Ionicons
                          name="bus-outline"
                          size={12}
                          color={ORANGE}
                        />
                        <Text style={[s.routeChipText, { color: C.text }]}>
                          Line {r.short_name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Photos */}
                <View>
                  <Text style={[s.secHeading, { color: C.sub }]}>
                    STAGE & STATION PHOTOS ({photos.length})
                  </Text>
                  {photosLoading ? (
                    <ActivityIndicator size="small" color={ORANGE} />
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                    >
                      {photos.map((p) => (
                        <Image
                          key={p.id}
                          source={{ uri: p.data.photo_url }}
                          style={s.photoTile}
                          contentFit="cover"
                        />
                      ))}
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: "/(account)/add-photo" as any,
                            params: { stopName: stop.name, stopId: stop.id },
                          })
                        }
                        style={[
                          s.photoPlaceholder,
                          { borderColor: ORANGE + "60" },
                        ]}
                      >
                        <Ionicons name="camera" size={20} color={ORANGE} />
                        <Text style={s.photoPlaceholderText}>Add photo</Text>
                      </Pressable>
                    </ScrollView>
                  )}
                </View>

                {/* Quick Community Actions */}
                <View style={s.quickContribRow}>
                  <Pressable
                    onPress={() => setActiveSheet("delay")}
                    style={[
                      s.contribBtn,
                      { backgroundColor: C.softRed },
                    ]}
                  >
                    <Ionicons name="time-outline" size={16} color={RED} />
                    <Text style={[s.contribBtnText, { color: RED }]}>
                      Report Delay
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setActiveSheet("edit")}
                    style={[
                      s.contribBtn,
                      { backgroundColor: C.softBlue },
                    ]}
                  >
                    <Ionicons
                      name="create-outline"
                      size={16}
                      color="#3B82F6"
                    />
                    <Text style={[s.contribBtnText, { color: "#3B82F6" }]}>
                      Edit Stop Info
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* ── TAB 3: REVIEWS ── */}
            {activeTab === "reviews" && (
              <View style={{ paddingTop: 12 }}>
                {reviewsLoading ? (
                  <ActivityIndicator color={ORANGE} style={{ padding: 28 }} />
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
                      .map((r) => (
                        <ReviewCard key={r.id} review={r} C={C} />
                      ))}
                  </>
                )}

                <Pressable
                  style={[
                    s.writeReviewBtn,
                    { backgroundColor: C.card, borderColor: C.border },
                  ]}
                  onPress={() => setActiveSheet("review")}
                >
                  <Ionicons name="star-outline" size={16} color={AMBER} />
                  <Text style={[s.writeReviewText, { color: C.text }]}>
                    {myReview ? "Edit Your Review" : "Write a Stop Review"}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={C.sub} />
                </Pressable>
              </View>
            )}
          </ScrollView>

          {/* ── STICKY KAKAOMAP BOTTOM ACTION BAR: [ℹ️ Info/Schedule] + [Refresh] + [From] [To][cite: 3] ── */}
          <View
            style={[
              s.stickyFooter,
              {
                backgroundColor: C.bg,
                borderTopColor: C.border,
                paddingBottom: Math.max(insets.bottom, 12) + 64,
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  const next = activeTab === "info" ? "arrivals" : "info";
                  setActiveTab(next);
                  if (next === "info" && snapState === "peek") {
                    snapTo(HALF_Y, "half");
                  }
                }}
                style={[s.schedulePill, { backgroundColor: C.card }]}
              >
                <Ionicons
                  name={
                    activeTab === "info"
                      ? "time-outline"
                      : "information-circle-outline"
                  }
                  size={16}
                  color={BLUE}
                />
                <Text style={[s.schedulePillText, { color: C.text }]}>
                  {activeTab === "info" ? "Live Arrivals" : "Stop Info"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  loadDeparturesAndInfo();
                }}
                style={[
                  s.refreshCircle,
                  { backgroundColor: C.card, borderColor: C.border },
                ]}
              >
                <Ionicons name="refresh" size={16} color={C.text} />
              </Pressable>
            </View>

            <View style={s.fromToGroup}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({
                    pathname: "/route" as any,
                    params: {
                      fLat: String(stop.lat),
                      fLng: String(stop.lng),
                      fName: stop.name,
                    },
                  });
                }}
                style={s.fromBtn}
              >
                <Text style={s.fromToText}>From</Text>
              </Pressable>

              <Pressable
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  if (onGoToStop) {
                    setDirectionsLoading(true);
                    try {
                      await onGoToStop();
                    } finally {
                      setDirectionsLoading(false);
                    }
                  } else {
                    router.push({
                      pathname: "/route" as any,
                      params: {
                        tLat: String(stop.lat),
                        tLng: String(stop.lng),
                        tName: stop.name,
                      },
                    });
                  }
                }}
                disabled={directionsLoading}
                style={s.toBtn}
              >
                {directionsLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={s.fromToText}>To</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Mini Sheets */}
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
        onClose={() => {
          setActiveSheet(null);
          ContributionService.getStopReviews(stop.id)
            .then(setReviews)
            .catch(() => {});
        }}
        title={myReview ? `Edit Review: ${stop.name}` : `Review ${stop.name}`}
        C={C}
      >
        <ReviewSheet
          stop={stop}
          onClose={() => {
            setActiveSheet(null);
            ContributionService.getStopReviews(stop.id)
              .then(setReviews)
              .catch(() => {});
          }}
          C={C}
          existingReview={myReview}
        />
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

const s = StyleSheet.create({
  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 24,
    zIndex: 20,
    flexDirection: "column",
    overflow: "hidden",
  },
  handleWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 8 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  neighborStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  neighborPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  neighborText: {
    fontSize: 11.5,
    fontWeight: "600",
    flex: 1,
  },
  swipeHintBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
  },
  swipeHintText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingBottom: 12,
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stopName: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  platBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  platBadgeText: {
    color: "#15803D",
    fontSize: 11,
    fontWeight: "700",
  },
  stopMeta: { fontSize: 13, marginTop: 3, fontWeight: "500" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    position: "relative",
  },
  tabLabel: { fontSize: 13.5, fontWeight: "700" },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 16,
    right: 16,
    height: 2.5,
    backgroundColor: ORANGE,
    borderRadius: 2,
  },
  scrollContent: { paddingHorizontal: 18, paddingTop: 4 },
  loadingBox: {
    height: 110,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  arrivalRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  arrivalBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  modeTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modeTagText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  routeShortName: {
    fontSize: 16,
    fontWeight: "700",
  },
  routeHeadsign: {
    fontSize: 12,
    marginTop: 2,
  },
  arrivalsRightCol: {
    alignItems: "flex-end",
    gap: 2,
  },
  arrivalLine: {
    fontSize: 12.5,
  },
  arrivalRedText: {
    color: RED,
    fontWeight: "700",
  },
  suggestEditsRow: {
    paddingVertical: 12,
  },
  suggestEditsText: {
    fontSize: 13,
    fontWeight: "500",
  },
  infoCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  infoRowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  infoDesc: {
    fontSize: 12.5,
    marginTop: 2,
  },
  secHeading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  routesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  routeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  routeChipText: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  photoTile: {
    width: 115,
    height: 84,
    borderRadius: 12,
    marginRight: 10,
  },
  photoPlaceholder: {
    width: 115,
    height: 84,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  photoPlaceholderText: {
    fontSize: 11,
    color: ORANGE,
    fontWeight: "600",
  },
  quickContribRow: {
    flexDirection: "row",
    gap: 10,
  },
  contribBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  contribBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  writeReviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
  },
  writeReviewText: {
    flex: 1,
    fontWeight: "600",
    fontSize: 14,
  },
  stickyFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  schedulePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  schedulePillText: {
    fontSize: 13,
    fontWeight: "700",
  },
  refreshCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fromToGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fromBtn: {
    backgroundColor: BLUE,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
  },
  toBtn: {
    backgroundColor: ORANGE,
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 20,
    minWidth: 68,
    alignItems: "center",
  },
  fromToText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});