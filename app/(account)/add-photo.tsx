import { ScreenHeader } from "@/components/app/ScreenHeader";
import { useContributionStore } from "@/store/contributionStore";
import { showReward } from "@/store/rewardStore";
import { CONTRIBUTION_POINTS, FIRST_PHOTO_BONUS } from "@/services/contribution";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { Icon } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";
const GREY   = "#8E8E93";

function makeC(dark: boolean) {
  return {
    bg:       dark ? "#0F0F0F" : "#F6F7F8",
    card:     dark ? "#1C1C1E" : "#FFFFFF",
    text:     dark ? "#FFFFFF" : "#1C1C1E",
    sub:      dark ? GREY      : "#6B7280",
    hairline: dark ? "#2C2C2E" : "#E5E7EB",
    border:   dark ? "#3A3A3C" : "#E5E7EB",
    input:    dark ? "#2C2C2E" : "#F3F4F6",
  };
}

export default function AddPhotoScreen() {
  const dark   = useColorScheme() === "dark";
  const C      = makeC(dark);
  const router = useRouter();
  const params = useLocalSearchParams<{ stopName?: string; stopId?: string }>();

  const { submit } = useContributionStore();

  const [imageUri, setImageUri]   = useState<string | null>(null);
  const [base64, setBase64]       = useState<string | null>(null);
  const [mimeType, setMimeType]   = useState<string>("image/jpeg");
  const [stopName, setStopName]   = useState(params.stopName ?? "");
  const [loading, setLoading]     = useState(false);

  const pickImage = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!perm.granted) {
      Alert.alert("Permission needed", fromCamera ? "Camera access is required." : "Photo library access is required.");
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7, mediaTypes: "images" })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7, mediaTypes: "images" });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setImageUri(asset.uri);
      setBase64(asset.base64 ?? null);
      setMimeType(asset.mimeType ?? "image/jpeg");
    }
  };

  const handleSubmit = async () => {
    if (!imageUri || !base64) {
      Alert.alert("No photo selected", "Please pick or take a photo first.");
      return;
    }
    setLoading(true);
    try {
      const res = await submit({
        type: "stop_photo",
        stop_id: params.stopId ?? undefined,
        title: stopName.trim() ? `Photo: ${stopName.trim()}` : "Stop photo",
        data: {
          photo_url: `data:${mimeType};base64,${base64}`,
          mime_type: mimeType,
        },
      });
      router.back();
      showReward({ points: 0, title: "Photo sent for review", pendingPoints: CONTRIBUTION_POINTS.stop_photo, quests: res.quests_done, streak: res.streak_days });
    } catch {
      Alert.alert("Error", "Could not submit your photo. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <ScreenHeader
        title={params.stopName ? `Photo: ${params.stopName}` : "Add Stop Photo"}
        C={{ bg: C.bg, text: C.text, hairline: C.hairline }}
      />

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {/* Photo picker area */}
        {imageUri ? (
          <View style={s.previewContainer}>
            <Image source={{ uri: imageUri }} style={s.preview} contentFit="cover" />
            <Pressable
              style={s.changeBtn}
              onPress={() =>
                Alert.alert("Change photo", undefined, [
                  { text: "Take photo",    onPress: () => pickImage(true)  },
                  { text: "Choose from library", onPress: () => pickImage(false) },
                  { text: "Cancel", style: "cancel" },
                ])
              }
            >
              <Text style={s.changeBtnText}>Change photo</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[s.pickerPlaceholder, { backgroundColor: C.card, borderColor: C.border }]}>
            <Icon name="camera-outline" size={48} color={C.sub} />
            <Text style={[s.placeholderText, { color: C.sub }]}>Add a stop photo</Text>
            <View style={s.pickerBtns}>
              <Pressable
                style={[s.pickerBtn, { backgroundColor: ORANGE }]}
                onPress={() => pickImage(true)}
              >
                <Icon name="camera" size={18} color="#FFF" />
                <Text style={s.pickerBtnText}>Camera</Text>
              </Pressable>
              <Pressable
                style={[s.pickerBtn, { backgroundColor: C.input }]}
                onPress={() => pickImage(false)}
              >
                <Icon name="images-outline" size={18} color={C.text} />
                <Text style={[s.pickerBtnText, { color: C.text }]}>Library</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Stop name */}
        <Text style={[s.label, { color: C.sub }]}>STOP NAME</Text>
        <TextInput
          style={[
            s.input,
            { backgroundColor: C.input, color: C.text, borderColor: C.border },
            !!params.stopId && { opacity: 0.6 },
          ]}
          placeholder="E.g. Kencom Stage, Westlands…"
          placeholderTextColor={C.sub}
          value={stopName}
          onChangeText={setStopName}
          editable={!params.stopId}
        />

        <Text style={[s.hint, { color: C.sub }]}>
          Photos help the community navigate stops. High-quality photos of entrances, signage, and
          waiting areas are most useful. You&apos;ll earn +{CONTRIBUTION_POINTS.stop_photo} Safiri Points when
          approved (+{CONTRIBUTION_POINTS.stop_photo + FIRST_PHOTO_BONUS} if it&apos;s the first photo of this stop).
        </Text>

        <Pressable
          style={[s.submitBtn, (!imageUri || loading) && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={!imageUri || loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Icon name="cloud-upload-outline" size={18} color="#FFF" />
              <Text style={s.submitText}>Submit for Review</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, paddingBottom: 48, gap: 14 },

  previewContainer: { borderRadius: 16, overflow: "hidden" },
  preview: { width: "100%", height: 240 },
  changeBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  changeBtnText: { color: "#FFF", fontWeight: "600", fontSize: 13 },

  pickerPlaceholder: {
    height: 200,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  placeholderText: { fontSize: 15 },
  pickerBtns: { flexDirection: "row", gap: 12, marginTop: 4 },
  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  pickerBtnText: { color: "#FFF", fontWeight: "600", fontSize: 14 },

  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  hint: { fontSize: 13, lineHeight: 18 },

  submitBtn: {
    backgroundColor: ORANGE,
    height: 50,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  submitText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});
