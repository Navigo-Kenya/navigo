// app/(tabs)/map.tsx
import { IntermStopInfoCard }    from "@/components/map/IntermStopInfoCard";
import { MapLayersSheet }        from "@/components/map/MapLayersSheet";
import { OfflineNotice }         from "@/components/map/OfflineNotice";
import { ReportLayer }           from "@/components/map/ReportLayer";
import type { ReportLayerHandle } from "@/components/map/ReportLayer";
import { BusLayer }              from "@/components/map/BusLayer";
import type { SelectedBusInfo }  from "@/components/map/BusLayer";
import { RouteOverlay }          from "@/components/map/RouteOverlay";
import { SaveWall }              from "@/components/map/SaveWall";
import { DestinationPin }        from "@/components/map/RouteMarkers";
import { DEFAULT_REGION }        from "@/components/map/types";
import type { IntermediateStop } from "@/components/map/types";
import JourneyDetailsSheet       from "@/components/app/JourneyDetailsSheet";
import MapFloatingUI             from "@/components/app/MapFloatingUI";
import NearestStopsSheet         from "@/components/app/NearestStopsSheet";
import ReportDetailCard          from "@/components/app/ReportDetailCard";
import ReportSheet               from "@/components/app/ReportSheet";
import RateAppSheet              from "@/components/app/RateAppSheet";
import PostJourneySheet          from "@/components/app/PostJourneySheet";
import BusDetailsSheet           from "@/components/app/BusDetailsSheet";
import RouteStepsList            from "@/components/app/RouteStepsList";
import StopDetailsSheet          from "@/components/app/StopDetailsSheet";
import StopQuickCard             from "@/components/app/StopQuickCard";
import StopsLayer                from "@/components/app/StopsLayer";
import ARWalkView                from "@/components/ar/ARWalkView";

import { useNavigation }       from "@/hooks/useNavigation";
import { useRatePrompt }       from "@/hooks/useRatePrompt";
import { useMapCamera }        from "@/hooks/useMapCamera";
import { useRouteOverlay }     from "@/hooks/useRouteOverlay";
import { useHeadingTracker }   from "@/hooks/useHeadingTracker";
import { useHeadingStore }     from "@/store/headingStore";
import { RouteService }        from "@/services/route";
import { ReportService }       from "@/services/report";
import type { TransitReport }  from "@/services/report";
import { StopService }         from "@/services/stop";
import { CacheService, CACHE_KEYS, CACHE_TTL } from "@/services/cache";
import { UnifiedLocation, useJourneyStore } from "@/store/journeyStore";
import { useMapLayersStore }   from "@/store/mapLayersStore";
import { useNetworkStore }     from "@/store/networkStore";
import { useOfflineMapStore }  from "@/store/offlineMapStore";
import { Stop, humanizeStep, mToNice, sToMin } from "@/utils/mapHelpers";
import { buildFlyThroughKeyframes, flyThroughZoom } from "@/utils/flyThrough";

import { useRouter }      from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useSavedStore }  from "@/store/savedStore";
import { usePrefsStore }  from "@/store/prefsStore";
import { useAuthStore }   from "@/store/authStore";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import {
  MapView as MapboxMapView,
  Camera as MapboxCamera,
  PointAnnotation,
  UserLocation,
  CircleLayer,
  LineLayer,
  FillLayer,
  ShapeSource,
  Models,
  ModelLayer,
  CustomLocationProvider,
} from "@rnmapbox/maps";

const NativeUserLocation  = UserLocation  as unknown as React.ComponentType<any>;
const NativeCircleLayer   = CircleLayer   as unknown as React.ComponentType<any>;
const NativeLineLayer     = LineLayer     as unknown as React.ComponentType<any>;
const NativeFillLayer     = FillLayer     as unknown as React.ComponentType<any>;
const NativeShapeSource   = ShapeSource   as unknown as React.ComponentType<any>;
const NativeModels        = Models        as unknown as React.ComponentType<any>; 
const NativeModelLayer    = ModelLayer    as unknown as React.ComponentType<any>; 

function headingArcGeoJson(
  lat: number,
  lng: number,
  headingDeg: number,
  zoom: number,
  isNavigationMode: boolean // On injecte le statut de navigation
): GeoJSON.Feature<GeoJSON.Polygon> {
  const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  const targetScreenPixels = 22; 
  
  // In navigation the beam is fixed-size so it stays visible between 3D
  // buildings — 28 m reads clearly at nav zoom without dominating the street.
  const R_M = isNavigationMode ? 28 : Math.max(6, Math.min(50, targetScreenPixels * metersPerPixel));

  const HALF = 47; 
  const STEPS = 16; 
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const pts: [number, number][] = [[lng, lat]];

  for (let i = 0; i <= STEPS; i++) {
    const a = ((headingDeg - HALF) + (2 * HALF * i) / STEPS) * (Math.PI / 180);
    pts.push([
      lng + (R_M / (111_320 * cosLat)) * Math.sin(a),
      lat + (R_M / 111_320) * Math.cos(a),
    ]);
  }
  pts.push([lng, lat]);

  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [pts] },
    properties: { layer: "beam" },
  };
}

import { MapService } from "@/services/map";

const { height: SH } = Dimensions.get("window");

const MODEL_TILT_X = 0;

function DroppedPin({ coord, name }: { coord: { latitude: number; longitude: number }; name: string }) {
  const [frozenName, setFrozenName] = useState<string | null>(null);
  const nameRef = useRef(name);
  useLayoutEffect(() => { nameRef.current = name; });
  useEffect(() => {
    const t = setTimeout(() => setFrozenName(nameRef.current), 100);
    return () => clearTimeout(t);
  }, []);
  if (frozenName === null) return null;
  return (
    <PointAnnotation
      id="dropped-pin"
      coordinate={[coord.longitude, coord.latitude]}
      anchor={{ x: 0.5, y: 1.0 }}
    >
      <DestinationPin name={frozenName} />
    </PointAnnotation>
  );
}

