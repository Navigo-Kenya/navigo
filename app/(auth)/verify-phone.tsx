import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import {
  EAST_AFRICA,
  type Country,
  detectCountry,
  buildFullPhone,
  CountryPickerModal,
} from "@/components/auth/CountryPicker";
import { Icon } from "@/components/icons/Icon";

type Step = "enter" | "verify";

export default function VerifyPhone() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setAuth } = useAuthStore();
  const dark = useColorScheme() === "dark";
  const C = theme(dark);

  const params = useLocalSearchParams<{ phone?: string; setupToken?: string }>();
  const initialPhone = params.phone ?? "";
  const setupToken = params.setupToken;

  const [step, setStep] = useState<Step>(initialPhone ? "verify" : "enter");
  const [selectedCountry, setSelectedCountry] = useState<Country>(
    initialPhone ? detectCountry(initialPhone) : EAST_AFRICA[0]
  );
  const [phoneInput, setPhoneInput] = useState(
    initialPhone ? initialPhone.replace(/^\+\d{3}/, "0") : ""
  );
  const [currentPhone, setCurrentPhone] = useState(initialPhone);
  const [showPicker, setShowPicker] = useState(false);

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(60);

  const phoneRef = useRef<TextInput>(null);
  const codeRefs = useRef<(TextInput | null)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (initialPhone) {
      if (setupToken) AuthService.sendOtp(initialPhone).catch(() => {});
      startCountdown();
      setTimeout(() => codeRefs.current[0]?.focus(), 500);
    } else {
      setTimeout(() => phoneRef.current?.focus(), 400);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startCountdown = () => {
    setCountdown(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(timerRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const fullPhone = () => buildFullPhone(selectedCountry, phoneInput);

  const handleSendCode = async () => {
    const phone = fullPhone();
    if (phone.replace(selectedCountry.dial, "").length < 8) {
      setError("Please enter a valid phone number.");
      return;
    }
    setError("");
    setSendingOtp(true);
    try {
      if (setupToken) {
        await AuthService.setPhone(phone, setupToken);
      } else {
        await AuthService.sendOtp(phone);
      }
      setCurrentPhone(phone);
      setCode(["", "", "", "", "", ""]);
      setStep("verify");
      startCountdown();
      setTimeout(() => codeRefs.current[0]?.focus(), 400);
    } catch (e: any) {
      setError(e.message || "Failed to send code. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleChangeNumber = () => {
    setStep("enter");
    setCode(["", "", "", "", "", ""]);
    setError("");
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeout(() => phoneRef.current?.focus(), 400);
  };

  const handleBack = () => {
    if (step === "verify" && !initialPhone) {
      handleChangeNumber();
    } else {
      router.back();
    }
  };

  const onCodeChange = (text: string, idx: number) => {
    const digit = text.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    if (digit && idx < 5) codeRefs.current[idx + 1]?.focus();
    if (!digit && idx > 0) codeRefs.current[idx - 1]?.focus();
    if (digit && idx === 5 && next.join("").length === 6) verify(next.join(""));
  };

  const verify = async (fullCode?: string) => {
    const codeStr = fullCode ?? code.join("");
    if (codeStr.length < 6) { setError("Enter all 6 digits."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await AuthService.verifyOtp(currentPhone, codeStr, setupToken);
      if ("token" in res) {
        await setAuth(res.user, res.token);
        router.replace("/(tabs)/map");
      } else {
        router.replace("/(auth)/login" as any);
      }
    } catch (e: any) {
      setError(e.message || "Verification failed.");
      setCode(["", "", "", "", "", ""]);
      codeRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!currentPhone) return;
    setError("");
    setResending(true);
    try {
      await AuthService.sendOtp(currentPhone);
      startCountdown();
    } catch (e: any) {
      setError(e.message || "Failed to resend code.");
    } finally {
      setResending(false);
    }
  };

  const maskedPhone = currentPhone.length > 6
    ? currentPhone.slice(0, 5) + " *** " + currentPhone.slice(-3)
    : currentPhone;

  const canSend = phoneInput.replace(/\D/g, "").length >= 8;

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
        <Pressable onPress={handleBack} style={styles.back}>
          <View style={[styles.backBtn, { backgroundColor: C.inputBg }]}>
            <Icon name="arrow-back" size={20} color={C.text} />
          </View>
        </Pressable>

        <View style={[styles.badge, { backgroundColor: C.accentBg }]}>
          <Icon
            name={step === "enter" ? "phone-portrait-outline" : "shield-checkmark-outline"}
            size={28}
            color={C.accent}
          />
        </View>

        {step === "enter" ? (
          <>
            <View style={styles.header}>
              <Text style={[styles.title, { color: C.text }]}>Set your number</Text>
              <Text style={[styles.subtitle, { color: C.textSub }]}>
                We'll send a 6-digit code to confirm it's yours.
              </Text>
            </View>

            {!!error && <ErrorBox error={error} C={C} />}

            <View style={styles.fieldWrap}>
              <Text style={[styles.label, { color: C.textSub }]}>Phone number</Text>
              <View style={[styles.phoneRow, { backgroundColor: C.inputBg, borderColor: C.inputBd }]}>
                {/* Country selector trigger */}
                <Pressable
                  style={[styles.countryBadge, { borderRightColor: C.inputBd }]}
                  onPress={() => setShowPicker(true)}
                >
                  <Text style={styles.flagEmoji}>{selectedCountry.flag}</Text>
                  <Text style={[styles.dialCode, { color: C.text }]}>{selectedCountry.dial}</Text>
                  <Icon name="chevron-down" size={12} color={C.textSub} style={{ marginLeft: 2 }} />
                </Pressable>

                <TextInput
                  ref={phoneRef}
                  style={[styles.phoneInput, { color: C.text }]}
                  placeholder={selectedCountry.placeholder}
                  placeholderTextColor={C.placeholder}
                  value={phoneInput}
                  onChangeText={setPhoneInput}
                  keyboardType="phone-pad"
                  maxLength={12}
                  returnKeyType="done"
                  onSubmitEditing={handleSendCode}
                />
              </View>
            </View>

            <Pressable
              style={[styles.primary, { backgroundColor: C.accent }, !canSend && styles.btnDisabled]}
              onPress={handleSendCode}
              disabled={sendingOtp || !canSend}
            >
              {sendingOtp
                ? <ActivityIndicator color="#FFF" />
                : <Text style={styles.primaryText}>Send code</Text>
              }
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={[styles.title, { color: C.text }]}>Enter the code</Text>
              <View style={styles.phoneHint}>
                <Text style={[styles.subtitle, { color: C.textSub }]}>
                  Sent to{" "}
                  <Text style={[styles.phoneText, { color: C.text }]}>{maskedPhone}</Text>
                </Text>
                <Pressable onPress={handleChangeNumber} hitSlop={8}>
                  <Text style={[styles.changeLink, { color: C.accent }]}>Change</Text>
                </Pressable>
              </View>
            </View>

            {!!error && <ErrorBox error={error} C={C} />}

            <View style={styles.codeRow}>
              {code.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(r) => { codeRefs.current[i] = r; }}
                  style={[
                    styles.codeBox,
                    { backgroundColor: C.inputBg, borderColor: digit ? C.accent : C.inputBd, color: C.text },
                  ]}
                  value={digit}
                  onChangeText={(t) => onCodeChange(t, i)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                />
              ))}
            </View>

            <Pressable
              style={[
                styles.primary,
                { backgroundColor: C.accent },
                (loading || code.join("").length < 6) && styles.btnDisabled,
              ]}
              onPress={() => verify()}
              disabled={loading || code.join("").length < 6}
            >
              {loading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={styles.primaryText}>Verify code</Text>
              }
            </Pressable>

            <View style={styles.resendRow}>
              {countdown > 0 ? (
                <Text style={[styles.countdownText, { color: C.textSub }]}>
                  Resend in{" "}
                  <Text style={{ color: C.accent, fontWeight: "600" }}>{countdown}s</Text>
                </Text>
              ) : (
                <Pressable onPress={resend} disabled={resending} style={styles.resendBtn}>
                  {resending
                    ? <ActivityIndicator size="small" color={C.accent} />
                    : <Text style={[styles.resendText, { color: C.accent }]}>Resend code</Text>
                  }
                </Pressable>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <CountryPickerModal
        visible={showPicker}
        selected={selectedCountry}
        C={C}
        bottomInset={insets.bottom}
        onSelect={(country) => {
          setSelectedCountry(country);
          setPhoneInput("");
          setShowPicker(false);
          setTimeout(() => phoneRef.current?.focus(), 200);
        }}
        onClose={() => setShowPicker(false)}
      />
    </KeyboardAvoidingView>
  );
}

// ── Error box ─────────────────────────────────────────────────────────────────

function ErrorBox({ error, C }: { error: string; C: ReturnType<typeof theme> }) {
  return (
    <View style={[styles.errorBox, { backgroundColor: C.errBg, borderColor: C.errBd }]}>
      <Icon name="alert-circle-outline" size={16} color={C.errText} />
      <Text style={[styles.errorText, { color: C.errText }]}>{error}</Text>
    </View>
  );
}

// ── Theme ─────────────────────────────────────────────────────────────────────

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

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:     { paddingHorizontal: 24, gap: 24 },
  back:          {},
  backBtn:       { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  badge:         { width: 64, height: 64, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  header:        { gap: 8 },
  title:         { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  subtitle:      { fontSize: 15, lineHeight: 22 },
  phoneHint:     { flexDirection: "row", alignItems: "center", gap: 10 },
  phoneText:     { fontWeight: "600" },
  changeLink:    { fontSize: 14, fontWeight: "600" },
  errorBox:      { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  errorText:     { flex: 1, fontSize: 14 },
  fieldWrap:     { gap: 8 },
  label:         { fontSize: 13, fontWeight: "500" },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  countryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    height: "100%",
    borderRightWidth: 1.5,
  },
  flagEmoji:     { fontSize: 22, lineHeight: 28 },
  dialCode:      { fontSize: 14, fontWeight: "600" },
  phoneInput:    { flex: 1, fontSize: 15, paddingHorizontal: 14 },
  codeRow:       { flexDirection: "row", gap: 10, justifyContent: "center" },
  codeBox: {
    width: 46,
    height: 58,
    borderRadius: 14,
    borderWidth: 2,
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  primary:       { height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  primaryText:   { color: "#FFF", fontSize: 16, fontWeight: "700" },
  btnDisabled:   { opacity: 0.45 },
  resendRow:     { alignItems: "center" },
  resendBtn:     { paddingVertical: 4 },
  countdownText: { fontSize: 14 },
  resendText:    { fontSize: 14, fontWeight: "600" },
});
