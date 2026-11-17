import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { Icon } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";

interface GuestWallProps {
  icon:     keyof typeof Ionicons.glyphMap;
  title:    string;
  subtitle: string;
}

export default function GuestWall({ icon, title, subtitle }: GuestWallProps) {
  const router = useRouter();
  const dark = useColorScheme() === "dark";
  const C = {
    text: dark ? "#FFFFFF" : "#1C1C1E",
    sub:  dark ? "#8E8E93" : "#6B7280",
  };

  return (
    <View style={s.root}>
      <View style={s.iconWrap}>
        <Icon name={icon} size={32} color={ORANGE} />
      </View>

      <Text style={[s.title, { color: C.text }]}>{title}</Text>
      <Text style={[s.subtitle, { color: C.sub }]}>{subtitle}</Text>

      <Pressable style={s.primary} onPress={() => router.push("/(auth)/login")}>
        <Text style={s.primaryText}>Sign in</Text>
      </Pressable>

      <Pressable style={s.secondary} onPress={() => router.push("/(auth)/register")}>
        <Text style={[s.secondaryText, { color: ORANGE }]}>Create account</Text>
      </Pressable>

      <Text style={[s.footer, { color: C.sub }]}>
        You can still browse routes and maps as a guest.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    gap: 14,
    paddingBottom: 40,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,111,0,0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },
  primary: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    backgroundColor: ORANGE,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  primaryText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
  },
  secondary: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: ORANGE,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryText: {
    fontWeight: "600",
    fontSize: 16,
  },
  footer: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 6,
  },
});
