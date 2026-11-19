// components/badges/NavigoBadge.tsx
//
// Navigo's own badges, drawn in code: a medallion whose shape says what you
// did, whose metal says how far you've gone, with a rim of shanga (Maasai
// beadwork) that grows richer with each tier.
//
//   Shape (family)          Road reports: a road-sign shield
//                           Photos: a lens, with its aperture
//                           Traffic & delays: a route-marker hexagon
//                           Reviews: a speech bubble
//                           Map edits: a compass diamond
//                           Milestones: an eight-point star
//   Metal (tier, Swahili)   Shaba (copper), Fedha (silver), Dhahabu (gold),
//                           Almasi (diamond), Nyota (star)
//   Beads                   one colour pair at Shaba, the full six-colour
//                           shanga at Nyota
//
// Locked badges are grey, with a ring showing the real progress towards
// them when the API reports it.
import React, { memo, useMemo } from "react";
import { View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";
import { Icon } from "@/components/icons/Icon";
import type { Badge, CommunityStats } from "@/services/contribution";

export type BadgeFamily = "report" | "photo" | "traffic" | "voice" | "pioneer" | "milestone";

export const FAMILY_LABEL: Record<BadgeFamily, string> = {
  report: "Road reports",
  traffic: "Traffic & delays",
  photo: "Photos",
  voice: "Reviews",
  pioneer: "Map edits",
  milestone: "Milestones",
};

/** Families in the order the badges screen shows them. */
export const FAMILY_ORDER: BadgeFamily[] = ["report", "traffic", "photo", "voice", "pioneer", "milestone"];

export interface Tier {
  key: string;
  name: string;
  /** Rim metal, light to dark. */
  metal: [string, string];
}

export const TIERS: Tier[] = [
  { key: "shaba",   name: "Shaba",   metal: ["#F0B27A", "#9A5524"] },
  { key: "fedha",   name: "Fedha",   metal: ["#F1F4F8", "#8A97A8"] },
  { key: "dhahabu", name: "Dhahabu", metal: ["#FFE08A", "#B7860B"] },
  { key: "almasi",  name: "Almasi",  metal: ["#C9F3FF", "#3A8FB7"] },
  { key: "nyota",   name: "Nyota",   metal: ["#FFD27A", "#7A3E00"] },
];

/** Shanga colours: red, white, blue, green, orange, yellow. */
const SHANGA = ["#D7263D", "#F7F3EA", "#1E5AA8", "#1B8A5A", "#F28C28", "#F6C343"];
const BEADS_FOR_TIER = [
  ["#F7F3EA", "#D7263D"],
  ["#D7263D", "#F7F3EA", "#1E5AA8"],
  ["#D7263D", "#F7F3EA", "#1E5AA8", "#1B8A5A"],
  ["#D7263D", "#F28C28", "#F7F3EA", "#1E5AA8", "#1B8A5A"],
  SHANGA,
];

type BadgeLike = Pick<Badge, "slug" | "requirement_type" | "requirement_meta" | "requirement_value">;

export function familyOf(b: BadgeLike): BadgeFamily {
  const t = String(b.requirement_meta?.type ?? "");
  switch (b.requirement_type) {
    case "report_count":
    case "report_type_count":
      return "report";
    case "approved_type_count":
      return "pioneer";
    case "type_count":
      if (t === "stop_photo") return "photo";
      if (t === "delay_report") return "traffic";
      if (t === "stop_review") return "voice";
      return "milestone";
    default:
      return "milestone";
  }
}

/**
 * A badge's tier (1–5): its rank by requirement among the badges of the
 * same family and requirement (First Alert, Road Reporter, City Watchman…).
 */
export function tierOf(b: BadgeLike, all: BadgeLike[]): number {
  const fam = familyOf(b);
  const same = all
    .filter((x) => familyOf(x) === fam && x.requirement_type === b.requirement_type && String(x.requirement_meta?.type ?? "") === String(b.requirement_meta?.type ?? ""))
    .map((x) => x.requirement_value)
    .sort((a, c) => a - c);
  const i = same.indexOf(b.requirement_value);
  return Math.min(TIERS.length, Math.max(1, i + 1));
}

/**
 * Real progress towards a badge from the API's counts (null when this API
 * build doesn't send them: no invented numbers).
 */
export function badgeProgress(b: BadgeLike, stats: CommunityStats | null): { current: number; target: number } | null {
  if (!stats) return null;
  const p = stats.progress;
  const t = String(b.requirement_meta?.type ?? "");
  let current: number | null = null;
  switch (b.requirement_type) {
    case "points":              current = stats.points; break;
    case "total_count":         current = p?.total ?? stats.submissions_count ?? null; break;
    case "type_count":          current = p ? p.by_type?.[t] ?? 0 : null; break;
    case "approved_type_count": current = p ? p.approved_by_type?.[t] ?? 0 : null; break;
    case "report_count":        current = p ? p.report_total ?? 0 : null; break;
    case "report_type_count":   current = p ? p.report_by_type?.[t] ?? 0 : null; break;
  }
  if (current == null) return null;
  return { current: Math.min(current, b.requirement_value), target: b.requirement_value };
}

// ─── Geometry (viewBox 0 0 100 100) ──────────────────────────────────────────

const C = 50;
const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
const polygon = (pts: number[][]) => `M${pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L")} Z`;

const SHAPES: Record<BadgeFamily, string> = {
  // A road-sign shield.
  report: "M50 13 L79 22 C80 22 81 23 81 24 V48 C81 68 68 81 50 88 C32 81 19 68 19 48 V24 C19 23 20 22 21 22 Z",
  // A lens.
  photo: "M50 15 A35 35 0 1 1 49.99 15 Z",
  // A route marker.
  traffic: polygon([0, 1, 2, 3, 4, 5].map((k) => polar(37, -90 + k * 60))),
  // A speech bubble.
  voice: "M27 19 H73 Q82 19 82 28 V60 Q82 69 73 69 H59 L50 82 L41 69 H27 Q18 69 18 60 V28 Q18 19 27 19 Z",
  // A compass diamond.
  pioneer: "M50 12 Q52 12 54 14 L86 46 Q88 50 86 54 L54 86 Q50 88 46 86 L14 54 Q12 50 14 46 L46 14 Q48 12 50 12 Z",
  // An eight-point star.
  milestone: polygon(Array.from({ length: 16 }, (_, k) => polar(k % 2 ? 31 : 39, -90 + k * 22.5))),
};

/** Where the glyph sits, as a fraction of the badge (the bubble's centre is higher). */
const GLYPH_Y: Record<BadgeFamily, number> = { report: 0.47, photo: 0.5, traffic: 0.5, voice: 0.44, pioneer: 0.5, milestone: 0.5 };

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  if (!Number.isFinite(n)) return hex;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

let uid = 0;

export const NavigoBadge = memo(function NavigoBadge({
  family,
  tier,
  color,
  icon,
  size = 72,
  locked = false,
  progress,
}: {
  family: BadgeFamily;
  /** 1–5. */
  tier: number;
  color: string;
  icon: string;
  size?: number;
  locked?: boolean;
  /** 0–1, drawn as a ring on locked badges. */
  progress?: number | null;
}) {
  const id = useMemo(() => `nb${++uid}`, []);
  const t = TIERS[Math.min(TIERS.length, Math.max(1, tier)) - 1];
  const face = locked ? ["#E5E7EB", "#9CA3AF"] : [shade(color, 0.35), shade(color, -0.35)];
  const metal = locked ? ["#F3F4F6", "#A1A1AA"] : t.metal;
  const beads = locked ? ["#D4D4D8", "#E4E4E7"] : BEADS_FOR_TIER[tier - 1] ?? BEADS_FOR_TIER[0];
  const beadCount = 18 + tier * 2;
  const glyph = String(icon || "ribbon").replace(/-outline$/, "");
  const ringLen = 2 * Math.PI * 47;
  const p = progress == null ? null : Math.max(0, Math.min(1, progress));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={face[0]} />
            <Stop offset="1" stopColor={face[1]} />
          </LinearGradient>
          <LinearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={metal[0]} />
            <Stop offset="1" stopColor={metal[1]} />
          </LinearGradient>
          <RadialGradient id={`${id}s`} cx="0.35" cy="0.25" r="0.6">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={locked ? 0.25 : 0.55} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Shanga rim. */}
        <G>
          {Array.from({ length: beadCount }, (_, k) => {
            const [x, y] = polar(44.5, -90 + (k * 360) / beadCount);
            return <Circle key={k} cx={x} cy={y} r={tier >= 4 ? 3 : 2.6} fill={beads[k % beads.length]} stroke={locked ? "#D4D4D8" : "rgba(0,0,0,0.18)"} strokeWidth={0.6} />;
          })}
        </G>

        {/* Metal, then the face, then its shine. */}
        <Path d={SHAPES[family]} fill={`url(#${id}m)`} transform="translate(50 50) scale(1.1) translate(-50 -50)" />
        <Path d={SHAPES[family]} fill={`url(#${id}f)`} />
        {family === "photo" ? (
          // The lens's aperture blades.
          <G opacity={locked ? 0.25 : 0.35}>
            {[0, 1, 2, 3, 4, 5].map((k) => {
              const [x1, y1] = polar(29, k * 60);
              const [x2, y2] = polar(29, k * 60 + 100);
              return <Path key={k} d={`M${x1} ${y1} L${x2} ${y2}`} stroke="#FFFFFF" strokeWidth={1.4} />;
            })}
          </G>
        ) : null}
        <Path d={SHAPES[family]} fill={`url(#${id}s)`} />

        {/* Tier pips: one to five little diamonds at the foot. */}
        {!locked ? (
          <G>
            {Array.from({ length: tier }, (_, k) => {
              const x = 50 + (k - (tier - 1) / 2) * 6;
              return <Path key={k} d={`M${x} 90 L${x + 2.3} 92.3 L${x} 94.6 L${x - 2.3} 92.3 Z`} fill={t.metal[1]} stroke="#FFFFFF" strokeWidth={0.7} />;
            })}
          </G>
        ) : null}

        {/* Progress towards a locked badge. */}
        {locked && p != null && p > 0 ? (
          <Circle
            cx={50}
            cy={50}
            r={47}
            fill="none"
            stroke="#FF6F00"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${ringLen * p} ${ringLen}`}
            transform="rotate(-90 50 50)"
          />
        ) : null}
      </Svg>

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: size * GLYPH_Y[family] - size * 0.17,
          alignItems: "center",
        }}
      >
        <Icon name={glyph as any} size={Math.round(size * 0.34)} color={locked ? "#FFFFFF" : "#FFFFFF"} />
      </View>
      {locked ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: size * 0.06,
            bottom: size * 0.06,
            width: size * 0.28,
            height: size * 0.28,
            borderRadius: size * 0.14,
            backgroundColor: "#52525B",
            borderWidth: 2,
            borderColor: "#FFFFFF",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="lock-closed" size={Math.round(size * 0.14)} color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
});
