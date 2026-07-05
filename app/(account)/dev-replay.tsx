// app/(account)/dev-replay.tsx
// Dev-only session replay: feed a recorded GPS trace through a FRESH
// NavigationEngine and watch the puck/step decisions on a map — debug
// "the puck slid at that corner" from a desk instead of riding the 46.
// Export turns a session into a golden-trace fixture for jest.
import { ScreenHeader } from "@/components/app/ScreenHeader";
import { NavigationEngine, EngineResult } from "@/services/navigationEngine";
import { TraceRecorder, RecordedSession } from "@/services/traceRecorder";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MapView, Camera, ShapeSource, LineLayer, CircleLayer } from "@rnmapbox/maps";

const NativeShapeSource = ShapeSource as unknown as React.ComponentType<any>;
const NativeLineLayer   = LineLayer   as unknown as React.ComponentType<any>;
const NativeCircleLayer = CircleLayer as unknown as React.ComponentType<any>;

const ORANGE = "#FF6F00";
const GREY   = "#8E8E93";
const SPEEDS = [1, 8, 32];

function makeC(dark: boolean) {
  return {
    bg:      dark ? "#0F0F0F" : "#F6F7F8",
    card:    dark ? "#1C1C1E" : "#FFFFFF",
    text:    dark ? "#FFFFFF" : "#1C1C1E",
    subText: GREY,
    hairline: dark ? "#2C2C2E" : "#E5E7EB",
  };
}

