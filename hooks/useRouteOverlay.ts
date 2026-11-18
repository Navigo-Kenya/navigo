import type { IntermediateStop, LocMarker, NodeMarker, TransitLeg, WalkLeg } from "@/components/map/types";
import { projectOntoPolyline, sanitizeHex } from "@/components/map/types";
import type { UnifiedLocation } from "@/store/journeyStore";
import type { Route } from "@/services/route";
import type { RouteInfo, Step } from "@/utils/mapHelpers";
import { detectManeuver } from "@/utils/mapHelpers";
import type { LatLng } from "@/providers/map/types";
import { asLandmark, withLandmark } from "@/utils/landmarks";
import { isStreetMode, streetVerb } from "@/utils/streetModes";
import { useEffect, useReducer, useRef } from "react";

type ActiveJourney = {
  fromLoc: UnifiedLocation;
  toLoc:   UnifiedLocation;
  route:   Route;
} | null;

// Minimal camera interface — avoids importing useMapCamera and creating circular deps.
interface Camera {
  fitCoordinates: (coords: LatLng[], padding?: { top?: number; right?: number; bottom?: number; left?: number }) => void;
}

interface RouteOverlayResult {
  walkLegs:          WalkLeg[];
  transitLegs:       TransitLeg[];
  nodeMarkers:       NodeMarker[];
  locMarkers:        LocMarker[];
  intermediateStops: IntermediateStop[];
  steps:             Step[];
  routeInfo:         RouteInfo | null;
  routeLoading:      boolean;
}

// ── Reducer ───────────────────────────────────────────────────────────────────

type RouteState = RouteOverlayResult;

type RouteAction =
  | { type: 'SET_ALL';     payload: Omit<RouteState, 'routeLoading'> }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'RESET' };

const INITIAL_STATE: RouteState = {
  walkLegs:          [],
  transitLegs:       [],
  nodeMarkers:       [],
  locMarkers:        [],
  intermediateStops: [],
  steps:             [],
  routeInfo:         null,
  routeLoading:      false,
};

