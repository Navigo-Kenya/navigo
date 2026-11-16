import { useStaticSheetTop } from "./mapSheetInsets";
import { Ionicons } from "@expo/vector-icons";
import { JSX } from "react";
import {
    Dimensions,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useColorScheme,
} from "react-native";

const BLACK = "#000000";
const BG    = "#F6F7F8";
const PANEL_MAX_H = Math.round(Dimensions.get("window").height * 0.6);

interface NearestStopsSheetProps {
  nearestOpen: boolean;
  setNearestOpen: (open: boolean) => void;
  nearest: any[];
  me: any;
  onSelect: (stop: any) => void;
}

export default function NearestStopsSheet({
  nearestOpen,
  setNearestOpen,
  nearest,
  me,
  onSelect,
}: NearestStopsSheetProps): JSX.Element | null {
  const dark = useColorScheme() === "dark";
  const C = {
    bg:   dark ? "#1C1C1E" : BG,
    text: dark ? "#FFFFFF" : BLACK,
  };

  // Floating map controls sit above this card.
  const onSheetLayout = useStaticSheetTop(nearestOpen);

  if (!nearestOpen) return null;

  return (
    <View
      onLayout={onSheetLayout}
      style={[styles.sheet, { maxHeight: PANEL_MAX_H, backgroundColor: C.bg }]}
    >
      <View style={styles.sheetHeader}>
        <Text style={[styles.panelTitle, { color: C.text }]}>Nearest stages</Text>
        <Pressable onPress={() => setNearestOpen(false)}>
          <Ionicons name="close-outline" size={22} color={C.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: 6 }}>
        {!me || nearest.length === 0 ? (
          <Text style={styles.sub}>Finding nearby stages…</Text>
        ) : (
          nearest.map((s) => (
            <Pressable
              key={s.id}
              style={styles.nearRow}
              onPress={() => onSelect(s)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="bus-outline" size={16} color={C.text} />
                <Text style={[styles.nearName, { color: C.text }]}>{s.name}</Text>
              </View>
              <Text style={styles.nearDist}>
                {s.dist < 1000
                  ? `${Math.round(s.dist)}m`
                  : `${(s.dist / 1000).toFixed(1)}km`}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position:     "absolute",
    left:         16,
    right:        16,
    bottom:       16,
    borderRadius: 14,
    padding:      14,
  },
  sheetHeader: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    paddingBottom:  6,
  },
  panelTitle: { fontSize: 16, fontWeight: "700" },
  nearRow: {
    paddingVertical: 10,
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "space-between",
  },
  nearName: {},
  nearDist: { color: "#6B7280" },
  sub:      { color: "#6B7280", textAlign: "left" },
});
