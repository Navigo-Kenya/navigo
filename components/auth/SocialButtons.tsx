import { AntDesign } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { AuthService } from "@/services/auth";
import type { AuthUser } from "@/store/authStore";
import { Icon } from "@/components/icons/Icon";

WebBrowser.maybeCompleteAuthSession();

interface Props {
  onSuccess: (user: AuthUser, token: string) => void;
  onNeedsPhone: (setupToken: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  showDivider?: boolean;
}

export function SocialButtons({ onSuccess, onNeedsPhone, onError, disabled, showDivider = true }: Props) {
  const dark = useColorScheme() === "dark";
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  const [, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS ?? "",
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ?? "",
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "",
    scopes: ["openid", "profile", "email"],
    extraParams: { prompt: "select_account" },
  });

  useEffect(() => {
    if (!response) return;
    if (response.type === "success") {
      const idToken = response.authentication?.idToken;
      if (idToken) {
        handleGoogleToken(idToken);
      } else {
        onError("Google sign-in returned no ID token.");
        setGoogleLoading(false);
      }
    } else {
      setGoogleLoading(false);
    }
  }, [response]);

  const handleGoogleToken = async (idToken: string) => {
    try {
      const res = await AuthService.googleAuth(idToken);
      if ("needs_phone" in res) {
        onNeedsPhone(res.setup_token);
      } else {
        onSuccess(res.user, res.token);
      }
    } catch (e: any) {
      onError(e.message || "Google sign-in failed.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (!process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS && !process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID) {
      onError("Google sign-in is not configured.");
      return;
    }
    setGoogleLoading(true);
    await promptAsync();
  };

  const handleApple = async () => {
    setAppleLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error("Apple returned no identity token.");

      const name = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(" ") || undefined;

      const res = await AuthService.appleAuth(credential.identityToken, {
        name,
        email: credential.email ?? undefined,
      });

      if ("needs_phone" in res) {
        onNeedsPhone(res.setup_token);
      } else {
        onSuccess(res.user, res.token);
      }
    } catch (e: any) {
      if (e.code !== "ERR_REQUEST_CANCELED") {
        onError(e.message || "Apple sign-in failed.");
      }
    } finally {
      setAppleLoading(false);
    }
  };

  const divColor = dark ? "#2C2C2E" : "#E5E7EB";
  const divTextColor = dark ? "#6B7280" : "#9CA3AF";
  const googleBg = dark ? "#1C1C1E" : "#FFFFFF";
  const googleBd = dark ? "#2C2C2E" : "#E5E7EB";
  const googleText = dark ? "#F9FAFB" : "#111827";

  return (
    <View style={styles.wrap}>
      {showDivider && (
        <View style={styles.dividerRow}>
          <View style={[styles.line, { backgroundColor: divColor }]} />
          <Text style={[styles.dividerText, { color: divTextColor }]}>or continue with</Text>
          <View style={[styles.line, { backgroundColor: divColor }]} />
        </View>
      )}

      <Pressable
        style={[
          styles.btn,
          { backgroundColor: googleBg, borderColor: googleBd },
          (disabled || googleLoading) && styles.btnDisabled,
        ]}
        onPress={handleGoogle}
        disabled={disabled || googleLoading}
      >
        {googleLoading ? (
          <ActivityIndicator size="small" color="#4285F4" />
        ) : (
          <>
            <AntDesign name="google" size={18} color="#4285F4" />
            <Text style={[styles.btnText, { color: googleText }]}>Continue with Google</Text>
          </>
        )}
      </Pressable>

      {Platform.OS === "ios" && (
        <Pressable
          style={[
            styles.btn,
            { backgroundColor: dark ? "#F9FAFB" : "#000000", borderColor: dark ? "#F9FAFB" : "#000000" },
            (disabled || appleLoading) && styles.btnDisabled,
          ]}
          onPress={handleApple}
          disabled={disabled || appleLoading}
        >
          {appleLoading ? (
            <ActivityIndicator size="small" color={dark ? "#000" : "#FFF"} />
          ) : (
            <>
              <Icon name="logo-apple" size={20} color={dark ? "#000000" : "#FFFFFF"} />
              <Text style={[styles.btnText, { color: dark ? "#000000" : "#FFFFFF" }]}>
                Continue with Apple
              </Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  line: { flex: 1, height: 1 },
  dividerText: { fontSize: 13 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  btnText: { fontSize: 15, fontWeight: "600" },
  btnDisabled: { opacity: 0.55 },
});
