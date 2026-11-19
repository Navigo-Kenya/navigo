// components/map/WeatherEffect.tsx
//
// Rain or snow over the map (Mapbox's precipitation effects), for the
// weather where the camera is looking (hooks/useMapAmbience).
//
// Memoized on primitive props: rnmapbox re-sends a Rain/Snow style on every
// render of its parent, and the map screen re-renders on each GPS fix while
// navigating. This only renders when the weather, the zoom band or the look
// changes.
import React, { memo, useMemo } from "react";
import { Rain, Snow } from "@rnmapbox/maps";
import { rainStyle, snowStyle, type PrecipKind } from "@/services/mapAmbience";

const NativeRain = Rain as unknown as React.ComponentType<any>;
const NativeSnow = Snow as unknown as React.ComponentType<any>;

export const WeatherEffect = memo(function WeatherEffect({
  kind,
  level,
  dark,
  navigating,
}: {
  kind: PrecipKind;
  level: 1 | 2 | 3;
  dark: boolean;
  navigating: boolean;
}) {
  const style = useMemo(
    () => (kind === "rain" ? rainStyle : snowStyle)(level, { dark, navigating }),
    [kind, level, dark, navigating]
  );
  return kind === "rain" ? <NativeRain style={style} /> : <NativeSnow style={style} />;
});
