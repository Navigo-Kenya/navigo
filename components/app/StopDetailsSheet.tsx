// components/app/StopDetailsSheet.tsx
//
// A stop's sheet, built like the place sheet (MapSheet: drag, snap, floating
// controls follow it) and adapted to transit:
//   - header: stop-type badge, name, platform, code · direction, community
//     rating and the next departure; swipe sideways for neighbouring stops
//   - actions: Save · Share · Report a delay · Suggest an edit · Review
//   - tabs: Arrivals (live board, refreshes every 30 s) · Info (photos,
//     landmark, lines, accessibility) · Reviews (summary, tags, cards)
//   - footer: From here / Directions
// Contributions open as bottom-sheet forms (stop/StopReviewForm,
// StopEditForm, StopReportForm).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ContributionService, type StopPhoto, type StopReview } from "@/services/contribution";
import {
  StopService,
  type StopDeparturesResponse,
  type StopRoute,
  type StopRouteBoardItem,
} from "@/services/stop";
import { useAuthStore } from "@/store/authStore";
import { useSavedStore, type SaveTarget } from "@/store/savedStore";
import { SaveToListSheet } from "@/components/saved/SaveToListSheet";
import { formatEta } from "@/utils/mapHelpers";
import { departureMeta } from "@/utils/departures";
import { StopTypeGlyph } from "@/components/icons/NavigoIcons";
import { PressableScale } from "@/components/ui/PressableScale";
import { LineNoDepartures, NoDeparturesState } from "./DepartureEmpty";
import { MapSheet, type MapSheetHandle } from "./MapSheet";
import { resolveStopCategory } from "./StopsLayer";
import { ModeIcon } from "./StopTypeBadge";
import { REVIEW_TAGS, Stars, StopReviewForm } from "./stop/StopReviewForm";
import { StopEditForm } from "./stop/StopEditForm";
import { StopReportForm } from "./stop/StopReportForm";
import { Icon } from "@/components/icons/Icon";
import { ViewInsideButton } from "@/components/map/ViewInsideButton";

const ORANGE = "#FF6F00";
const BLUE = "#2563EB";
const GREEN = "#16A34A";
const RED = "#DC2626";
const AMBER = "#F59E0B";
const { height: SH, width: SW } = Dimensions.get("window");
const SWIPE_SWITCH_PX = SW * 0.22;
const REFRESH_MS = 30_000;

type Stop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stop_code?: string | null;
  stop_type?: string | null;
  location_t?: number;
  platform_code?: string | null;
  landmark?: string | null;
  direction_label?: string | null;
  mode?: string | null;
  mode_badge?: string | null;
};

type Tab = "arrivals" | "info" | "reviews";
type Form = "review" | "edit" | "report" | null;

function palette(dark: boolean) {
  return {
    bg: dark ? "#18181B" : "#FFFFFF",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    chip: dark ? "#27272A" : "#F1F5F9",
    line: dark ? "#27272A" : "#EEF0F3",
    skeleton: dark ? "#27272A" : "#EEF0F3",
    segOn: dark ? "#3F3F46" : "#FFFFFF",
  };
}

const TYPE_LABEL: Record<string, string> = {
  bus: "Matatu & bus stop",
  terminal: "Bus terminal",
  rail: "Railway station",
  metro: "Metro station",
  brt: "BRT station",
  tram: "Tram stop",
  ferry: "Ferry terminal",
  airport: "Airport",
  sgr: "SGR station",
};

