// components/app/ReportSheet.tsx
//
// "Report an issue": pick a report type from a KakaoMap-style grid of 3D
// icons, then send it from the sticky footer. Draggable (MapSheet), so the
// floating map controls ride above it and the tab bar steps aside.
import { ReportCategory, ReportService } from "@/services/report";
import { REPORT_TYPES, REPORT_TYPE_ORDER } from "@/components/icons/reportIcons";
import { ReportTypeIcon } from "@/components/icons/ReportTypeIcon";
import { PressableScale } from "@/components/ui/PressableScale";
import { useAuthStore } from "@/store/authStore";
import { useContributionStore } from "@/store/contributionStore";
import { showReward } from "@/store/rewardStore";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { MapSheet, type MapSheetHandle } from "./MapSheet";
import { Icon } from "@/components/icons/Icon";

const { height: SH } = Dimensions.get("window");
const ORANGE = "#FF6F00";

const CATS = REPORT_TYPE_ORDER.map((id) => ({ id, ...REPORT_TYPES[id] }));

interface Props {
  onClose:  () => void;
  userLat?: number | null;
  userLng?: number | null;
  /** Picked already (from the Contribute tab's "On the road"). */
  initialType?: ReportCategory | null;
}

export default function ReportSheet({ onClose, userLat, userLng, initialType = null }: Props) {
  const dark = useColorScheme() === "dark";
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sheet = useRef<MapSheetHandle>(null);

  const [selectedCat, setSelectedCat] = useState<ReportCategory | null>(initialType);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [showAuthWall, setShowAuthWall] = useState(false);

  const C = {
    text:    dark ? "#F4F4F5" : "#111827",
    sub:     dark ? "#A1A1AA" : "#6B7280",
    tile:    dark ? "#232326" : "#F6F6F8",
    chip:    dark ? "#27272A" : "#F1F5F9",
    disabled: dark ? "#3F3F46" : "#D4D4D8",
  };

  const selected = selectedCat ? CATS.find((c) => c.id === selectedCat) ?? null : null;
  const hasLocation = userLat != null && userLng != null;

  const submit = async () => {
    if (!selectedCat || busy) return;
    if (!isAuthenticated) { setShowAuthWall(true); return; }
    if (!hasLocation) {
      Alert.alert("Location needed", "We need your current position to pin a report.");
      return;
    }
    setBusy(true);
    try {
      const r = await ReportService.createReport(userLat!, userLng!, selectedCat);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
      useContributionStore.getState().noteReport(r);
      if (r.points_awarded > 0 || r.new_badges.length || r.quests_done.length) {
        showReward({ points: r.points_awarded, badges: r.new_badges, streak: r.streak_days, title: "Alert pinned", quests: r.quests_done });
      }
      setTimeout(() => sheet.current?.close(), 1500);
    } catch (e: any) {
      if (e?.response?.status === 409) {
        Alert.alert("Already on the map", "The same alert is pinned right here. Tap it on the map to confirm it's still there.");
      } else {
        Alert.alert("Couldn't submit", "Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color: C.text }]}>
          {done ? "Alert pinned" : "Report an issue"}
        </Text>
        <View style={[s.locChip, { backgroundColor: C.chip }]}>
          <Icon name={hasLocation ? "location" : "location-outline"} size={12} color={hasLocation ? ORANGE : C.sub} />
          <Text style={[s.locText, { color: C.sub }]} numberOfLines={1}>
            {hasLocation ? "Pinned at your current location" : "Waiting for your location…"}
          </Text>
        </View>
      </View>
      <PressableScale
        onPress={() => sheet.current?.close()}
        hitSlop={12}
        style={[s.closeBtn, { backgroundColor: C.chip }]}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Icon name="close" size={16} color={C.sub} />
      </PressableScale>
    </View>
  );

  const footer = done ? null : (
    <PressableScale
      onPress={submit}
      disabled={!selected || busy}
      accessibilityRole="button"
      accessibilityLabel={selected ? `Send ${selected.label} alert` : "Select what's happening"}
      style={[s.sendBtn, { backgroundColor: selected ? selected.color : C.disabled }]}
    >
      {busy ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <>
          {selected && <ReportTypeIcon type={selected.id} size={26} />}
          <Text style={s.sendText}>
            {selected ? `Send ${selected.label} alert` : "Select what’s happening"}
          </Text>
        </>
      )}
    </PressableScale>
  );

  return (
    <>
      <MapSheet
        ref={sheet}
        snapPoints={[SH * 0.62, SH * 0.9]}
        onClose={onClose}
        backdrop
        header={header}
        footer={footer}
      >
        {done ? (
          <View style={s.doneBox}>
            <View style={s.doneCircle}>
              <Icon name="checkmark" size={36} color="#16A34A" />
            </View>
            <Text style={[s.doneTitle, { color: C.text }]}>Thanks, it&apos;s live!</Text>
            <Text style={[s.doneSub, { color: C.sub }]}>
              Nearby commuters can see your alert now.
            </Text>
          </View>
        ) : (
          <View style={s.grid}>
            {CATS.map((c) => {
              const isSel = c.id === selectedCat;
              return (
                <PressableScale
                  key={c.id}
                  containerStyle={s.tileWrap}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedCat(isSel ? null : c.id);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={`${c.label}: ${c.desc}`}
                  style={[
                    s.tile,
                    {
                      backgroundColor: isSel ? c.color + "16" : C.tile,
                      borderColor: isSel ? c.color : "transparent",
                    },
                  ]}
                >
                  <ReportTypeIcon type={c.id} size={50} />
                  <Text style={[s.tileLabel, { color: C.text }]} numberOfLines={1}>
                    {c.label}
                  </Text>
                  <Text style={[s.tileDesc, { color: C.sub }]} numberOfLines={2}>
                    {c.desc}
                  </Text>
                  {isSel && (
                    <View style={[s.check, { backgroundColor: c.color }]}>
                      <Icon name="checkmark" size={12} color="#FFFFFF" />
                    </View>
                  )}
                </PressableScale>
              );
            })}
          </View>
        )}
      </MapSheet>

      {/* ── Sign-in wall ─────────────────────────────────────────────────── */}
      {showAuthWall && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowAuthWall(false)}>
          <Pressable style={s.wallBackdrop} onPress={() => setShowAuthWall(false)} />
          <View style={[s.wallSheet, { backgroundColor: dark ? "#18181B" : "#FFFFFF" }]}>
            <View style={[s.wallIcon, { backgroundColor: ORANGE + "18" }]}>
              <Icon name="lock-closed" size={28} color={ORANGE} />
            </View>
            <Text style={[s.wallTitle, { color: C.text }]}>Sign in to report</Text>
            <Text style={[s.wallSub, { color: C.sub }]}>
              Help Nairobi commuters stay informed. Sign in to pin a live alert on the map.
            </Text>
            <PressableScale
              containerStyle={{ alignSelf: "stretch" }}
              onPress={() => { setShowAuthWall(false); sheet.current?.close(); router.push("/(auth)/login" as any); }}
              style={s.wallPrimary}
            >
              <Text style={s.wallPrimaryTxt}>Sign In</Text>
              <Icon name="arrow-forward" size={15} color="#fff" />
            </PressableScale>
            <PressableScale
              containerStyle={{ alignSelf: "stretch" }}
              onPress={() => { setShowAuthWall(false); sheet.current?.close(); router.push("/(auth)/register" as any); }}
              style={[s.wallSecondary, { borderColor: dark ? "#3F3F46" : "#D4D4D8" }]}
            >
              <Text style={[s.wallSecondaryTxt, { color: C.text }]}>Create Account</Text>
            </PressableScale>
            <Pressable onPress={() => setShowAuthWall(false)} hitSlop={10}>
              <Text style={[s.wallNotNow, { color: C.sub }]}>Not now</Text>
            </Pressable>
          </View>
        </Modal>
      )}
    </>
  );
}