export default function DevReplayScreen() {
  const dark   = useColorScheme() === "dark";
  const C      = makeC(dark);
  const insets = useSafeAreaInsets();

  const [sessions, setSessions] = useState<RecordedSession[]>([]);
  const [session, setSession]   = useState<RecordedSession | null>(null);
  const [tick, setTick]         = useState(0);
  const [playing, setPlaying]   = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [result, setResult]     = useState<EngineResult | null>(null);

  const engineRef    = useRef<NavigationEngine | null>(null);
  const stepIndexRef = useRef(0);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { TraceRecorder.list().then(setSessions); }, []);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const openSession = (s: RecordedSession) => {
    try {
      engineRef.current = new NavigationEngine(s.route.coords, s.route.steps);
      stepIndexRef.current = 0;
      setSession(s);
      setTick(0);
      setResult(null);
      setPlaying(false);
    } catch {
      // degenerate route — ignore
    }
  };

  const applyTick = (s: RecordedSession, i: number) => {
    const fix = s.fixes[i];
    if (!fix || !engineRef.current) return;
    const r = engineRef.current.update(fix.lng, fix.lat, fix.speed, stepIndexRef.current);
    stepIndexRef.current = r.stepIndex;
    setResult(r);
  };

  // Playback loop — replays fixes at the chosen multiplier (1 fix ≈ 1 s real time).
  useEffect(() => {
    if (!playing || !session) return;
    const interval = Math.max(20, 1000 / SPEEDS[speedIdx]);
    timerRef.current = setInterval(() => {
      setTick((prev) => {
        const next = prev + 1;
        if (next >= session.fixes.length) {
          setPlaying(false);
          return prev;
        }
        applyTick(session, next);
        return next;
      });
    }, interval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, speedIdx, session]);

  const routeGeoJson = useMemo(() => session && ({
    type: "Feature",
    geometry: { type: "LineString", coordinates: session.route.coords },
    properties: {},
  }), [session]);

  const fix = session?.fixes[tick];
  const snapped = result?.projectedPoint;

  const markersGeoJson = useMemo(() => {
    if (!fix) return null;
    const features: any[] = [{
      type: "Feature",
      geometry: { type: "Point", coordinates: [fix.lng, fix.lat] },
      properties: { kind: "raw" },
    }];
    if (snapped) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [snapped.longitude, snapped.latitude] },
        properties: { kind: "snapped" },
      });
    }
    return { type: "FeatureCollection", features };
  }, [fix, snapped]);

  const exportSession = async () => {
    if (!session) return;
    // Fixture shape consumed by services/__tests__/traceKit.ts replayRecorded().
    const fixture = {
      version: 1,
      route: session.route,
      fixes: session.fixes.map((f) => ({ t: f.t, lat: f.lat, lng: f.lng, speed: f.speed })),
    };
    await Share.share({ message: JSON.stringify(fixture) }).catch(() => {});
  };

  if (!__DEV__) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScreenHeader title="Dev replay" C={C as any} />
        <Text style={{ color: C.subText, textAlign: "center", marginTop: 40 }}>
          Available in development builds only.
        </Text>
      </View>
    );
  }

  // ── Session list ─────────────────────────────────────────────────────────
  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScreenHeader title="Dev replay" C={C as any} />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {sessions.length === 0 && (
            <Text style={{ color: C.subText, textAlign: "center", marginTop: 40 }}>
              No recorded sessions yet. Navigate a journey first.
            </Text>
          )}
          {sessions.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => openSession(s)}
              style={[st.sessionRow, { backgroundColor: C.card }]}
            >
              <Ionicons name="analytics-outline" size={20} color={ORANGE} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: "600" }}>
                  {s.destination ?? "Unknown destination"}
                </Text>
                <Text style={{ color: C.subText, fontSize: 12 }}>
                  {new Date(s.startedAt).toLocaleString()} · {s.fixes.length} fixes
                </Text>
              </View>
              <Pressable
                hitSlop={10}
                onPress={() => TraceRecorder.remove(s.id).then(() => TraceRecorder.list().then(setSessions))}
              >
                <Ionicons name="trash-outline" size={18} color="#FF3B30" />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── Replay view ──────────────────────────────────────────────────────────
  const progress = session.fixes.length > 1 ? tick / (session.fixes.length - 1) : 0;
  const mid = session.route.coords[Math.floor(session.route.coords.length / 2)];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title={session.destination ?? "Replay"} C={C as any} />

      <MapView style={{ flex: 1 }} logoEnabled={false} attributionEnabled={false} scaleBarEnabled={false}>
        <Camera defaultSettings={{ centerCoordinate: mid, zoomLevel: 13.5 }} />
        {routeGeoJson && (
          <NativeShapeSource id="replay-route" shape={routeGeoJson}>
            <NativeLineLayer id="replay-route-line" style={{ lineColor: ORANGE, lineWidth: 4, lineOpacity: 0.6 }} />
          </NativeShapeSource>
        )}
        {markersGeoJson && (
          <NativeShapeSource id="replay-markers" shape={markersGeoJson}>
            <NativeCircleLayer
              id="replay-raw"
              filter={["==", ["get", "kind"], "raw"]}
              style={{ circleRadius: 6, circleColor: "#8E8E93", circleStrokeColor: "#FFF", circleStrokeWidth: 2 }}
            />
            <NativeCircleLayer
              id="replay-snapped"
              filter={["==", ["get", "kind"], "snapped"]}
              style={{ circleRadius: 8, circleColor: ORANGE, circleStrokeColor: "#FFF", circleStrokeWidth: 2 }}
            />
          </NativeShapeSource>
        )}
      </MapView>

      {/* Readout + transport controls */}
      <View style={[st.panel, { backgroundColor: C.card, paddingBottom: insets.bottom + 12 }]}>
        <View style={st.readout}>
          <Text style={[st.readoutText, { color: C.text }]}>
            step {result?.stepIndex ?? "–"} · {result?.status ?? "–"} ·{" "}
            {result ? `${result.distanceFromRouteM.toFixed(0)} m off` : "–"} ·{" "}
            {result ? `${(result.remainingDistanceM / 1000).toFixed(2)} km left` : "–"}
          </Text>
          <Text style={{ color: C.subText, fontSize: 11 }}>
            fix {tick + 1}/{session.fixes.length} · acc {fix?.acc ?? "–"} m · {(fix?.speed ?? 0).toFixed(1)} m/s
          </Text>
        </View>

        <View style={[st.progressTrack, { backgroundColor: C.hairline }]}>
          <View style={[st.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        <View style={st.controls}>
          <Pressable onPress={() => setSession(null)} style={st.ctrlBtn}>
            <Ionicons name="list" size={20} color={C.text} />
          </Pressable>
          <Pressable
            onPress={() => { openSession(session); }}
            style={st.ctrlBtn}
          >
            <Ionicons name="play-skip-back" size={20} color={C.text} />
          </Pressable>
          <Pressable onPress={() => setPlaying((p) => !p)} style={[st.ctrlBtn, st.playBtn]}>
            <Ionicons name={playing ? "pause" : "play"} size={22} color="#FFF" />
          </Pressable>
          <Pressable onPress={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)} style={st.ctrlBtn}>
            <Text style={{ color: C.text, fontWeight: "800", fontSize: 13 }}>{SPEEDS[speedIdx]}×</Text>
          </Pressable>
          <Pressable onPress={exportSession} style={st.ctrlBtn}>
            <Ionicons name="share-outline" size={20} color={C.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  sessionRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, padding: 14 },
  panel:      { paddingHorizontal: 16, paddingTop: 10, gap: 8 },
  readout:    { gap: 2 },
  readoutText:{ fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill:  { height: 4, backgroundColor: ORANGE },
  controls:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ctrlBtn:    { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  playBtn:    { backgroundColor: ORANGE, borderRadius: 22 },
});