function mapboxStaticPhoto(lng: number, lat: number): string {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+FF6F00(${lng},${lat})/${lng},${lat},17,0,40/400x240@2x?access_token=${token}`;
}

/** Overall rating of a review (older reviews have only the three aspects). */
function overallOf(r: StopReview): number {
  const d = r.data as StopReview["data"] & { overall?: number };
  if (d.overall) return d.overall;
  const parts = [d.safety, d.comfort, d.cleanliness].filter((n) => n > 0);
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export default function StopDetailsSheet({
  stop,
  allStops = [],
  onSelectStop,
  onSelectRouteCorridor,
  onClose,
  onGoToStop,
  onGoInside,
  initialTab = "arrivals",
}: {
  stop: Stop;
  allStops?: Stop[];
  onSelectStop?: (nextStop: Stop) => void;
  onSelectRouteCorridor?: (routeId: string) => void;
  onClose: () => void;
  onGoToStop?: () => Promise<void>;
  /** Fly the map into the station's indoor map (it opens from zoom 16). */
  onGoInside?: (lat: number, lng: number) => void;
  initialTab?: Tab;
}): React.JSX.Element {
  const dark = useColorScheme() === "dark";
  const C = palette(dark);
  const router = useRouter();
  const sheet = useRef<MapSheetHandle>(null);
  const snapIdx = useRef(0);

  const { user } = useAuthStore();
  const places = useSavedStore((st) => st.places);
  // Saved in any list: the stop's rows (one per list), not Home/Work pins.
  const savedLists = places.filter((p) => p.place_id === stop.id && p.pin === null && p.list !== null);
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(null);

  const [tab, setTab] = useState<Tab>(initialTab);
  const [form, setForm] = useState<Form>(null);
  const [reportRouteId, setReportRouteId] = useState<string | null>(null);
  const [directionsLoading, setDirectionsLoading] = useState(false);

  const [board, setBoard] = useState<StopDeparturesResponse | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [routes, setRoutes] = useState<StopRoute[]>([]);
  const [reviews, setReviews] = useState<StopReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [photos, setPhotos] = useState<StopPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);

  // The stop's type: from the stop itself, else the departure board's
  // stop_type, else the modes of the lines serving it (a station served only
  // by trains is a station, never "bus" by default).
  const category = useMemo(() => {
    const own = (stop.stop_type ?? board?.stop?.stop_type) || null;
    const lineModes = (board?.routes ?? []).map((r) => r.mode);
    return resolveStopCategory({
      ...(stop as any),
      stop_type: own,
      mode: stop.mode ?? lineModes[0] ?? null,
      mode_badge: stop.mode_badge ?? board?.routes?.[0]?.mode_badge ?? null,
    });
  }, [stop, board]);
  const typeLabel = TYPE_LABEL[category.category] ?? "Transit stop";

  // ── Data ────────────────────────────────────────────────────────────────
  const loadBoard = useCallback(
    async (quiet = false) => {
      if (!quiet) setBoardLoading(true);
      try {
        const data = await StopService.getStopDepartures(stop.id);
        setBoard(data);
        setUpdatedAt(new Date());
        setRoutes(
          data.routes.map((r) => ({
            id: r.route_id,
            short_name: r.route_short_name,
            long_name: r.route_long_name,
            route_color: r.route_color,
            route_type: r.route_type,
          }))
        );
      } catch {
        StopService.getStopDetails(stop.id)
          .then((d) => setRoutes(d.routes))
          .catch(() => {});
      } finally {
        setBoardLoading(false);
      }
    },
    [stop.id]
  );

  const loadReviews = useCallback(() => {
    setReviewsLoading(true);
    ContributionService.getStopReviews(stop.id)
      .then(setReviews)
      .catch(() => setReviews([]))
      .finally(() => setReviewsLoading(false));
  }, [stop.id]);

  useEffect(() => {
    setBoard(null);
    loadBoard();
    loadReviews();
    setPhotosLoading(true);
    ContributionService.getStopPhotos(stop.id)
      .then(setPhotos)
      .catch(() => setPhotos([]))
      .finally(() => setPhotosLoading(false));
  }, [stop.id, loadBoard, loadReviews]);

  // Live board: refresh quietly while the arrivals tab is open.
  useEffect(() => {
    if (tab !== "arrivals") return;
    const t = setInterval(() => loadBoard(true), REFRESH_MS);
    return () => clearInterval(t);
  }, [tab, loadBoard]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const stopCode = board?.stop?.stop_code ?? stop.stop_code ?? null;
  const direction = board?.stop?.direction_label ?? stop.direction_label ?? null;
  const platform = board?.stop?.platform_code ?? stop.platform_code ?? null;
  const landmark = board?.stop?.landmark ?? stop.landmark ?? null;
  const myReview = reviews.find((r) => r.user_id === user?.id);

  const rating = useMemo(() => {
    if (!reviews.length) return null;
    const avg = reviews.reduce((s, r) => s + overallOf(r), 0) / reviews.length;
    const aspect = (k: "safety" | "comfort" | "cleanliness") =>
      reviews.reduce((s, r) => s + (r.data[k] ?? 0), 0) / reviews.length;
    const tagCounts = new Map<string, number>();
    for (const r of reviews) {
      for (const t of ((r.data as any).tags as string[] | undefined) ?? []) {
        tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      }
    }
    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return {
      avg,
      count: reviews.length,
      safety: aspect("safety"),
      comfort: aspect("comfort"),
      cleanliness: aspect("cleanliness"),
      topTags,
    };
  }, [reviews]);

  const nextDeparture = useMemo(() => {
    let best: { line: string; eta: number } | null = null;
    for (const r of board?.routes ?? []) {
      const a = r.arrivals[0];
      if (a && (best == null || a.eta_seconds < best.eta)) best = { line: r.route_short_name, eta: a.eta_seconds };
    }
    return best;
  }, [board]);

  const reportLines = useMemo(() => {
    const seen = new Set<string>();
    return (board?.routes ?? [])
      .filter((r) => (seen.has(r.route_id) ? false : (seen.add(r.route_id), true)))
      .map((r) => ({ route_id: r.route_id, short_name: r.route_short_name, color: r.badge_color || r.route_color, headsign: r.headsign }));
  }, [board]);

  // ── Neighbouring stops (swipe sideways) ─────────────────────────────────
  const { prevStop, nextStop } = useMemo(() => {
    if (allStops.length < 2) return { prevStop: null, nextStop: null };
    const others = allStops
      .filter((s) => s.id !== stop.id)
      .map((s) => ({ s, d: Math.hypot(s.lat - stop.lat, s.lng - stop.lng), dx: s.lng - stop.lng }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8);
    return {
      prevStop: others.find((o) => o.dx <= 0)?.s ?? null,
      nextStop: others.find((o) => o.dx > 0)?.s ?? null,
    };
  }, [allStops, stop.id, stop.lat, stop.lng]);

  const neighbors = useRef({ prevStop, nextStop, onSelectStop });
  neighbors.current = { prevStop, nextStop, onSelectStop };

  const slideX = useRef(new Animated.Value(0)).current;
  const enterFrom = useRef<0 | 1 | -1>(0);
  const settle = useCallback(
    () => Animated.spring(slideX, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 260 }).start(),
    [slideX]
  );

  // Claims only clearly horizontal drags; vertical ones go to MapSheet.
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        !!neighbors.current.onSelectStop && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      onPanResponderMove: (_, g) => {
        const n = g.dx < 0 ? neighbors.current.nextStop : neighbors.current.prevStop;
        slideX.setValue(n ? g.dx : g.dx * 0.22);
      },
      onPanResponderTerminate: () => settle(),
      onPanResponderRelease: (_, g) => {
        const dir = g.dx < 0 ? -1 : 1;
        const n = dir < 0 ? neighbors.current.nextStop : neighbors.current.prevStop;
        if (n && (Math.abs(g.dx) > SWIPE_SWITCH_PX || Math.abs(g.vx) > 0.55)) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          enterFrom.current = dir < 0 ? 1 : -1;
          Animated.timing(slideX, { toValue: dir * SW, duration: 170, useNativeDriver: true }).start(() =>
            neighbors.current.onSelectStop?.(n)
          );
        } else {
          settle();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (enterFrom.current !== 0) {
      slideX.setValue(enterFrom.current * SW * 0.5);
      enterFrom.current = 0;
    }
    settle();
  }, [stop.id, slideX, settle]);

  const slideStyle = {
    transform: [{ translateX: slideX }],
    opacity: slideX.interpolate({ inputRange: [-SW, 0, SW], outputRange: [0.2, 1, 0.2], extrapolate: "clamp" as const }),
  };

  // ── Actions ─────────────────────────────────────────────────────────────
  const openTab = (t: Tab) => {
    Haptics.selectionAsync();
    setTab(t);
    if (t !== "arrivals" && snapIdx.current === 0) sheet.current?.snapTo(1);
  };

  // The same "Save to list" sheet as places: every list, ticked where it's
  // saved, a new list on the spot (components/saved/SaveToListSheet).
  const openSave = () => {
    Haptics.selectionAsync();
    setSaveTarget({ name: stop.name, lat: Number(stop.lat), lng: Number(stop.lng), type: "stop", place_id: stop.id, category: typeLabel });
  };

  const share = () =>
    Share.share({
      message: `${stop.name}${landmark ? ` (${landmark})` : ""}\nhttps://navigo.co.ke/route?tLat=${stop.lat}&tLng=${stop.lng}&tName=${encodeURIComponent(stop.name)}`,
    }).catch(() => {});

  const go = async (role: "from" | "to") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (role === "to" && onGoToStop) {
      setDirectionsLoading(true);
      try {
        await onGoToStop();
      } finally {
        setDirectionsLoading(false);
      }
      return;
    }
    const params =
      role === "from"
        ? { fLat: String(stop.lat), fLng: String(stop.lng), fName: stop.name }
        : { tLat: String(stop.lat), tLng: String(stop.lng), tName: stop.name };
    router.push({ pathname: "/route" as any, params });
  };

  const openReport = (routeId: string | null = null) => {
    setReportRouteId(routeId);
    setForm("report");
  };

  // ── Header ──────────────────────────────────────────────────────────────
  const header = (
    <Animated.View style={slideStyle} {...swipe.panHandlers}>
      {onSelectStop && (prevStop || nextStop) && (
        <View style={s.neighbors}>
          <NeighborPill stop={prevStop} side="prev" C={C} onPress={(n) => onSelectStop(n)} />
          <NeighborPill stop={nextStop} side="next" C={C} onPress={(n) => onSelectStop(n)} />
        </View>
      )}

      <View style={s.headerRow}>
        <View style={[s.typeBadge, { backgroundColor: category.color }]}>
          <StopTypeGlyph category={category.category as any} size={20} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={s.titleRow}>
            <Text style={[s.title, { color: C.text }]} numberOfLines={2}>
              {stop.name}
            </Text>
            {!!platform && (
              <View style={[s.platform, { backgroundColor: category.color }]}>
                <Text style={s.platformText}>Plat. {platform}</Text>
              </View>
            )}
          </View>
          <Text style={[s.meta, { color: C.sub }]} numberOfLines={1}>
            {[typeLabel, stopCode, direction].filter(Boolean).join(" · ")}
          </Text>
          <View style={s.factsRow}>
            {rating ? (
              <Pressable onPress={() => openTab("reviews")} style={s.ratingInline} hitSlop={6}>
                <Icon name="star" size={12} color={AMBER} />
                <Text style={[s.fact, { color: C.text, fontWeight: "800" }]}>{rating.avg.toFixed(1)}</Text>
                <Text style={[s.fact, { color: C.sub }]}>({rating.count})</Text>
              </Pressable>
            ) : null}
            {rating && nextDeparture ? <Text style={[s.fact, { color: C.sub }]}>·</Text> : null}
            {nextDeparture ? (
              <Text style={[s.fact, { color: GREEN, fontWeight: "700" }]}>
                {nextDeparture.line} in {formatEta(nextDeparture.eta)}
              </Text>
            ) : null}
          </View>
        </View>
        <PressableScale
          onPress={() => sheet.current?.close()}
          hitSlop={12}
          style={[s.roundBtn, { backgroundColor: C.chip }]}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Icon name="close" size={16} color={C.sub} />
        </PressableScale>
      </View>

      <View style={s.actions}>
        <Action icon={savedLists.length ? "bookmark" : "bookmark-outline"} label={savedLists.length ? "Saved" : "Save"} fg={savedLists.length ? ORANGE : C.text} C={C} onPress={openSave} />
        <Action icon="share-outline" label="Share" C={C} onPress={share} />
        <Action icon="alert-circle-outline" label="Report" fg={RED} C={C} onPress={() => openReport()} />
        <ViewInsideButton lat={Number(stop.lat)} lng={Number(stop.lng)} name={stop.name} chip={C.chip} text={C.text} sub={C.sub}
          onGoInside={(lat, lng) => (onGoInside ? onGoInside(lat, lng) : sheet.current?.close())} />
        <Action icon="create-outline" label="Edit" fg={BLUE} C={C} onPress={() => setForm("edit")} />
        <Action icon={myReview ? "star" : "star-outline"} label="Review" fg={AMBER} C={C} onPress={() => setForm("review")} />
      </View>

      <View style={[s.segment, { backgroundColor: C.chip }]}>
        {(
          [
            { key: "arrivals", label: "Arrivals" },
            { key: "info", label: "Info" },
            { key: "reviews", label: rating ? `Reviews · ${rating.count}` : "Reviews" },
          ] as const
        ).map((t) => {
          const on = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => openTab(t.key)}
              style={[s.segBtn, on && { backgroundColor: C.segOn }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[s.segText, { color: on ? C.text : C.sub }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );

  const footer = (
    <View style={s.footerRow}>
      <PressableScale containerStyle={{ flex: 1 }} onPress={() => go("from")} style={[s.bigBtn, { backgroundColor: C.chip }]}>
        <Text style={[s.bigBtnText, { color: C.text }]}>From here</Text>
      </PressableScale>
      <PressableScale
        containerStyle={{ flex: 1.4 }}
        onPress={() => go("to")}
        disabled={directionsLoading}
        style={[s.bigBtn, { backgroundColor: ORANGE }]}
      >
        {directionsLoading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <>
            <Icon name="navigate" size={16} color="#FFFFFF" />
            <Text style={[s.bigBtnText, { color: "#FFFFFF" }]}>Directions</Text>
          </>
        )}
      </PressableScale>
    </View>
  );

  return (
    <>
      <MapSheet
        ref={sheet}
        snapPoints={[390, SH * 0.62, SH * 0.92]}
        onClose={onClose}
        onSnapChange={(i) => (snapIdx.current = i)}
        header={header}
        footer={footer}
      >
        <Animated.View style={slideStyle}>
          {tab === "arrivals" && (
            <ArrivalsTab
              board={board}
              loading={boardLoading}
              updatedAt={updatedAt}
              C={C}
              onRefresh={() => {
                Haptics.selectionAsync();
                loadBoard();
              }}
              onLine={(id) => {
                if (!onSelectRouteCorridor) return;
                Haptics.selectionAsync();
                onSelectRouteCorridor(id);
              }}
              onReport={openReport}
              onSuggest={() => setForm("edit")}
            />
          )}
          {tab === "info" && (
            <InfoTab
              stop={stop}
              typeLabel={typeLabel}
              typeColor={category.color}
              stopCode={stopCode}
              platform={platform}
              landmark={landmark}
              wheelchair={!!board?.stop?.wheelchair_boarding}
              routes={routes}
              photos={photos}
              photosLoading={photosLoading}
              C={C}
              onLine={(id) => onSelectRouteCorridor?.(id)}
              onAddPhoto={() =>
                router.push({ pathname: "/(account)/add-photo" as any, params: { stopName: stop.name, stopId: stop.id } })
              }
              onSuggest={() => setForm("edit")}
            />
          )}
          {tab === "reviews" && (
            <ReviewsTab
              reviews={reviews}
              loading={reviewsLoading}
              rating={rating}
              myReviewId={myReview?.id ?? null}
              C={C}
              onWrite={() => setForm("review")}
            />
          )}
        </Animated.View>
      </MapSheet>

      {form === "review" && (
        <StopReviewForm visible onClose={() => setForm(null)} stop={stop} existing={myReview} onSubmitted={loadReviews} />
      )}
      {form === "edit" && (
        <StopEditForm
          visible
          onClose={() => setForm(null)}
          stop={{ ...stop, landmark }}
          lines={routes.map((r) => ({ id: r.id, short_name: r.short_name }))}
        />
      )}
      <SaveToListSheet target={saveTarget} onClose={() => setSaveTarget(null)} />
      {form === "report" && (
        <StopReportForm visible onClose={() => setForm(null)} stop={stop} lines={reportLines} initialRouteId={reportRouteId} />
      )}
    </>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

type P = ReturnType<typeof palette>;

function ArrivalsTab({
  board,
  loading,
  updatedAt,
  C,
  onRefresh,
  onLine,
  onReport,
  onSuggest,
}: {
  board: StopDeparturesResponse | null;
  loading: boolean;
  updatedAt: Date | null;
  C: P;
  onRefresh: () => void;
  onLine: (routeId: string) => void;
  onReport: (routeId: string) => void;
  onSuggest: () => void;
}) {
  if (loading && !board) return <SkeletonRows color={C.skeleton} />;
  if (!board?.routes?.length) {
    return <NoDeparturesState actionLabel="Suggest edits" onAction={onSuggest} />;
  }
  return (
    <View>
      <View style={s.boardHead}>
        <View style={s.liveDot} />
        <Text style={[s.boardHeadText, { color: C.sub }]}>
          {updatedAt
            ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · refreshes every 30 s`
            : "Departures"}
        </Text>
        <PressableScale onPress={onRefresh} hitSlop={10} style={[s.refresh, { backgroundColor: C.chip }]} accessibilityLabel="Refresh departures">
          {loading ? <ActivityIndicator size="small" color={C.sub} /> : <Icon name="refresh" size={14} color={C.sub} />}
        </PressableScale>
      </View>

      {board.routes.map((r: StopRouteBoardItem, i: number) => {
        const color = r.badge_color || r.route_color || BLUE;
        const [first, ...rest] = r.arrivals;
        return (
          <PressableScale
            key={`${r.route_id}-${r.direction_id}-${i}`}
            onPress={() => onLine(r.route_id)}
            onLongPress={() => onReport(r.route_id)}
            pressedScale={0.985}
            style={[s.lineRow, { borderBottomColor: C.line }]}
            accessibilityRole="button"
            accessibilityLabel={`Line ${r.route_short_name} to ${r.headsign}`}
            accessibilityHint="Shows the line on the map. Long-press to report a delay."
          >
            {/* Line pill on its own line: long rail names truncate instead of
                squeezing the headsign and times. */}
            <View style={s.lineTop}>
              <View style={[s.linePill, { backgroundColor: color }]}>
                <ModeIcon mode={r.mode} badge={r.mode_badge} size={14} color="#FFFFFF" />
                <Text style={s.linePillText} numberOfLines={1}>
                  {r.route_short_name}
                </Text>
              </View>
              <Text style={[s.agency, { color: C.sub }]} numberOfLines={1}>
                {[r.mode_badge, r.agency_name].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <View style={s.lineBottom}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: "row", gap: 5 }}>
                <Icon name="arrow-forward" size={14} color={C.sub} style={{ marginTop: 2 }} />
                <Text style={[s.headsign, { color: C.text }]} numberOfLines={2}>
                  {r.headsign}
                </Text>
              </View>
              <View style={s.etaCol}>
                {!first ? (
                  <LineNoDepartures status={r.arrivals_status} />
                ) : (
                  <>
                    <Text style={[s.etaMain, { color: first.eta_seconds <= 120 ? RED : C.text }]}>
                      {first.eta_seconds <= 60 ? "Now" : formatEta(first.eta_seconds)}
                    </Text>
                    <Text style={[s.etaSub, { color: C.sub }]} numberOfLines={2}>
                      {[departureMeta(first), rest[0] ? `then ${formatEta(rest[0].eta_seconds)}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </>
                )}
              </View>
            </View>
          </PressableScale>
        );
      })}

      <Text style={[s.footNote, { color: C.sub }]}>Tap a line to see its route · long-press to report a delay</Text>
    </View>
  );
}

