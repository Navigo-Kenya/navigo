// app/(account)/kwame-memory.tsx
// Transparency screen: everything Kwame persistently remembers about the
// user (stated preferences), with per-item and bulk delete.
import { ScreenHeader } from "@/components/app/ScreenHeader";
import api from "@/services/apiClient";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ORANGE = "#FF6F00";
const GREY   = "#8E8E93";
const DANGER = "#FF3B30";

interface MemoryItem {
  id: number;
  kind: string;
  content: string;
  source: string;
  created_at: string;
}

function makeC(dark: boolean) {
  return {
    bg:       dark ? "#0F0F0F" : "#F6F7F8",
    card:     dark ? "#1C1C1E" : "#FFFFFF",
    text:     dark ? "#FFFFFF" : "#1C1C1E",
    subText:  dark ? GREY      : "#4B5563",
    hairline: dark ? "#2C2C2E" : "#E5E7EB",
    soft:     dark ? "rgba(255,111,0,0.15)" : "#FFF3E0",
  };
}

export default function KwameMemoryScreen() {
  const dark   = useColorScheme() === "dark";
  const C      = makeC(dark);
  const insets = useSafeAreaInsets();

  const [items, setItems]     = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await api.get<{ data: MemoryItem[] }>("/user/kwame-memory");
      setItems(res.data.data ?? []);
    } catch {
      // Guest / network error — show empty state.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const deleteOne = async (id: number) => {
    const prev = items;
    setItems((p) => p.filter((m) => m.id !== id));
    try {
      await api.delete(`/user/kwame-memory/${id}`);
    } catch {
      setItems(prev);
      Alert.alert("Error", "Could not delete this memory. Please try again.");
    }
  };

  const deleteAll = () => {
    Alert.alert(
      "Forget everything?",
      "Kwame will no longer remember any of your stated preferences.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Forget all",
          style: "destructive",
          onPress: async () => {
            const prev = items;
            setItems([]);
            try {
              await api.delete("/user/kwame-memory");
            } catch {
              setItems(prev);
              Alert.alert("Error", "Could not clear memory. Please try again.");
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Kwame memory" C={C as any} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]}>
        <View style={s.introRow}>
          <View style={[s.introIcon, { backgroundColor: C.soft }]}>
            <Ionicons name="sparkles" size={20} color={ORANGE} />
          </View>
          <Text style={[s.introText, { color: C.subText }]}>
            When you tell Kwame a lasting preference ("I avoid CBD at night"),
            it's remembered here and used to personalize future answers. Home,
            work and frequent destinations come from your saved places and
            trips — manage those in their own screens.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={ORANGE} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="cloud-outline" size={36} color={GREY} />
            <Text style={[s.emptyTitle, { color: C.text }]}>Nothing remembered yet</Text>
            <Text style={[s.emptySub, { color: C.subText }]}>
              Chat with Kwame and mention your travel preferences.
            </Text>
          </View>
        ) : (
          <>
            <View style={[s.card, { backgroundColor: C.card }]}>
              {items.map((m, i) => (
                <View key={m.id}>
                  {i > 0 && <View style={[s.divider, { backgroundColor: C.hairline }]} />}
                  <View style={s.memRow}>
                    <Ionicons
                      name={m.kind === "preference" ? "options-outline" : "information-circle-outline"}
                      size={16}
                      color={ORANGE}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.memText, { color: C.text }]}>{m.content}</Text>
                      <Text style={[s.memMeta, { color: C.subText }]}>
                        {new Date(m.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <Pressable onPress={() => deleteOne(m.id)} hitSlop={10}>
                      <Ionicons name="trash-outline" size={18} color={DANGER} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>

            <Pressable onPress={deleteAll} style={s.forgetAll}>
              <Ionicons name="trash-outline" size={16} color={DANGER} />
              <Text style={s.forgetAllText}>Forget everything</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  body:      { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  introRow:  { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  introIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  introText: { flex: 1, fontSize: 13, lineHeight: 19 },

  card:    { borderRadius: 14, overflow: "hidden" },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 44 },
  memRow:  { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  memText: { fontSize: 14.5, lineHeight: 20 },
  memMeta: { fontSize: 11.5, marginTop: 2 },

  empty:      { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700" },
  emptySub:   { fontSize: 13 },

  forgetAll:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  forgetAllText: { color: DANGER, fontSize: 14, fontWeight: "600" },
});