const GAP = 10;

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingBottom: 14,
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  locChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  locText: { fontSize: 12, fontWeight: "500" },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 14,
    gap: GAP,
  },
  tileWrap: { width: "31.2%" },
  tile: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 6,
    borderRadius: 18,
    borderWidth: 1.5,
    minHeight: 132,
  },
  tileLabel: { fontSize: 13, fontWeight: "700", marginTop: 6, letterSpacing: -0.2 },
  tileDesc: { fontSize: 10.5, lineHeight: 14, textAlign: "center", marginTop: 2 },
  check: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  sendBtn: {
    height: 52,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sendText: { color: "#FFFFFF", fontSize: 15.5, fontWeight: "800", letterSpacing: -0.2 },

  doneBox: { alignItems: "center", paddingTop: 30, paddingHorizontal: 24, gap: 8 },
  doneCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "#16A34A18",
    alignItems: "center", justifyContent: "center", marginBottom: 6,
  },
  doneTitle: { fontSize: 20, fontWeight: "800" },
  doneSub: { fontSize: 13.5, textAlign: "center", lineHeight: 19 },

  wallBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  wallSheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 22, paddingBottom: 36,
    alignItems: "center", gap: 12,
  },
  wallIcon: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  wallTitle: { fontSize: 21, fontWeight: "800", letterSpacing: -0.4, textAlign: "center" },
  wallSub: { fontSize: 13.5, lineHeight: 20, textAlign: "center", marginBottom: 4 },
  wallPrimary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 15, borderRadius: 16, backgroundColor: ORANGE,
  },
  wallPrimaryTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
  wallSecondary: { alignItems: "center", paddingVertical: 14, borderRadius: 16, borderWidth: 1.5 },
  wallSecondaryTxt: { fontSize: 15, fontWeight: "600" },
  wallNotNow: { fontSize: 13, fontWeight: "500", marginTop: 2 },
});
