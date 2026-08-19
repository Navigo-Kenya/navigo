import BadgeUnlockModal from "@/components/contribution/BadgeUnlockModal";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { useContributionStore } from "@/store/contributionStore";
import { StopService } from "@/services/stop";
import { UnifiedLocation } from "@/store/journeyStore";

const ORANGE = "#FF6F00";
const GREEN  = "#10B981";
const RED    = "#EF4444";
const GREY   = "#8E8E93";

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
    // Notifications not available, streak feature still works without reminder.
  }
}

// ── MAIN SCREEN ──────────────────────────────────────────────────────────────
// Picker UI replicates mobile/src/features/contribution/components/ContributionSheet.tsx's
// design (title+subtitle header, a stats pill, a 4-card type grid, a leaderboard link)
// instead of the previous level-track/recent-submissions/badges-preview dashboard.
// "Add a new stop" is a 5th card in the same visual style, not part of the mobile
// design being replicated, kept because it's real, working functionality
// (NewStopSheet below) that shouldn't quietly disappear just because the reference
// screen doesn't have an equivalent action.
type ActiveSheet = "delay" | "review" | "edit" | "new_stop" | null;

interface ContributionType {
  id: ActiveSheet | "photo";
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle: string;
  points: number;
}

const TYPES: ContributionType[] = [
  { id: "edit",     icon: "pencil-outline",     label: "Edit a stop",     subtitle: "Fix a name or location",   points: 10 },
  { id: "photo",    icon: "camera-outline",     label: "Add a photo",     subtitle: "Help others recognize it", points: 5  },
  { id: "delay",    icon: "megaphone-outline",  label: "Report an issue", subtitle: "Delays, hazards, closures", points: 8 },
  { id: "review",   icon: "star-outline",       label: "Write a review",  subtitle: "Rate a route or stop",     points: 5  },
  { id: "new_stop", icon: "location-outline",   label: "Add a new stop",  subtitle: "Missing from the map",     points: 12 },
];

function TypeCard({
  type,
  C,
  onPress,
}: {
  type: ContributionType;
  C: ReturnType<typeof makeC>;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={{ width: "48%" }}>
      <View style={[s.typeCard, { backgroundColor: C.card, borderColor: C.border }]}>
        <View style={[s.typeIconCircle, { backgroundColor: ORANGE + "18" }]}>
          <Ionicons name={type.icon} size={19} color={ORANGE} />
        </View>
        <Text style={[s.typeLabel, { color: C.text }]}>{type.label}</Text>
        <Text style={[s.typeSub, { color: C.sub }]}>{type.subtitle}</Text>
        <Text style={s.typePoints}>+{type.points} pts</Text>
      </View>
    </Pressable>
  );
}

export default function ContributionScreen() {
  const dark   = useColorScheme() === "dark";
  const C      = makeC(dark);
  const router = useRouter();

  const { stats, fetch: fetchStore } = useContributionStore();

  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [badgeModal, setBadgeModal]   = useState<{
    visible: boolean; pointsAwarded: number; badges: string[]; streakDays?: number;
  }>({ visible: false, pointsAwarded: 0, badges: [] });

  useEffect(() => {
    fetchStore().catch(() => {});
  }, [fetchStore]);

  // Schedule 19:00 reminder only when the user has an active streak and hasn't
  // contributed today, purely advisory, dismissed if they contribute before then.
  useEffect(() => {
    if (stats && stats.streak_days > 0 && !stats.contributed_today) {
      scheduleStreakReminder();
    }
  }, [stats?.streak_days, stats?.contributed_today]);

  const handleTypePress = (id: ActiveSheet | "photo") => {
    Haptics.selectionAsync();
    if (id === "photo") {
      router.push("/(account)/add-photo" as any);
      return;
    }
    setActiveSheet(id as ActiveSheet);
  };

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 50, gap: 24 }}
      >
        <View>
          <Text style={[s.headerTitle, { color: C.text }]}>Contribute</Text>
          <Text style={[s.headerSub, { color: C.sub }]}>Help improve Navigo for everyone in Nairobi.</Text>
        </View>

        {stats ? (
          <Pressable onPress={() => router.push("/(account)/badges" as any)}>
            <View style={[s.statsPill, { backgroundColor: C.card }]}>
              <View>
                <Text style={[s.statsPillPoints, { color: C.text }]}>{stats.points.toLocaleString()} pts</Text>
                <Text style={[s.statsPillLevel, { color: C.sub }]}>{stats.level_label}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {stats.streak_days > 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={{ fontSize: 16 }}>🔥</Text>
                    <Text style={[s.statsPillStreak, { color: C.text }]}>{stats.streak_days}d</Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={18} color={C.sub} />
              </View>
            </View>
          </Pressable>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
          {TYPES.map((type) => (
            <TypeCard key={type.id} type={type} C={C} onPress={() => handleTypePress(type.id)} />
          ))}
        </View>

        <Pressable
          onPress={() => router.push("/(account)/leaderboard" as any)}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 }}
        >
          <Ionicons name="trophy-outline" size={16} color={ORANGE} />
          <Text style={{ color: ORANGE, fontWeight: "600" }}>View leaderboard</Text>
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

  headerTitle: { fontSize: 26, fontWeight: "800", letterSpacing: -0.4 },
  headerSub:   { fontSize: 14, marginTop: 2 },

  statsPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 20,
  },
  statsPillPoints: { fontSize: 22, fontWeight: "800" },
  statsPillLevel:  { fontSize: 13, marginTop: 2 },
  statsPillStreak: { fontSize: 13, fontWeight: "700" },

  typeCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  typeIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  typeLabel: { fontSize: 15, fontWeight: "600" },
  typeSub:   { fontSize: 13, marginTop: 2, marginBottom: 8 },
  typePoints: { fontSize: 13, fontWeight: "700", color: ORANGE },
});