function routeReducer(state: RouteState, action: RouteAction): RouteState {
  switch (action.type) {
    case 'RESET':       return INITIAL_STATE;
    case 'SET_LOADING': return { ...state, routeLoading: action.loading };
    case 'SET_ALL':     return { ...action.payload, routeLoading: false };
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRouteOverlay(
  activeJourney: ActiveJourney,
  camera: Camera,
): RouteOverlayResult {
  const [state, dispatch] = useReducer(routeReducer, INITIAL_STATE);

  // Keep a stable ref so build() can call fitCoordinates without being in the dep array.
  const cameraRef = useRef(camera);
  useEffect(() => { cameraRef.current = camera; }, [camera]);

  useEffect(() => {
    if (!activeJourney) {
      dispatch({ type: 'RESET' });
      return;
    }

    // Route hasn't loaded yet (deep-link scenario — useNavigation fetches it async).
    if (!activeJourney.route) {
      dispatch({ type: 'SET_LOADING', loading: true });
      return () => dispatch({ type: 'SET_LOADING', loading: false });
    }

    if (!activeJourney.route.is_ai_derived) dispatch({ type: 'SET_LOADING', loading: true });

    const build = async () => {
      try {
        const { route, fromLoc, toLoc } = activeJourney;
        const segments = route?.segments;
        if (!segments?.length) return;

        const summarySteps: Step[]               = [];
        const newWalkLegs: WalkLeg[]             = [];
        const newTransitLegs: TransitLeg[]       = [];
        const newNodeMarkers: NodeMarker[]       = [];
        const newLocMarkers: LocMarker[]         = [];
        const newIntermStops: IntermediateStop[] = [];

        if (fromLoc._type !== "stop" && fromLoc.id !== "current_location") {
          newLocMarkers.push({ id: "loc-from", coord: { latitude: fromLoc.lat, longitude: fromLoc.lng }, name: fromLoc.name, isStart: true });
        }
        const isWalkOnly = !segments.some((seg: any) => seg.mode !== "WALK");
        if ((toLoc._type !== "stop" || isWalkOnly) && toLoc.id !== "current_location") {
          newLocMarkers.push({ id: "loc-to", coord: { latitude: toLoc.lat, longitude: toLoc.lng }, name: toLoc.name, isStart: false });
        }

        let allCoords: LatLng[] = [];

        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];

          const coords: LatLng[] = seg.coordinates.map(([lat, lng]) => ({
            latitude: lat, longitude: lng,
          }));

          allCoords = allCoords.concat(coords);

          const isStreet = isStreetMode(seg.mode);
          if (isStreet) {
            // Walks draw as walk legs; bike / car / boda journeys keep their solid line.
            if (seg.mode === "WALK") {
              newWalkLegs.push({ id: `walk-${i}`, coords });
            } else {
              newTransitLegs.push({ id: `street-${i}`, coords, color: sanitizeHex(seg.route_color, seg.mode) });
            }
            const verb = streetVerb(seg.mode);
            const target = seg.to.name === "Destination" ? toLoc.name : seg.to.name;
            // Walking to a stop: anchor it ("Walk to Koja, opposite Masinde Muliro University").
            const nextSeg = segments[i + 1];
            const boardLm = nextSeg && nextSeg.stops?.length ? asLandmark(nextSeg.from.landmark) : null;
            summarySteps.push({
              instruction: withLandmark(`${verb} to ${target}`, boardLm),
              distance: seg.distance,
              duration: seg.duration,
              location: [seg.to.lng, seg.to.lat],
              type: "walk",
              subSteps: (seg.walk_steps ?? []).map((ws: any) => ({
                // "Turn left onto Kimathi St, after Java House"
                instruction: withLandmark(ws.instruction, asLandmark(ws.landmark)),
                note:        ws.note,
                distance:    ws.distance,
                duration:    ws.duration,
                lat:         ws.lat,
                lng:         ws.lng,
                maneuver:    detectManeuver(ws.instruction),
              })),
            });
          } else {
            const color    = sanitizeHex(seg.route_color, seg.route_name ?? "");
            const fromName = seg.from.name === "Origin"      ? fromLoc.name : seg.from.name;
            const toName   = seg.to.name   === "Destination" ? toLoc.name   : seg.to.name;

            if (__DEV__) {
              console.log(`[RouteOverlay] seg ${i}: route_color="${seg.route_color}" → "${color}"`);
            }

            newTransitLegs.push({ id: `transit-${i}`, coords, color });
            newNodeMarkers.push(
              { id: `node-from-${i}`, coord: { latitude: seg.from.lat, longitude: seg.from.lng }, name: fromName, color },
              { id: `node-to-${i}`,   coord: { latitude: seg.to.lat,   longitude: seg.to.lng   }, name: toName,   color },
            );

(seg.stops ?? []).slice(1, -1).forEach((stop: any, j: number) => {
              if (stop.lat && stop.lng) {
                const projected = projectOntoPolyline(
                  { latitude: stop.lat, longitude: stop.lng },
                  coords
                );
                newIntermStops.push({
                  id: `interm-${i}-${j}`,
                  stop_id: stop.stop_id ?? undefined,
                  coord: projected,
                  color,
                  name: stop.name ?? "",
                  routeName: seg.route_name ?? "",
                } as any);
              }
            });

            summarySteps.push(
              {
                instruction: `Board Line ${seg.route_name} at ${fromName}`,
                distance: 0,
                duration: 0,
                location: [seg.from.lng, seg.from.lat],
                type: "depart",
                mode: seg.mode,
                modeBadge: seg.mode_badge ?? "Bus",
                stopCode: seg.from.stop_code ?? null,
                platformCode: seg.from.platform_code ?? null,
                landmark: asLandmark(seg.from.landmark)?.text ?? null,
                nextDeparture: seg.next_departures?.[0] ?? null,
                traffic: seg.traffic ?? null,
                routeName: seg.route_name ?? undefined,
                routeColor: color,
                stops: seg.stops,
              } as any,
              {
                instruction: withLandmark(`Alight at ${toName}`, asLandmark(seg.to.landmark)),
                distance: seg.distance,
                duration: seg.duration,
                location: [seg.to.lng, seg.to.lat],
                type: "arrive",
                mode: seg.mode,
                landmarksAlong: seg.landmarks_along ?? [],
                legCoords: seg.coordinates,
                alightName: toName,
                alightLandmark: asLandmark(seg.to.landmark),
                routeName: seg.route_name ?? undefined,
                routeColor: color,
              } as any
            );

          }
        }

        dispatch({
          type: 'SET_ALL',
          payload: {
            walkLegs:          newWalkLegs,
            transitLegs:       newTransitLegs,
            nodeMarkers:       newNodeMarkers,
            locMarkers:        newLocMarkers,
            intermediateStops: newIntermStops,
            steps:             summarySteps,
            routeInfo:         { distance: route.total_distance, duration: route.total_duration },
          },
        });

        const validCoords = allCoords.filter(
          ({ latitude, longitude }) => latitude !== 0 && longitude !== 0 && !isNaN(latitude)
        );

        if (validCoords.length > 1) {
          cameraRef.current.fitCoordinates(validCoords, { top: 140, right: 40, bottom: 320, left: 40 });
        }
      } catch (err) {
        console.warn("Failed to build journey overlays", err);
      } finally {
        dispatch({ type: 'SET_LOADING', loading: false });
      }
    };

    build();
  }, [activeJourney]); // camera intentionally excluded — accessed via cameraRef

  return state;
}
