// components/app/ReportDetailCard.tsx
//
// Detail sheet for a report tapped on the map: what, when, how much the
// community trusts it, and "still there?" voting. Draggable (MapSheet), no
// backdrop, so the map stays usable and the floating controls ride above it.
import type { ReportVoteResult, TransitReport } from "@/services/report";
import { ReportService } from "@/services/report";
import { reportMeta } from "@/components/icons/reportIcons";
import { ReportTypeIcon } from "@/components/icons/ReportTypeIcon";
import { PressableScale } from "@/components/ui/PressableScale";
import { useAuthStore } from "@/store/authStore";
import { useReportVoteStore } from "@/store/reportVoteStore";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { MapSheet, type MapSheetHandle } from "./MapSheet";

const { height: SH } = Dimensions.get("window");
const ORANGE = "#FF6F00";
const GREEN = "#16A34A";
const RED = "#DC2626";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return "Just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function expiresIn(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (!isFinite(ms) || ms <= 0) return "Expired";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `Expires in ${m}m`;
  return `Expires in ${Math.floor(m / 60)}h`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

const INITIAL_COLORS = ["#FF6F00", "#007AFF", "#34C759", "#AF52DE", "#FF9500", "#5856D6", "#FF2D55"];
function nameColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return INITIAL_COLORS[h % INITIAL_COLORS.length];
}

