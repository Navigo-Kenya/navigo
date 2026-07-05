// components/map/BusLayer.tsx
import { Models, ModelLayer, ShapeSource, CircleLayer } from "@rnmapbox/maps";
import React, { useEffect, useRef, useState } from "react";
import { routes as allRoutes } from "@/data/routes";
import { stops as allStops } from "@/data/stops";

export const BUS_SPEED_KPH = 40;
export const BUS_DWELL_S   = 45;
const MAX_WAYPOINTS         = 24;

// ─── PREMIUM PHYSICS: Slerp (Spherical Linear Interpolation) ───
function lerpAngle(start: number, end: number, factor: number): number {
  const shortestAngle = ((((end - start) % 360) + 540) % 360) - 180;
  return (start + shortestAngle * factor + 360) % 360;
}

// ─── PREMIUM PHYSICS: Easing (Acceleration & Braking) ───
function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function computeBearing(a: [number, number], b: [number, number]): number {
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const y    = Math.sin(dLng) * Math.cos(lat2);
  const x    = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

interface StopInfo { coord: [number, number]; name: string; }
export interface BusStopMeta { name: string; distKm: number; }
export interface SelectedBusInfo {
  id:             string;
  label:          string;
  routeName:      string;
  color:          string;
  stops:          BusStopMeta[];
  cycleTime:      number;
  initFrac:       number;
  animStartEpoch: number;
}

function km(a: [number, number], b: [number, number]): number {
  const R  = 6371;
  const φ1 = (a[1] * Math.PI) / 180;
  const φ2 = (b[1] * Math.PI) / 180;
  const Δφ = φ2 - φ1;
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
  const x  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function subsample<T>(arr: T[], maxLen: number): T[] {
  if (arr.length <= maxLen) return arr;
  const out: T[] = [];
  for (let i = 0; i < maxLen; i++) {
    out.push(arr[Math.round((i / (maxLen - 1)) * (arr.length - 1))]);
  }
  return out;
}

function orderStopInfoByAxis(items: StopInfo[]): StopInfo[] {
  if (items.length <= 2) return items;
  const pts = items.map((s) => s.coord);
  const cx  = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy  = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let fi = 0, fmax = -1;
  for (let i = 0; i < pts.length; i++) {
    const d = (pts[i][0] - cx) ** 2 + (pts[i][1] - cy) ** 2;
    if (d > fmax) { fmax = d; fi = i; }
  }
  let gi = 0, gmax = -1;
  for (let i = 0; i < pts.length; i++) {
    const d = (pts[i][0] - pts[fi][0]) ** 2 + (pts[i][1] - pts[fi][1]) ** 2;
    if (d > gmax) { gmax = d; gi = i; }
  }
  const dx = pts[gi][0] - pts[fi][0];
  const dy = pts[gi][1] - pts[fi][1];
  const ox = pts[fi][0];
  const oy = pts[fi][1];
  return [...items].sort(
    (a, b) =>
      (a.coord[0] - ox) * dx + (a.coord[1] - oy) * dy -
      ((b.coord[0] - ox) * dx + (b.coord[1] - oy) * dy),
  );
}

interface Path {
  pts:       [number, number][];
  segs:      number[];
  cumDist:   number[];
  total:     number;
  stopDists: number[];
  cycleTime: number;
  label:     string;
  color:     string;
}

function buildPath(polyPts: [number, number][], stopDists: number[], label: string, color: string): Path {
  const segs: number[] = [], cumDist: number[] = [0];
  let total = 0;
  for (let i = 0; i < polyPts.length - 1; i++) {
    const d = km(polyPts[i], polyPts[i + 1]);
    segs.push(d); total += d; cumDist.push(total);
  }
  const cycleTime = Math.max(1, (total / BUS_SPEED_KPH) * 3600 + stopDists.length * BUS_DWELL_S);
  return { pts: polyPts, segs, cumDist, total, stopDists, cycleTime, label, color };
}

function interpolateDist(path: Path, distKm: number): [number, number] {
  const d = Math.max(0, Math.min(distKm, path.total));
  let lo = 0, hi = path.segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (path.cumDist[mid + 1] < d) lo = mid + 1; else hi = mid;
  }
  const segLen = path.segs[lo];
  if (segLen === 0) return path.pts[lo];
  const t = (d - path.cumDist[lo]) / segLen;
  const [x1, y1] = path.pts[lo], [x2, y2] = path.pts[lo + 1];
  return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
}

function positionAtTime(path: Path, T: number): [number, number] {
  let t = ((T % path.cycleTime) + path.cycleTime) % path.cycleTime;
  for (let i = 0; i < path.stopDists.length; i++) {
    if (t < BUS_DWELL_S) return interpolateDist(path, path.stopDists[i]);
    t -= BUS_DWELL_S;
    if (i < path.stopDists.length - 1) {
      const legDist = path.stopDists[i + 1] - path.stopDists[i];
      const legTime = (legDist / BUS_SPEED_KPH) * 3600;
      if (t <= legTime) {
        const progress = easeInOutQuad(t / legTime);
        return interpolateDist(path, path.stopDists[i] + legDist * progress);
      }
      t -= legTime;
    }
  }
  return path.pts[path.pts.length - 1];
}

const SIMULATED: { id: string; color: string }[] = [
  { id: "10000114011", color: "#FF6F00" },
  { id: "70400011111", color: "#007AFF" },
  { id: "20100012011", color: "#34C759" },
  { id: "50205012611", color: "#AF52DE" },
  { id: "40705383911", color: "#FF3B30" },
  { id: "20000237011", color: "#5AC8FA" },
];
const SIM_IDS = new Set(SIMULATED.map((r) => r.id));

const stopInfoByRoute = new Map<string, StopInfo[]>();
for (const stop of allStops) {
  if (!stop.route_ids) continue;
  const seen = new Set<string>();
  for (const rid of stop.route_ids.split(",")) {
    if (!SIM_IDS.has(rid) || seen.has(rid)) continue;
    seen.add(rid);
    if (!stopInfoByRoute.has(rid)) stopInfoByRoute.set(rid, []);
    stopInfoByRoute.get(rid)!.push({ coord: [stop.lng, stop.lat], name: stop.name });
  }
}

const STRAIGHT_PATHS = new Map<string, Path>();
const ROUTE_STOPS    = new Map<string, BusStopMeta[]>();

for (const { id, color } of SIMULATED) {
  const raw = stopInfoByRoute.get(id);
  if (!raw || raw.length < 2) continue;
  const ordered  = orderStopInfoByAxis(raw);
  const sampled  = subsample(ordered, MAX_WAYPOINTS);
  const pts      = sampled.map((s) => s.coord) as [number, number][];
  const stopDists: number[] = [0];
  for (let i = 0; i < pts.length - 1; i++) stopDists.push(stopDists[i] + km(pts[i], pts[i + 1]));
  const route = allRoutes.find((r) => r.route_id === id);
  const label = route?.route_short_name ?? id;
  STRAIGHT_PATHS.set(id, buildPath(pts, stopDists, label, color));
  ROUTE_STOPS.set(id, sampled.map((s, i) => ({ name: s.name, distKm: stopDists[i] })));
}

interface BusDef { id: string; pathId: string; initFrac: number; }
const FLEET: BusDef[] = [];
for (const [pathId] of STRAIGHT_PATHS) {
  FLEET.push({ id: `${pathId}-A`, pathId, initFrac: 0.0 });
  FLEET.push({ id: `${pathId}-B`, pathId, initFrac: 0.5 });
}

async function fetchRoadSnapped(
  waypoints: [number, number][],
  token:     string,
): Promise<{ pts: [number, number][]; legDistsKm: number[] } | null> {
  const coords = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?geometries=geojson&overview=full&access_token=${token}`;
  try {
    const res = await fetch(url), data = await res.json();
    if (!data.routes?.length) return null;
    return {
      pts:        data.routes[0].geometry.coordinates as [number, number][],
      legDistsKm: (data.routes[0].legs as any[]).map((l) => l.distance / 1000),
    };
  } catch {
    return null;
  }
}

interface BusState {
  id:        string;
  pathId:    string;
  coords:    [number, number];
  color:     string;
  label:     string;
  bearing:   number; 
  pulseR:    number;
  pulseO:    number;
  rotation:  [number, number, number];
}

interface BusLayerProps {
  selectedBusId?:    string | null;
  onBusPress?:       (info: SelectedBusInfo) => void;
  followBusId?:      string | null;
  onFollowPosition?: (coords: [number, number]) => void;
}

export function BusLayer({ selectedBusId, onBusPress, followBusId, onFollowPosition }: BusLayerProps = {}) {
  const pathsRef       = useRef<Map<string, Path>>(STRAIGHT_PATHS);
  const t0Ref          = useRef(Date.now());
  const followIdRef    = useRef(followBusId);
  const onFollowPosRef = useRef(onFollowPosition);
  const onBusPressRef  = useRef(onBusPress);
  const bearingsRef    = useRef<Map<string, number>>(new Map());
  
  const lastFollowTimeRef = useRef(0);

  useEffect(() => { followIdRef.current    = followBusId;      }, [followBusId]);
  useEffect(() => { onFollowPosRef.current = onFollowPosition; }, [onFollowPosition]);
  useEffect(() => { onBusPressRef.current  = onBusPress;       }, [onBusPress]);

  useEffect(() => {
    const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;
    Promise.allSettled(
      SIMULATED.map(async ({ id }) => {
        const raw = stopInfoByRoute.get(id);
        if (!raw) return;
        const waypoints = subsample(orderStopInfoByAxis(raw).map((s) => s.coord), MAX_WAYPOINTS);
        const result    = await fetchRoadSnapped(waypoints, token);
        if (!result) return;
        const stopDists: number[] = [0];
        for (const d of result.legDistsKm) stopDists.push(stopDists[stopDists.length - 1] + d);
        const existing = pathsRef.current.get(id);
        if (!existing) return;
        pathsRef.current.set(id, buildPath(result.pts, stopDists, existing.label, existing.color));
      }),
    );
  }, []);

  const [buses, setBuses] = useState<BusState[]>([]);

  useEffect(() => {
    t0Ref.current = Date.now();
    let frameId: number;

    const animate = () => {
      const now = Date.now();
      const elapsedSec = (now - t0Ref.current) / 1000;
      
      const pulseT = (now % 1500) / 1500;
      const pulseRadius = 15 + (pulseT * 25);
      const pulseOpacity = 0.5 * (1 - pulseT);

      const updatedBuses = FLEET.map((b) => {
        const path = pathsRef.current.get(b.pathId);
        if (!path) return null;
        
        const coords = positionAtTime(path, b.initFrac * path.cycleTime + elapsedSec);
        const ahead = positionAtTime(path, b.initFrac * path.cycleTime + elapsedSec + 0.1);
        const distKm = km(coords, ahead);
        
        let bearing = bearingsRef.current.get(b.id);
        
        if (distKm > 0.00001 && distKm < 0.01) {
          const targetBearing = (computeBearing(coords, ahead) + 180) % 360;
          if (bearing === undefined) {
            bearing = targetBearing;
          } else {
            bearing = lerpAngle(bearing, targetBearing, 0.15);
          }
          bearingsRef.current.set(b.id, bearing);
        }

        if (bearing === undefined) {
          let peekT = 0.1;
          let peekCoords = ahead;
          while (km(coords, peekCoords) < 0.00001 && peekT < 60) {
            peekT += 1;
            peekCoords = positionAtTime(path, b.initFrac * path.cycleTime + elapsedSec + peekT);
          }
          bearing = (computeBearing(coords, peekCoords) + 180) % 360;
          bearingsRef.current.set(b.id, bearing);
        }

        if (followIdRef.current === b.id) {
          if (now - lastFollowTimeRef.current > 100) {
            onFollowPosRef.current?.(coords);
            lastFollowTimeRef.current = now;
          }
        }

        return { 
          id: b.id, 
          pathId: b.pathId, 
          coords, 
          color: path.color, 
          label: path.label, 
          bearing,
          pulseR: pulseRadius,
          pulseO: pulseOpacity,
          // FIX: Add a 90-degree offset to the Z-axis (bearing)
          // If the bus drives backwards after this, change it to: bearing - 90
          rotation: [0, 0, bearing + -90]
        };
      }).filter(Boolean) as BusState[];

      setBuses(updatedBuses);
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const geojson: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: buses.map((bus) => ({
      type: "Feature",
      id: bus.id,
      geometry: { type: "Point", coordinates: bus.coords },
      properties: {
        busId: bus.id,
        pathId: bus.pathId,
        color: bus.color,
        label: bus.label,
        bearing: bus.bearing, 
        pulseR: bus.pulseR,
        pulseO: bus.pulseO,
        rotation: bus.rotation,
      },
    })),
  };

return (
    <>
      <Models models={{ "bus-model": "https://files.navigo.co.ke/bus.glb" }} />
      
      <ShapeSource
        id="buses"
        shape={geojson}
        onPress={(e) => {
          const feat = e.features[0];
          if (!feat?.properties) return;
          const { busId, pathId } = feat.properties as { busId: string; pathId: string };
          const path       = pathsRef.current.get(pathId);
          const routeStops = ROUTE_STOPS.get(pathId);
          if (!path || !routeStops) return;
          const def   = FLEET.find((f) => f.id === busId);
          const route = allRoutes.find((r) => r.route_id === pathId);
          onBusPressRef.current?.({
            id:             busId,
            label:          path.label,
            routeName:      route?.route_long_name ?? path.label,
            color:          path.color,
            stops:          routeStops,
            cycleTime:      path.cycleTime,
            initFrac:       def?.initFrac ?? 0,
            animStartEpoch: t0Ref.current,
          });
        }}
      >
        <CircleLayer
          id="bus-pulse"
          filter={["==", "busId", selectedBusId || "NONE"]}
          style={{
            circleRadius: ["get", "pulseR"],
            circleColor: ["get", "color"],
            circleOpacity: ["get", "pulseO"],
            circleStrokeWidth: 0,
            circlePitchAlignment: "map",
          }}
        />

        <ModelLayer
          id="buses-models"
          sourceID="buses"
          
          // We use 'as any' to prevent TypeScript from crashing on this complex Mapbox expression
          style={{
            modelId: "bus-model",
            
            // GROUND ALIGNMENT
            // Lift the bus so the tires touch the road. 
            // Since the model is now much smaller, this value needs to be smaller too.
            // Tweak this (e.g., 0.2, 0.5) if it's floating or sinking.
            modelTranslation: [0, 0, 0.2],

            // DYNAMIC ZOOM SCALE
            // 0.4 was too huge, so we dial the street-level zoom way down to 0.05.
            modelScale: [
              "interpolate", ["linear"], ["zoom"],
              10, ["literal", [0.5, 0.5, 0.5]],    // Zoomed out (City view): Artificially large so you can see it
              15, ["literal", [0.15, 0.15, 0.15]], // Mid zoom (Neighborhood)
              20, ["literal", [0.01, 0.01, 0.01]]  // Zoomed in (Street view): Physically fits in the lane
            ],
            
            modelRotation: ["get", "rotation"], 
            modelOpacity: 1,
          } as any} 
        />
      </ShapeSource>
    </>
  );
}