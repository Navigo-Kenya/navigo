// components/transit/TransitSheet.tsx
//
// The Transit tab (KakaoMap's 대중교통 home, for matatus, buses and trains):
//   - search a line ("45K", "111", "SGR") or a stage, answered as you type;
//   - Nearby: the closest stages, each with its lines and their next
//     departures, live (refreshed every 30 s while the tab is open);
//   - Saved: the stages you saved, the same way.
// A stage opens its sheet on the map, a line opens its route and stops on
// the map (store/mapIntentStore). The star saves a stage to your lists.
// Only real data: departures come from the stop's board (schedules and
// headways), never invented; a line with none says why (ended, not today).
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/icons/Icon";
import { PressableScale } from "@/components/ui/PressableScale";
import { ModeIcon, StopTypeBadge } from "@/components/app/StopTypeBadge";
import { LineNoDepartures } from "@/components/app/DepartureEmpty";
import { SaveToListSheet } from "@/components/saved/SaveToListSheet";
import {
  StopService,
  type MobilitySearchRouteItem,
  type StopDeparturesResponse,
  type StopRouteBoardItem,
} from "@/services/stop";
import { formatEta, type Stop } from "@/utils/mapHelpers";
import { departureMeta } from "@/utils/departures";
import { distanceM, formatDistance } from "@/services/exploreSearch";
import { useMapIntentStore } from "@/store/mapIntentStore";
import { useSavedStore, type SaveTarget } from "@/store/savedStore";
import { useAuthStore } from "@/store/authStore";

const ORANGE = "#FF6F00";
const BLUE = "#2563EB";
const RED = "#DC2626";
const LINES_PER_CARD = 4;
const NEARBY_RADIUS_M = 1200;

type Tab = "nearby" | "saved";
type Coords = { lat: number; lng: number };

function palette(dark: boolean) {
  return {
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    card: dark ? "#1F1F23" : "#FFFFFF",
    cardLine: dark ? "#2A2A2F" : "#EEF0F3",
    field: dark ? "#27272A" : "#F3F4F6",
    seg: dark ? "#27272A" : "#F1F5F9",
    segOn: dark ? "#3F3F46" : "#FFFFFF",
    skeleton: dark ? "#27272A" : "#EEF0F3",
  };
}

/** Where the user is: the last fix if it's recent, else a quick one. */
function useHere(): { here: Coords | null; denied: boolean } {
  const [here, setHere] = useState<Coords | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
      if (!perm?.granted) { if (alive) setDenied(true); return; }
      const last = await Location.getLastKnownPositionAsync({ maxAge: 120_000 }).catch(() => null);
      if (last && alive) setHere({ lat: last.coords.latitude, lng: last.coords.longitude });
      const now = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
      if (now && alive) setHere({ lat: now.coords.latitude, lng: now.coords.longitude });
    })();
    return () => { alive = false; };
  }, []);
  return { here, denied };
}