function InfoTab({
  stop,
  typeLabel,
  typeColor,
  stopCode,
  platform,
  landmark,
  wheelchair,
  routes,
  photos,
  photosLoading,
  C,
  onLine,
  onAddPhoto,
  onSuggest,
}: {
  stop: Stop;
  typeLabel: string;
  typeColor: string;
  stopCode: string | null;
  platform: string | null;
  landmark: string | null;
  wheelchair: boolean;
  routes: StopRoute[];
  photos: StopPhoto[];
  photosLoading: boolean;
  C: P;
  onLine: (id: string) => void;
  onAddPhoto: () => void;
  onSuggest: () => void;
}) {
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photoStrip}>
        {photosLoading
          ? [0, 1].map((i) => <View key={i} style={[s.photo, { backgroundColor: C.skeleton }]} />)
          : (photos.length
              ? photos.map((p) => ({ key: String(p.id), uri: p.data.photo_url }))
              : [{ key: "map", uri: mapboxStaticPhoto(stop.lng, stop.lat) }]
            ).map((p) => (
              <Image
                key={p.key}
                source={{ uri: p.uri }}
                style={[s.photo, { backgroundColor: C.chip }]}
                contentFit="cover"
                transition={180}
                cachePolicy="memory-disk"
              />
            ))}
        <PressableScale onPress={onAddPhoto} style={[s.addPhoto, { borderColor: ORANGE + "66" }]} accessibilityLabel="Add a photo">
          <Icon name="camera" size={20} color={ORANGE} />
          <Text style={s.addPhotoText}>Add photo</Text>
        </PressableScale>
      </ScrollView>

      <View style={[s.infoList, { borderTopColor: C.line }]}>
        <InfoRow icon="location-outline" color={typeColor} C={C} text={landmark ? landmark.replace(/^./, (c) => c.toUpperCase()) : "No landmark yet"} sub={landmark ? "Landmark riders use" : "Know one? Suggest it"} onPress={landmark ? undefined : onSuggest} />
        <InfoRow icon="pricetag-outline" color={C.sub} C={C} text={[typeLabel, stopCode && `code ${stopCode}`, platform && `platform ${platform}`].filter(Boolean).join(" · ")} />
        <InfoRow
          icon={wheelchair ? "accessibility" : "accessibility-outline"}
          color={wheelchair ? GREEN : C.sub}
          C={C}
          text={wheelchair ? "Step-free boarding" : "Accessibility not confirmed"}
          sub={wheelchair ? undefined : "Riders can help by suggesting an edit"}
        />
        <InfoRow icon="navigate-circle-outline" color={C.sub} C={C} text={`${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)}`} />
      </View>

      {routes.length > 0 && (
        <View style={{ paddingHorizontal: 18, paddingTop: 16 }}>
          <Text style={[s.section, { color: C.sub }]}>LINES AT THIS STOP</Text>
          <View style={s.lineChips}>
            {routes.map((r) => (
              <PressableScale
                key={r.id}
                onPress={() => onLine(r.id)}
                style={[s.lineChip, { backgroundColor: r.route_color ? `#${String(r.route_color).replace("#", "")}` : BLUE }]}
                accessibilityLabel={`Line ${r.short_name}`}
              >
                <ModeIcon mode={[0, 1, 2].includes(Number(r.route_type)) ? "RAIL" : "BUS"} size={13} color="#FFFFFF" />
                <Text style={s.lineChipText}>{r.short_name}</Text>
              </PressableScale>
            ))}
          </View>
        </View>
      )}

      <Pressable onPress={onSuggest} style={s.suggestRow}>
        <Icon name="create-outline" size={15} color={BLUE} />
        <Text style={[s.suggestText, { color: BLUE }]}>Something wrong here? Suggest an edit</Text>
      </Pressable>
    </View>
  );
}