/** Server reliability (0–1) as a label and colour. */
function confidence(r: number): { label: string; color: string } {
  if (r >= 0.7) return { label: "High confidence", color: GREEN };
  if (r >= 0.4) return { label: "Some confirmations", color: "#F59E0B" };
  return { label: "Unconfirmed", color: "#9CA3AF" };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  report:        TransitReport;
  clusterCount?: number;
  onClose:       () => void;
  /**
   * Called with the server's result after every vote, so the map can update
   * its copy of the report (counts, my_vote) or drop it once dismissed.
   */
  onVoted?:      (reportId: string, result: ReportVoteResult) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReportDetailCard({ report, clusterCount = 1, onClose, onVoted }: Props) {
  const dark   = useColorScheme() === "dark";
  const router = useRouter();
  const { user } = useAuthStore();
  const meta   = reportMeta(report.type);
  const sheet  = useRef<MapSheetHandle>(null);

  const [upvotes,     setUpvotes]     = useState(report.upvotes);
  const [downvotes,   setDownvotes]   = useState(report.downvotes);
  // The server's my_vote is the truth (same on every device). The local store
  // only fills in for older API responses that don't include it.
  const [userVote,    setUserVote]    = useState<"up" | "down" | null>(() =>
    report.my_vote !== undefined
      ? report.my_vote
      : useReportVoteStore.getState().votes[report.id] ?? null
  );
  const [voting,      setVoting]      = useState(false);
  const [showAuthWall, setShowAuthWall] = useState(false);

  const persistVote = (v: "up" | "down" | null) => {
    setUserVote(v);
    useReportVoteStore.getState().setVote(report.id, v);
  };

  // ── Voting (optimistic) ───────────────────────────────────────────────────────
  // Tap 👍 / 👎 to vote, tap a different one to switch, tap your current vote
  // again to take it back. The server sets (not toggles) the vote, so the
  // request always says exactly what we want; its answer is the final word.
  const handleVote = async (v: "up" | "down") => {
    if (!user) { setShowAuthWall(true); return; }
    if (voting) return;
    Haptics.selectionAsync();
    const prevVote = userVote;
    const prevUp   = upvotes;
    const prevDown = downvotes;
    const next     = prevVote === v ? null : v;

    persistVote(next);
    if (prevVote === "up")   setUpvotes(n => Math.max(0, n - 1));
    if (prevVote === "down") setDownvotes(n => Math.max(0, n - 1));
    if (next === "up")       setUpvotes(n => n + 1);
    if (next === "down")     setDownvotes(n => n + 1);

    setVoting(true);
    try {
      const res = await ReportService.voteReport(report.id, next ?? "clear");
      setUpvotes(res.upvotes);
      setDownvotes(res.downvotes);
      persistVote(res.my_vote);
      onVoted?.(report.id, res);
      // The community voted it down: nothing left to show.
      if (res.status === "dismissed") sheet.current?.close();
    } catch {
      persistVote(prevVote);
      setUpvotes(prevUp);
      setDownvotes(prevDown);
    } finally {
      setVoting(false);
    }
  };

  const share = () => {
    Share.share({
      message:
        `${meta.label} reported on Navigo ${timeAgo(report.created_at).toLowerCase()}.\n` +
        `https://www.google.com/maps/search/?api=1&query=${report.lat},${report.lng}`,
    }).catch(() => {});
  };

  // ── Palette ───────────────────────────────────────────────────────────────────
  const C = {
    text:  dark ? "#F4F4F5" : "#111827",
    sub:   dark ? "#A1A1AA" : "#6B7280",
    card:  dark ? "#232326" : "#F6F6F8",
    chip:  dark ? "#27272A" : "#F1F5F9",
    track: dark ? "#3F3F46" : "#E5E7EB",
  };

  const ago     = timeAgo(report.created_at);
  const expires = expiresIn(report.expires_at);
  const rColor  = report.reporter ? nameColor(report.reporter.name) : ORANGE;
  const reliability = Math.max(0, Math.min(1, report.reliability ?? 0.5));
  const conf    = confidence(reliability);

  const header = (
    <View style={s.headerRow}>
      <ReportTypeIcon type={report.type} size={56} />
      <View style={s.headerText}>
        <Text style={[s.catLabel, { color: C.text }]}>{meta.label}</Text>
        <Text style={[s.catDesc, { color: C.sub }]} numberOfLines={1}>{meta.desc}</Text>
        <View style={s.metaRow}>
          {!!ago && <Text style={[s.metaTxt, { color: C.sub }]}>{ago}</Text>}
          {!!ago && !!expires && <View style={[s.metaDot, { backgroundColor: C.sub }]} />}
          {!!expires && <Text style={[s.metaTxt, { color: C.sub }]}>{expires}</Text>}
          {clusterCount > 1 && (
            <>
              <View style={[s.metaDot, { backgroundColor: C.sub }]} />
              <Text style={[s.metaTxt, { color: meta.color, fontWeight: "700" }]}>
                +{clusterCount - 1} more here
              </Text>
            </>
          )}
        </View>
      </View>
      <PressableScale
        onPress={() => sheet.current?.close()}
        hitSlop={12}
        style={[s.roundBtn, { backgroundColor: C.chip }]}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Ionicons name="close" size={16} color={C.sub} />
      </PressableScale>
    </View>
  );

  return (
    <>
      <MapSheet ref={sheet} snapPoints={[340, SH * 0.6]} onClose={onClose} header={header}>
        <View style={s.body}>
          {/* Still there? */}
          <Text style={[s.sectionLabel, { color: C.sub }]}>STILL THERE?</Text>
          <View style={s.voteRow}>
            <VoteButton
              icon="thumbs-up"
              label="Still there"
              count={upvotes}
              color={GREEN}
              active={userVote === "up"}
              disabled={voting}
              bg={C.card}
              text={C.text}
              onPress={() => handleVote("up")}
            />
            <VoteButton
              icon="thumbs-down"
              label="Gone"
              count={downvotes}
              color={RED}
              active={userVote === "down"}
              disabled={voting}
              bg={C.card}
              text={C.text}
              onPress={() => handleVote("down")}
            />
          </View>
          {userVote && (
            <Text style={[s.voteHint, { color: C.sub }]}>Tap your vote again to undo it.</Text>
          )}

          {/* Community confidence */}
          <View style={[s.confCard, { backgroundColor: C.card }]}>
            <View style={s.confHead}>
              <Text style={[s.confLabel, { color: conf.color }]}>{conf.label}</Text>
              <Text style={[s.confPct, { color: C.sub }]}>{Math.round(reliability * 100)}%</Text>
            </View>
            <View style={[s.track, { backgroundColor: C.track }]}>
              <View style={[s.fill, { width: `${reliability * 100}%`, backgroundColor: conf.color }]} />
            </View>
            <Text style={[s.confSub, { color: C.sub }]}>
              {upvotes} confirmed · {downvotes} said it&apos;s gone
            </Text>
          </View>

          {/* Reporter */}
          <View style={[s.reporterRow, { backgroundColor: C.card }]}>
            <View style={[s.initialsCircle, { backgroundColor: rColor + "22", borderColor: rColor + "33" }]}>
              {report.reporter
                ? <Text style={[s.initials, { color: rColor }]}>{initialsOf(report.reporter.name)}</Text>
                : <Ionicons name="person" size={16} color={rColor} />}
            </View>
            <View style={s.reporterText}>
              <Text style={[s.reporterName, { color: C.text }]} numberOfLines={1}>
                {report.reporter?.name ?? "Anonymous commuter"}
              </Text>
              <Text style={[s.reporterLevel, { color: C.sub }]} numberOfLines={1}>
                {report.reporter?.level ?? "Community report"}
              </Text>
            </View>
            <PressableScale
              onPress={share}
              style={[s.shareBtn, { backgroundColor: C.chip }]}
              accessibilityRole="button"
              accessibilityLabel="Share this alert"
            >
              <Ionicons name="share-outline" size={15} color={C.text} />
              <Text style={[s.shareTxt, { color: C.text }]}>Share</Text>
            </PressableScale>
          </View>
        </View>
      </MapSheet>

      {/* ── Sign-in wall ─────────────────────────────────────────────────── */}
      {showAuthWall && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowAuthWall(false)}>
          <Pressable style={s.wallBackdrop} onPress={() => setShowAuthWall(false)} />
          <View style={[s.wallSheet, { backgroundColor: dark ? "#18181B" : "#FFFFFF" }]}>
            <View style={[s.wallIcon, { backgroundColor: ORANGE + "18" }]}>
              <Ionicons name="lock-closed" size={28} color={ORANGE} />
            </View>
            <Text style={[s.wallTitle, { color: C.text }]}>Join the conversation</Text>
            <Text style={[s.wallSub, { color: C.sub }]}>
              Sign in to vote on reports and help Nairobi commuters know what&apos;s actually happening on the road.
            </Text>
            <PressableScale
              containerStyle={{ alignSelf: "stretch" }}
              onPress={() => { setShowAuthWall(false); router.push("/(auth)/login" as any); }}
              style={s.wallPrimary}
            >
              <Text style={s.wallPrimaryTxt}>Sign In</Text>
              <Ionicons name="arrow-forward" size={15} color="#fff" />
            </PressableScale>
            <PressableScale
              containerStyle={{ alignSelf: "stretch" }}
              onPress={() => { setShowAuthWall(false); router.push("/(auth)/register" as any); }}
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

function VoteButton({
  icon, label, count, color, active, disabled, bg, text, onPress,
}: {
  icon: "thumbs-up" | "thumbs-down";
  label: string;
  count: number;
  color: string;
  active: boolean;
  disabled: boolean;
  bg: string;
  text: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      containerStyle={{ flex: 1 }}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${count}`}
      style={[
        s.voteBtn,
        active
          ? { backgroundColor: color + "18", borderColor: color }
          : { backgroundColor: bg, borderColor: "transparent" },
      ]}
    >
      <Ionicons name={active ? icon : `${icon}-outline`} size={18} color={active ? color : text} />
      <Text style={[s.voteLabel, { color: active ? color : text }]}>{label}</Text>
      <View style={[s.countPill, { backgroundColor: active ? color : text + "14" }]}>
        <Text style={[s.countTxt, { color: active ? "#FFFFFF" : text }]}>{count}</Text>
      </View>
    </PressableScale>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 14 },
  headerText: { flex: 1, gap: 2 },
  catLabel:   { fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
  catDesc:    { fontSize: 12.5 },
  metaRow:    { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3, flexWrap: "wrap" },
  metaTxt:    { fontSize: 11.5, fontWeight: "500" },
  metaDot:    { width: 3, height: 3, borderRadius: 1.5 },
  roundBtn:   { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },

  body: { paddingHorizontal: 18, gap: 12 },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  voteRow: { flexDirection: "row", gap: 10 },
  voteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 50, borderRadius: 16, borderWidth: 1.5,
  },
  voteLabel: { fontSize: 14.5, fontWeight: "700" },
  countPill: { minWidth: 24, height: 22, borderRadius: 11, paddingHorizontal: 7, alignItems: "center", justifyContent: "center" },
  countTxt: { fontSize: 12, fontWeight: "800" },
  voteHint: { fontSize: 11.5, marginTop: -4 },

  confCard: { borderRadius: 16, padding: 14, gap: 8 },
  confHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  confLabel: { fontSize: 13.5, fontWeight: "800" },
  confPct: { fontSize: 12.5, fontWeight: "600" },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  confSub: { fontSize: 12 },

  reporterRow: {
    flexDirection: "row", alignItems: "center", gap: 11,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16,
  },
  initialsCircle: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  initials:      { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  reporterText:  { flex: 1, gap: 1 },
  reporterName:  { fontSize: 13.5, fontWeight: "700" },
  reporterLevel: { fontSize: 11.5 },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  shareTxt: { fontSize: 12.5, fontWeight: "700" },

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