export default function TransitSheet({ onClose }: { onClose: () => void }) {
  const dark = useColorScheme() === "dark";
  const C = palette(dark);
  const show = useMapIntentStore((s) => s.show);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { places, fetch: fetchSaved } = useSavedStore();
  const { here, denied } = useHere();
  const [tab, setTab] = useState<Tab>("nearby");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(null);

  useEffect(() => { if (isAuthenticated) fetchSaved().catch(() => {}); }, [isAuthenticated, fetchSaved]);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 280);
    return () => clearTimeout(id);
  }, [query]);

  // Rounded so a GPS wobble doesn't refetch the nearby stages.
  const hereKey = here ? `${here.lat.toFixed(3)},${here.lng.toFixed(3)}` : null;
  const nearby = useQuery({
    queryKey: ["transit", "nearby", hereKey],
    enabled: !!here,
    staleTime: 60_000,
    queryFn: async () => {
      const list = await StopService.getNearbyStops(here!.lat, here!.lng, NEARBY_RADIUS_M, 8);
      return list as (Stop & Record<string, any>)[];
    },
  });

  const search = useQuery({
    queryKey: ["transit", "search", debounced, hereKey],
    enabled: debounced.length >= 1,
    staleTime: 30_000,
    queryFn: () => StopService.searchMobility(debounced, here?.lat, here?.lng),
  });

  const savedStops = useMemo(() => {
    const seen = new Set<string>();
    return places
      .filter((p) => p.type === "stop" && p.place_id && !seen.has(p.place_id) && (seen.add(p.place_id), true))
      .map((p) => ({ id: p.place_id!, name: p.name, lat: p.lat, lng: p.lng }) as Stop);
  }, [places]);
  const savedIds = useMemo(() => new Set(savedStops.map((s) => s.id)), [savedStops]);

  const openStop = (stop: Stop) => {
    Haptics.selectionAsync();
    Keyboard.dismiss();
    onClose();
    show({ kind: "stop", stop });
  };
  const openLine = (routeId: string) => {
    Haptics.selectionAsync();
    Keyboard.dismiss();
    onClose();
    show({ kind: "line", routeId });
  };
  const saveStop = (stop: Stop) => {
    Haptics.selectionAsync();
    setSaveTarget({ name: stop.name, lat: stop.lat, lng: stop.lng, type: "stop", place_id: stop.id, category: "Stage" });
  };

  const searching = debounced.length > 0;
  const stops = tab === "nearby" ? (nearby.data ?? []) : savedStops;

  return (
    <View style={s.root}>
      <View style={s.head}>
        <Text style={[s.title, { color: C.text }]}>Transit</Text>
        <Text style={[s.titleSub, { color: C.sub }]}>Live departures from the stages around you</Text>
      </View>

      {/* Search */}
      <View style={[s.searchBox, { backgroundColor: C.field }]}>
        <Icon name="search" size={17} color={C.sub} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search a line or a stage"
          placeholderTextColor={C.sub}
          style={[s.searchInput, { color: C.text }]}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search a line or a stage"
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Clear search">
            <Icon name="close-circle" size={18} color={C.sub} />
          </Pressable>
        ) : null}
      </View>

      {searching ? (
        <SearchResults
          loading={search.isFetching && !search.data}
          lines={search.data?.routes ?? []}
          stops={(search.data?.stops ?? []) as (Stop & Record<string, any>)[]}
          here={here}
          C={C}
          onLine={openLine}
          onStop={openStop}
        />
      ) : (
        <>
          <View style={[s.seg, { backgroundColor: C.seg }]}>
            {(["nearby", "saved"] as Tab[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => { Haptics.selectionAsync(); setTab(t); }}
                style={[s.segBtn, tab === t && { backgroundColor: C.segOn }, tab === t && s.segOnShadow]}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t }}
              >
                <Icon name={t === "nearby" ? "locate" : "star"} size={14} color={tab === t ? ORANGE : C.sub} />
                <Text style={[s.segText, { color: tab === t ? C.text : C.sub }]}>
                  {t === "nearby" ? "Nearby" : `Saved${savedStops.length ? ` · ${savedStops.length}` : ""}`}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === "nearby" && denied ? (
            <Empty icon="locate" title="Location is off" sub="Turn on location to see the stages around you and their next departures." C={C} />
          ) : tab === "nearby" && (nearby.isLoading || (!here && !denied)) ? (
            <>{[0, 1, 2].map((i) => <CardSkeleton key={i} C={C} />)}</>
          ) : tab === "nearby" && nearby.isError ? (
            <Empty icon="cloud-offline" title="Couldn't load the stages" sub="Check your connection and try again." C={C} action="Try again" onAction={() => nearby.refetch()} />
          ) : stops.length === 0 ? (
            tab === "nearby" ? (
              <Empty icon="bus" title="No stages within 1.2 km" sub="Search a line or a stage above, or move the map to explore." C={C} />
            ) : (
              <Empty
                icon="star"
                title="Save the stages you use"
                sub={isAuthenticated ? "Tap the star on a stage: its next departures show up here." : "Sign in, then tap the star on a stage: its next departures show up here."}
                C={C}
              />
            )
          ) : (
            <>
              <Text style={[s.section, { color: C.sub }]}>
                {tab === "nearby" ? `NEARBY STAGES · ${formatDistance(NEARBY_RADIUS_M)}` : "YOUR STAGES"}
              </Text>
              {stops.map((stop, i) => (
                <StopCard
                  key={stop.id}
                  stop={stop}
                  here={here}
                  // Live boards for the closest few; the rest load when opened.
                  live={i < 4}
                  saved={savedIds.has(stop.id)}
                  C={C}
                  onStop={() => openStop(stop)}
                  onLine={openLine}
                  onSave={() => saveStop(stop)}
                />
              ))}
              <Text style={[s.foot, { color: C.sub }]}>
                {"Times are from the lines' schedules and frequencies · tap a line to see its route"}
              </Text>
            </>
          )}
        </>
      )}

      <SaveToListSheet target={saveTarget} onClose={() => setSaveTarget(null)} />
    </View>
  );
}