function ReviewsTab({
  reviews,
  loading,
  rating,
  myReviewId,
  C,
  onWrite,
}: {
  reviews: StopReview[];
  loading: boolean;
  rating: {
    avg: number; count: number; safety: number; comfort: number; cleanliness: number; topTags: [string, number][];
  } | null;
  myReviewId: number | null;
  C: P;
  onWrite: () => void;
}) {
  if (loading) return <SkeletonRows color={C.skeleton} />;
  const mine = reviews.find((r) => r.id === myReviewId);
  const others = reviews.filter((r) => r.id !== myReviewId);
  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 6, gap: 14 }}>
      {rating ? (
        <View style={[s.summary, { backgroundColor: C.chip }]}>
          <View style={{ alignItems: "center", width: 88 }}>
            <Text style={[s.summaryAvg, { color: C.text }]}>{rating.avg.toFixed(1)}</Text>
            <Stars value={Math.round(rating.avg * 2) / 2} size={13} idle={C.sub} />
            <Text style={[s.summaryCount, { color: C.sub }]}>
              {rating.count} review{rating.count === 1 ? "" : "s"}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 7 }}>
            {(
              [
                ["Safety", rating.safety],
                ["Comfort", rating.comfort],
                ["Cleanliness", rating.cleanliness],
              ] as const
            ).map(([label, v]) => (
              <View key={label} style={s.barRow}>
                <Text style={[s.barLabel, { color: C.sub }]}>{label}</Text>
                <View style={[s.barTrack, { backgroundColor: C.bg }]}>
                  <View style={[s.barFill, { width: `${(v / 5) * 100}%`, backgroundColor: v >= 3.5 ? GREEN : v >= 2.5 ? AMBER : RED }]} />
                </View>
                <Text style={[s.barValue, { color: C.text }]}>{v.toFixed(1)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={s.emptyReviews}>
          <Icon name="chatbubbles-outline" size={34} color={C.sub} />
          <Text style={[s.emptyTitle, { color: C.text }]}>No reviews yet</Text>
          <Text style={[s.emptySub, { color: C.sub }]}>{"Tell other riders if it's safe, sheltered and easy to find."}</Text>
        </View>
      )}

      {!!rating?.topTags.length && (
        <View style={s.tagRow}>
          {rating.topTags.map(([key, n]) => {
            const t = REVIEW_TAGS.find((x) => x.key === key);
            if (!t) return null;
            const color = t.good ? GREEN : RED;
            return (
              <View key={key} style={[s.tag, { backgroundColor: color + "16" }]}>
                <Text style={[s.tagText, { color }]}>
                  {t.label} · {n}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <PressableScale onPress={onWrite} style={[s.writeBtn, { borderColor: AMBER }]} accessibilityRole="button">
        <Icon name={mine ? "create-outline" : "star-outline"} size={16} color={AMBER} />
        <Text style={[s.writeText, { color: C.text }]}>{mine ? "Edit your review" : "Write a review"}</Text>
      </PressableScale>

      {mine && <ReviewCard review={mine} own C={C} onEdit={onWrite} />}
      {others.map((r) => (
        <ReviewCard key={r.id} review={r} C={C} />
      ))}
    </View>
  );
}

// ─── Small parts ─────────────────────────────────────────────────────────────

function ReviewCard({ review, own, C, onEdit }: { review: StopReview; own?: boolean; C: P; onEdit?: () => void }) {
  const name = own ? "You" : review.user?.name ?? "Rider";
  const tags = ((review.data as any).tags as string[] | undefined) ?? [];
  return (
    <View style={[s.reviewCard, { borderColor: own ? AMBER + "66" : C.line }]}>
      <View style={s.reviewHead}>
        {review.user?.avatar ? (
          <Image source={{ uri: review.user.avatar }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, { backgroundColor: ORANGE + "26", alignItems: "center", justifyContent: "center" }]}>
            <Text style={{ color: ORANGE, fontWeight: "800" }}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[s.reviewName, { color: C.text }]}>{name}</Text>
          <View style={s.reviewMeta}>
            <Stars value={Math.round(overallOf(review) * 2) / 2} size={11} idle={C.sub} />
            <Text style={[s.reviewDate, { color: C.sub }]}>{timeAgo(review.created_at)}</Text>
          </View>
        </View>
        {own && onEdit && (
          <Pressable onPress={onEdit} hitSlop={8}>
            <Text style={{ color: BLUE, fontWeight: "700", fontSize: 12.5 }}>Edit</Text>
          </Pressable>
        )}
      </View>
      {!!review.data.text && <Text style={[s.reviewText, { color: C.text }]}>{review.data.text}</Text>}
      {tags.length > 0 && (
        <View style={s.tagRow}>
          {tags.map((k) => {
            const t = REVIEW_TAGS.find((x) => x.key === k);
            return t ? (
              <Text key={k} style={[s.reviewTag, { color: t.good ? GREEN : RED, backgroundColor: (t.good ? GREEN : RED) + "12" }]}>
                {t.label}
              </Text>
            ) : null;
          })}
        </View>
      )}
    </View>
  );
}

function Action({
  icon, label, fg, C, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  fg?: string;
  C: P;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} hitSlop={4} style={s.action} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[s.actionCircle, { backgroundColor: C.chip }]}>
        <Icon name={icon} size={17} color={fg ?? C.text} />
      </View>
      <Text style={[s.actionLabel, { color: C.sub }]}>{label}</Text>
    </PressableScale>
  );
}

function NeighborPill({
  stop, side, C, onPress,
}: {
  stop: Stop | null;
  side: "prev" | "next";
  C: P;
  onPress: (s: Stop) => void;
}) {
  if (!stop) return <View style={{ flex: 1 }} />;
  return (
    <PressableScale
      containerStyle={{ flex: 1 }}
      onPress={() => {
        Haptics.selectionAsync();
        onPress(stop);
      }}
      style={[s.neighbor, { backgroundColor: C.chip, justifyContent: side === "next" ? "flex-end" : "flex-start" }]}
      accessibilityLabel={`${side === "prev" ? "Previous" : "Next"} stop: ${stop.name}`}
    >
      {side === "prev" && <Icon name="chevron-back" size={13} color={ORANGE} />}
      <Text style={[s.neighborText, { color: C.text, textAlign: side === "next" ? "right" : "left" }]} numberOfLines={1}>
        {stop.name}
      </Text>
      {side === "next" && <Icon name="chevron-forward" size={13} color={ORANGE} />}
    </PressableScale>
  );
}

function InfoRow({
  icon, color, text, sub, C, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  text: string;
  sub?: string;
  C: P;
  onPress?: () => void;
}) {
  const body = (
    <View style={[s.infoRow, { borderBottomColor: C.line }]}>
      <Icon name={icon} size={18} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={[s.infoText, { color: C.text }]} numberOfLines={2}>
          {text}
        </Text>
        {!!sub && <Text style={[s.infoSub, { color: onPress ? BLUE : C.sub }]}>{sub}</Text>}
      </View>
      {onPress && <Icon name="chevron-forward" size={14} color={C.sub} />}
    </View>
  );
  return onPress ? <PressableScale onPress={onPress}>{body}</PressableScale> : body;
}

function SkeletonRows({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={{ opacity: pulse, paddingHorizontal: 18 }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={s.skelRow}>
          <View style={[s.skelBadge, { backgroundColor: color }]} />
          <View style={{ flex: 1, gap: 7 }}>
            <View style={[s.skelLine, { width: "64%", backgroundColor: color }]} />
            <View style={[s.skelLine, { width: "38%", backgroundColor: color }]} />
          </View>
          <View style={[s.skelLine, { width: 44, height: 18, backgroundColor: color }]} />
        </View>
      ))}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  neighbors: { flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingBottom: 8 },
  neighbor: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  neighborText: { flex: 1, fontSize: 12, fontWeight: "600" },

  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 18 },
  typeBadge: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF", marginTop: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  title: { fontSize: 19, fontWeight: "800", letterSpacing: -0.3, flexShrink: 1 },
  platform: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  platformText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  meta: { fontSize: 12.5 },
  factsRow: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  ratingInline: { flexDirection: "row", alignItems: "center", gap: 3 },
  fact: { fontSize: 12.5 },
  roundBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },

  actions: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 10, paddingTop: 14, paddingBottom: 10 },
  action: { alignItems: "center", gap: 5, minWidth: 56 },
  actionCircle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 11.5, fontWeight: "600" },

  segment: { flexDirection: "row", marginHorizontal: 18, marginBottom: 6, padding: 3, borderRadius: 12 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 9 },
  segText: { fontSize: 13, fontWeight: "700" },

  boardHead: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 18, paddingVertical: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN },
  boardHeadText: { flex: 1, fontSize: 11.5 },
  refresh: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  lineRow: { gap: 7, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  lineTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  linePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, maxWidth: "62%" },
  linePillText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900", flexShrink: 1 },
  lineBottom: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  headsign: { fontSize: 14.5, fontWeight: "700" },
  agency: { fontSize: 12, marginTop: 2 },
  etaCol: { alignItems: "flex-end", maxWidth: 130 },
  etaMain: { fontSize: 17, fontWeight: "900" },
  etaSub: { fontSize: 11.5, marginTop: 1 },
  footNote: { fontSize: 11.5, textAlign: "center", paddingVertical: 14 },

  photoStrip: { paddingHorizontal: 18, gap: 10, paddingTop: 6 },
  photo: { width: 190, height: 120, borderRadius: 14 },
  addPhoto: { width: 110, height: 120, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 6 },
  addPhotoText: { color: ORANGE, fontSize: 12, fontWeight: "700" },
  infoList: { marginTop: 16, marginHorizontal: 18, borderTopWidth: StyleSheet.hairlineWidth },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  infoText: { fontSize: 14, fontWeight: "500" },
  infoSub: { fontSize: 12, marginTop: 2 },
  section: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: 10 },
  lineChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  lineChip: { flexDirection: "row", gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, minWidth: 44, alignItems: "center", maxWidth: "100%" },
  lineChipText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  suggestRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 18 },
  suggestText: { fontSize: 13, fontWeight: "700" },

  summary: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 16 },
  summaryAvg: { fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  summaryCount: { fontSize: 11.5, marginTop: 3 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barLabel: { width: 74, fontSize: 12 },
  barTrack: { flex: 1, height: 7, borderRadius: 4, overflow: "hidden" },
  barFill: { height: 7, borderRadius: 4 },
  barValue: { width: 26, fontSize: 12, fontWeight: "700", textAlign: "right" },
  emptyReviews: { alignItems: "center", gap: 6, paddingVertical: 18 },
  emptyTitle: { fontSize: 15, fontWeight: "800" },
  emptySub: { fontSize: 12.5, textAlign: "center", maxWidth: 260 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  tagText: { fontSize: 12, fontWeight: "700" },
  writeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 12, borderWidth: 1.5 },
  writeText: { fontSize: 14, fontWeight: "700" },
  reviewCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  reviewHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  reviewName: { fontSize: 13.5, fontWeight: "700" },
  reviewMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  reviewDate: { fontSize: 11.5 },
  reviewText: { fontSize: 13.5, lineHeight: 19 },
  reviewTag: { fontSize: 11, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },

  footerRow: { flexDirection: "row", gap: 10 },
  bigBtn: { height: 48, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  bigBtnText: { fontSize: 15, fontWeight: "800" },

  skelRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  skelBadge: { width: 54, height: 38, borderRadius: 10 },
  skelLine: { height: 11, borderRadius: 6 },
});
