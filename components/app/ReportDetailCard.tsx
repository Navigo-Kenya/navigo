import type { ReportVoteResult, TransitReport } from "@/services/report";
import { ReportService } from "@/services/report";
import { reportMeta } from "@/components/icons/reportIcons";
import { ReportTypeIcon } from "@/components/icons/ReportTypeIcon";
import { useAuthStore } from "@/store/authStore";
import { useReportVoteStore } from "@/store/reportVoteStore";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";

const SHEET_H    = 300;
const WALL_H     = 440;

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

  // Syncs local vote state + store so the card opens with the correct state
  // on subsequent opens during the same session.
  const persistVote = (v: "up" | "down" | null) => {
    setUserVote(v);
    useReportVoteStore.getState().setVote(report.id, v);
  };

  const sheetY    = useRef(new Animated.Value(SHEET_H)).current;
  const backdropA = useRef(new Animated.Value(0)).current;
  const wallY     = useRef(new Animated.Value(WALL_H)).current;
  const wallBgA   = useRef(new Animated.Value(0)).current;

  // ── Entrance ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, damping: 28, stiffness: 260, mass: 0.85 }),
      Animated.timing(backdropA, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Auth wall enter/exit ──────────────────────────────────────────────────────
  useEffect(() => {
    if (showAuthWall) {
      Animated.parallel([
        Animated.spring(wallY, { toValue: 0, useNativeDriver: true, damping: 28, stiffness: 260, mass: 0.9 }),
        Animated.timing(wallBgA, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [showAuthWall]);

  const dismissWall = () =>
    Animated.parallel([
      Animated.timing(wallY,   { toValue: WALL_H, duration: 240, useNativeDriver: true }),
      Animated.timing(wallBgA, { toValue: 0,       duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setShowAuthWall(false);
      wallY.setValue(WALL_H);
      wallBgA.setValue(0);
    });

  // ── Main dismiss ──────────────────────────────────────────────────────────────
  const dismiss = () =>
    Animated.parallel([
      Animated.timing(sheetY,    { toValue: SHEET_H, duration: 240, useNativeDriver: true }),
      Animated.timing(backdropA, { toValue: 0,        duration: 180, useNativeDriver: true }),
    ]).start(onClose);

  // ── Drag-to-dismiss ───────────────────────────────────────────────────────────
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_, g) => g.dy > 5,
      onPanResponderMove:    (_, g) => { if (g.dy > 0) sheetY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.vy > 0.5 || g.dy > 60) dismiss();
        else Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, damping: 28, stiffness: 260 }).start();
      },
    })
  ).current;

  // ── Voting (optimistic) ───────────────────────────────────────────────────────
  // Tap 👍 / 👎 to vote, tap a different one to switch, tap your current vote
  // again to take it back. The server sets (not toggles) the vote, so the
  // request always says exactly what we want; its answer is the final word.
  const handleVote = async (v: "up" | "down") => {
    if (!user) { setShowAuthWall(true); return; }
    if (voting) return;
    const prevVote = userVote;
    const prevUp   = upvotes;
    const prevDown = downvotes;
    const next     = prevVote === v ? null : v;

    // Optimistic counts: take the old vote off, put the new one on.
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
      if (res.status === "dismissed") dismiss();
    } catch {
      persistVote(prevVote);
      setUpvotes(prevUp);
      setDownvotes(prevDown);
    } finally {
      setVoting(false);
    }
  };

  // ── Palette ───────────────────────────────────────────────────────────────────
  const bg      = dark ? "#1C1C1E" : "#FFFFFF";
  const txt     = dark ? "#F2F2F7" : "#111111";
  const muted   = dark ? "#8E8E93" : "#8A8A8E";
  const cardBg  = dark ? "#2C2C2E" : "#F2F2F7";
  const pillBg  = dark ? "#48484A" : "#D1D1D6";
  const divider = dark ? "#38383A" : "#E5E5EA";
  const GREEN   = "#34C759";
  const RED     = "#FF3B30";
  const ORANGE  = "#FF6F00";

  const ago     = timeAgo(report.created_at);
  const expires = expiresIn(report.expires_at);
  const rColor  = report.reporter ? nameColor(report.reporter.name) : ORANGE;

  return (
    <>
      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <Animated.View style={[s.backdrop, { opacity: backdropA }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
      </Animated.View>

      {/* ── Detail sheet ──────────────────────────────────────────────────── */}
      <Animated.View style={[s.sheet, { backgroundColor: bg, transform: [{ translateY: sheetY }] }]}>
        <View {...pan.panHandlers} style={s.dragZone}>
          <View style={[s.pill, { backgroundColor: pillBg }]} />
        </View>

        <View style={s.body}>
          {/* Header */}
          <View style={s.headerRow}>
            <ReportTypeIcon type={report.type} size={52} />

            <View style={s.headerText}>
              <Text style={[s.catLabel, { color: txt }]}>{meta.label}</Text>
              <Text style={[s.catDesc,  { color: muted }]} numberOfLines={1}>{meta.desc}</Text>
              <View style={s.metaRow}>
                {!!ago && <Text style={[s.metaTxt, { color: muted }]}>{ago}</Text>}
                {!!ago && !!expires && <View style={[s.metaDot, { backgroundColor: muted }]} />}
                {!!expires && <Text style={[s.metaTxt, { color: muted }]}>{expires}</Text>}
                {clusterCount > 1 && (
                  <>
                    <View style={[s.metaDot, { backgroundColor: muted }]} />
                    <Text style={[s.metaTxt, { color: meta.color, fontWeight: "600" }]}>
                      +{clusterCount - 1} more here
                    </Text>
                  </>
                )}
              </View>
            </View>

            <Pressable onPress={dismiss} hitSlop={12} style={[s.closeBtn, { backgroundColor: cardBg }]}>
              <Ionicons name="close" size={14} color={muted} />
            </Pressable>
          </View>

          {/* Reporter row — always shown; falls back to "Anonymous" for guests */}
          <View style={[s.reporterRow, { backgroundColor: cardBg }]}>
            <View style={[s.initialsCircle, { backgroundColor: rColor + "22", borderColor: rColor + "33" }]}>
              {report.reporter
                ? <Text style={[s.initials, { color: rColor }]}>{initialsOf(report.reporter.name)}</Text>
                : <Ionicons name="person" size={16} color={rColor} />}
            </View>
            <View style={s.reporterText}>
              <Text style={[s.reporterName, { color: txt }]} numberOfLines={1}>
                {report.reporter?.name ?? "Anonymous commuter"}
              </Text>
              <Text style={[s.reporterLevel, { color: muted }]} numberOfLines={1}>
                {report.reporter?.level ?? "Community report"}
              </Text>
            </View>
            <View style={[s.reporterTag, { backgroundColor: meta.color + "18" }]}>
              <Ionicons name="megaphone" size={11} color={meta.color} />
              <Text style={[s.reporterTagTxt, { color: meta.color }]}>Reporter</Text>
            </View>
          </View>

          {/* Divider */}
          <View style={[s.divider, { backgroundColor: divider }]} />

          {/* Vote section */}
          <View style={s.voteRow}>
            <Text style={[s.votePrompt, { color: muted }]}>Still accurate?</Text>

            <View style={s.voteBtns}>
              {/* Tap again to take your vote back */}
              <Pressable
                onPress={() => handleVote("up")}
                disabled={voting}
                accessibilityRole="button"
                accessibilityState={{ selected: userVote === "up" }}
                accessibilityLabel={`Still there, ${upvotes} confirmations`}
                style={[
                  s.voteBtn,
                  userVote === "up"
                    ? { backgroundColor: GREEN + "1C", borderColor: GREEN + "50", borderWidth: 1 }
                    : { backgroundColor: cardBg },
                ]}
              >
                <Ionicons
                  name={userVote === "up" ? "thumbs-up" : "thumbs-up-outline"}
                  size={16}
                  color={userVote === "up" ? GREEN : muted}
                />
                <Text style={[s.voteCnt, { color: userVote === "up" ? GREEN : txt }]}>{upvotes}</Text>
              </Pressable>

              <Pressable
                onPress={() => handleVote("down")}
                disabled={voting}
                accessibilityRole="button"
                accessibilityState={{ selected: userVote === "down" }}
                accessibilityLabel={`Not there anymore, ${downvotes} reports`}
                style={[
                  s.voteBtn,
                  userVote === "down"
                    ? { backgroundColor: RED + "1C", borderColor: RED + "50", borderWidth: 1 }
                    : { backgroundColor: cardBg },
                ]}
              >
                <Ionicons
                  name={userVote === "down" ? "thumbs-down" : "thumbs-down-outline"}
                  size={16}
                  color={userVote === "down" ? RED : muted}
                />
                <Text style={[s.voteCnt, { color: userVote === "down" ? RED : txt }]}>{downvotes}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* ── Auth wall (Modal, appears above detail card) ──────────────────── */}
      {showAuthWall && (
        <Modal visible transparent animationType="none" onRequestClose={dismissWall}>
          <Animated.View style={[s.wallBackdrop, { opacity: wallBgA }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={dismissWall} />
          </Animated.View>

          <Animated.View style={[s.wallSheet, { backgroundColor: bg, transform: [{ translateY: wallY }] }]}>
            {/* Pill */}
            <View style={s.dragZone}>
              <View style={[s.pill, { backgroundColor: pillBg }]} />
            </View>

            <View style={s.wallBody}>
              {/* Lock icon */}
              <View style={[s.wallIconWrap, { backgroundColor: ORANGE + "18" }]}>
                <Ionicons name="lock-closed" size={28} color={ORANGE} />
              </View>

              <Text style={[s.wallTitle, { color: txt }]}>Join the conversation</Text>
              <Text style={[s.wallSub, { color: muted }]}>
                Sign in to vote on reports and help Nairobi commuters know what&apos;s actually happening on the road.
              </Text>

              {/* Sign In */}
              <Pressable
                onPress={() => { dismissWall(); router.push("/(auth)/login" as any); }}
                style={[s.wallPrimaryBtn, { backgroundColor: ORANGE }]}
              >
                <Text style={s.wallPrimaryTxt}>Sign In</Text>
                <Ionicons name="arrow-forward" size={15} color="#fff" />
              </Pressable>

              {/* Create Account */}
              <Pressable
                onPress={() => { dismissWall(); router.push("/(auth)/register" as any); }}
                style={[s.wallSecondaryBtn, { borderColor: dark ? "#48484A" : "#D1D1D6" }]}
              >
                <Text style={[s.wallSecondaryTxt, { color: txt }]}>Create Account</Text>
              </Pressable>

              {/* Dismiss */}
              <Pressable onPress={dismissWall} hitSlop={10}>
                <Text style={[s.wallNotNow, { color: muted }]}>Not now</Text>
              </Pressable>
            </View>
          </Animated.View>
        </Modal>
      )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.22)",
    zIndex: 26,
  },
  sheet: {
    position:             "absolute",
    bottom: 0, left: 0, right: 0,
    height:               SHEET_H,
    borderTopLeftRadius:  26,
    borderTopRightRadius: 26,
    zIndex:               27,
    elevation:            27,
    shadowColor:          "#000",
    shadowOffset:         { width: 0, height: -3 },
    shadowOpacity:        0.10,
    shadowRadius:         14,
  },

  dragZone: { alignItems: "center", paddingTop: 10, paddingBottom: 6 },
  pill:     { width: 34, height: 4, borderRadius: 2 },

  body: { paddingHorizontal: 20 },

  headerRow:  { flexDirection: "row", alignItems: "center", gap: 14, paddingBottom: 12 },
  iconBubble: {
    width: 54, height: 54, borderRadius: 17,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  headerText: { flex: 1, gap: 2 },
  catLabel:   { fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
  catDesc:    { fontSize: 12, lineHeight: 16 },
  metaRow:    { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3, flexWrap: "wrap" },
  metaTxt:    { fontSize: 11 },
  metaDot:    { width: 3, height: 3, borderRadius: 1.5 },
  closeBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },

  reporterRow: {
    flexDirection: "row", alignItems: "center", gap: 11,
    paddingVertical: 9, paddingHorizontal: 11,
    borderRadius: 14, marginBottom: 14,
  },
  initialsCircle: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, flexShrink: 0,
  },
  initials:      { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  reporterText:  { flex: 1, gap: 1 },
  reporterName:  { fontSize: 13.5, fontWeight: "700", letterSpacing: -0.2 },
  reporterLevel: { fontSize: 11.5 },
  reporterTag: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9, flexShrink: 0,
  },
  reporterTagTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.2 },

  divider: { height: StyleSheet.hairlineWidth, marginBottom: 16 },

  voteRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  votePrompt: { fontSize: 13, fontWeight: "500" },
  voteBtns:   { flexDirection: "row", gap: 10 },
  voteBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 18, paddingVertical: 11, borderRadius: 22,
    borderWidth: 0,
  },
  voteCnt: { fontSize: 14, fontWeight: "600" },

  // ── Auth wall ──────────────────────────────────────────────────────────────
  wallBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  wallSheet: {
    position:             "absolute",
    bottom: 0, left: 0, right: 0,
    height:               WALL_H,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    shadowColor:          "#000",
    shadowOffset:         { width: 0, height: -4 },
    shadowOpacity:        0.18,
    shadowRadius:         20,
    elevation:            40,
  },
  wallBody: {
    paddingHorizontal: 26,
    paddingTop: 6,
    paddingBottom: 28,
    alignItems: "center",
    gap: 14,
  },
  wallIconWrap: {
    width: 66, height: 66, borderRadius: 21,
    alignItems: "center", justifyContent: "center",
    marginBottom: 2,
  },
  wallTitle: {
    fontSize: 21, fontWeight: "800", letterSpacing: -0.4, textAlign: "center",
  },
  wallSub: {
    fontSize: 13.5, lineHeight: 20, textAlign: "center",
    marginBottom: 6, paddingHorizontal: 4,
  },
  wallPrimaryBtn: {
    width: "100%", flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8,
    paddingVertical: 15, borderRadius: 16,
  },
  wallPrimaryTxt: {
    color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: -0.2,
  },
  wallSecondaryBtn: {
    width: "100%", alignItems: "center",
    paddingVertical: 14, borderRadius: 16, borderWidth: 1.5,
  },
  wallSecondaryTxt: {
    fontSize: 15, fontWeight: "600", letterSpacing: -0.2,
  },
  wallNotNow: {
    fontSize: 13, fontWeight: "500", marginTop: 2,
  },
});