// ─── A stage and its next departures ─────────────────────────────────────────

function StopCard({
  stop,
  here,
  live,
  saved,
  C,
  onStop,
  onLine,
  onSave,
}: {
  stop: Stop & Record<string, any>;
  here: Coords | null;
  live: boolean;
  saved: boolean;
  C: ReturnType<typeof palette>;
  onStop: () => void;
  onLine: (routeId: string) => void;
  onSave: () => void;
}) {
  const [open, setOpen] = useState(live);
  const [expanded, setExpanded] = useState(false);
  const board = useQuery<StopDeparturesResponse>({
    queryKey: ["transit", "board", stop.id],
    enabled: open,
    staleTime: 20_000,
    refetchInterval: open ? 30_000 : false,
    queryFn: () => StopService.getStopDepartures(stop.id),
  });

  const dist = here ? formatDistance(distanceM(here.lat, here.lng, stop.lat, stop.lng)) : null;
  const walkMin = here ? Math.max(1, Math.round(distanceM(here.lat, here.lng, stop.lat, stop.lng) / 75)) : null;
  const routes = useMemo(() => sortBoard(board.data?.routes ?? []), [board.data]);
  const shown = expanded ? routes : routes.slice(0, LINES_PER_CARD);
  const subtitle = [
    dist && walkMin ? `${dist} · ${walkMin} min walk` : null,
    stop.direction_label || board.data?.stop?.direction_label || null,
  ].filter(Boolean).join(" · ");

  return (
    <View style={[s.card, { backgroundColor: C.card, borderColor: C.cardLine }]}>
      <Pressable onPress={onStop} style={s.cardHead} accessibilityRole="button" accessibilityLabel={`${stop.name}, open on the map`}>
        <StopTypeBadge stop={stop} size={34} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.stopName, { color: C.text }]} numberOfLines={1}>{stop.name}</Text>
          {subtitle ? <Text style={[s.stopSub, { color: C.sub }]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <PressableScale onPress={onSave} hitSlop={10} style={s.star} accessibilityLabel={saved ? "Saved stage, change lists" : "Save this stage"}>
          <Icon name={saved ? "star" : "star-outline"} size={20} color={saved ? "#F59E0B" : C.sub} />
        </PressableScale>
      </Pressable>

      {!open ? (
        <Pressable onPress={() => setOpen(true)} style={[s.loadRow, { borderTopColor: C.cardLine }]} accessibilityRole="button">
          <Icon name="time" size={14} color={BLUE} />
          <Text style={[s.loadText, { color: BLUE }]}>Show next departures</Text>
        </Pressable>
      ) : board.isLoading ? (
        <View style={[s.loadRow, { borderTopColor: C.cardLine }]}>
          <ActivityIndicator size="small" color={C.sub} />
          <Text style={[s.loadText, { color: C.sub }]}>Loading departures…</Text>
        </View>
      ) : board.isError ? (
        <Pressable onPress={() => board.refetch()} style={[s.loadRow, { borderTopColor: C.cardLine }]} accessibilityRole="button">
          <Icon name="refresh" size={14} color={C.sub} />
          <Text style={[s.loadText, { color: C.sub }]}>{"Couldn't load departures · tap to retry"}</Text>
        </Pressable>
      ) : routes.length === 0 ? (
        <View style={[s.loadRow, { borderTopColor: C.cardLine }]}>
          <Text style={[s.loadText, { color: C.sub }]}>No lines with times at this stage yet</Text>
        </View>
      ) : (
        <>
          {shown.map((r, i) => (
            <LineRow key={`${r.route_id}-${r.direction_id}-${i}`} r={r} C={C} onPress={() => onLine(r.route_id)} />
          ))}
          {routes.length > LINES_PER_CARD ? (
            <Pressable onPress={() => setExpanded((e) => !e)} style={[s.moreRow, { borderTopColor: C.cardLine }]} accessibilityRole="button">
              <Text style={[s.moreText, { color: C.sub }]}>
                {expanded ? "Fewer lines" : `${routes.length - LINES_PER_CARD} more line${routes.length - LINES_PER_CARD === 1 ? "" : "s"}`}
              </Text>
              <Icon name={expanded ? "chevron-up" : "chevron-down"} size={14} color={C.sub} />
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

/** Lines leaving soonest first; lines with no departure after them. */
function sortBoard(routes: StopRouteBoardItem[]): StopRouteBoardItem[] {
  return [...routes].sort((a, b) => {
    const ea = a.arrivals[0]?.eta_seconds ?? Number.POSITIVE_INFINITY;
    const eb = b.arrivals[0]?.eta_seconds ?? Number.POSITIVE_INFINITY;
    return ea - eb || a.route_short_name.localeCompare(b.route_short_name, undefined, { numeric: true });
  });
}

function LineRow({ r, C, onPress }: { r: StopRouteBoardItem; C: ReturnType<typeof palette>; onPress: () => void }) {
  const color = r.badge_color || r.route_color || BLUE;
  const [first, second] = r.arrivals;
  const meta = first ? departureMeta(first) : "";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.lineRow, { borderTopColor: C.cardLine, opacity: pressed ? 0.75 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`Line ${r.route_short_name} to ${r.headsign}${first ? `, ${formatEta(first.eta_seconds)}` : ""}`}
    >
      <View style={[s.linePill, { backgroundColor: color }]}>
        <ModeIcon mode={r.mode} badge={r.mode_badge} size={12} color="#FFFFFF" />
        <Text style={s.linePillText} numberOfLines={1}>{r.route_short_name}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.headsign, { color: C.text }]} numberOfLines={1}>{r.headsign}</Text>
        {meta ? <Text style={[s.lineMeta, { color: C.sub }]} numberOfLines={1}>{meta}</Text> : null}
      </View>
      {first ? (
        <View style={s.etaCol}>
          <Text style={[s.eta, { color: first.eta_seconds <= 120 ? RED : C.text }]}>
            {first.eta_seconds <= 60 ? "Now" : formatEta(first.eta_seconds)}
          </Text>
          {second ? <Text style={[s.etaNext, { color: C.sub }]}>then {formatEta(second.eta_seconds)}</Text> : null}
        </View>
      ) : (
        <LineNoDepartures status={r.arrivals_status} />
      )}
    </Pressable>
  );
}

// ─── Search ──────────────────────────────────────────────────────────────────

function SearchResults({
  loading,
  lines,
  stops,
  here,
  C,
  onLine,
  onStop,
}: {
  loading: boolean;
  lines: MobilitySearchRouteItem[];
  stops: (Stop & Record<string, any>)[];
  here: Coords | null;
  C: ReturnType<typeof palette>;
  onLine: (routeId: string) => void;
  onStop: (stop: Stop) => void;
}) {
  if (loading) return <>{[0, 1, 2].map((i) => <CardSkeleton key={i} C={C} short />)}</>;
  if (!lines.length && !stops.length) {
    return <Empty icon="search" title="Nothing found" sub="Try a line number like 45K or 111, or a stage name." C={C} />;
  }
  return (
    <View>
      {lines.length ? <Text style={[s.section, { color: C.sub }]}>LINES</Text> : null}
      {lines.slice(0, 8).map((l) => {
        const color = l.route_color || BLUE;
        return (
          <PressableScale key={l.route_id} pressedScale={0.985} onPress={() => onLine(l.route_id)} style={[s.resultRow, { borderBottomColor: C.cardLine }]}>
            <View style={[s.linePill, { backgroundColor: color }]}>
              <ModeIcon mode={l.mode} badge={l.mode_badge} size={12} color="#FFFFFF" />
              <Text style={s.linePillText} numberOfLines={1}>{l.route_short_name}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.resultTitle, { color: C.text }]} numberOfLines={1}>{l.route_long_name || `Line ${l.route_short_name}`}</Text>
              <Text style={[s.resultSub, { color: C.sub }]} numberOfLines={1}>
                {[l.mode_badge, l.agency_name].filter(Boolean).join(" · ") || "Route and stops on the map"}
              </Text>
            </View>
            <Icon name="chevron-forward" size={16} color={C.sub} />
          </PressableScale>
        );
      })}
      {stops.length ? <Text style={[s.section, { color: C.sub, marginTop: 10 }]}>STAGES</Text> : null}
      {stops.slice(0, 8).map((st) => {
        const d = st.distance_m ?? (here ? distanceM(here.lat, here.lng, st.lat, st.lng) : null);
        return (
          <PressableScale key={st.id} pressedScale={0.985} onPress={() => onStop(st)} style={[s.resultRow, { borderBottomColor: C.cardLine }]}>
            <StopTypeBadge stop={st} size={32} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.resultTitle, { color: C.text }]} numberOfLines={1}>{st.name}</Text>
              <Text style={[s.resultSub, { color: C.sub }]} numberOfLines={1}>
                {[d != null ? formatDistance(d) : null, st.route_nams ? `Lines ${st.route_nams}` : st.direction_label].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Icon name="chevron-forward" size={16} color={C.sub} />
          </PressableScale>
        );
      })}
    </View>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────────

function Empty({
  icon,
  title,
  sub,
  C,
  action,
  onAction,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  title: string;
  sub: string;
  C: ReturnType<typeof palette>;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.empty}>
      <View style={[s.emptyIcon, { backgroundColor: ORANGE + "1A" }]}>
        <Icon name={icon} size={24} color={ORANGE} />
      </View>
      <Text style={[s.emptyTitle, { color: C.text }]}>{title}</Text>
      <Text style={[s.emptySub, { color: C.sub }]}>{sub}</Text>
      {action && onAction ? (
        <PressableScale onPress={onAction} style={[s.emptyBtn, { backgroundColor: C.field }]}>
          <Text style={[s.emptyBtnText, { color: C.text }]}>{action}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

function CardSkeleton({ C, short }: { C: ReturnType<typeof palette>; short?: boolean }) {
  return (
    <View style={[s.card, { backgroundColor: C.card, borderColor: C.cardLine, padding: 14, gap: 10 }]}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.skeleton }} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ width: "60%", height: 12, borderRadius: 6, backgroundColor: C.skeleton }} />
          <View style={{ width: "40%", height: 10, borderRadius: 5, backgroundColor: C.skeleton }} />
        </View>
      </View>
      {!short ? <View style={{ width: "100%", height: 10, borderRadius: 5, backgroundColor: C.skeleton }} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { paddingHorizontal: 14, paddingTop: 2, gap: 10 },
  head: { gap: 2, marginBottom: 2 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  titleSub: { fontSize: 13 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, height: 46, borderRadius: 23, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  seg: { flexDirection: "row", borderRadius: 14, padding: 3, gap: 3 },
  segBtn: { flex: 1, height: 36, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  segOnShadow: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  segText: { fontSize: 14, fontWeight: "700" },
  section: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginTop: 4 },
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  stopName: { fontSize: 16, fontWeight: "700" },
  stopSub: { fontSize: 12.5, marginTop: 2 },
  star: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  loadRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  loadText: { fontSize: 13.5, fontWeight: "600" },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  linePill: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 52, maxWidth: 96, height: 26, borderRadius: 8, paddingHorizontal: 8, justifyContent: "center" },
  linePillText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800", letterSpacing: -0.2 },
  headsign: { fontSize: 14.5, fontWeight: "600" },
  lineMeta: { fontSize: 12, marginTop: 1 },
  etaCol: { alignItems: "flex-end", minWidth: 64 },
  eta: { fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },
  etaNext: { fontSize: 11.5, marginTop: 1 },
  moreRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  moreText: { fontSize: 13, fontWeight: "600" },
  foot: { fontSize: 11.5, textAlign: "center", marginTop: 4, marginBottom: 8 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  resultTitle: { fontSize: 15.5, fontWeight: "600" },
  resultSub: { fontSize: 12.5, marginTop: 2 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 28, paddingHorizontal: 20 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: "800", textAlign: "center" },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyBtn: { marginTop: 6, height: 40, paddingHorizontal: 22, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  emptyBtnText: { fontSize: 14, fontWeight: "700" },
});
