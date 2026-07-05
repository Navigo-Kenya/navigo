import BadgeUnlockModal from "@/components/contribution/BadgeUnlockModal";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
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
import MapView, { PROVIDER_GOOGLE, Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/authStore";
import { useContributionStore } from "@/store/contributionStore";
import { Contribution } from "@/services/contribution";
import { StopService } from "@/services/stop";
import { UnifiedLocation } from "@/store/journeyStore";

const ORANGE = "#FF6F00";
const GREEN  = "#10B981";
const RED    = "#EF4444";
const GREY   = "#8E8E93";

const { width: SCREEN_W } = Dimensions.get("window");

// ── Mapbox static thumbnail ──────────────────────────────────────────────────
function mapboxThumb(lng: number, lat: number, w = 600, h = 180): string {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${lng},${lat},15/${w}x${h}@2x?access_token=${token}`;
}

// ── Color factory ────────────────────────────────────────────────────────────
function makeC(dark: boolean) {
  return {
    bg:       dark ? "#0F0F0F" : "#FFFFFF",
    card:     dark ? "#1C1C1E" : "#F6F7F8",
    text:     dark ? "#FFFFFF" : "#1C1C1E",
    sub:      dark ? GREY      : "#6B7280",
    hairline: dark ? "#2C2C2E" : "#E5E7EB",
    border:   dark ? "#3A3A3C" : "#E5E7EB",
    input:    dark ? "#2C2C2E" : "#F3F4F6",
    pressed:  dark ? "#2C2C2E" : "#F2F2F7",
    sheetBg:  dark ? "#1C1C1E" : "#FFFFFF",
    pill:     dark ? "rgba(255,111,0,0.18)" : "#FFF3E0",
  };
}

// ── StopSearchInput ──────────────────────────────────────────────────────────
function StopSearchInput({
  value,
  onChange,
  placeholder = "Search stops…",
  C,
}: {
  value: UnifiedLocation | null;
  onChange: (stop: UnifiedLocation | null) => void;
  placeholder?: string;
  C: ReturnType<typeof makeC>;
}) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<UnifiedLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await StopService.searchStops(query);
        setResults(res.slice(0, 5));
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  if (value !== null) {
    return (
      <View style={[ssi.chip, { backgroundColor: C.input, borderColor: C.border }]}>
        <Ionicons name="bus-outline" size={16} color={ORANGE} />
        <Text style={[ssi.chipText, { color: C.text }]} numberOfLines={1}>{value.name}</Text>
        <Pressable onPress={() => onChange(null)} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={C.sub} />
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <View style={[ssi.inputRow, { backgroundColor: C.input, borderColor: C.border }]}>
        <Ionicons name="search-outline" size={16} color={C.sub} />
        <TextInput
          style={[ssi.textInput, { color: C.text }]}
          placeholder={placeholder}
          placeholderTextColor={C.sub}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
        {loading && <ActivityIndicator size="small" color={ORANGE} />}
      </View>

      {open && (
        <View style={[ssi.dropdown, { backgroundColor: C.sheetBg, borderColor: C.border }]}>
          {loading && results.length === 0 ? (
            <View style={ssi.dropRow}>
              <ActivityIndicator size="small" color={ORANGE} />
            </View>
          ) : results.length === 0 ? (
            <View style={ssi.dropRow}>
              <Text style={[ssi.noResults, { color: C.sub }]}>No stops found</Text>
            </View>
          ) : (
            results.map((stop) => (
              <Pressable
                key={stop.id}
                style={({ pressed }) => [ssi.dropRow, pressed && { backgroundColor: C.pressed }]}
                onPress={() => { onChange(stop); setQuery(""); setOpen(false); }}
              >
                <Ionicons name="bus-outline" size={15} color={ORANGE} />
                <View style={{ flex: 1 }}>
                  <Text style={[ssi.dropName, { color: C.text }]} numberOfLines={1}>{stop.name}</Text>
                  {stop.route_nams ? (
                    <Text style={[ssi.dropRoutes, { color: C.sub }]} numberOfLines={1}>{stop.route_nams}</Text>
                  ) : null}
                </View>
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  );
}

const ssi = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  chipText: { flex: 1, fontSize: 15, fontWeight: "500" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  textInput: { flex: 1, fontSize: 15 },
  dropdown: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  dropRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropName:   { fontSize: 14, fontWeight: "500" },
  dropRoutes: { fontSize: 12, marginTop: 1 },
  noResults:  { fontSize: 14, fontStyle: "italic" },
});

// ── LocationPickerModal ──────────────────────────────────────────────────────
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
  const insets     = useSafeAreaInsets();
  const mapRef     = useRef<MapView>(null);
  const centerRef  = useRef({ lat: initialLat, lng: initialLng });
  const [displayCoords, setDisplayCoords] = useState({ lat: initialLat, lng: initialLng });
  const [gpsLoading, setGpsLoading]       = useState(false);

  const onRegionChangeComplete = (r: Region) => {
    centerRef.current = { lat: r.latitude, lng: r.longitude };
    setDisplayCoords({ lat: r.latitude, lng: r.longitude });
  };

  const handleMyLocation = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Enable location in Settings.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      mapRef.current?.animateToRegion(
        { latitude, longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 },
        500,
      );
      centerRef.current = { lat: latitude, lng: longitude };
      setDisplayCoords({ lat: latitude, lng: longitude });
    } catch {
      Alert.alert("Error", "Could not get your location.");
    } finally {
      setGpsLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude:      initialLat,
            longitude:     initialLng,
            latitudeDelta:  0.01,
            longitudeDelta: 0.01,
          }}
          onRegionChangeComplete={onRegionChangeComplete}
          showsUserLocation
          showsMyLocationButton={false}
        />

        {/* Centered pin, pointer-events none so map panning works */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, lpm.pinContainer]}>
          <Ionicons name="location" size={44} color={ORANGE} style={{ marginBottom: -4 }} />
          <View style={lpm.pinShadow} />
        </View>

        {/* Top bar */}
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

        {/* Bottom card */}
        <View style={[lpm.bottomCard, { paddingBottom: insets.bottom + 16 }]}>
          <View style={lpm.coordChip}>
            <Ionicons name="location-outline" size={14} color={GREY} />
            <Text style={lpm.coordText}>
              {displayCoords.lat.toFixed(5)}, {displayCoords.lng.toFixed(5)}
            </Text>
          </View>
          <Pressable
            style={lpm.confirmBtn}
            onPress={() => { onConfirm(centerRef.current); onClose(); }}
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

// ── Sheet backdrop + slide-up container ──────────────────────────────────────
function BottomSheet({
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
  const slideAnim = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      slideAnim.setValue(500);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
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
          <View style={sh.backdrop} />
        </TouchableWithoutFeedback>
        <Animated.View
          style={[sh.sheet, { backgroundColor: C.sheetBg, transform: [{ translateY: slideAnim }] }]}
        >
          <View style={sh.sheetHandle} />
          <View style={sh.sheetHeader}>
            <Text style={[sh.sheetTitle, { color: C.text }]}>{title}</Text>
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

type BadgeUnlockCb = (pts: number, badges: string[], streak?: number) => void;

// ── Delay Report Sheet ───────────────────────────────────────────────────────
function DelayReportSheet({
  visible,
  onClose,
  onBadgeUnlock,
  C,
}: {
  visible: boolean;
  onClose: () => void;
  onBadgeUnlock: BadgeUnlockCb;
  C: ReturnType<typeof makeC>;
}) {
  const [selectedStop, setSelectedStop] = useState<UnifiedLocation | null>(null);
  const [severity, setSeverity]         = useState<"minor" | "major" | "cancelled">("minor");
  const [note, setNote]                 = useState("");
  const [loading, setLoading]           = useState(false);
  const { submit } = useContributionStore();

  const SEVERITIES: { key: "minor" | "major" | "cancelled"; label: string; color: string }[] = [
    { key: "minor",     label: "Minor",     color: "#F59E0B" },
    { key: "major",     label: "Major",     color: RED       },
    { key: "cancelled", label: "Cancelled", color: "#6B7280" },
  ];

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const result = await submit({
        type: "delay_report",
        stop_id: selectedStop?.id ?? undefined,
        data: { severity, note: note.trim() || undefined },
      });
      onClose();
      setNote(""); setSeverity("minor"); setSelectedStop(null);
      if (result.points_awarded > 0 || result.new_badges.length > 0) {
        onBadgeUnlock(result.points_awarded, result.new_badges, result.streak_days);
      }
    } catch {
      Alert.alert("Error", "Could not submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Report a Delay" C={C}>
      <ScrollView contentContainerStyle={sh.sheetBody} keyboardShouldPersistTaps="handled">
        <Text style={[sh.fieldLabel, { color: C.sub }]}>STOP (OPTIONAL)</Text>
        <StopSearchInput
          value={selectedStop}
          onChange={setSelectedStop}
          placeholder="Which stop had the delay?"
          C={C}
        />

        <Text style={[sh.fieldLabel, { color: C.sub, marginTop: 20 }]}>SEVERITY</Text>
        <View style={sh.pillRow}>
          {SEVERITIES.map((sv) => (
            <Pressable
              key={sv.key}
              onPress={() => setSeverity(sv.key)}
              style={[
                sh.severityPill,
                { borderColor: severity === sv.key ? sv.color : C.border },
                severity === sv.key && { backgroundColor: sv.color + "18" },
              ]}
            >
              <Text style={[sh.severityText, { color: severity === sv.key ? sv.color : C.sub }]}>
                {sv.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[sh.fieldLabel, { color: C.sub, marginTop: 20 }]}>NOTE (OPTIONAL)</Text>
        <TextInput
          style={[sh.textArea, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
          placeholder="E.g. Route 23 stuck near Globe Roundabout…"
          placeholderTextColor={C.sub}
          multiline
          numberOfLines={3}
          value={note}
          onChangeText={setNote}
          maxLength={300}
        />

        <Text style={[sh.pointsHint, { color: C.sub }]}>Awards +3 Safiri Points immediately</Text>

        <Pressable
          style={[sh.submitBtn, loading && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={sh.submitText}>Submit Report</Text>
          )}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

// ── Stop Review Sheet ────────────────────────────────────────────────────────
function StopReviewSheet({
  visible,
  onClose,
  onBadgeUnlock,
  C,
}: {
  visible: boolean;
  onClose: () => void;
  onBadgeUnlock: BadgeUnlockCb;
  C: ReturnType<typeof makeC>;
}) {
  const [selectedStop, setSelectedStop] = useState<UnifiedLocation | null>(null);
  const [safety, setSafety]             = useState(0);
  const [comfort, setComfort]           = useState(0);
  const [cleanliness, setCleanliness]   = useState(0);
  const [reviewText, setReviewText]     = useState("");
  const [loading, setLoading]           = useState(false);
  const { submit } = useContributionStore();

  const StarRow = ({
    label,
    value,
    onSet,
  }: {
    label: string;
    value: number;
    onSet: (n: number) => void;
  }) => (
    <View style={sh.starRow}>
      <Text style={[sh.starLabel, { color: C.text }]}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => onSet(n)} hitSlop={6}>
            <Ionicons
              name={n <= value ? "star" : "star-outline"}
              size={26}
              color={n <= value ? "#F59E0B" : C.sub}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );

  const handleSubmit = async () => {
    if (!selectedStop) {
      Alert.alert("Select a stop", "Please search for and select the stop you are reviewing.");
      return;
    }
    if (!safety || !comfort || !cleanliness) {
      Alert.alert("Rate all categories", "Please give a rating for Safety, Comfort, and Cleanliness.");
      return;
    }
    setLoading(true);
    try {
      const result = await submit({
        type: "stop_review",
        stop_id: selectedStop.id,
        title: selectedStop.name,
        data: { safety, comfort, cleanliness, text: reviewText.trim() || undefined },
      });
      onClose();
      setSafety(0); setComfort(0); setCleanliness(0); setSelectedStop(null); setReviewText("");
      if (result.points_awarded > 0 || result.new_badges.length > 0) {
        onBadgeUnlock(result.points_awarded, result.new_badges, result.streak_days);
      }
    } catch {
      Alert.alert("Error", "Could not submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Review a Stop" C={C}>
      <ScrollView contentContainerStyle={sh.sheetBody} keyboardShouldPersistTaps="handled">
        <Text style={[sh.fieldLabel, { color: C.sub }]}>STOP</Text>
        <StopSearchInput
          value={selectedStop}
          onChange={setSelectedStop}
          placeholder="Search for the stop…"
          C={C}
        />
        {selectedStop?.route_nams ? (
          <View style={[sh.routeHint, { borderColor: C.border }]}>
            <Ionicons name="bus-outline" size={12} color={C.sub} />
            <Text style={[sh.routeHintText, { color: C.sub }]} numberOfLines={1}>
              {selectedStop.route_nams}
            </Text>
          </View>
        ) : null}

        <Text style={[sh.fieldLabel, { color: C.sub, marginTop: 20 }]}>RATINGS</Text>
        <View style={[sh.ratingsCard, { backgroundColor: C.input, borderColor: C.border }]}>
          <StarRow label="Safety"      value={safety}      onSet={setSafety}      />
          <View style={[sh.divider, { backgroundColor: C.hairline }]} />
          <StarRow label="Comfort"     value={comfort}     onSet={setComfort}     />
          <View style={[sh.divider, { backgroundColor: C.hairline }]} />
          <StarRow label="Cleanliness" value={cleanliness} onSet={setCleanliness} />
        </View>

        <Text style={[sh.fieldLabel, { color: C.sub, marginTop: 20 }]}>REVIEW (OPTIONAL)</Text>
        <TextInput
          style={[sh.textArea, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
          placeholder="Share your experience at this stop…"
          placeholderTextColor={C.sub}
          multiline
          numberOfLines={3}
          value={reviewText}
          onChangeText={setReviewText}
          maxLength={500}
        />

        <Text style={[sh.pointsHint, { color: C.sub }]}>Awards +10 Safiri Points immediately</Text>

        <Pressable
          style={[sh.submitBtn, loading && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={sh.submitText}>Submit Review</Text>
          )}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

// ── Stop Edit Sheet ──────────────────────────────────────────────────────────
function StopEditSheet({
  visible,
  onClose,
  onBadgeUnlock,
  C,
}: {
  visible: boolean;
  onClose: () => void;
  onBadgeUnlock: BadgeUnlockCb;
  C: ReturnType<typeof makeC>;
}) {
  const [selectedStop, setSelectedStop]       = useState<UnifiedLocation | null>(null);
  const [field, setField]                     = useState<"name" | "location" | "routes" | "landmark">("name");
  const [currentVal, setCurrentVal]           = useState("");
  const [proposedVal, setProposedVal]         = useState("");
  const [editNote, setEditNote]               = useState("");
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [loading, setLoading]                 = useState(false);
  const { submit } = useContributionStore();

  const FIELDS: { key: "name" | "location" | "routes" | "landmark"; label: string }[] = [
    { key: "name",     label: "Name"     },
    { key: "location", label: "Location" },
    { key: "routes",   label: "Routes"   },
    { key: "landmark", label: "Landmark" },
  ];

  useEffect(() => {
    if (!selectedStop) { setCurrentVal(""); return; }
    switch (field) {
      case "name":     setCurrentVal(selectedStop.name); break;
      case "location": setCurrentVal(`${selectedStop.lat.toFixed(5)}, ${selectedStop.lng.toFixed(5)}`); break;
      case "routes":   setCurrentVal(selectedStop.route_nams ?? ""); break;
      case "landmark": setCurrentVal(""); break;
    }
  }, [selectedStop, field]);

  const handleSubmit = async () => {
    if (!selectedStop) {
      Alert.alert("Select a stop", "Please search for and select the stop you want to edit.");
      return;
    }
    if (!proposedVal.trim()) {
      Alert.alert("Missing info", "Please enter a proposed value.");
      return;
    }
    setLoading(true);
    try {
      await submit({
        type: "stop_edit",
        stop_id: selectedStop.id,
        title: `${selectedStop.name} – ${field}`,
        data: {
          field,
          current_value:  currentVal.trim()  || undefined,
          proposed_value: proposedVal.trim(),
          note:           editNote.trim()     || undefined,
        },
      });
      onClose();
      setSelectedStop(null); setCurrentVal(""); setProposedVal(""); setEditNote("");
      setField("name"); setLocationPickerVisible(false);
      Alert.alert("Submitted", "Your edit has been submitted for review.");
    } catch {
      Alert.alert("Error", "Could not submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title="Edit Stop Info" C={C}>
        <ScrollView contentContainerStyle={sh.sheetBody} keyboardShouldPersistTaps="handled">
          <Text style={[sh.fieldLabel, { color: C.sub }]}>STOP</Text>
          <StopSearchInput
            value={selectedStop}
            onChange={(s) => { setSelectedStop(s); setProposedVal(""); }}
            placeholder="Search for the stop to edit…"
            C={C}
          />

          <Text style={[sh.fieldLabel, { color: C.sub, marginTop: 20 }]}>WHAT TO EDIT</Text>
          <View style={sh.pillRow}>
            {FIELDS.map((f) => (
              <Pressable
                key={f.key}
                onPress={() => setField(f.key)}
                style={[
                  sh.severityPill,
                  { borderColor: field === f.key ? ORANGE : C.border },
                  field === f.key && { backgroundColor: ORANGE + "18" },
                ]}
              >
                <Text style={[sh.severityText, { color: field === f.key ? ORANGE : C.sub }]}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[sh.fieldLabel, { color: C.sub, marginTop: 20 }]}>CURRENT VALUE</Text>
          <TextInput
            style={[sh.input, { backgroundColor: C.input, color: C.text, borderColor: C.border, opacity: 0.65 }]}
            value={currentVal}
            editable={false}
            placeholder="Auto-filled when stop is selected"
            placeholderTextColor={C.sub}
          />

          <Text style={[sh.fieldLabel, { color: C.sub, marginTop: 12 }]}>PROPOSED VALUE</Text>
          <TextInput
            style={[sh.input, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
            placeholder={field === "landmark" ? "E.g. in front of Hilton Hotel…" : "What it should say…"}
            placeholderTextColor={C.sub}
            value={proposedVal}
            onChangeText={setProposedVal}
          />
          {field === "landmark" && (
            <Text style={[sh.pointsHint, { color: C.sub, marginTop: 0, marginBottom: 0, textAlign: "left", fontSize: 12 }]}>
              A nearby landmark helps riders find the boarding point (e.g. "in front of Hilton")
            </Text>
          )}

          {field === "location" && (
            <Pressable
              style={[sh.mapPickBtn, { borderColor: ORANGE }]}
              onPress={() => setLocationPickerVisible(true)}
            >
              <Ionicons name="map-outline" size={15} color={ORANGE} />
              <Text style={[sh.mapPickBtnText, { color: ORANGE }]}>Pick on Map</Text>
            </Pressable>
          )}

          <Text style={[sh.fieldLabel, { color: C.sub, marginTop: 12 }]}>NOTE (OPTIONAL)</Text>
          <TextInput
            style={[sh.textArea, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
            placeholder="Any additional context…"
            placeholderTextColor={C.sub}
            multiline
            numberOfLines={2}
            value={editNote}
            onChangeText={setEditNote}
            maxLength={300}
          />

          <Text style={[sh.pointsHint, { color: C.sub }]}>Awards +15 Safiri Points if approved</Text>

          <Pressable
            style={[sh.submitBtn, loading && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={sh.submitText}>Submit Edit</Text>
            )}
          </Pressable>
        </ScrollView>
      </BottomSheet>

      <LocationPickerModal
        visible={locationPickerVisible}
        onClose={() => setLocationPickerVisible(false)}
        onConfirm={(loc) => setProposedVal(`${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`)}
        initialLat={selectedStop?.lat ?? -1.2921}
        initialLng={selectedStop?.lng ?? 36.8219}
      />
    </>
  );
}

// ── New Stop Sheet ───────────────────────────────────────────────────────────
function NewStopSheet({
  visible,
  onClose,
  C,
}: {
  visible: boolean;
  onClose: () => void;
  C: ReturnType<typeof makeC>;
}) {
  const [stopName, setStopName]   = useState("");
  const [stopType, setStopType]   = useState<"bus_stop" | "stage" | "station">("bus_stop");
  const [coords, setCoords]       = useState<{ lat: number; lng: number } | null>(null);
  const [routes, setRoutes]       = useState("");
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [loading, setLoading]     = useState(false);
  const { submit } = useContributionStore();

  const TYPES: { key: "bus_stop" | "stage" | "station"; label: string }[] = [
    { key: "bus_stop", label: "Bus stop" },
    { key: "stage",    label: "Stage"    },
    { key: "station",  label: "Station"  },
  ];

  const handleUseMyLocation = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Enable location in Settings.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      Alert.alert("Error", "Could not get your location.");
    } finally {
      setGpsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!stopName.trim() || !coords) {
      Alert.alert("Missing info", "Please enter a stop name and set the location.");
      return;
    }
    setLoading(true);
    try {
      await submit({
        type: "new_stop",
        title: `New stop: ${stopName.trim()}`,
        data: {
          lat: coords.lat,
          lng: coords.lng,
          name: stopName.trim(),
          stop_type: stopType,
          routes: routes.trim() || undefined,
        },
      });
      onClose();
      setStopName(""); setCoords(null); setStopType("bus_stop");
      setRoutes(""); setLocationPickerVisible(false);
      Alert.alert("Submitted", "Your new stop suggestion is under review. If approved, you'll earn +50 Safiri Points.");
    } catch {
      Alert.alert("Error", "Could not submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title="Suggest a New Stop" C={C}>
        <ScrollView contentContainerStyle={sh.sheetBody} keyboardShouldPersistTaps="handled">
          <Text style={[sh.fieldLabel, { color: C.sub }]}>STOP NAME</Text>
          <TextInput
            style={[sh.input, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
            placeholder="E.g. New Westlands Junction…"
            placeholderTextColor={C.sub}
            value={stopName}
            onChangeText={setStopName}
          />

          <Text style={[sh.fieldLabel, { color: C.sub, marginTop: 20 }]}>STOP TYPE</Text>
          <View style={sh.pillRow}>
            {TYPES.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => setStopType(t.key)}
                style={[
                  sh.severityPill,
                  { borderColor: stopType === t.key ? GREEN : C.border },
                  stopType === t.key && { backgroundColor: GREEN + "18" },
                ]}
              >
                <Text style={[sh.severityText, { color: stopType === t.key ? GREEN : C.sub }]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[sh.fieldLabel, { color: C.sub, marginTop: 20 }]}>LOCATION</Text>

          {/* Location preview card */}
          <View style={[sh.locationCard, { backgroundColor: C.input, borderColor: C.border }]}>
            {coords ? (
              <>
                <Image
                  source={{ uri: mapboxThumb(coords.lng, coords.lat) }}
                  style={sh.locationThumb}
                  contentFit="cover"
                />
                <View style={sh.coordChipRow}>
                  <Ionicons name="location" size={13} color={ORANGE} />
                  <Text style={[sh.coordText, { color: C.text }]}>
                    {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                  </Text>
                  <Pressable onPress={() => setCoords(null)} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={C.sub} />
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={[sh.locationEmpty, { color: C.sub }]}>No location set</Text>
            )}
          </View>

          {/* GPS + Map picker buttons */}
          <View style={[sh.pillRow, { marginTop: 10 }]}>
            <Pressable
              style={[sh.locationBtn, { borderColor: C.border, backgroundColor: C.input }]}
              onPress={handleUseMyLocation}
              disabled={gpsLoading}
            >
              {gpsLoading
                ? <ActivityIndicator size="small" color={ORANGE} />
                : <Ionicons name="locate-outline" size={16} color={C.text} />}
              <Text style={[sh.locationBtnText, { color: C.text }]}>My Location</Text>
            </Pressable>
            <Pressable
              style={[sh.locationBtn, { borderColor: C.border, backgroundColor: C.input }]}
              onPress={() => setLocationPickerVisible(true)}
            >
              <Ionicons name="map-outline" size={16} color={C.text} />
              <Text style={[sh.locationBtnText, { color: C.text }]}>Pick on Map</Text>
            </Pressable>
          </View>

          <Text style={[sh.fieldLabel, { color: C.sub, marginTop: 20 }]}>ROUTES SERVED (OPTIONAL)</Text>
          <TextInput
            style={[sh.textArea, { backgroundColor: C.input, color: C.text, borderColor: C.border }]}
            placeholder="E.g. 23, 58, 125A"
            placeholderTextColor={C.sub}
            multiline
            numberOfLines={2}
            value={routes}
            onChangeText={setRoutes}
            maxLength={200}
          />

          <Text style={[sh.pointsHint, { color: C.sub }]}>Awards +50 Safiri Points if approved</Text>

          <Pressable
            style={[sh.submitBtn, { backgroundColor: GREEN }, loading && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={sh.submitText}>Submit New Stop</Text>
            )}
          </Pressable>
        </ScrollView>
      </BottomSheet>

      <LocationPickerModal
        visible={locationPickerVisible}
        onClose={() => setLocationPickerVisible(false)}
        onConfirm={(loc) => setCoords(loc)}
        initialLat={coords?.lat ?? -1.2921}
        initialLng={coords?.lng ?? 36.8219}
      />
    </>
  );
}

// ── Contribution type helpers ────────────────────────────────────────────────
function typeIcon(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "delay_report":     return "time-outline";
    case "stop_review":      return "chatbubbles-outline";
    case "stop_photo":       return "camera-outline";
    case "stop_edit":        return "create-outline";
    case "route_correction": return "git-merge-outline";
    case "new_stop":         return "location-outline";
    default:                 return "ellipse-outline";
  }
}

function typeColor(type: string): string {
  switch (type) {
    case "delay_report":     return RED;
    case "stop_review":      return ORANGE;
    case "stop_photo":       return ORANGE;
    case "stop_edit":        return ORANGE;
    case "route_correction": return ORANGE;
    case "new_stop":         return GREEN;
    default:                 return GREY;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "approved":      return GREEN;
    case "auto_approved": return GREEN;
    case "rejected":      return RED;
    default:              return "#F59E0B";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "approved":      return "Approved";
    case "auto_approved": return "Approved";
    case "rejected":      return "Rejected";
    default:              return "Pending";
  }
}

function relativeTime(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ── Schedule a 19:00 streak-preservation local notification (opt-in, one/day)
async function scheduleStreakReminder() {
  try {
    const now = new Date();
    const fire = new Date(now);
    fire.setHours(19, 0, 0, 0);
    if (fire <= now) return; // already past 19:00 today
    // Cancel any existing one before scheduling (idempotent)
    await Notifications.cancelScheduledNotificationAsync("streak-reminder").catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: "streak-reminder",
      content: {
        title: "🔥 Don't lose your streak!",
        body: "Contribute before midnight to keep your streak alive.",
        sound: true,
        data: { screen: "/(tabs)/contribution" },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire },
    });
  } catch {
    // Notifications not available — streak feature still works without reminder.
  }
}

// ── ContributionRow ──────────────────────────────────────────────────────────
function ContributionRow({
  item,
  C,
  onLongPress,
}: {
  item: Contribution;
  C: ReturnType<typeof makeC>;
  onLongPress?: () => void;
}) {
  const color = typeColor(item.type);
  const sc    = statusColor(item.status);

  return (
    <Pressable
      onLongPress={onLongPress}
      style={({ pressed }) => [
        s.contribRow,
        { borderBottomColor: C.hairline, backgroundColor: pressed ? C.pressed : "transparent" },
      ]}
    >
      <View style={[s.contribIcon, { backgroundColor: color + "18" }]}>
        <Ionicons name={typeIcon(item.type)} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.contribTitle, { color: C.text }]} numberOfLines={1}>
          {item.title ?? item.type.replace(/_/g, " ")}
        </Text>
        <View style={s.contribMeta}>
          <View style={[s.statusDot, { backgroundColor: sc }]} />
          <Text style={[s.contribSub, { color: C.sub }]}>
            {statusLabel(item.status)}
            {item.points_awarded > 0 ? ` · +${item.points_awarded} pts` : ""}
            {" · "}{relativeTime(item.created_at)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ── MAIN SCREEN ──────────────────────────────────────────────────────────────
type ActiveSheet = "delay" | "review" | "edit" | "new_stop" | null;

const QUICK_ACTIONS: {
  id: ActiveSheet | "photo";
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  { id: "photo",    label: "Add Photo",    icon: "camera-outline",  color: ORANGE },
  { id: "delay",    label: "Report Delay", icon: "time-outline",    color: RED    },
  { id: "review",   label: "Review Stop",  icon: "star-outline",    color: ORANGE },
  { id: "edit",     label: "Edit Info",    icon: "create-outline",  color: ORANGE },
  { id: "new_stop", label: "New Stop",     icon: "location-outline", color: GREEN },
];

export default function ContributionScreen() {
  const insets = useRef(useSafeAreaInsets()).current;
  const dark   = useColorScheme() === "dark";
  const C      = makeC(dark);
  const router = useRouter();
  const { user, avatarTs } = useAuthStore();

  const {
    contributions,
    stats,
    badges,
    loaded,
    fetch: fetchStore,
    refresh: refreshStore,
    removeContribution,
  } = useContributionStore();

  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [refreshing, setRefreshing]   = useState(false);
  const [badgeModal, setBadgeModal]   = useState<{
    visible: boolean; pointsAwarded: number; badges: string[]; streakDays?: number;
  }>({ visible: false, pointsAwarded: 0, badges: [] });

  useEffect(() => {
    fetchStore().catch(() => {});
  }, [fetchStore]);

  // Schedule 19:00 reminder only when the user has an active streak and hasn't
  // contributed today — purely advisory, dismissed if they contribute before then.
  useEffect(() => {
    if (stats && stats.streak_days > 0 && !stats.contributed_today) {
      scheduleStreakReminder();
    }
  }, [stats?.streak_days, stats?.contributed_today]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshStore().catch(() => {});
    setRefreshing(false);
  };

  const handleActionPress = (id: ActiveSheet | "photo") => {
    if (id === "photo") {
      router.push("/(account)/add-photo" as any);
      return;
    }
    setActiveSheet(id as ActiveSheet);
  };

  const handleLongPress = (item: Contribution) => {
    if (item.status !== "pending") return;
    Alert.alert("Delete submission", "Remove this pending submission?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => removeContribution(item.id).catch(() => Alert.alert("Error", "Could not delete.")),
      },
    ]);
  };

  const levelPoints = stats?.points ?? 0;
  const toNext      = stats?.points_to_next_level ?? 1;
  const level       = stats?.level ?? 1;

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const recentContribs = contributions.slice(0, 5);
  const earnedBadges   = badges.earned.slice(0, 4);

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: 0, backgroundColor: C.bg }]}>
        <Text style={[s.headerTitle, { color: C.text }]}>Contribute</Text>
        <Pressable onPress={handleRefresh} hitSlop={12}>
          <Ionicons name="refresh-outline" size={22} color={C.sub} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 50 }}
      >
        {/* ── Level Card ── */}
        <View style={[s.levelCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={s.levelCardTop}>
            {user?.avatar ? (
              <Image source={{ uri: `${user.avatar}?_v=${avatarTs}` }} style={s.avatar} contentFit="cover" />
            ) : (
              <View style={[s.avatar, { backgroundColor: ORANGE, justifyContent: "center", alignItems: "center" }]}>
                <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 18 }}>{initials}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[s.levelLabel, { color: C.text }]}>{stats?.level_label ?? "Commuter"}</Text>
                {(stats?.streak_days ?? 0) > 0 && (
                  <View style={[s.streakPill, { backgroundColor: ORANGE + "18" }]}>
                    <Text style={s.streakFlame}>🔥</Text>
                    <Text style={[s.streakCount, { color: ORANGE }]}>{stats!.streak_days}</Text>
                  </View>
                )}
              </View>
              <Text style={[s.levelSub, { color: C.sub }]}>
                Level {stats?.level ?? 1} · {levelPoints} pts
              </Text>
            </View>
            <Pressable
              onPress={() => router.push("/(account)/badges" as any)}
              style={[s.badgesBtn, { backgroundColor: ORANGE + "18" }]}
            >
              <Text style={s.badgesBtnText}>Badges</Text>
              <Ionicons name="chevron-forward" size={14} color={ORANGE} />
            </Pressable>
          </View>

          {/* Level track */}
          <View style={s.levelTrack}>
            {[1, 2, 3, 4, 5, 6, 7].map((lvl, i) => {
              const isCurrent = level === lvl;
              const isPast    = lvl < level;
              const dotSize   = isCurrent ? 20 : 12;
              const dotColor  = isPast || isCurrent ? ORANGE : C.input;
              return (
                <React.Fragment key={lvl}>
                  {i > 0 && (
                    <View style={[s.levelLine, { backgroundColor: lvl <= level ? ORANGE : C.input }]} />
                  )}
                  <View
                    style={[
                      s.levelDot,
                      {
                        width: dotSize, height: dotSize, borderRadius: dotSize / 2,
                        backgroundColor: dotColor,
                        borderWidth: isCurrent ? 3 : 0,
                        borderColor: ORANGE + "40",
                      },
                    ]}
                  />
                </React.Fragment>
              );
            })}
          </View>
          {toNext > 0 ? (
            <Text style={[s.progressHint, { color: C.sub }]}>
              {toNext} pts to {stats?.next_level_label ?? "next level"}
            </Text>
          ) : (
            <Text style={[s.progressHint, { color: GREEN }]}>Max level, Community Elder!</Text>
          )}
        </View>

        {/* ── Quick Actions ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.actionsRow}
        >
          {QUICK_ACTIONS.map((action) => (
            <Pressable
              key={action.id}
              style={s.actionItem}
              onPress={() => handleActionPress(action.id as any)}
            >
              <View style={[s.actionCircle, { backgroundColor: action.color + "18", borderColor: action.color + "30" }]}>
                <Ionicons name={action.icon} size={24} color={action.color} />
              </View>
              <Text style={[s.actionLabel, { color: C.sub }]}>{action.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ── Recent Submissions ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={[s.sectionTitle, { color: C.text }]}>Your Submissions</Text>
            {contributions.length > 5 && (
              <Pressable onPress={() => router.push("/(account)/submissions" as any)}>
                <Text style={s.seeAll}>See all</Text>
              </Pressable>
            )}
          </View>
          <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
            {!loaded ? (
              <ActivityIndicator color={ORANGE} style={{ padding: 24 }} />
            ) : recentContribs.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="leaf-outline" size={36} color={C.sub} />
                <Text style={[s.emptyText, { color: C.sub }]}>No submissions yet</Text>
                <Text style={[s.emptySub, { color: C.sub }]}>
                  Use the quick actions above to start contributing.
                </Text>
              </View>
            ) : (
              recentContribs.map((item) => (
                <ContributionRow
                  key={item.id}
                  item={item}
                  C={C}
                  onLongPress={() => handleLongPress(item)}
                />
              ))
            )}
          </View>
        </View>

        {/* ── Stats row ── */}
        {stats && (
          <View style={s.statsRow}>
            <View style={[s.statCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[s.statNum, { color: C.text }]}>{stats.submissions_count}</Text>
              <Text style={[s.statLbl, { color: C.sub }]}>Submissions</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[s.statNum, { color: C.text }]}>{stats.points}</Text>
              <Text style={[s.statLbl, { color: C.sub }]}>Safiri Points</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[s.statNum, { color: C.text }]}>{stats.badges_count}</Text>
              <Text style={[s.statLbl, { color: C.sub }]}>Badges</Text>
            </View>
          </View>
        )}

        {/* ── Badges preview ── */}
        {earnedBadges.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={[s.sectionTitle, { color: C.text }]}>Your Badges</Text>
              <Pressable onPress={() => router.push("/(account)/badges" as any)}>
                <Text style={s.seeAll}>View all</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.badgesRow}>
              {earnedBadges.map((b) => (
                <View key={b.slug} style={[s.badgeItem, { backgroundColor: C.card, borderColor: C.border }]}>
                  <View style={[s.badgeCircle, { backgroundColor: b.color + "22" }]}>
                    <Ionicons name={b.icon as any} size={22} color={b.color} />
                  </View>
                  <Text style={[s.badgeName, { color: C.text }]} numberOfLines={2}>{b.name}</Text>
                </View>
              ))}
              {badges.locked.length > 0 && (
                <Pressable
                  style={[s.badgeItem, s.badgeMore, { backgroundColor: C.input, borderColor: C.border }]}
                  onPress={() => router.push("/(account)/badges" as any)}
                >
                  <Text style={[s.badgeMoreText, { color: C.sub }]}>+{badges.locked.length}</Text>
                  <Text style={[s.badgeMoreSub, { color: C.sub }]}>locked</Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        )}

        {/* ── Leaderboard CTA ── */}
        <Pressable
          style={[s.leaderboardCta, { backgroundColor: ORANGE }]}
          onPress={() => router.push("/(account)/leaderboard" as any)}
        >
          <Ionicons name="trophy-outline" size={20} color="#FFF" />
          <Text style={s.leaderboardCtaText}>Community Leaderboard</Text>
          <Ionicons name="chevron-forward" size={18} color="#FFF" />
        </Pressable>
      </ScrollView>

      {/* ── Action Sheets ── */}
      <DelayReportSheet
        visible={activeSheet === "delay"}
        onClose={() => setActiveSheet(null)}
        onBadgeUnlock={(pts, badges, streak) =>
          setBadgeModal({ visible: true, pointsAwarded: pts, badges, streakDays: streak })
        }
        C={C}
      />
      <StopReviewSheet
        visible={activeSheet === "review"}
        onClose={() => setActiveSheet(null)}
        onBadgeUnlock={(pts, badges, streak) =>
          setBadgeModal({ visible: true, pointsAwarded: pts, badges, streakDays: streak })
        }
        C={C}
      />
      <StopEditSheet
        visible={activeSheet === "edit"}
        onClose={() => setActiveSheet(null)}
        onBadgeUnlock={(pts, badges, streak) =>
          setBadgeModal({ visible: true, pointsAwarded: pts, badges, streakDays: streak })
        }
        C={C}
      />
      <NewStopSheet visible={activeSheet === "new_stop"} onClose={() => setActiveSheet(null)} C={C} />

      <BadgeUnlockModal
        visible={badgeModal.visible}
        onDismiss={() => setBadgeModal((p) => ({ ...p, visible: false }))}
        pointsAwarded={badgeModal.pointsAwarded}
        badges={badgeModal.badges}
        streakDays={badgeModal.streakDays}
      />
    </View>
  );
}

// ── Sheet styles ─────────────────────────────────────────────────────────────
const sh = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: "90%",
  },
  sheetHandle: {
    width:  36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#C7C7CC",
    alignSelf: "center",
    marginTop:    12,
    marginBottom:  4,
  },
  sheetHeader: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical:   14,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700" },
  sheetBody:  { paddingHorizontal: 20, paddingBottom: 24 },

  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 8 },
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
    minHeight: 80,
    textAlignVertical: "top",
  },
  pillRow:      { flexDirection: "row", gap: 10 },
  severityPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
  },
  severityText: { fontWeight: "600", fontSize: 14 },

  ratingsCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  starRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  starLabel: { fontSize: 15, fontWeight: "500" },
  divider:   { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },

  routeHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  routeHintText: { fontSize: 12, flex: 1 },

  mapPickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
  },
  mapPickBtnText: { fontWeight: "600", fontSize: 13 },

  locationCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  locationThumb:  { width: "100%", height: 120 },
  locationEmpty:  { fontSize: 14, paddingVertical: 20 },
  coordChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  coordText:      { fontSize: 13, fontWeight: "500", flex: 1 },
  locationBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  locationBtnText: { fontWeight: "600", fontSize: 13 },

  pointsHint: { fontSize: 13, marginTop: 16, marginBottom: 8, textAlign: "center" },
  submitBtn: {
    backgroundColor: ORANGE,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  submitText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});

// ── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: "700", letterSpacing: -0.5 },

  levelCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  levelCardTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  avatar:       { width: 46, height: 46, borderRadius: 23 },
  levelLabel:   { fontSize: 17, fontWeight: "700" },
  levelSub:     { fontSize: 13, marginTop: 2 },
  badgesBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgesBtnText: { color: ORANGE, fontWeight: "600", fontSize: 13 },
  levelTrack:  { flexDirection: "row", alignItems: "center", marginTop: 14, marginBottom: 6 },
  levelLine:   { flex: 1, height: 2, marginHorizontal: 3 },
  levelDot:    { alignItems: "center", justifyContent: "center" },
  progressHint: { fontSize: 12 },

  actionsRow: { paddingHorizontal: 16, paddingVertical: 18, gap: 18 },
  actionItem: { alignItems: "center", width: 70 },
  actionCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    borderWidth: 1,
  },
  actionLabel: { fontSize: 11, fontWeight: "500", textAlign: "center" },

  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  seeAll:       { color: ORANGE, fontWeight: "600", fontSize: 14 },

  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },

  contribRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contribIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  contribTitle: { fontSize: 14, fontWeight: "500", marginBottom: 3 },
  contribMeta:  { flexDirection: "row", alignItems: "center", gap: 5 },
  contribSub:   { fontSize: 12 },
  statusDot:    { width: 6, height: 6, borderRadius: 3 },

  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  statNum: { fontSize: 22, fontWeight: "800" },
  statLbl: { fontSize: 11, marginTop: 2 },

  badgesRow: { paddingLeft: 16, paddingRight: 8, gap: 10 },
  badgeItem: {
    width: 80,
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  badgeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeName:     { fontSize: 11, fontWeight: "500", textAlign: "center" },
  badgeMore:     { justifyContent: "center" },
  badgeMoreText: { fontSize: 20, fontWeight: "800", color: GREY, textAlign: "center" },
  badgeMoreSub:  { fontSize: 11, textAlign: "center" },

  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  streakFlame: { fontSize: 12 },
  streakCount: { fontSize: 12, fontWeight: "700" },

  leaderboardCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    height: 50,
    borderRadius: 14,
  },
  leaderboardCtaText: { color: "#FFF", fontWeight: "700", fontSize: 16, flex: 1, textAlign: "center" },

  emptyState: { alignItems: "center", padding: 32, gap: 8 },
  emptyText:  { fontSize: 15, fontWeight: "600" },
  emptySub:   { fontSize: 13, textAlign: "center", opacity: 0.7 },
});
