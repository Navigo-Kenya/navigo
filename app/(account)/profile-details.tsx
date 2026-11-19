// app/(account)/profile-details.tsx
//
// Your profile: the photo and name people see on the leaderboard and your
// reports, how you sign in, your phone (verified for password resets), and
// where you stand in the community.
import { ScreenHeader } from "@/components/app/ScreenHeader";
import { AuthService } from "@/services/auth";
import { UserService } from "@/services/user";
import { useAuthStore } from "@/store/authStore";
import { useContributionStore } from "@/store/contributionStore";
import { levelProgress } from "@/components/badges/levels";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
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
import { Icon, type IconName } from "@/components/icons/Icon";
import { PressableScale } from "@/components/ui/PressableScale";

const ORANGE = "#FF6F00";
const GREEN = "#16A34A";
const NAME_MAX = 40;

function makeC(dark: boolean) {
  return {
    bg:    dark ? "#0F0F10" : "#F6F7F8",
    card:  dark ? "#1C1C1F" : "#FFFFFF",
    text:  dark ? "#F4F4F5" : "#111827",
    sub:   dark ? "#A1A1AA" : "#6B7280",
    line:  dark ? "#2A2A2F" : "#EEF0F3",
    field: dark ? "#27272A" : "#F3F4F6",
  };
}
type P = ReturnType<typeof makeC>;

