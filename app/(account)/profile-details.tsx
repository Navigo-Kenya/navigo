// app/(account)/profile-details.tsx
import { ScreenHeader } from "@/components/app/ScreenHeader";
import { AuthService } from "@/services/auth";
import { UserService } from "@/services/user";
import { useAuthStore } from "@/store/authStore";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { Icon } from "@/components/icons/Icon";

const ORANGE  = "#FF6F00";
const GREY    = "#8E8E93";
const SUCCESS = "#34C759";
const DANGER  = "#FF3B30";

function makeC(dark: boolean) {
  return {
    bg:          dark ? "#0F0F0F" : "#F6F7F8",
    card:        dark ? "#1C1C1E" : "#FFFFFF",
    text:        dark ? "#FFFFFF" : "#1C1C1E",
    subText:     dark ? GREY      : "#4B5563",
    hairline:    dark ? "#2C2C2E" : "#E5E7EB",
    icon:        dark ? "#EBEBF5" : "#1C1C1E",
    pressed:     dark ? "#2C2C2E" : "#F2F2F7",
    input:       dark ? "#2C2C2E" : "#F3F4F6",
    inputText:   dark ? "#FFFFFF" : "#111827",
    inputBorder: dark ? "#3A3A3C" : "#D1D5DB",
    inputFocus:  ORANGE,
    placeholder: dark ? "#4B5563" : "#9CA3AF",
    softOrange:  dark ? "rgba(255,111,0,0.16)" : "#FFF3E0",
    softGreen:   dark ? "rgba(52,199,89,0.15)"  : "#F0FFF4",
    softRed:     dark ? "rgba(255,59,48,0.12)"  : "#FFF5F5",
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, C, children }: { title: string; C: ReturnType<typeof makeC>; children: React.ReactNode }) {
  return (
    <View style={[s.section, { backgroundColor: C.card }]}>
      <Text style={[s.sectionTitle, { color: C.subText }]}>{title}</Text>
      {children}
    </View>
  );
}

function Divider({ C }: { C: ReturnType<typeof makeC> }) {
  return <View style={[s.divider, { backgroundColor: C.hairline }]} />;
}

function Row({
  icon,
  label,
  description,
  value,
  right,
  onPress,
  C,
  danger = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  C: ReturnType<typeof makeC>;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        s.row,
        pressed && onPress ? { backgroundColor: C.pressed, marginHorizontal: -14, paddingHorizontal: 14 } : null,
      ]}
    >
      <Icon name={icon} size={18} color={danger ? DANGER : C.icon} />
      <View style={s.rowBody}>
        <Text style={[s.rowLabel, { color: danger ? DANGER : C.text }]}>{label}</Text>
        {description ? <Text style={[s.rowDesc, { color: C.subText }]}>{description}</Text> : null}
      </View>
      {value ? <Text style={[s.rowValue, { color: C.subText }]}>{value}</Text> : null}
      {right ?? null}
      {onPress && !right && !value ? <Icon name="chevron-forward" size={16} color={C.subText} /> : null}
      {onPress && (value || right) ? <Icon name="chevron-forward" size={16} color={C.subText} style={{ marginLeft: 4 }} /> : null}
    </Pressable>
  );
}

function VerifiedBadge({ verified, C }: { verified: boolean; C: ReturnType<typeof makeC> }) {
  return (
    <View style={[s.badge, { backgroundColor: verified ? C.softGreen : C.softRed }]}>
      <Icon
        name={verified ? "checkmark-circle" : "alert-circle"}
        size={11}
        color={verified ? SUCCESS : DANGER}
      />
      <Text style={[s.badgeText, { color: verified ? SUCCESS : DANGER }]}>
        {verified ? "Verified" : "Unverified"}
      </Text>
    </View>
  );
}

