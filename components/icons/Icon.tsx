// components/icons/Icon.tsx
//
// <Icon name="star-outline" size={16} color={...} /> — Navigo's own icons,
// a drop-in for <Ionicons> (same props, same names). "-outline" names draw
// the line style; plain names the filled style (duotone, or solid for
// stars, pins, bookmarks and status circles). Names not drawn yet fall back
// to Ionicons (and warn in development) so nothing breaks while the set grows.
import React, { memo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { resolveGlyph } from "./glyphs";

const STROKE = 1.9;
const DUOTONE = 0.18;

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];
export type IconName = IoniconName;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

const warned = new Set<string>();

export const Icon = memo(function Icon({ name, size = 24, color = "#111827", style, accessibilityLabel, testID }: IconProps) {
  const r = resolveGlyph(String(name));
  if (!r) {
    if (__DEV__ && !warned.has(String(name))) {
      warned.add(String(name));
      console.warn(`[Icon] "${String(name)}" has no Navigo glyph yet, using Ionicons`);
    }
    return <Ionicons name={name} size={size} color={color} style={style as any} accessibilityLabel={accessibilityLabel} testID={testID} />;
  }
  const { glyph, outline } = r;
  const solid = !outline && glyph.filled === "solid";
  const stroke = { stroke: color, strokeWidth: STROKE, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={style}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {glyph.parts.map((p, i) => {
        const w = p.w ?? STROKE;
        switch (p.k) {
          case "line":
            return <Path key={i} d={p.d} fill="none" {...stroke} strokeWidth={w} strokeOpacity={p.o ?? 1} />;
          case "solid":
            return <Path key={i} d={p.d} fill={color} />;
          case "knock":
            return <Path key={i} d={p.d} fill="none" {...stroke} strokeWidth={w} stroke={solid ? "#FFFFFF" : color} />;
          case "shape":
          default:
            return solid ? (
              <Path key={i} d={p.d} fill={color} {...stroke} />
            ) : (
              <Path key={i} d={p.d} fill={outline ? "none" : color} fillOpacity={outline ? 0 : DUOTONE} {...stroke} />
            );
        }
      })}
    </Svg>
  );
});
