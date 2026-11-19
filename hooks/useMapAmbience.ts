// hooks/useMapAmbience.ts
//
// The light and weather of the place the camera is looking at, cheaply:
//   - the light comes from the sun's position (a few trig operations), for
//     the camera centre snapped to 0.5°, re-checked once a minute;
//   - the weather is the weather pill's own request (fetchLiveMeteo: ~5 km
//     cells, cached for 10 minutes, shared in-flight), re-checked every 10
//     minutes and when the camera moves to another cell;
//   - both pause while the app is in the background;
//   - state changes only when the result does (a preset string, a "rain:2"
//     key), so the map screen re-renders a few times an hour at most.
// Rain and snow are left out when the phone asks for reduced motion.
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, AppState } from "react-native";
import { lightPresetAt, type LightPreset } from "@/components/map/nav3d";
import { fetchLiveMeteo } from "@/components/app/WeatherMeteoSheet";
import {
  precipFor,
  precipFromKey,
  precipKey,
  snapSun,
  snapWeather,
  type Precip,
} from "@/services/mapAmbience";

const LIGHT_TICK_MS = 60_000;
const WEATHER_TICK_MS = 10 * 60_000;

export function useMapAmbience({
  lat,
  lng,
  timeOfDay,
  weather,
}: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  /** Follow the sun (dawn, day, dusk, night); off: always day. */
  timeOfDay: boolean;
  /** Draw the rain or snow falling there. */
  weather: boolean;
}): { lightPreset: LightPreset; precip: Precip | null } {
  const has = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const sunLat = has ? snapSun(lat!) : null;
  const sunLng = has ? snapSun(lng!) : null;
  const wLat = has ? snapWeather(lat!) : null;
  const wLng = has ? snapWeather(lng!) : null;

  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active"));
    return () => sub.remove();
  }, []);

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (alive) setReduceMotion(v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { alive = false; sub.remove(); };
  }, []);

  // ── Light ──
  const [lightPreset, setLightPreset] = useState<LightPreset>("day");
  useEffect(() => {
    if (!timeOfDay || sunLat == null || sunLng == null) {
      setLightPreset("day");
      return;
    }
    const update = () => setLightPreset(lightPresetAt(sunLat, sunLng));
    update();
    if (!active) return;
    const id = setInterval(update, LIGHT_TICK_MS);
    return () => clearInterval(id);
  }, [timeOfDay, sunLat, sunLng, active]);

  // ── Weather ──
  const [key, setKey] = useState<string | null>(null);
  const reqRef = useRef(0);
  const wantWeather = weather && !reduceMotion;
  useEffect(() => {
    if (!wantWeather || wLat == null || wLng == null) {
      setKey(null);
      return;
    }
    const check = () => {
      const req = ++reqRef.current;
      fetchLiveMeteo(wLat, wLng)
        .then((m) => {
          if (req === reqRef.current) setKey(precipKey(precipFor(m.weatherCode, m.precipMm)));
        })
        // No weather (offline, provider down): nothing falls on the map.
        .catch(() => { if (req === reqRef.current) setKey(null); });
    };
    check();
    if (!active) return;
    const id = setInterval(check, WEATHER_TICK_MS);
    return () => clearInterval(id);
  }, [wantWeather, wLat, wLng, active]);

  const precip = useMemo(() => precipFromKey(key), [key]);
  return { lightPreset, precip };
}
