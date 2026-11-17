import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
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
import { AuthService } from "@/services/auth";
import { useAuthStore } from "@/store/authStore";
import { Icon } from "@/components/icons/Icon";

export default function ForgotPassword() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setAuth } = useAuthStore();
  const dark = useColorScheme() === "dark";

  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const codeRefs = useRef<(TextInput | null)[]>([]);
  const C = theme(dark);

  const submitEmail = async () => {
    setError("");
    setLoading(true);
    try {
      await AuthService.forgotPassword(email);
      setStep("reset");
    } catch (e: any) {
      setError(e.message || "Failed to send reset code.");
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async () => {
    setError("");
    if (password !== confirm) { setError("Passwords do not match."); return; }
    const fullCode = code.join("");
    if (fullCode.length < 6) { setError("Enter all 6 digits."); return; }
    setLoading(true);
    try {
      const res = await AuthService.resetPassword(phone, fullCode, password);
      await setAuth(res.user, res.token);
      router.replace("/(tabs)/map");
    } catch (e: any) {
      setError(e.message || "Reset failed.");
    } finally {
      setLoading(false);
    }
  };

  const onCodeChange = (text: string, idx: number) => {
    const digit = text.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    if (digit && idx < 5) codeRefs.current[idx + 1]?.focus();
    if (!digit && idx > 0) codeRefs.current[idx - 1]?.focus();
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
        <Pressable
          onPress={() => (step === "reset" ? setStep("email") : router.back())}
          style={styles.back}
        >
          <View style={[styles.backBtn, { backgroundColor: C.inputBg }]}>
            <Icon name="arrow-back" size={20} color={C.text} />
          </View>
        </Pressable>

        {/* Step indicator */}
        <View style={styles.stepRow}>
          <View style={[styles.stepDot, { backgroundColor: C.accent }]} />
          <View style={[styles.stepLine, { backgroundColor: step === "reset" ? C.accent : C.inputBd }]} />
          <View style={[styles.stepDot, { backgroundColor: step === "reset" ? C.accent : C.inputBd }]} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.badge, { backgroundColor: C.accentBg }]}>
            <Icon
              name={step === "email" ? "mail-outline" : "lock-closed-outline"}
              size={28}
              color={C.accent}
            />
          </View>
          <Text style={[styles.title, { color: C.text }]}>
            {step === "email" ? "Forgot password?" : "Set new password"}
          </Text>
          <Text style={[styles.subtitle, { color: C.textSub }]}>
            {step === "email"
              ? "Enter your email and we'll send a reset code to your registered phone."
              : "Enter the code you received and choose a new password."}
          </Text>
        </View>

        {!!error && (
          <View style={[styles.errorBox, { backgroundColor: C.errBg, borderColor: C.errBd }]}>
            <Icon name="alert-circle-outline" size={16} color={C.errText} />
            <Text style={[styles.errorText, { color: C.errText }]}>{error}</Text>
          </View>
        )}

        {step === "email" ? (
          <>
            <Field
              label="Email address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              C={C}
            />
            <Pressable
              style={[styles.primary, { backgroundColor: C.accent }, loading && styles.btnDisabled]}
              onPress={submitEmail}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryText}>Send reset code</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Field
              label="Phone number"
              value={phone}
              onChangeText={setPhone}
              placeholder="+254712345678"
              keyboardType="phone-pad"
              C={C}
            />

            <View style={styles.fieldWrap}>
              <Text style={[styles.label, { color: C.textSub }]}>Verification code</Text>
              <View style={styles.codeRow}>
                {code.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(r) => { codeRefs.current[i] = r; }}
                    style={[
                      styles.codeBox,
                      {
                        backgroundColor: C.inputBg,
                        borderColor: digit ? C.accent : C.inputBd,
                        color: C.text,
                      },
                    ]}
                    value={digit}
                    onChangeText={(t) => onCodeChange(t, i)}
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                  />
                ))}
              </View>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={[styles.label, { color: C.textSub }]}>New password</Text>
              <View style={[styles.pwRow, { backgroundColor: C.inputBg, borderColor: C.inputBd }]}>
                <TextInput
                  style={[styles.pwInput, { color: C.text }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Min. 8 characters"
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

            <Field
              label="Confirm password"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Repeat password"
              secureTextEntry
              C={C}
            />

            <Pressable
              style={[styles.primary, { backgroundColor: C.accent }, loading && styles.btnDisabled]}
              onPress={submitReset}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryText}>Reset password</Text>
              )}
            </Pressable>
          </>
        )}
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
    accentBg:    dark ? "rgba(255,111,0,0.12)" : "#FFF7ED",
    errBg:       dark ? "rgba(220,38,38,0.1)" : "#FEF2F2",
    errBd:       dark ? "rgba(220,38,38,0.2)" : "#FECACA",
    errText:     dark ? "#FF6B6B" : "#DC2626",
  };
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, gap: 20 },
  back: {},
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
    alignSelf: "flex-start",
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stepLine: {
    width: 48,
    height: 3,
    borderRadius: 2,
  },
  header: { gap: 10 },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  errorText: { flex: 1, fontSize: 14 },
  fieldWrap: { gap: 8 },
  label: { fontSize: 13, fontWeight: "500" },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  pwRow: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    paddingLeft: 16,
  },
  pwInput: { flex: 1, fontSize: 15 },
  eyeBtn: { paddingHorizontal: 14, height: "100%", justifyContent: "center" },
  codeRow: { flexDirection: "row", gap: 10, justifyContent: "center" },
  codeBox: {
    width: 46,
    height: 58,
    borderRadius: 14,
    borderWidth: 2,
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  primary: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  btnDisabled: { opacity: 0.55 },
});