export default function MapScreen() {
  const router = useRouter();
  const dark = useColorScheme() === "dark";
  const BG = dark ? "#0F0F0F" : "#F6F7F8";

  const { location: me, navState, locationPermissionDenied, openLocationSettings, gpsLost, wrongDirection, startNavigation, stopNavigation, pauseNavigation, resumeNavigation, isIndoor, canBoardTransit, boardTransit } = useNavigation();
  const { visible: rateVisible, onJourneyComplete, onRate, onLater } = useRatePrompt();
  const [showPostJourney, setShowPostJourney] = useState(false);
  // Snapshot of the finished journey — PostJourneySheet must not read
  // activeJourney (it's cleared before the sheet opens; reading it live was
  // the arrival-time crash).
  const [postJourneyData, setPostJourneyData] = useState<{
    toName?: string;
    summary?: string;
    fare: { amount: number; currency: string } | null;
  } | null>(null);

  const activeJourney = useJourneyStore((s) => s.activeJourney);
  const setJourney    = useJourneyStore((s) => s.setJourney);
  const tripStatus    = useJourneyStore((s) => s.tripStatus);
  const clearJourney  = useJourneyStore((s) => s.clearJourney);
  
  const navigating    = tripStatus === "IN_TRANSIT";
  const tripPaused    = tripStatus === "PAUSED";
  
  const isVehicleMode = navigating && (
    (navState?.currentSegmentMode != null && navState.currentSegmentMode !== "WALK")
    || (me?.speed ?? 0) > 4.0
  );

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const layers          = useMapLayersStore((s) => s.layers);
  const isOnline        = useNetworkStore((s) => s.isOnline);
  const offlinePack     = useOfflineMapStore((s) => s.pack);

  const [styleLoaded, setStyleLoaded] = useState(false);

  const activeStyleURL = useMemo(() => {
    if (layers.mapType === "satellite") return "mapbox://styles/mapbox/satellite-streets-v12";
    if (layers.mapType === "hybrid")    return "mapbox://styles/mapbox/outdoors-v12";
    if (layers.traffic) return dark ? "mapbox://styles/mapbox/traffic-night-v2" : "mapbox://styles/mapbox/traffic-day-v2";
    return dark 
      ? "mapbox://styles/mapbox/dark-v11" 
      : (process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ?? "mapbox://styles/mapbox/streets-v12");
  }, [layers.mapType, layers.traffic, dark]);

  useEffect(() => {
    setStyleLoaded(false);
    const failsafeTimer = setTimeout(() => setStyleLoaded(true), 1200);
    return () => clearTimeout(failsafeTimer);
  }, [activeStyleURL]);

  const { journeys, addJourney, removeJourney } = useSavedStore();
  const { prefs, load: loadPrefs } = usePrefsStore();
  useEffect(() => { loadPrefs(); }, [loadPrefs]);

  const isSaved = useMemo(() =>
    activeJourney
      ? journeys.some((j) =>
          j.from_name === activeJourney.fromLoc.name &&
          j.to_name   === activeJourney.toLoc.name
        )
      : false,
    [journeys, activeJourney]
  );

  const savedJourneyId = useMemo(() =>
    activeJourney
      ? journeys.find((j) =>
          j.from_name === activeJourney.fromLoc.name &&
          j.to_name   === activeJourney.toLoc.name
        )?.id
      : undefined,
    [journeys, activeJourney]
  );

  const handleSaveJourney = async (label?: string) => {
    if (!isAuthenticated) { setShowSaveWall(true); return; }
    if (!activeJourney) return;
    const { fromLoc, toLoc, route } = activeJourney;
    await addJourney({
      label: label ?? null,
      from_name: fromLoc.name,
      from_lat:  fromLoc.lat,
      from_lng:  fromLoc.lng,
      from_id:   fromLoc.id ?? null,
      from_type: fromLoc._type,
      to_name:   toLoc.name,
      to_lat:    toLoc.lat,
      to_lng:    toLoc.lng,
      to_id:     toLoc.id ?? null,
      to_type:   toLoc._type,
      summary:   route.summary,
      duration:  route.total_duration,
      route,
    });
  };

  const handleUnsaveJourney = async () => {
    if (savedJourneyId !== undefined) await removeJourney(savedJourneyId);
  };

  const stepsScrollRef = useRef<any>(null);
  const speedKph = Math.round((me?.speed ?? 0) * 3.6);

  const [showSaveWall,    setShowSaveWall]    = useState(false);
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [arOpen,          setArOpen]          = useState(false);
  const [layersOpen,      setLayersOpen]      = useState(false);
  const [followMe,   setFollowMe]   = useState(true);
  const [headingUp,  setHeadingUp]  = useState(false);
  const [navStarted, setNavStarted] = useState(false);
  const [selected,        setSelected]        = useState<Stop | null>(null);
  const [nearestOpen,     setNearestOpen]     = useState(false);
  const [nearestStops,    setNearestStops]    = useState<UnifiedLocation[]>([]);
  const [activeReports,   setActiveReports]   = useState<TransitReport[]>([]);
  const [selectedReport,  setSelectedReport]  = useState<{ report: TransitReport; count: number } | null>(null);
  const [allStops,        setAllStops]        = useState<Stop[]>([]);
  const [stopDetailsOpen, setStopDetailsOpen] = useState(false);
  const [selectedIntermStop, setSelectedIntermStop] = useState<IntermediateStop | null>(null);
  const [viewCenter,     setViewCenter]     = useState<{ lat: number; lng: number } | null>(null);
  const [viewZoom,       setViewZoom]       = useState<number>(13);
  const [cameraHeading,  setCameraHeading]  = useState(0);
  const [longPressCoord,   setLongPressCoord]   = useState<{ latitude: number; longitude: number } | null>(null);
  const [longPressName,    setLongPressName]    = useState<string>("Dropped pin");

  const [selectedBus,   setSelectedBus]   = useState<SelectedBusInfo | null>(null);
  const [followingBus,  setFollowingBus]  = useState(false);
  const lastFollowCoordRef                = useRef<[number, number] | null>(null);
  const lastCamRef                        = useRef({ lat: 0, lng: 0, zoom: 0, pitch: 0 });

  const mapRef             = useRef<MapboxMapView>(null);
  const cameraRef          = useRef<MapboxCamera>(null);
  const camera             = useMapCamera(mapRef, cameraRef);
  const chipJustPressedRef = useRef(false);
  const compassBusyRef     = useRef(false);
  const lastSentHdgRef     = useRef<number>(0);

  const isVehicleModeRef = useRef(isVehicleMode);
  useEffect(() => { isVehicleModeRef.current = isVehicleMode; }, [isVehicleMode]);

  const headingUpRef = useRef(headingUp);
  useEffect(() => { headingUpRef.current = headingUp; }, [headingUp]);

  const navViewRef = useRef(prefs.navView);
  useEffect(() => { navViewRef.current = prefs.navView; }, [prefs.navView]);

  const isNavigationMode = navStarted;

  // ── NATIVE FOLLOW (#18) ──
  // Puck + camera follow run on the native/UI thread: the engine feeds 1 Hz
  // snapped fixes into CustomLocationProvider, Mapbox interpolates the puck
  // at 60 fps and followUserLocation drives the camera — immune to JS stalls.
  // prefs.nativeFollow=false restores the JS glide + camera loops.
  const nativeFollowPref   = prefs.nativeFollow;
  const nativeFollowActive = nativeFollowPref && isNavigationMode && followMe;

  // Flat overview pulls back to zoom 15.5 automatically
  const followZoom = useMemo(() => {
    if (!headingUp) return 15.5; 
    const kph = (me?.speed ?? 0) * 3.6;
    if (isVehicleMode) {
      return kph < 5 ? 17.2 : kph < 30 ? 17.2 - ((kph - 5) / 25) * 0.8 : kph < 80 ? 16.4 - ((kph - 30) / 50) * 0.9 : 15.5;
    }
    return kph < 5 ? 19.2 : kph < 30 ? 19.2 - ((kph - 5) / 25) * 1.2 : 18.0;
  }, [headingUp, me?.speed, isVehicleMode]);

  // Flat overview drops pitch to 0 automatically
  const followPitch = headingUp ? (isVehicleMode ? 65 : 55) : 0;

  // Keep the screen on for the whole navigation session.
  useEffect(() => {
    if (!isNavigationMode) return;
    activateKeepAwakeAsync("navigo-nav").catch(() => {});
    return () => { deactivateKeepAwake("navigo-nav"); };
  }, [isNavigationMode]);

  // Camera loop reads nav state (route bearing) without re-subscribing.
  const navStateRef = useRef(navState);
  useEffect(() => { navStateRef.current = navState; }, [navState]);

  // Target of the most recent programmatic flight — the camera loop adopts it
  // when it resumes, instead of slowly re-slewing from a stale zoom (the
  // "recenter works once, then everything re-animates slowly" glitch).
  const flightCamRef = useRef<{ zoom: number; pitch: number; at: number } | null>(null);

  useHeadingTracker();

  const [beamHeading, setBeamHeading] = useState(() => useHeadingStore.getState().heading);
  useEffect(() => {
    return useHeadingStore.subscribe((s) => {
      setBeamHeading((prev) => {
        const delta = Math.abs(((s.heading - prev + 540) % 360) - 180);
        // Drop threshold to 0.5 for real-time 60fps tracking
        return delta >= 0.5 ? s.heading : prev;
      });
    });
  }, []);

  // Puck heading: Route bearing ONLY when snapped AND in a fast-moving vehicle.
  // Walking must use the realtime device compass for true FPV.
  const puckHeading = useMemo(() => {
    if (isVehicleMode && navState && navState.distanceFromRouteM < 25 && navState.routeBearing > 0)
      return navState.routeBearing;
    return beamHeading; 
  }, [isVehicleMode, navState, beamHeading]);

  const meRef = useRef(me);
  useEffect(() => { meRef.current = me; }, [me]);

  const reportFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportReqId      = useRef(0);

  const reportLayerRef      = useRef<ReportLayerHandle>(null);
  const isUserGesturingRef  = useRef(false);
  const isProgrammaticFlightRef = useRef(false);
  const isFlatOverviewRef = useRef(false);
  // Timestamps exactly when the camera was locked
  const lockEngagedAtRef = useRef<number>(0);

  const followMeRef = useRef(followMe);
  useEffect(() => { followMeRef.current = followMe; }, [followMe]);

  // Ref so that handleRegionChange and Mapbox callbacks can read nativeFollowActive
  // without a re-render cycle. Updated inline (synchronous with every render) AND
  // immediately in any handler that changes follow state — this closes the race window
  // where Mapbox fires onRegionIsChanging between setState and the next render.
  const nativeFollowActiveRef = useRef(nativeFollowActive);
  nativeFollowActiveRef.current = nativeFollowActive; // Always in sync with current render

  const prevRegionRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null);
  useEffect(() => { prevRegionRef.current = null; }, [navigating]);

  const lastBoundsRef    = useRef<{ north: number; south: number; east: number; west: number } | null>(null);

  const meLat   = me?.latitude  ?? null;
  const meLng   = me?.longitude ?? null;
  const meSpeed = me?.speed     ?? 0;

  const { walkLegs, transitLegs, nodeMarkers, locMarkers, intermediateStops, steps, routeInfo, routeLoading } =
    useRouteOverlay(activeJourney, camera);

  // ── ROUTE PREVIEW FLY-THROUGH ──
  // ~4 s camera sweep along the whole journey before "Start". Auto-runs once
  // per new route; replayable from the journey sheet; any user gesture,
  // Start, or clearing the journey cancels it instantly.
  const flyThroughActiveRef = useRef(false);
  const flyThroughTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const flyThroughSeenRouteRef = useRef<any>(null);

  const journeyCoords = useMemo(() => {
    const legs = [...walkLegs, ...transitLegs]
      .map((l) => ({ segIdx: parseInt(l.id.split("-")[1], 10) || 0, coords: l.coords }))
      .sort((a, b) => a.segIdx - b.segIdx);
    return legs.flatMap((l) => l.coords);
  }, [walkLegs, transitLegs]);

  const cancelFlyThrough = useCallback(() => {
    if (!flyThroughActiveRef.current) return;
    flyThroughActiveRef.current = false;
    flyThroughTimersRef.current.forEach(clearTimeout);
    flyThroughTimersRef.current = [];
    isProgrammaticFlightRef.current = false;
  }, []);

  const runFlyThrough = useCallback(() => {
    if (flyThroughActiveRef.current || journeyCoords.length < 2) return;
    const frames = buildFlyThroughKeyframes(journeyCoords, 6);
    if (frames.length < 2) return;

    cancelFlyThrough();
    flyThroughActiveRef.current = true;
    isProgrammaticFlightRef.current = true;

    const zoom   = flyThroughZoom(routeInfo?.distance ?? 3000);
    const stepMs = 4000 / frames.length;

    frames.forEach((f, i) => {
      flyThroughTimersRef.current.push(setTimeout(() => {
        if (!flyThroughActiveRef.current) return;
        camera.animateTo({
          center:  { latitude: f.center.latitude, longitude: f.center.longitude },
          zoom,
          pitch:   45,
          heading: f.heading,
          duration: stepMs,
          mode: "linearTo", // Crucial for chaining! Prevents easing to a dead stop at every waypoint.
        });
      }, i * stepMs));
    });

    // Land back on the standard overview fit.
    flyThroughTimersRef.current.push(setTimeout(() => {
      if (!flyThroughActiveRef.current) return;
      flyThroughActiveRef.current = false;
      isProgrammaticFlightRef.current = false;
      camera.fitCoordinates(journeyCoords, { top: 140, right: 40, bottom: 320, left: 40 });
    }, frames.length * stepMs + 100));
  }, [journeyCoords, routeInfo, camera, cancelFlyThrough]);

  // Auto-run once per freshly loaded route (AI routes auto-start nav instead).
  useEffect(() => {
    if (!activeJourney?.route || activeJourney.route.is_ai_derived) return;
    if (navStarted || journeyCoords.length < 2) return;
    if (flyThroughSeenRouteRef.current === activeJourney.route) return;
    flyThroughSeenRouteRef.current = activeJourney.route;
    const t = setTimeout(runFlyThrough, 1100); // let the overview fit settle first
    return () => clearTimeout(t);
  }, [activeJourney, journeyCoords, navStarted, runFlyThrough]);

  useEffect(() => {
    if (activeJourney) {
      setSelected(null);
      setFollowMe(false);
      followMeRef.current = false;
      isFlatOverviewRef.current = true;
    } else {
      setFollowMe(true);
      followMeRef.current = true;
      isFlatOverviewRef.current = false;
    }
  }, [activeJourney]);

  useEffect(() => {
    (async () => {
      const cached = await CacheService.get<Stop[]>(CACHE_KEYS.STOPS_ALL, CACHE_TTL.STOPS);
      if (cached?.length) setAllStops(cached);
      try {
        const live = await StopService.getAllStops();
        const stops = live as unknown as Stop[];
        setAllStops(stops);
        CacheService.set(CACHE_KEYS.STOPS_ALL, stops);
      } catch (e) {
        if (!cached?.length) console.warn("Failed to load all stops", e);
      }
    })();
  }, []);

  useEffect(() => {
    CacheService.get<TransitReport[]>(CACHE_KEYS.REPORTS_VIEWPORT, CACHE_TTL.REPORTS)
      .then((cached) => { if (cached?.length) setActiveReports(cached); })
      .catch(() => {});
  }, []);

  useEffect(() => () => {
    if (reportFetchTimer.current) clearTimeout(reportFetchTimer.current);
  }, []);

  useEffect(() => {
    if (meLat == null || meLng == null || !nearestOpen) return;
    StopService.getNearbyStops(meLat, meLng, 2000, 5)
      .then(setNearestStops)
      .catch((e) => console.warn(e));
  }, [meLat, meLng, nearestOpen]);

  useEffect(() => {
    if (meLat == null || meLng == null || !followMe || isNavigationMode) return;
    if (isProgrammaticFlightRef.current) return; 

    camera.animateTo({ center: { latitude: meLat, longitude: meLng }, zoom: 16, heading: 0, duration: 300 });
  }, [meLat, meLng, followMe, isNavigationMode, camera]);


  const handleRecenter = useCallback(() => {
    lockEngagedAtRef.current = Date.now(); // Stamp lock
    setFollowMe(true);
    followMeRef.current = true;
    if (nativeFollowPref && isNavigationMode) {
      nativeFollowActiveRef.current = true;
      return;
    }
    if (meRef.current) {
      isProgrammaticFlightRef.current = true;
      isUserGesturingRef.current = false;
      flightCamRef.current = { zoom: 16, pitch: 0, at: Date.now() };

      camera.animateTo({
        center: { latitude: meRef.current.latitude, longitude: meRef.current.longitude },
        zoom: 16,
        duration: 1000
      });
      setTimeout(() => { isProgrammaticFlightRef.current = false; }, 1050);
    }
  }, [camera, nativeFollowPref, isNavigationMode]);


  // ── CAMERA LOOP (JS fallback — native followUserLocation owns the camera
  //    when prefs.nativeFollow is on) ──
  useEffect(() => {
    if (!isNavigationMode || !followMe || nativeFollowPref) return;

    let smooth    = useHeadingStore.getState().heading || 0;
    let committed = smooth;

    let anchorGps    = smooth;
    let anchorCmp    = useHeadingStore.getState().heading;
    let lastAnchorMs = 0;

    // Slew-rate-limited zoom & pitch: instead of jumping straight to the
    // speed-derived zoom (pumping) or flipping pitch 45↔70 on mode change,
    // ease toward the target a bounded amount per tick.
    // null = re-adopt on next active tick (start, or after a flight/gesture).
    let slewZoom:  number | null = null;
    let slewPitch: number | null = null;
    const ZOOM_SLEW_PER_TICK  = 0.18; // hard cap ≈1.8 zoom levels / s
    const PITCH_SLEW_PER_TICK = 3.0;  // hard cap ≈30° / s

    if (!headingUpRef.current) {
      camera.animateTo({ heading: 0, duration: 400 });
      lastSentHdgRef.current = 0;
    } else {
      lastSentHdgRef.current = committed;
    }

    const id = setInterval(() => {
      if (isProgrammaticFlightRef.current) {
        // A flight is moving the camera elsewhere; resync slews when we resume.
        slewZoom = null;
        slewPitch = null;
        return;
      }

      const pos = meRef.current;
      if (!pos) return;
      if (isUserGesturingRef.current) {
        slewZoom = null;
        slewPitch = null;
        return;
      }

      const vehicleMode = isVehicleModeRef.current;
      const speed       = pos.speed ?? 0;
      const compass     = useHeadingStore.getState().heading;
      const gpsHeading  = pos.heading ?? null;
      const gpsWeight   = Math.min(1.0, Math.max(0, (speed - 0.5) / 2.5));
      const now         = Date.now();

      if (gpsHeading != null && now - lastAnchorMs >= 2500) {
        anchorGps    = gpsHeading;
        anchorCmp    = compass;
        lastAnchorMs = now;
      }

      let rawHeading: number;
      if (vehicleMode) {
        // In a matatu the compass is junk (metal body) and GPS heading is
        // noisy at low speed. The route bearing at the projected position is
        // the truth — and when the vehicle is at rest, freeze the heading
        // entirely so the camera doesn't spin at stops.
        const routeBearing = navStateRef.current?.routeBearing;
        rawHeading = speed < 0.8
          ? smooth // at rest: hold current heading
          : (routeBearing ?? gpsHeading ?? compass);
      } else {
        // For walking FPV, bypass GPS fusion entirely so it exactly mirrors the beam.
        rawHeading = compass;
      }
      const diff = ((rawHeading - smooth + 540) % 360) - 180;
      // Instant tracking (1.0) for walking, smooth (0.75) for vehicles
      smooth     = (smooth + (vehicleMode ? 0.75 : 1.0) * diff + 360) % 360;

      const delta = Math.abs(((smooth - committed + 540) % 360) - 180);
      // Lower threshold so the camera responds to micro-movements instantly
      if (delta >= 0.5) committed = smooth;

      const isFlat = !headingUpRef.current || navViewRef.current === "flat";

      const speedKphCam = speed * 3.6;
      // Separate zoom curves: walking hugs the street; transit sits further
      // out (a bus at a red light must NOT zoom into 19.2 like a pedestrian).
      const calcZoom = vehicleMode
        ? ( speedKphCam < 5  ? 17.2
          : speedKphCam < 30 ? 17.2 - ((speedKphCam -  5) / 25) * 0.8
          : speedKphCam < 80 ? 16.4 - ((speedKphCam - 30) / 50) * 0.9
          :                    15.5)
        : ( speedKphCam < 5  ? 19.2
          : speedKphCam < 30 ? 19.2 - ((speedKphCam -  5) / 25) * 1.2
          :                    18.0);

      const targetZoom  = isFlat ? 15.5 : Math.max(15.0, Math.min(19.5, calcZoom));
      const targetPitch = isFlat ? 0 : (vehicleMode ? 65 : 45);

      // Adopt on the first tick after start/flight/gesture. A fresh
      // programmatic flight already put the camera at its own target — start
      // from THAT, not from the stale pre-flight zoom (otherwise every
      // recenter is followed by a second slow re-animation).
      if (slewZoom == null || slewPitch == null) {
        const f = flightCamRef.current;
        const freshFlight = f && now - f.at < 4000;
        slewZoom  = freshFlight ? f.zoom  : (prevRegionRef.current?.zoom ?? targetZoom);
        slewPitch = freshFlight ? f.pitch : targetPitch;
      }
      // Proportional chase with a hard cap: fast when far, gentle when close.
      const zErr = targetZoom - slewZoom;
      const pErr = targetPitch - slewPitch;
      slewZoom  += Math.abs(zErr) < 0.02 ? zErr : Math.max(-ZOOM_SLEW_PER_TICK,  Math.min(ZOOM_SLEW_PER_TICK,  zErr * 0.22));
      slewPitch += Math.abs(pErr) < 0.30 ? pErr : Math.max(-PITCH_SLEW_PER_TICK, Math.min(PITCH_SLEW_PER_TICK, pErr * 0.25));

      const finalZoom = slewZoom;

      const mpp = (Math.cos(pos.latitude * Math.PI / 180) * 156543) / Math.pow(2, finalZoom);
      const sheetCompM = Math.min(100, 155 * mpp);
      const netOffsetM = isFlat ? 0 : (vehicleMode ? SH * 0.20 * mpp : 50 - sheetCompM);

      const hRad      = (committed * Math.PI) / 180;
      const cosLat    = Math.cos(pos.latitude * Math.PI / 180);
      const offsetDeg = netOffsetM / 111_320;
      
      const targetHeading = (!isFlat && headingUpRef.current) ? committed : 0;
      const camHRad       = headingUpRef.current ? hRad : 0;

      const centerLat = pos.latitude  + offsetDeg * Math.cos(camHRad);
      const centerLng = pos.longitude + offsetDeg * Math.sin(camHRad) / cosLat;

      const pitch = slewPitch;

      const hdgDelta = Math.abs(((targetHeading - lastSentHdgRef.current + 540) % 360) - 180);
      const hdgThreshold = headingUpRef.current ? 1.0 : (vehicleMode ? 2.0 : 5.0);
      const sendHdg = hdgDelta >= hdgThreshold && (headingUpRef.current || speed >= 0.5) && !compassBusyRef.current;

      const last = lastCamRef.current;
      const moved = 
        Math.abs(centerLat - last.lat) > 0.000005 ||
        Math.abs(centerLng - last.lng) > 0.000005 ||
        Math.abs(finalZoom - last.zoom) > 0.05 ||
        Math.abs(pitch - last.pitch) > 1.0;

      if (moved || sendHdg) {
        if (sendHdg) lastSentHdgRef.current = targetHeading;
        lastCamRef.current = { lat: centerLat, lng: centerLng, zoom: finalZoom, pitch };
        
        // PERFECT SYNC
        camera.animateTo({
          center:   { latitude: centerLat, longitude: centerLng },
          zoom:     finalZoom,
          ...(sendHdg ? { heading: targetHeading } : {}),
          pitch,
          duration: 100, 
        });
      }
    }, 100); 

    return () => clearInterval(id);
  }, [isNavigationMode, followMe, camera, nativeFollowPref]);

  const handleReportPress = useCallback((r: TransitReport, count: number) => {
    setReportSheetOpen(false);
    setSelectedReport({ report: r, count });
  }, []);

  const handleClearJourney = useCallback(() => {
    cancelFlyThrough();
    stopNavigation();
    clearJourney();
    setNavStarted(false);
    setSelectedIntermStop(null);
  }, [stopNavigation, clearJourney, cancelFlyThrough]);

  // ── ARRIVAL SEQUENCE ──
  // 1. Snapshot the journey (the post-journey sheet must never read the live
  //    store — it gets cleared underneath it, which crashed the app).
  // 2. End the journey: close JourneyDetailsSheet, drop nav camera.
  // 3. Only then present PostJourneySheet; the rate prompt waits for its dismissal.
  useEffect(() => {
    if (tripStatus !== "ARRIVED") return;

    const j    = useJourneyStore.getState().activeJourney;
    const segs = (j?.route?.segments ?? []) as any[];
    const fare = segs.find((s) => s.mode !== "WALK" && s.fare)?.fare;
    setPostJourneyData({
      toName:  j?.toLoc?.name,
      summary: j?.route?.summary,
      fare:    fare ? { amount: fare.amount, currency: fare.currency } : null,
    });

    const tEnd  = setTimeout(() => { handleClearJourney(); }, 600);
    const tPost = setTimeout(() => setShowPostJourney(true), 1200);
    return () => { clearTimeout(tEnd); clearTimeout(tPost); };
  }, [tripStatus, handleClearJourney]);

  const handleSelectStop = useCallback((s: Stop) => {
    stopNavigation();
    setFollowMe(false);
    setSelected(s);
    setStopDetailsOpen(false);
    setNearestOpen(false);
    camera.animateTo({ center: { latitude: s.lat, longitude: s.lng }, zoom: 17.2, duration: 500 });
  }, [stopNavigation, camera]);

  const handleGoToStop = useCallback(async () => {
    if (!me || !selected) return;

    const fromLoc: UnifiedLocation = {
      id: "current_location", name: "Current Location", _type: "location",
      lat: me.latitude, lng: me.longitude,
    };
    const toLoc: UnifiedLocation = {
      id: selected.id, name: selected.name, _type: "stop",
      lat: selected.lat, lng: selected.lng,
    };

    try {
      const routes = await RouteService.calculateJourney(fromLoc, toLoc, prefs.maxWalkMeters);
      if (routes.length > 0) {
        setJourney(fromLoc, toLoc, routes[0]);
      } else {
        Alert.alert("No route found", "We couldn't find a transit route to this stop right now. Try again later.");
      }
    } catch (e) {
      console.warn("Failed to calculate route to stop", e);
      Alert.alert("Error", "Failed to calculate route. Please check your connection.");
    }
  }, [me, selected, setJourney, prefs.maxWalkMeters]);
  
  const handleToggleNav = useCallback((nextState: boolean) => {
    cancelFlyThrough();
    if (nextState) {
      lockEngagedAtRef.current = Date.now();
      isFlatOverviewRef.current = false;
      startNavigation();
      setFollowMe(true);
      followMeRef.current = true;
      setNavStarted(true);
      setHeadingUp(true);
      headingUpRef.current = true;
      // Stamp immediately — Mapbox fires onRegionIsChanging before the next render,
      // and the guard in handleRegionChange reads this ref.
      nativeFollowActiveRef.current = nativeFollowPref;

      // Native follow engages via Camera props — no manual intro flight
      // (setCamera would fight followUserLocation).
      if (prefs.nativeFollow) return;

      if (meRef.current) {
        isProgrammaticFlightRef.current = true;
        isUserGesturingRef.current = false;

        const startZoom  = isVehicleModeRef.current ? 17.2 : 19.2;
        const startPitch = isVehicleModeRef.current ? 65 : 45;
        const startHdg = useHeadingStore.getState().heading || 0;
        lastSentHdgRef.current = startHdg;
        flightCamRef.current = { zoom: startZoom, pitch: startPitch, at: Date.now() };

        camera.animateTo({
          center: { latitude: meRef.current.latitude, longitude: meRef.current.longitude },
          zoom: startZoom,
          pitch: startPitch,
          heading: startHdg,
          duration: 1200,
        });

        setTimeout(() => {
          isProgrammaticFlightRef.current = false;
        }, 1250);
      }
    } else {
      isFlatOverviewRef.current = false;
      stopNavigation();
      setFollowMe(false);
      followMeRef.current = false;
      nativeFollowActiveRef.current = false; // stamp immediately on nav stop
      setNavStarted(false);
      setHeadingUp(false);
      headingUpRef.current = false;

      isProgrammaticFlightRef.current = true;
      camera.animateTo({ pitch: 0, heading: 0, zoom: 15, duration: 600 });
      setTimeout(() => { isProgrammaticFlightRef.current = false; }, 650);
    }
  }, [startNavigation, stopNavigation, camera, prefs.nativeFollow, nativeFollowPref, cancelFlyThrough]);

  const handleCompassPress = useCallback(() => {
    // 1. Native Follow Handling
    if (prefs.nativeFollow && isNavigationMode) {
      if (!followMe) {
        lockEngagedAtRef.current = Date.now(); // 🛠️ Stamp lock
        setFollowMe(true);
        followMeRef.current = true;
        nativeFollowActiveRef.current = true;
        return;
      }
      setHeadingUp((h) => {
        headingUpRef.current = !h;
        return !h;
      });
      return;
    }

    // 2. Free-roam Mode (Not Navigating)
    if (!isNavigationMode) {
      isProgrammaticFlightRef.current = true;
      isUserGesturingRef.current = false;
      camera.animateTo({ heading: 0, pitch: 0, duration: 800, mode: "easeTo" });
      setCameraHeading(0);
      setTimeout(() => { isProgrammaticFlightRef.current = false; }, 850);
      return;
    }

    // 3. JS Nav Loop: Recenter if currently unlocked
    if (!followMe) {
      lockEngagedAtRef.current = Date.now(); // 🛠️ Stamp lock
      setFollowMe(true);
      followMeRef.current = true;

      if (meRef.current) {
        isProgrammaticFlightRef.current = true;
        isUserGesturingRef.current = false;

        const targetPitch = !headingUpRef.current ? 0 : (isVehicleModeRef.current ? 65 : 45);
        const targetZoom  = !headingUpRef.current ? 15.5 : (isVehicleModeRef.current ? 17.2 : 19.2);
        const targetHdg   = headingUpRef.current ? (useHeadingStore.getState().heading || 0) : 0;
        
        flightCamRef.current = { zoom: targetZoom, pitch: targetPitch, at: Date.now() };

        camera.animateTo({
          center: { latitude: meRef.current.latitude, longitude: meRef.current.longitude },
          zoom: targetZoom,
          pitch: targetPitch,
          heading: targetHdg,
          duration: 1200, 
          mode: "easeTo", // 🛠️ Forces a smooth glide
        } as any);

        setTimeout(() => { isProgrammaticFlightRef.current = false; }, 1250);
      }
      return;
    }

    // 4. JS Nav Loop: Toggle FPV / Flat Overview
    setHeadingUp((h) => {
      const next = !h;
      headingUpRef.current = next;

      isProgrammaticFlightRef.current = true;
      isUserGesturingRef.current = false;

      const targetPitch = next ? (isVehicleModeRef.current ? 65 : 45) : 0;
      const targetZoom  = next ? (isVehicleModeRef.current ? 17.2 : 19.2) : 15.5;
      const targetHdg   = next ? (useHeadingStore.getState().heading || 0) : 0;

      flightCamRef.current = { zoom: targetZoom, pitch: targetPitch, at: Date.now() };

      camera.animateTo({
        pitch: targetPitch,
        heading: targetHdg,
        zoom: targetZoom,
        duration: 1200, // 🛠️ Lengthened for elegance
        mode: "easeTo", // 🛠️ Forces a smooth glide
      } as any);

      setTimeout(() => { isProgrammaticFlightRef.current = false; }, 1250);

      return next;
    });

    compassBusyRef.current = true;
    setTimeout(() => { compassBusyRef.current = false; }, 500);
  }, [isNavigationMode, followMe, camera, prefs.nativeFollow]);

  const handleLongPress = useCallback((feature: any) => {
    const [longitude, latitude] = (feature?.geometry?.coordinates as [number, number]) ?? [0, 0];
    setLongPressCoord({ latitude, longitude });
    setLongPressName("Dropped pin");
    MapService.reverseGeocode(latitude, longitude)
      .then((name: string | null) => { if (name) setLongPressName(name); })
      .catch(() => {});
  }, []);

  const fetchReportsForBounds = useCallback(
    (north: number, south: number, east: number, west: number) => {
      if (!useMapLayersStore.getState().layers.reports) return; 
      const reqId = ++reportReqId.current;
      ReportService.getReportsInViewport(north, south, east, west)
        .then((reports) => {
          if (reqId !== reportReqId.current) return; 
          setActiveReports(reports);
          CacheService.set(CACHE_KEYS.REPORTS_VIEWPORT, reports);
        })
        .catch((err) => console.warn("Failed to fetch viewport reports", err));
    },
    []
  );

  const prevJourneyRouteRef = useRef<any>(null);
  useEffect(() => {
    if (!activeJourney) { prevJourneyRouteRef.current = null; return; }
    if (activeJourney.route === prevJourneyRouteRef.current) return;
    prevJourneyRouteRef.current = activeJourney.route;

    if (activeJourney.route.is_ai_derived) {
      setTimeout(() => { handleToggleNav(true); }, 350);
    }
  }, [activeJourney, handleToggleNav]);

  const handleRegionChange = useCallback((feature: any) => {
    if (isProgrammaticFlightRef.current) return;

    if (flyThroughActiveRef.current && feature?.properties?.isUserInteraction) {
      cancelFlyThrough();
    }

    const isGesture = feature?.properties?.isUserInteraction;
    const timeSinceLock = Date.now() - lockEngagedAtRef.current;

    if (isGesture) {
      isUserGesturingRef.current = true;
      
      // INSTANT RECENTER DETECTION
      // Shield the lock for 500ms from Mapbox's fake native snap gesture.
      // After 500ms, ANY swipe instantly drops the camera lock and shows the recenter button.
      if (followMeRef.current && timeSinceLock > 500) {
        followMeRef.current = false;
        setFollowMe(false);
        nativeFollowActiveRef.current = false; // Stamp immediately
      }
      setFollowingBus(false);
    }

    const newZoom = feature?.properties?.zoomLevel;
    if (newZoom != null) {
      setViewZoom((prev) => {
        const crossedReports = (prev >= 11.5) !== (newZoom >= 11.5);
        const crossedStops   = (prev >= 13.0) !== (newZoom >= 13.0);
        if (crossedReports || crossedStops || Math.abs(prev - newZoom) > 0.5) {
          return newZoom;
        }
        return prev;
      });
    }
  }, [cancelFlyThrough]);

  const onRegionChangeComplete = useCallback(async (feature: any) => {
    if (isProgrammaticFlightRef.current) return;

    const [lng, lat] = (feature?.geometry?.coordinates as [number, number]) ?? [DEFAULT_REGION.longitude, DEFAULT_REGION.latitude];
    const newZoom   = feature?.properties?.zoomLevel    ?? 13;
    const isGesture = feature?.properties?.isUserInteraction ?? false;

    if (isGesture) {
      isUserGesturingRef.current = false;
      // The buggy 'isPinch' logic has been completely removed. 
      // Once unlocked, it stays unlocked until the user taps Recenter.
    }

    prevRegionRef.current = { lat, lng, zoom: newZoom };
    if (feature?.properties?.heading != null) setCameraHeading(feature.properties.heading);
    setViewZoom(newZoom);
    setViewCenter({ lat, lng });
    reportLayerRef.current?.project();

    try {
      const bounds = await mapRef.current?.getVisibleBounds();
      if (bounds) {
        const [[maxLng, maxLat], [minLng, minLat]] = bounds;
        lastBoundsRef.current = { north: maxLat, south: minLat, east: maxLng, west: minLng };
        if (reportFetchTimer.current) clearTimeout(reportFetchTimer.current);
        reportFetchTimer.current = setTimeout(
          () => fetchReportsForBounds(maxLat, minLat, maxLng, minLng),
          400
        );
      }
    } catch { }
  }, [navigating, fetchReportsForBounds]);

  useEffect(() => {
    if (!layers.reports) return;
    const b = lastBoundsRef.current;
    if (b) fetchReportsForBounds(b.north, b.south, b.east, b.west);
  }, [layers.reports, fetchReportsForBounds]);

  const nextStep    = steps[navState?.stepIndex ?? 0];
  const nextPreview = prefs.navHints === "off" || !nextStep ? null : humanizeStep(nextStep);
  const nextNextStep = steps[(navState?.stepIndex ?? 0) + 1];

  const nextNextPreview = useMemo(() => {
    if (prefs.navHints === "off" || !nextNextStep) return null;
    if (nextNextStep.type === "depart") {
      const m = nextNextStep.instruction?.match(/^Board (Line \S+)/);
      return m ? `Board ${m[1]}` : humanizeStep(nextNextStep);
    }
    return humanizeStep(nextNextStep);
  }, [nextNextStep, prefs.navHints]);

  const stepEta = (navState?.stepETAs?.[navState?.stepIndex ?? 0]) ?? null;

  const walkInstruction = useMemo(() => {
    if (!isNavigationMode || navState?.currentSegmentMode !== "WALK") return null;
    const step = steps[navState.stepIndex ?? 0];
    if (!step?.subSteps?.length) return null;
    if (meLat == null || meLng == null) return step.subSteps[0].instruction;
    
    let nearestIdx = 0, nearestDist = Infinity;
    for (let i = 0; i < step.subSteps.length; i++) {
      const d = Math.hypot(meLat - step.subSteps[i].lat, meLng - step.subSteps[i].lng);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    
    const isStandingAtStart = nearestIdx === 0 && nearestDist < (30 / 111_320);
    const isPassingWaypoint = !isStandingAtStart && nearestDist < (20 / 111_320);
    const idx = isPassingWaypoint ? Math.min(nearestIdx + 1, step.subSteps.length - 1) : nearestIdx;
      
    return step.subSteps[idx].instruction;
  }, [isNavigationMode, navState, steps, meLat, meLng]);

  const walkDestination = useMemo(() => {
    if (!isNavigationMode || navState?.currentSegmentMode !== "WALK") return null;
    const si = navState.stepIndex ?? 0;
    for (let i = si + 1; i < steps.length; i++) {
      if (steps[i].type === "depart") {
        const m = steps[i].instruction?.match(/at (.+)$/);
        return m?.[1] ?? null;
      }
      if (steps[i].type === "arrive") break;
    }
    return null;
  }, [isNavigationMode, navState, steps]);

  // AR guidance is a walk-leg tool: auto-dismiss when boarding or ending.
  useEffect(() => {
    if (arOpen && (isVehicleMode || !isNavigationMode)) setArOpen(false);
  }, [arOpen, isVehicleMode, isNavigationMode]);

  // AR arrow target: the current step's endpoint (stage / boarding stop).
  const arTarget = steps[navState?.stepIndex ?? 0]?.location ?? null; // [lng, lat]

  const boardingNodeId = (tripStatus === "WAITING_FOR_BUS" && navStarted)
    ? (() => {
        const segs = activeJourney?.route?.segments as any[] | undefined;
        if (!segs) return null;
        const idx = segs.findIndex((seg) => seg.mode !== "WALK");
        return idx >= 0 ? `node-from-${idx}` : null;
      })()
    : null;

  // Active segment = engine step index (the engine builds exactly one step
  // per route segment), so leg dim/trim state comes straight from the engine
  // instead of a nearest-point scan that froze during transit legs.
  const activeSegIdx = isNavigationMode ? (navState?.stepIndex ?? -1) : -1;

  // Quantize the user position fed to the overlay (~1 m) so active-leg
  // trimming doesn't rebuild geometry at the 10 Hz glide rate.
  const overlayUserLat = isNavigationMode && meLat != null ? Math.round(meLat * 1e5) / 1e5 : undefined;
  const overlayUserLng = isNavigationMode && meLng != null ? Math.round(meLng * 1e5) / 1e5 : undefined;


  // ── 2D User Location (Beam + Pulse + Dot) ──
  const unifiedUserLocationGeoJson = useMemo(() => {
    if (meLat == null || meLng == null) return null;

    const showBeam = !isVehicleMode;
    // The beam visual must ALWAYS use the device compass (beamHeading),
    // even when the map camera tracking is snapped to the route.
    const effectiveHeading = beamHeading;
    const beamFeature = showBeam
      ? headingArcGeoJson(meLat, meLng, effectiveHeading, viewZoom, isNavigationMode)
      : null;

    const dotFeature: GeoJSON.Feature<GeoJSON.Point> = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [meLng, meLat] },
      properties: { 
        layer: "dot" 
      },
    };

    return {
      type: "FeatureCollection",
      features: beamFeature ? [beamFeature, dotFeature] : [dotFeature],
    };
  }, [meLat, meLng, beamHeading, viewZoom, isVehicleMode, isNavigationMode]); // Ensure dependencies are accurate

  const navModelsGeoJson = useMemo(() => {
    if (!isNavigationMode || meLat == null || meLng == null) return null;

    // Heading: the puck's course-over-ground (route bearing when snapped) —
    // NOT the compass, which is useless inside a vehicle. Same axis offset as
    // BusLayer: bearings become model rotation via (bearing + 180) - 90.
    const busHeading = ((me?.heading ?? 0) + 180) % 360 - 90;

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [meLng, meLat] },
          properties: {
            modelRot: [MODEL_TILT_X, 0, busHeading],
          },
        },
      ],
    } as GeoJSON.FeatureCollection;
  }, [meLat, meLng, me?.heading, isNavigationMode]);


  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <MapboxMapView
        ref={mapRef}
        style={{ flex: 1 }}
        styleURL={activeStyleURL}
        logoEnabled={false}
        compassEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        pitchEnabled={false}
        onRegionIsChanging={handleRegionChange}         
        onRegionDidChange={onRegionChangeComplete}      
        onLongPress={handleLongPress}
        onDidFinishLoadingStyle={() => {
          setTimeout(() => setStyleLoaded(true), 150);
        }} 
      >
        <MapboxCamera
          ref={cameraRef}
          maxZoomLevel={19.5}
          defaultSettings={{
            centerCoordinate: [DEFAULT_REGION.longitude, DEFAULT_REGION.latitude],
            zoomLevel: 13,
          }}
          followUserLocation={nativeFollowActive}
          {...(nativeFollowActive
            ? {
                // 'course' freezes at 0 speed. 'compass' perfectly tracks device hardware rotation when walking.
                followUserMode: (headingUp ? (isVehicleMode ? "course" : "compass") : "normal") as any,
                followZoomLevel: followZoom,
                followPitch,
                followPadding: { paddingBottom: 200 },
              }
            : {})}
          onUserTrackingModeChange={(e: any) => {
            if (nativeFollowActiveRef.current && e?.nativeEvent?.payload?.followUserMode == null) {
              followMeRef.current = false;
              setFollowMe(false);
              nativeFollowActiveRef.current = false;
            }
          }}
        />

        {/* CustomLocationProvider tells the Camera where to follow — no visual. */}
        {/* Decoupled from `nativeFollowActive`. It must stay mounted during the whole nav session so Mapbox always has coordinates ready the instant you hit Recenter. */}
        {prefs.nativeFollow && isNavigationMode && meLat != null && meLng != null && (
          <CustomLocationProvider coordinate={[meLng, meLat]} heading={puckHeading} />
        )}

        {styleLoaded && (
          <NativeModels models={{ 
            navBus:   "https://files.navigo.co.ke/bus.glb"
          }} />
        )}

        {/* Offline tiles: native vector packs + ambient cache are served by
            Mapbox automatically when the device is offline — no source swap. */}

        {styleLoaded && (
          <>

            {unifiedUserLocationGeoJson && (
              <NativeShapeSource id="user-bundle-src" shape={unifiedUserLocationGeoJson}>
                
                <NativeFillLayer id="user-beam-fill" filter={["==", ["get", "layer"], "beam"]} style={{ fillColor: "#FF6F00", fillOpacity: 0.18 }} />

                <NativeCircleLayer id="user-dot-pulse" filter={["==", ["get", "layer"], "dot"]} style={{ circleRadius: 18, circleColor: "#FF6F00", circleOpacity: 0.15, circlePitchAlignment: "viewport" }} />

                {!isVehicleMode && (
                  <NativeCircleLayer
                    id="user-dot-core"
                    filter={["==", ["get", "layer"], "dot"]}
                    style={{
                      circleRadius: 9,
                      circleColor: "#FF6F00",
                      circleStrokeColor: "#FFFFFF",
                      circleStrokeWidth: 3,
                      circlePitchAlignment: "viewport",
                    }}
                  />
                )}

              </NativeShapeSource>
            )}

            {navModelsGeoJson && (
               <NativeShapeSource id="nav-models-src" shape={navModelsGeoJson}>
                  {isVehicleMode && (
                    <NativeModelLayer
                      id="nav-model-bus"
                      style={{
                        modelId: "navBus",
                        // Same zoom-scaled sizing as BusLayer: big enough to
                        // spot from city view, physically lane-sized up close.
                        modelScale: [
                          "interpolate", ["linear"], ["zoom"],
                          10, ["literal", [0.5, 0.5, 0.5]],
                          15, ["literal", [0.15, 0.15, 0.15]],
                          20, ["literal", [0.01, 0.01, 0.01]],
                        ],
                        modelRotation: ["get", "modelRot"],
                        // Sit on the road, not 25 m in the sky.
                        modelTranslation: ["literal", [0, 0, 0.2]],
                        modelOpacity: 1,
                      }}
                    />
                  )}
               </NativeShapeSource>
            )}

            <RouteOverlay
              walkLegs={walkLegs}
              transitLegs={transitLegs}
              nodeMarkers={nodeMarkers}
              locMarkers={locMarkers}
              intermediateStops={intermediateStops}
              onIntermStopPress={setSelectedIntermStop}
              boardingNodeId={boardingNodeId}
              activeSegIdx={activeSegIdx}
              userLat={overlayUserLat}
              userLng={overlayUserLng}
            />

            {longPressCoord && !activeJourney && (
              <DroppedPin
                key={`pin-${Math.round(longPressCoord.latitude * 1e5)},${Math.round(longPressCoord.longitude * 1e5)}`}
                coord={longPressCoord}
                name={longPressName}
              />
            )}

            {!activeJourney && (
              <StopsLayer
                allStops={allStops}
                viewCenter={viewCenter}
                viewZoom={viewZoom}
                selected={selected}
                onPress={handleSelectStop}
              />
            )}

            {!activeJourney && layers.bus && (
              <BusLayer
                selectedBusId={selectedBus?.id}
                onBusPress={(info) => { 
                  setSelectedBus(info); 
                  setFollowingBus(true); 
                  lastFollowCoordRef.current = null; 
                  camera.animateTo({ zoom: 16.5, duration: 600 });
                }}
                followBusId={followingBus ? selectedBus?.id : null}
                onFollowPosition={(coords) => {
                  if (isUserGesturingRef.current) {
                    setFollowingBus(false);
                    return;
                  }
                  const last = lastFollowCoordRef.current;
                  if (last && Math.abs(coords[0] - last[0]) < 0.000001 && Math.abs(coords[1] - last[1]) < 0.000001) return;
                  lastFollowCoordRef.current = coords;
                  camera.animateTo({ center: { longitude: coords[0], latitude: coords[1] }, duration: 100 });
                }}
              />
            )}
            
          {layers.reports && (
            <ReportLayer
              ref={reportLayerRef}
              reports={activeReports}
              mapRef={mapRef}
              viewZoom={viewZoom}
              onPress={handleReportPress}
            />
          )}
          </>
        )}

      </MapboxMapView>

      {!me && (
        <View style={s.locatingOverlay}>
          <ActivityIndicator size="large" color="#FF6F00" />
        </View>
      )}

      {locationPermissionDenied && (
        <Pressable onPress={openLocationSettings} style={s.permissionBanner}>
          <Text style={s.permissionText}>
            Location needed for navigation, tap to enable in Settings
          </Text>
        </Pressable>
      )}

      {!isOnline && (
        offlinePack ? (
          <OfflineNotice variant="active" dark={dark} />
        ) : (
          <OfflineNotice
            variant={isAuthenticated ? "download" : "login"}
            dark={dark}
            onPress={() =>
              router.push((isAuthenticated ? "/(account)/offline-maps" : "/(auth)/login") as any)
            }
          />
        )
      )}

      <MapFloatingUI
        onRecenter={handleRecenter}
        onOpenSearch={() => {
          if (chipJustPressedRef.current) { chipJustPressedRef.current = false; return; }
          router.push("/search");
        }}
        onOpenReport={() => setReportSheetOpen(true)}
        onOpenLayers={() => setLayersOpen(true)}
        onOpenKwame={() => { chipJustPressedRef.current = true; setNearestOpen(false); router.push("/kwame"); }}
        navigating={isNavigationMode}
        followMe={followMe}
        waitingForBus={tripStatus === "WAITING_FOR_BUS" && navStarted}
        onToggleNav={() => handleToggleNav(!isNavigationMode)}
        nextPreview={nextPreview}
        nextStep={nextStep}
        showNavSub={prefs.navHints === "detailed"}
        eta={navState?.eta ?? null}
        remainingDistanceM={navState?.remainingDistanceM ?? null}
        distanceToNextStepM={navState?.distanceToNextStepM ?? null}
        navStatus={navState?.status ?? null}
        stopsRemaining={navState?.stopsRemaining ?? null}
        arrivalSoonShown={navState?.status === "arrived"}
        gpsLost={gpsLost}
        wrongDirection={wrongDirection && isNavigationMode}
        currentSpeedKph={isNavigationMode ? speedKph : undefined}
        activeJourney={activeJourney}
        onClearJourney={handleClearJourney}
        nextNextPreview={nextNextPreview}
        approachPhase={navState?.approachPhase ?? null}
        cameraHeading={cameraHeading}
        onResetNorth={handleCompassPress}
        headingUp={headingUp}
        stepEta={stepEta}
        walkInstruction={walkInstruction}
        walkDestination={walkDestination}
        canBoardTransit={canBoardTransit && (isNavigationMode || tripStatus === "WAITING_FOR_BUS")}
        onBoardTransit={boardTransit}
        isIndoor={isIndoor && isNavigationMode}
        paused={tripPaused}
        onResume={resumeNavigation}
        showAR={isNavigationMode && !isVehicleMode && navState?.currentSegmentMode === "WALK"}
        onOpenAR={() => setArOpen(true)}
        bottomOffset={
          activeJourney ? 190
          : selectedBus ? 180
          : nearestOpen ? 240
          : selected && stopDetailsOpen ? 280
          : selected ? 180
          : 0
        }
      />

      {selectedReport && (
        <ReportDetailCard
          report={selectedReport.report}
          clusterCount={selectedReport.count}
          onClose={() => setSelectedReport(null)}
        />
      )}

      {reportSheetOpen && (
        <ReportSheet
          onClose={() => setReportSheetOpen(false)}
          userLat={meLat}
          userLng={meLng}
        />
      )}

      {rateVisible && <RateAppSheet onRate={onRate} onLater={onLater} />}

      <ARWalkView
        visible={arOpen}
        onClose={() => setArOpen(false)}
        userLat={meLat}
        userLng={meLng}
        targetLat={arTarget ? arTarget[1] : null}
        targetLng={arTarget ? arTarget[0] : null}
        targetName={walkDestination ?? activeJourney?.toLoc?.name ?? null}
        instruction={walkInstruction ?? nextPreview}
        distanceM={navState?.distanceToNextStepM ?? null}
      />

      <PostJourneySheet
        visible={showPostJourney}
        onDismiss={() => {
          setShowPostJourney(false);
          setPostJourneyData(null);
          onJourneyComplete(); // rate prompt only after this sheet is gone
        }}
        toName={postJourneyData?.toName}
        journeyRoute={postJourneyData?.summary}
        estimatedFare={postJourneyData?.fare ?? null}
      />

      <BusDetailsSheet
        bus={selectedBus}
        following={followingBus}
        onFollow={() => setFollowingBus((f) => !f)}
        onDismiss={() => { setSelectedBus(null); setFollowingBus(false); }}
      />

      {!selected && !activeJourney && (
        <NearestStopsSheet nearestOpen={nearestOpen} setNearestOpen={setNearestOpen} nearest={nearestStops} me={me} onSelect={handleSelectStop} />
      )}

      {selected && !activeJourney && !stopDetailsOpen && (
        <StopQuickCard
          stop={selected}
          onClose={() => setSelected(null)}
          onGoToStop={handleGoToStop}
          onViewDetails={() => setStopDetailsOpen(true)}
          loading={routeLoading}
        />
      )}

      {selected && !activeJourney && stopDetailsOpen && (
        <StopDetailsSheet
          stop={selected}
          onClose={() => { setStopDetailsOpen(false); setSelected(null); }}
          onGoToStop={handleGoToStop}
        />
      )}

      {selectedIntermStop && (
        <IntermStopInfoCard
          stop={selectedIntermStop}
          onClose={() => setSelectedIntermStop(null)}
          dark={dark}
        />
      )}

      {activeJourney && (
        <JourneyDetailsSheet activeJourney={activeJourney} routeLoading={routeLoading} routeInfo={routeInfo} navigating={isNavigationMode} paused={tripPaused} onPauseToggle={tripPaused ? resumeNavigation : pauseNavigation} onPreview={!isNavigationMode ? runFlyThrough : undefined} onToggleNav={handleToggleNav} onClose={handleClearJourney} mToNice={mToNice} sToMin={sToMin} isSaved={isSaved} onSave={handleSaveJourney} onUnsave={handleUnsaveJourney} scrollRef={stepsScrollRef} eta={navState?.eta ?? null} remainingDistanceM={navState?.remainingDistanceM ?? null}>
          <RouteStepsList steps={steps} nextStepIdx={navState?.stepIndex ?? 0} navigating={isNavigationMode} selectedName={activeJourney.toLoc.name} stopsRemaining={navState?.stopsRemaining ?? null} stepETAs={navState?.stepETAs} scrollRef={stepsScrollRef} />
        </JourneyDetailsSheet>
      )}

      <SaveWall
        visible={showSaveWall}
        onDismiss={() => setShowSaveWall(false)}
        dark={dark}
      />

      <MapLayersSheet
        visible={layersOpen}
        onDismiss={() => setLayersOpen(false)}
        dark={dark}
      />
    </View>
  );
}

const s = StyleSheet.create({
  locatingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  permissionBanner: {
    position: "absolute", bottom: 100, left: 16, right: 16,
    backgroundColor: "#FF3B30", borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16,
    zIndex: 20,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
  permissionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", textAlign: "center" },
});