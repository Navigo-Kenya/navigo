import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/icons/Icon";

interface SaveWallProps {
  visible:   boolean;
  onDismiss: () => void;
  dark:      boolean;
}

export function SaveWall({ visible, onDismiss, dark }: SaveWallProps) {
  const router = useRouter();

  if (!visible) return null;

  return (
    <View style={s.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      <View style={[s.card, { backgroundColor: dark ? "#1C1C1E" : "#FFFFFF" }]}>
        <View style={s.handle} />
        <View style={s.iconWrap}>
          <Icon name="bookmark-outline" size={26} color="#FF6F00" />
        </View>
        <Text style={[s.title, { color: dark ? "#FFF" : "#1C1C1E" }]}>
          Save this journey
        </Text>
        <Text style={[s.sub, { color: dark ? "#8E8E93" : "#6B7280" }]}>
          Sign in to save journeys and access them later.
        </Text>
        <Pressable
          style={s.btn}
          onPress={() => { onDismiss(); router.push("/(auth)/login"); }}
        >
          <Text style={s.btnText}>Sign in</Text>
        </Pressable>
        <Pressable style={s.dismiss} onPress={onDismiss}>
          <Text style={[s.dismissText, { color: dark ? "#8E8E93" : "#6B7280" }]}>
            Not now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    zIndex: 50,
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#C7C7CC",
    alignSelf: "center",
    marginBottom: 8,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,111,0,0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 260,
    marginBottom: 4,
  },
  btn: {
    width: "100%",
    height: 50,
    borderRadius: 14,
    backgroundColor: "#FF6F00",
    justifyContent: "center",
    alignItems: "center",
  },
  btnText:     { color: "#FFF", fontWeight: "700", fontSize: 16 },
  dismiss:     { paddingVertical: 10 },
  dismissText: { fontSize: 14, fontWeight: "500" },
});