function OAuthBadge({ provider, C }: { provider: string; C: ReturnType<typeof makeC> }) {
  const label = provider.charAt(0).toUpperCase() + provider.slice(1);
  const icon: keyof typeof Ionicons.glyphMap =
    provider === "google" ? "logo-google" :
    provider === "apple"  ? "logo-apple"  : "key-outline";
  return (
    <View style={[s.badge, { backgroundColor: C.softOrange }]}>
      <Icon name={icon} size={11} color={ORANGE} />
      <Text style={[s.badgeText, { color: ORANGE }]}>{label}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileDetails() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const dark     = useColorScheme() === "dark";
  const C        = makeC(dark);

  const { user, setUser, avatarTs } = useAuthStore();

  const [isEditing,      setIsEditing]      = useState(false);
  const [editName,       setEditName]       = useState(user?.name ?? "");
  const [saving,         setSaving]         = useState(false);
  const [avatarPreview,  setAvatarPreview]  = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const nameRef = useRef<TextInput>(null);

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const phoneVerified = !!user?.phone_verified_at;
  const emailVerified = true; // email is verified at registration
  const hasOAuth      = !!user?.oauth_provider;
  const hasPassword   = !hasOAuth;

  const startEditing = () => {
    setEditName(user?.name ?? "");
    setIsEditing(true);
    setTimeout(() => nameRef.current?.focus(), 80);
  };

  const cancelEditing = () => {
    setEditName(user?.name ?? "");
    setIsEditing(false);
  };

  const handleSave = async () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === user?.name) { setIsEditing(false); return; }
    setSaving(true);
    try {
      const updated = await UserService.updateProfile({ name: trimmed });
      setUser(updated);
      setIsEditing(false);
    } catch {
      Alert.alert("Update failed", "Could not save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePhoto = () => {
    Alert.alert(
      "Update profile photo",
      undefined,
      [
        { text: "Take photo",          onPress: () => pickImage("camera")  },
        { text: "Choose from library", onPress: () => pickImage("library") },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const pickImage = async (source: "camera" | "library") => {
    const isCamera = source === "camera";

    const { status } = isCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        isCamera
          ? "Camera access is needed to take a photo."
          : "Photo library access is needed to select a photo."
      );
      return;
    }

    const result = isCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });

    if (result.canceled) return;

    const asset = result.assets[0];
    setAvatarPreview(asset.uri);
    setUploadingAvatar(true);
    try {
      const updated = await UserService.uploadAvatar(asset.uri, asset.mimeType ?? "image/jpeg");
      setUser(updated);
      setAvatarPreview(null);
    } catch {
      setAvatarPreview(null);
      Alert.alert("Upload failed", "Could not update your profile photo. Please try again.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleVerifyPhone = async () => {
    if (!user?.phone_number) return;
    try {
      await AuthService.sendOtp(user.phone_number);
      router.push({ pathname: "/(auth)/verify-phone" as any, params: { phone: user.phone_number } });
    } catch {
      Alert.alert("Error", "Failed to send verification code. Please try again.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenHeader
        title="Profile"
        C={C}
        leftLabel={isEditing ? "Cancel" : undefined}
        leftAction={isEditing ? cancelEditing : undefined}
        rightLabel={isEditing ? "Save" : "Edit"}
        rightAction={isEditing ? handleSave : startEditing}
        rightLoading={saving}
      />

      <ScrollView
        style={{ backgroundColor: C.bg }}
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Avatar Hero ──────────────────────────────────────────────────── */}
        <View style={s.heroSection}>
          <Pressable onPress={handleChangePhoto} style={s.avatarWrap} disabled={uploadingAvatar}>
            {(avatarPreview ?? user?.avatar) ? (
              <Image source={{ uri: avatarPreview ?? `${user!.avatar!}?_v=${avatarTs}` }} style={s.avatar} contentFit="cover" />
            ) : (
              <View style={[s.avatar, s.avatarFallback]}>
                <Text style={s.avatarInitials}>{initials}</Text>
              </View>
            )}
            {uploadingAvatar ? (
              <View style={s.avatarOverlay}>
                <ActivityIndicator color="#FFF" />
              </View>
            ) : (
              <View style={[s.cameraRing, { backgroundColor: C.card, borderColor: C.bg }]}>
                <Icon name="camera" size={14} color={C.text} />
              </View>
            )}
          </Pressable>
          <Pressable onPress={handleChangePhoto} hitSlop={8} disabled={uploadingAvatar}>
            <Text style={[s.changePhotoText, uploadingAvatar && { opacity: 0.4 }]}>
              {uploadingAvatar ? "Uploading…" : "Edit photo"}
            </Text>
          </Pressable>
          {user?.oauth_provider && (
            <OAuthBadge provider={user.oauth_provider} C={C} />
          )}
        </View>

        {/* ── Personal Info ────────────────────────────────────────────────── */}
        <Section title="PERSONAL INFO" C={C}>
          {isEditing ? (
            <View style={s.editRow}>
              <Icon name="person-outline" size={18} color={C.icon} />
              <View style={{ flex: 1 }}>
                <Text style={[s.editFieldLabel, { color: C.subText }]}>Full name</Text>
                <TextInput
                  ref={nameRef}
                  style={[s.nameInput, { color: C.inputText, borderColor: C.inputBorder, backgroundColor: C.input }]}
                  value={editName}
                  onChangeText={setEditName}
                  maxLength={50}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                  placeholder="Full name"
                  placeholderTextColor={C.placeholder}
                  autoCorrect={false}
                />
              </View>
              <Text style={[s.charCount, { color: C.subText }]}>{editName.length}/50</Text>
            </View>
          ) : (
            <Row C={C} icon="person-outline" label="Full name" value={user?.name ?? "—"} onPress={startEditing} />
          )}
        </Section>

        {/* ── Contact ──────────────────────────────────────────────────────── */}
        <Section title="CONTACT" C={C}>
          <Row
            C={C}
            icon="mail-outline"
            label="Email"
            value={user?.email ?? "—"}
            right={<VerifiedBadge verified={emailVerified} C={C} />}
          />
          <Divider C={C} />
          <Row
            C={C}
            icon="call-outline"
            label="Phone"
            value={user?.phone_number ?? "Not set"}
            right={user?.phone_number ? <VerifiedBadge verified={phoneVerified} C={C} /> : null}
            description={!user?.phone_number ? "Required for navigation alerts" : (!phoneVerified && user?.phone_number ? "Tap to verify your number" : undefined)}
            onPress={user?.phone_number && !phoneVerified ? handleVerifyPhone : undefined}
          />
        </Section>

        {/* ── Account / Security ───────────────────────────────────────────── */}
        <Section title="ACCOUNT" C={C}>
          {hasPassword && (
            <>
              <Row
                C={C}
                icon="lock-closed-outline"
                label="Change password"
                description="Update your account password"
                onPress={() => router.push("/(auth)/forgot-password" as any)}
              />
              {!hasOAuth && <Divider C={C} />}
            </>
          )}
          {hasOAuth ? (
            <Row
              C={C}
              icon="shield-checkmark-outline"
              label="Sign-in method"
              value={user!.oauth_provider!.charAt(0).toUpperCase() + user!.oauth_provider!.slice(1)}
            />
          ) : (
            <Row
              C={C}
              icon="shield-checkmark-outline"
              label="Sign-in method"
              value="Email & password"
            />
          )}
        </Section>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  body: {
    paddingHorizontal: 16,
    paddingTop:        24,
    gap:               16,
  },

  /* Avatar hero */
  heroSection: {
    alignItems:    "center",
    gap:            8,
    paddingBottom:  8,
  },
  avatarWrap: { position: "relative", marginBottom: 4 },
  avatar: {
    width:        88,
    height:       88,
    borderRadius: 44,
  },
  avatarFallback: {
    backgroundColor: ORANGE,
    justifyContent:  "center",
    alignItems:      "center",
  },
  avatarInitials:  { color: "#FFF", fontSize: 30, fontWeight: "700" },
  cameraRing: {
    position:     "absolute",
    bottom:        0,
    right:         0,
    width:        28,
    height:       28,
    borderRadius: 14,
    borderWidth:   2,
    alignItems:   "center",
    justifyContent: "center",
  },
  avatarOverlay: {
    position:        "absolute",
    width:           88,
    height:          88,
    borderRadius:    44,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent:  "center",
    alignItems:      "center",
  },
  changePhotoText: { color: ORANGE, fontSize: 14, fontWeight: "600" },

  /* Sections */
  section: {
    borderRadius:      14,
    paddingHorizontal: 14,
    paddingTop:        12,
    paddingBottom:      4,
    gap:                0,
  },
  sectionTitle: {
    fontSize:      11,
    fontWeight:    "700",
    letterSpacing:  0.5,
    marginBottom:   8,
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 26, marginVertical: 0 },

  /* Row */
  row: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:             10,
    paddingVertical: 13,
  },
  rowBody:  { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15 },
  rowDesc:  { fontSize: 12, lineHeight: 16 },
  rowValue: { fontSize: 14, maxWidth: 160, textAlign: "right" },

  /* Edit mode */
  editRow: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:             10,
    paddingVertical: 10,
  },
  editFieldLabel: { fontSize: 11, fontWeight: "600", marginBottom: 4, letterSpacing: 0.3 },
  nameInput: {
    fontSize:      15,
    paddingVertical:  8,
    paddingHorizontal: 10,
    borderRadius:   10,
    borderWidth:    1.5,
  },
  charCount: { fontSize: 11, minWidth: 36, textAlign: "right" },

  /* Badge */
  badge: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:               3,
    paddingHorizontal: 7,
    paddingVertical:   3,
    borderRadius:      99,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
});
