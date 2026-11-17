// components/app/StopTypeBadge.tsx
//
// A stop's type as a round badge: the stop-type glyph (bus, terminal, rail,
// metro, BRT, ferry, tram, airport, cable) on the type's colour, the same
// look as the stop markers on the map. Use it wherever a stop is listed so a
// railway station never shows as a bus stop.
import React from "react";
import { View } from "react-native";
import { StopTypeGlyph } from "@/components/icons/NavigoIcons";
import { Icon } from "@/components/icons/Icon";
import { resolveStopCategory } from "./StopsLayer";

type StopLike = {
  stop_type?: string | null;
  mode?: string | null;
  mode_badge?: string | null;
  location_t?: number | null;
};

export function StopTypeBadge({ stop, size = 32 }: { stop: StopLike; size?: number }) {
  const { category, color } = resolveStopCategory(stop as any);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: size >= 36 ? 2 : 1.5,
        borderColor: "#FFFFFF",
      }}
    >
      <StopTypeGlyph category={category as any} size={Math.round(size * 0.52)} />
    </View>
  );
}

/** Transit mode of a line (route_type / mode / badge) as an icon name. */
export type ModeIconName = "train" | "bus" | "car" | "motorbike" | "bicycle" | "walk" | "boat" | "airplane";

export function modeIconName(mode?: string | null, badge?: string | null): ModeIconName {
  const m = String(mode ?? "").toUpperCase();
  const b = String(badge ?? "").toUpperCase();
  if (["RAIL", "SUBWAY", "TRAM", "METRO"].includes(m) || ["SGR", "RAIL", "METRO", "COMMUTER"].includes(b)) return "train";
  if (m === "FERRY" || b === "FERRY") return "boat";
  if (m === "AIRPLANE" || m === "FLIGHT" || b === "FLIGHT") return "airplane";
  if (m === "CAR") return "car";
  if (m === "MOTORBIKE") return "motorbike";
  if (m === "BICYCLE") return "bicycle";
  if (m === "WALK") return "walk";
  return "bus";
}

/** Small mode glyph for a line row. */
export function ModeIcon({ mode, badge, size = 14, color }: { mode?: string | null; badge?: string | null; size?: number; color: string }) {
  return <Icon name={modeIconName(mode, badge)} size={size} color={color} />;
}
