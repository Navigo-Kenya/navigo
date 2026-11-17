import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { AuthService } from "@/services/auth";
import { useAuthStore, type AuthUser } from "@/store/authStore";
import { Icon } from "@/components/icons/Icon";

export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setAuth } = useAuthStore();
  const dark = useColorScheme() === "dark";

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const [emailOpen, setEmailOpen] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;

  const C = theme(dark);

  const toggleEmail = () => {
    const opening = !emailOpen;
    setEmailOpen(opening);
    Animated.timing(expandAnim, {
      toValue: opening ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  };

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await AuthService.login(email, password);
      await setAuth(res.user, res.token);
      router.replace("/(tabs)/map");
    } catch (e: any) {
      setError(e.message || "Wrong email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSuccess = async (user: AuthUser, token: string) => {
    await setAuth(user, token);
    router.replace("/(tabs)/map");
  };

  const handleNeedsPhone = (setupToken: string) => {
    router.push({ pathname: "/(auth)/verify-phone", params: { setupToken } });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <Pressable onPress={() => router.back()} style={styles.back}>
          <View style={[styles.backBtn, { backgroundColor: C.inputBg }]}>
            <Icon name="arrow-back" size={20} color={C.text} />
          </View>
        </Pressable>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: C.text }]}>Welcome back</Text>
          <Text style={[styles.subtitle, { color: C.textSub }]}>
            Sign in to continue navigating Nairobi.
          </Text>
        </View>

        {/* Error */}
        {!!error && (
          <View style={[styles.errorBox, { backgroundColor: C.errBg, borderColor: C.errBd }]}>
            <Icon name="alert-circle-outline" size={16} color={C.errText} />
            <Text style={[styles.errorText, { color: C.errText }]}>{error}</Text>
          </View>
        )}

        {/* Primary: OAuth — no "or continue with" header, these are the first action */}
        <SocialButtons
          showDivider={false}
          onSuccess={handleSocialSuccess}
          onNeedsPhone={handleNeedsPhone}
          onError={setError}
          disabled={loading}
        />

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={[styles.line, { backgroundColor: C.inputBd }]} />
          <Text style={[styles.dividerText, { color: C.textSub }]}>or</Text>
          <View style={[styles.line, { backgroundColor: C.inputBd }]} />
        </View>

        {/* Email toggle */}
        <Pressable onPress={toggleEmail} style={styles.emailToggle}>
          <Icon name="mail-outline" size={17} color={C.accent} />
          <Text style={[styles.emailToggleText, { color: C.accent }]}>Sign in with email</Text>
          <Animated.View style={{
            transform: [{
              rotate: expandAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }),
            }],
          }}>
            <Icon name="chevron-forward" size={15} color={C.accent} />
          </Animated.View>
        </Pressable>

        {/* Expandable email form */}
        <Animated.View
          style={{
            maxHeight: expandAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 400] }),
            opacity: expandAnim,
            overflow: "hidden",
          }}
          pointerEvents={emailOpen ? "auto" : "none"}
        >
          <View style={styles.form}>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              C={C}
            />

            <View style={styles.fieldWrap}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: C.textSub }]}>Password</Text>
                <Pressable onPress={() => router.push("/(auth)/forgot-password")}>
                  <Text style={[styles.linkSmall, { color: C.accent }]}>Forgot password?</Text>
                </Pressable>
              </View>
              <View style={[styles.pwRow, { backgroundColor: C.inputBg, borderColor: C.inputBd }]}>
                <TextInput
                  style={[styles.pwInput, { color: C.text }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Your password"
                  placeholderTextColor={C.placeholder}
                  secureTextEntry={!showPw}
                />
                <Pressable onPress={() => setShowPw((v) => !v)} style={styles.eyeBtn}>
                  <Icon
                    name={showPw ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={C.textSub}
                  />
                </Pressable>
              </View>
            </View>

            <Pressable
              style={[styles.primary, { backgroundColor: C.accent }, loading && styles.btnDisabled]}
              onPress={submit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={styles.primaryText}>Sign in</Text>
              }
            </Pressable>
          </View>
        </Animated.View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: C.textSub }]}>Don't have an account? </Text>
          <Pressable onPress={() => router.replace("/(auth)/register")}>
            <Text style={[styles.link, { color: C.accent }]}>Create one</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  C,
  ...props
}: { label: string; C: ReturnType<typeof theme> } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.label, { color: C.textSub }]}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.inputBd, color: C.text }]}
        placeholderTextColor={C.placeholder}
        {...props}
      />
    </View>
  );
}

function theme(dark: boolean) {
  return {
    bg:          dark ? "#0F0F0F" : "#FFFFFF",
    text:        dark ? "#F9FAFB" : "#111827",
    textSub:     dark ? "#9CA3AF" : "#6B7280",
    inputBg:     dark ? "#1C1C1E" : "#F3F4F6",
    inputBd:     dark ? "#2C2C2E" : "#E5E7EB",
    placeholder: dark ? "#4B5563" : "#9CA3AF",
    accent:      "#FF6F00",
    errBg:       dark ? "rgba(220,38,38,0.1)" : "#FEF2F2",
    errBd:       dark ? "rgba(220,38,38,0.2)" : "#FECACA",
    errText:     dark ? "#FF6B6B" : "#DC2626",
  };
}

const styles = StyleSheet.create({
  container:    { paddingHorizontal: 24, gap: 20 },
  back:         { marginBottom: 4 },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: "center", alignItems: "center",
  },
  header:    { gap: 6 },
  title:     { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  subtitle:  { fontSize: 15, lineHeight: 22 },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  errorText: { flex: 1, fontSize: 14 },

  dividerRow:  { flexDirection: "row", alignItems: "center", gap: 12 },
  line:        { flex: 1, height: 1 },
  dividerText: { fontSize: 13 },

  emailToggle: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, paddingVertical: 4,
  },
  emailToggleText: { fontSize: 15, fontWeight: "600" },

  form:      { gap: 16, paddingTop: 4 },
  fieldWrap: { gap: 8 },
  labelRow:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label:     { fontSize: 13, fontWeight: "500" },
  linkSmall: { fontSize: 13, fontWeight: "600" },
  input: {
    height: 52, borderRadius: 14, borderWidth: 1.5,
    paddingHorizontal: 16, fontSize: 15,
  },
  pwRow: {
    height: 52, flexDirection: "row", alignItems: "center",
    borderRadius: 14, borderWidth: 1.5, paddingLeft: 16,
  },
  pwInput:  { flex: 1, fontSize: 15 },
  eyeBtn:   { paddingHorizontal: 14, height: "100%", justifyContent: "center" },
  primary: {
    height: 56, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  primaryText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  btnDisabled: { opacity: 0.55 },
  footer:      { flexDirection: "row", justifyContent: "center" },
  footerText:  { fontSize: 14 },
  link:        { fontSize: 14, fontWeight: "600" },
});