function InfoRow({ icon, label, value, badge, action, onAction, C }: {
  icon: IconName;
  label: string;
  value: string;
  badge?: { text: string; ok: boolean };
  action?: string;
  onAction?: () => void;
  C: P;
}) {
  return (
    <View style={s.row}>
      <View style={[s.rowIcon, { backgroundColor: C.field }]}>
        <Icon name={icon} size={17} color={C.text} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.rowLabel, { color: C.sub }]}>{label}</Text>
        <Text style={[s.rowValue, { color: C.text }]} numberOfLines={1}>{value}</Text>
      </View>
      {badge ? (
        <View style={[s.pill, { backgroundColor: (badge.ok ? GREEN : ORANGE) + "1F" }]}>
          <Text style={[s.pillText, { color: badge.ok ? GREEN : ORANGE }]}>{badge.text}</Text>
        </View>
      ) : null}
      {action && onAction ? (
        <PressableScale onPress={onAction} style={[s.action, { backgroundColor: ORANGE }]}>
          <Text style={s.actionText}>{action}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

export default function ProfileDetails() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";
  const C = makeC(dark);
  const { user, setUser, avatarTs } = useAuthStore();
  const { stats, fetch } = useContributionStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const nameRef = useRef<TextInput>(null);

  useEffect(() => { fetch().catch(() => {}); }, [fetch]);

  const initials = user?.name ? user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() : "?";
  const provider = user?.oauth_provider === "apple" ? "Apple" : user?.oauth_provider ? "Google" : null;
  const phoneVerified = !!user?.phone_verified_at;
  const since = user?.created_at ? new Date(user.created_at).toLocaleDateString([], { month: "long", year: "numeric" }) : null;
  const { level } = levelProgress(stats?.points ?? 0);

  const startEditing = () => {
    setName(user?.name ?? "");
    setEditing(true);
    setTimeout(() => nameRef.current?.focus(), 80);
  };

  const save = async () => {
    const trimmed = name.replace(/\s+/g, " ").trim();
    if (!trimmed) { Alert.alert("Your name", "Enter the name people will see."); return; }
    if (trimmed === user?.name) { setEditing(false); return; }
    setSaving(true);
    try {
      setUser(await UserService.updateProfile({ name: trimmed }));
      setEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Couldn't save", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async (source: "camera" | "library") => {
    const camera = source === "camera";
    const { status } = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", camera ? "Allow the camera to take a photo." : "Allow your photos to pick one.");
      return;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setPreview(asset.uri);
    setUploading(true);
    try {
      setUser(await UserService.uploadAvatar(asset.uri, asset.mimeType ?? "image/jpeg"));
    } catch {
      Alert.alert("Couldn't update your photo", "Check your connection and try again.");
    } finally {
      setPreview(null);
      setUploading(false);
    }
  };

  const changePhoto = () => {
    const options = ["Take a photo", "Choose from your photos"];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: "Profile photo", options: [...options, "Cancel"], cancelButtonIndex: 2 },
        (i) => { if (i === 0) pickImage("camera"); if (i === 1) pickImage("library"); }
      );
      return;
    }
    Alert.alert("Profile photo", undefined, [
      { text: options[0], onPress: () => pickImage("camera") },
      { text: options[1], onPress: () => pickImage("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const verifyPhone = async () => {
    if (!user?.phone_number) return;
    try {
      await AuthService.sendOtp(user.phone_number);
      router.push({ pathname: "/(auth)/verify-phone" as any, params: { phone: user.phone_number } });
    } catch {
      Alert.alert("Couldn't send the code", "Check your connection and try again.");
    }
  };

  const avatarUri = preview ?? (user?.avatar ? `${user.avatar}?_v=${avatarTs}` : null);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenHeader
        title="Your profile"
        C={{ bg: C.bg, text: C.text, hairline: C.line }}
        rightLabel={editing ? "Save" : undefined}
        rightAction={editing ? save : undefined}
        rightLoading={saving}
      />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        {/* Photo and name */}
        <View style={[s.hero, { backgroundColor: C.card }]}>
          <Pressable onPress={changePhoto} disabled={uploading} accessibilityRole="button" accessibilityLabel="Change your profile photo">
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={s.avatar} contentFit="cover" transition={150} />
            ) : (
              <View style={[s.avatar, s.avatarFallback]}>
                <Text style={s.initials}>{initials}</Text>
              </View>
            )}
            <View style={s.camera}>
              {uploading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="camera" size={15} color="#FFFFFF" />}
            </View>
          </Pressable>

          {editing ? (
            <View style={s.editWrap}>
              <TextInput
                ref={nameRef}
                value={name}
                onChangeText={setName}
                maxLength={NAME_MAX}
                returnKeyType="done"
                onSubmitEditing={save}
                style={[s.nameInput, { color: C.text, backgroundColor: C.field }]}
                placeholder="Your name"
                placeholderTextColor={C.sub}
                accessibilityLabel="Your name"
              />
              <Text style={[s.hint, { color: C.sub }]}>
                Shown on the leaderboard and, unless you post anonymously, on your road reports. {NAME_MAX - name.length} left.
              </Text>
              <Pressable onPress={() => setEditing(false)} hitSlop={8}>
                <Text style={[s.cancel, { color: C.sub }]}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={startEditing} style={s.nameRow} accessibilityRole="button" accessibilityLabel="Edit your name">
              <Text style={[s.name, { color: C.text }]} numberOfLines={1}>{user?.name ?? "—"}</Text>
              <Icon name="create" size={16} color={ORANGE} />
            </Pressable>
          )}

          <View style={s.chips}>
            <View style={[s.chip, { backgroundColor: level.color + "22" }]}>
              <Text style={[s.chipText, { color: level.color }]}>Level {level.n} · {level.name}</Text>
            </View>
            {since ? (
              <View style={[s.chip, { backgroundColor: C.field }]}>
                <Text style={[s.chipText, { color: C.sub }]}>Since {since}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Text style={[s.sectionTitle, { color: C.sub }]}>SIGN-IN</Text>
        <View style={[s.card, { backgroundColor: C.card }]}>
          <InfoRow C={C} icon="mail" label="Email" value={user?.email ?? "—"} />
          <View style={[s.sep, { backgroundColor: C.line }]} />
          <InfoRow
            C={C}
            icon="call"
            label="Phone"
            value={user?.phone_number ?? "No phone number"}
            badge={user?.phone_number ? { text: phoneVerified ? "Verified" : "Not verified", ok: phoneVerified } : undefined}
            action={user?.phone_number && !phoneVerified ? "Verify" : undefined}
            onAction={verifyPhone}
          />
          <View style={[s.sep, { backgroundColor: C.line }]} />
          <InfoRow C={C} icon="lock-closed" label="Signs in with" value={provider ?? "Email and password"} />
        </View>
        <Text style={[s.note, { color: C.sub }]}>
          {provider
            ? `Your password is managed by ${provider}.`
            : "Password resets send a code to your verified phone. Change it in Privacy & security."}
        </Text>

        <Text style={[s.sectionTitle, { color: C.sub }]}>COMMUNITY</Text>
        <Pressable onPress={() => router.push("/(account)/badges" as any)} style={[s.card, s.community, { backgroundColor: C.card }]} accessibilityRole="button">
          <View style={s.communityStat}>
            <Text style={[s.statValue, { color: C.text }]}>{(stats?.points ?? 0).toLocaleString()}</Text>
            <Text style={[s.statLabel, { color: C.sub }]}>points</Text>
          </View>
          <View style={[s.vsep, { backgroundColor: C.line }]} />
          <View style={s.communityStat}>
            <Text style={[s.statValue, { color: C.text }]}>{stats?.submissions_count ?? 0}</Text>
            <Text style={[s.statLabel, { color: C.sub }]}>contributions</Text>
          </View>
          <View style={[s.vsep, { backgroundColor: C.line }]} />
          <View style={s.communityStat}>
            <Text style={[s.statValue, { color: C.text }]}>{stats?.badges_count ?? 0}</Text>
            <Text style={[s.statLabel, { color: C.sub }]}>badges</Text>
          </View>
          <Icon name="chevron-forward" size={16} color={C.sub} />
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  body: { padding: 14, gap: 10 },
  hero: { borderRadius: 22, padding: 20, alignItems: "center", gap: 12, marginBottom: 6 },
  avatar: { width: 104, height: 104, borderRadius: 52 },
  avatarFallback: { backgroundColor: ORANGE, alignItems: "center", justifyContent: "center" },
  initials: { color: "#FFFFFF", fontSize: 34, fontWeight: "800" },
  camera: { position: "absolute", right: 2, bottom: 2, width: 34, height: 34, borderRadius: 17, backgroundColor: ORANGE, borderWidth: 3, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "90%" },
  name: { fontSize: 23, fontWeight: "800", letterSpacing: -0.4, flexShrink: 1 },
  editWrap: { alignSelf: "stretch", gap: 6, alignItems: "center" },
  nameInput: { alignSelf: "stretch", height: 48, borderRadius: 14, paddingHorizontal: 14, fontSize: 18, fontWeight: "700", textAlign: "center" },
  hint: { fontSize: 12.5, textAlign: "center", lineHeight: 17 },
  cancel: { fontSize: 14, fontWeight: "700", paddingTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  chip: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 12 },
  chipText: { fontSize: 12.5, fontWeight: "800" },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, paddingHorizontal: 4, marginTop: 6 },
  card: { borderRadius: 18, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 12, fontWeight: "600" },
  rowValue: { fontSize: 15.5, fontWeight: "600", marginTop: 1 },
  pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  pillText: { fontSize: 12, fontWeight: "800" },
  action: { height: 32, paddingHorizontal: 12, borderRadius: 16, alignItems: "center", justifyContent: "center", marginLeft: 6 },
  actionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 56 },
  note: { fontSize: 12, paddingHorizontal: 6, lineHeight: 17 },
  community: { flexDirection: "row", alignItems: "center", padding: 14, gap: 8 },
  communityStat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 19, fontWeight: "900", letterSpacing: -0.3 },
  statLabel: { fontSize: 11.5, fontWeight: "600", marginTop: 1 },
  vsep: { width: StyleSheet.hairlineWidth, alignSelf: "stretch" },
});
