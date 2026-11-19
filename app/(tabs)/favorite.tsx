// app/(tabs)/favorite.tsx
//
// The Saved tab: KakaoMap's look (Home and Work up top, coloured lists),
// Google Maps' ways (a list is a tap away, every place has its actions:
// directions, change lists, remove; lists can be edited and deleted).
import { useAuthStore } from "@/store/authStore";
import { sToMin } from "@/utils/mapHelpers";
import { useSavedStore } from "@/store/savedStore";
import { useJourneyStore, UnifiedLocation } from "@/store/journeyStore";
import { useExploreSearchStore } from "@/store/exploreSearchStore";
import { useMapIntentStore } from "@/store/mapIntentStore";
import {
  allLists,
  listMeta,
  useSavedListsStore,
  type SavedListMeta,
} from "@/store/savedListsStore";
import { SavedJourney, SavedPlace } from "@/services/user";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { Icon } from "@/components/icons/Icon";
import { PressableScale } from "@/components/ui/PressableScale";
import { ListTile } from "@/components/saved/ListTile";
import { NewListForm, type ListDraft } from "@/components/saved/NewListForm";
import { useListEditing } from "@/components/saved/useListEditing";
import { SaveToListSheet } from "@/components/saved/SaveToListSheet";
import { useActionSheet, type SheetAction } from "@/components/ui/ActionSheet";
import type { SaveTarget } from "@/store/savedStore";

const ORANGE = "#FF6F00";
const RECENT_COUNT = 5;

function makeC(dark: boolean) {
  return {
    bg:       dark ? "#18181B" : "#FFFFFF",
    card:     dark ? "#1F1F23" : "#FFFFFF",
    text:     dark ? "#F4F4F5" : "#111827",
    sub:      dark ? "#A1A1AA" : "#6B7280",
    hairline: dark ? "#2A2A2F" : "#EEF0F3",
    chip:     dark ? "#27272A" : "#F3F4F6",
    pressed:  dark ? "#27272A" : "#F3F4F6",
  };
}
type Palette = ReturnType<typeof makeC>;

function mapboxJourneyThumb(fromLng: number, fromLat: number, toLng: number, toLat: number, dark: boolean): string {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
  const style = dark ? "dark-v11" : "streets-v12";
  return (
    `https://api.mapbox.com/styles/v1/mapbox/${style}/static/` +
    `pin-s+FF6F00(${fromLng},${fromLat}),pin-s+10B981(${toLng},${toLat})` +
    `/auto/320x130@2x?padding=35&access_token=${token}`
  );
}

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)} wk ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── Home / Work ───────────────────────────────────────────────────────────────

function PinCard({ pin, place, C, onPress, onLongPress }: {
  pin: "home" | "work";
  place?: SavedPlace;
  C: Palette;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      containerStyle={{ flex: 1 }}
      style={[s.pinCard, { backgroundColor: C.chip }]}
      accessibilityRole="button"
      accessibilityLabel={place ? `Directions to ${pin === "home" ? "Home" : "Work"}, ${place.name}` : `Set ${pin === "home" ? "Home" : "Work"}`}
    >
      <View style={[s.pinIcon, { backgroundColor: place ? ORANGE : C.card }]}>
        <Icon name={pin === "home" ? "home" : "business"} size={17} color={place ? "#FFFFFF" : ORANGE} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.pinTitle, { color: C.text }]}>{pin === "home" ? "Home" : "Work"}</Text>
        <Text style={[s.pinSub, { color: place ? C.sub : ORANGE }]} numberOfLines={1}>
          {place ? place.name : "Set location"}
        </Text>
      </View>
    </PressableScale>
  );
}

// ── A list row ────────────────────────────────────────────────────────────────

function ListRow({ list, count, C, onPress, onMore }: {
  list: SavedListMeta;
  count: number;
  C: Palette;
  onPress: () => void;
  onMore: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.listRow, { backgroundColor: pressed ? C.pressed : "transparent" }]}
      accessibilityRole="button"
      accessibilityLabel={`${list.name}, ${count} place${count === 1 ? "" : "s"}`}
    >
      <ListTile icon={list.icon} color={list.color} size={42} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.listTitle, { color: C.text }]} numberOfLines={1}>{list.name}</Text>
        <Text style={[s.listSub, { color: C.sub }]}>
          {count === 0 ? "Empty" : `${count} place${count === 1 ? "" : "s"}`} · Private
        </Text>
      </View>
      <Pressable onPress={onMore} hitSlop={10} style={s.more} accessibilityLabel={`${list.name} options`}>
        <Icon name="ellipsis-horizontal" size={18} color={C.sub} />
      </Pressable>
    </Pressable>
  );
}

// ── A saved place ─────────────────────────────────────────────────────────────

function PlaceRow({ place, lists, C, onPress, onMore }: {
  place: SavedPlace;
  /** The lists it's in (a place can be in several). */
  lists: SavedListMeta[];
  C: Palette;
  onPress: () => void;
  onMore: () => void;
}) {
  const first = lists[0];
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMore}
      delayLongPress={350}
      style={({ pressed }) => [s.placeRow, { backgroundColor: pressed ? C.pressed : "transparent" }]}
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, open on the map`}
    >
      {place.type === "stop" ? (
        <View style={[s.stopTile, { backgroundColor: "#2563EB1F" }]}>
          <Icon name="bus" size={18} color="#2563EB" />
        </View>
      ) : (
        <ListTile icon={first?.icon ?? "bookmark"} color={first?.color ?? ORANGE} size={40} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.placeTitle, { color: C.text }]} numberOfLines={1}>{place.name}</Text>
        <View style={s.placeMeta}>
          {lists.slice(0, 3).map((l) => (
            <View key={l.key} style={[s.dot, { backgroundColor: l.color }]} />
          ))}
          <Text style={[s.placeSub, { color: C.sub }]} numberOfLines={1}>
            {[place.category, lists.map((l) => l.name).join(", "), timeAgo(place.created_at)].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>
      <Pressable onPress={onMore} hitSlop={10} style={s.more} accessibilityLabel={`${place.name} options`}>
        <Icon name="ellipsis-horizontal" size={18} color={C.sub} />
      </Pressable>
    </Pressable>
  );
}

// ── A saved route ─────────────────────────────────────────────────────────────

function JourneyCard({ journey, C, dark, onPress, onLongPress }: {
  journey: SavedJourney;
  C: Palette;
  dark: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const segs = journey.route?.segments ?? [];
  return (
    <PressableScale
      pressedScale={0.97}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[s.journeyCard, { backgroundColor: C.card, borderColor: C.hairline }]}
    >
      <Image
        source={{ uri: mapboxJourneyThumb(journey.from_lng, journey.from_lat, journey.to_lng, journey.to_lat, dark) }}
        style={s.journeyThumb}
        contentFit="cover"
      />
      <View style={s.journeyBody}>
        {journey.label ? <Text style={s.journeyLabel} numberOfLines={1}>{journey.label}</Text> : null}
        <Text style={[s.journeyLeg, { color: C.text }]} numberOfLines={1}>{journey.from_name}</Text>
        <Text style={[s.journeyTo, { color: C.sub }]} numberOfLines={1}>→ {journey.to_name}</Text>
        <View style={s.journeyFooter}>
          <View style={s.journeyChips}>
            {segs.slice(0, 4).map((seg: any, i: number) =>
              seg.mode === "WALK" ? (
                <View key={i} style={[s.walkChip, { backgroundColor: C.chip }]}>
                  <Icon name="walk" size={10} color={C.sub} />
                  <Text style={[s.chipText, { color: C.sub }]}>{Math.max(1, Math.round((seg.duration ?? 0) / 60))}m</Text>
                </View>
              ) : (
                <View key={i} style={[s.busChip, { backgroundColor: ORANGE + "18" }]}>
                  <Text style={[s.chipText, { color: ORANGE }]}>{seg.route_name ?? "Bus"}</Text>
                </View>
              )
            )}
          </View>
          <Text style={s.journeyDuration}>{sToMin(journey.duration)}</Text>
        </View>
      </View>
    </PressableScale>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function FavoriteScreen({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const dark = useColorScheme() === "dark";
  const C = makeC(dark);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const {
    places, journeys, customLists, fetch: fetchSaved, removePlace, removeJourney,
  } = useSavedStore();
  const { custom, create, migrate } = useSavedListsStore();
  const setJourney = useJourneyStore((s) => s.setJourney);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [changing, setChanging] = useState<SaveTarget | null>(null);
  // Menus in a plain sheet: an Alert would cut them to three buttons on Android.
  const sheet = useActionSheet();
  const choose = (title: string, options: SheetAction[]) => sheet.open(title, options);

  useEffect(() => { if (isAuthenticated) fetchSaved().catch(() => {}); }, [isAuthenticated, fetchSaved]);
  useEffect(() => { migrate(customLists); }, [customLists, migrate]);

  const listPlaces = useMemo(() => places.filter((p) => p.list !== null && p.pin === null), [places]);
  const lists = useMemo(() => allLists(custom, listPlaces.map((p) => p.list as string)), [custom, listPlaces]);
  const home = places.find((p) => p.pin === "home");
  const work = places.find((p) => p.pin === "work");

  // One row per place (a place in three lists is three rows on the API), newest first.
  const recent = useMemo(() => {
    const byPlace = new Map<string, { place: SavedPlace; lists: SavedListMeta[] }>();
    for (const p of [...listPlaces].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
      const key = p.place_id ?? `${p.lat},${p.lng}`;
      const hit = byPlace.get(key);
      const meta = listMeta(p.list as string, custom);
      if (hit) { if (!hit.lists.some((l) => l.key === meta.key)) hit.lists.push(meta); }
      else byPlace.set(key, { place: p, lists: [meta] });
    }
    return [...byPlace.values()];
  }, [listPlaces, custom]);

  const countOf = (key: string) => listPlaces.filter((p) => p.list === key).length;
  const listEdit = useListEditing(lists, countOf);

  const openOnMap = (p: SavedPlace) => {
    Haptics.selectionAsync();
    onClose?.();
    if (p.type === "stop" && p.place_id) {
      useMapIntentStore.getState().show({ kind: "stop", stop: { id: p.place_id, name: p.name, lat: p.lat, lng: p.lng } as any });
      return;
    }
    const place = { id: p.place_id ?? `saved:${p.id}`, name: p.name, address: "", category: p.category ?? "", lat: p.lat, lng: p.lng };
    useExploreSearchStore.getState().startSearch({ query: p.name, activeTab: "place", places: [place], selectedPlace: place });
  };

  const directionsTo = (p: { name: string; lat: number; lng: number }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose?.();
    router.push({ pathname: "/route" as any, params: { tLat: String(p.lat), tLng: String(p.lng), tName: p.name } });
  };

  const pinPress = (pin: "home" | "work", place?: SavedPlace) => {
    if (place) directionsTo(place);
    else router.push({ pathname: "/(account)/pick-place", params: { pin } } as any);
  };
  const pinMore = (pin: "home" | "work", place?: SavedPlace) => {
    if (!place) return;
    choose(pin === "home" ? "Home" : "Work", [
      { label: "Change location", icon: "location-outline", run: () => router.push({ pathname: "/(account)/pick-place", params: { pin } } as any) },
      { label: `Remove ${pin === "home" ? "Home" : "Work"}`, icon: "trash-outline", destructive: true, run: () => removePlace(place.id).catch(() => {}) },
    ]);
  };

  const placeMore = (p: SavedPlace, inLists: SavedListMeta[]) => {
    const rows = listPlaces.filter((r) => (r.place_id ?? `${r.lat},${r.lng}`) === (p.place_id ?? `${p.lat},${p.lng}`));
    choose(p.name, [
      { label: "Directions", icon: "navigate-outline", run: () => directionsTo(p) },
      { label: "Show on map", icon: "map-outline", run: () => openOnMap(p) },
      ...(p.place_id
        ? [{ label: "Change lists", icon: "bookmarks-outline" as const, run: () => setChanging({ name: p.name, lat: p.lat, lng: p.lng, type: p.type, place_id: p.place_id!, category: p.category }) }]
        : []),
      {
        label: inLists.length > 1 ? `Remove from ${inLists.length} lists` : "Remove",
        icon: "trash-outline",
        destructive: true,
        run: () => { Promise.all(rows.map((r) => removePlace(r.id))).catch(() => {}); },
      },
    ]);
  };

  const listMore = (l: SavedListMeta) => {
    const n = countOf(l.key);
    choose(l.name, [
      { label: n ? `View ${n} place${n === 1 ? "" : "s"}` : "Open list", icon: "list-outline", run: () => viewList(l.key) },
      { label: l.builtIn ? "Change colour and icon" : "Edit list", icon: "color-palette-outline", run: () => listEdit.edit(l) },
      ...(!l.builtIn
        ? [{
            label: "Delete list",
            icon: "trash-outline" as const,
            destructive: true,
            run: () => listEdit.confirmDelete(l),
          }]
        : []),
    ]);
  };

  const submitNew = (d: ListDraft) => {
    if (!create(d.name, d.color, d.icon)) { setCreateError("You already have a list with this name."); return; }
    setCreating(false);
    setCreateError(null);
  };

  const viewList = (key: string) => router.push({ pathname: "/(account)/saved-places", params: { filter: key } } as any);

  const loadJourneyOnMap = (journey: SavedJourney) => {
    const fromLoc: UnifiedLocation = { _type: journey.from_type, id: journey.from_id ?? journey.from_name, name: journey.from_name, lat: journey.from_lat, lng: journey.from_lng };
    const toLoc: UnifiedLocation = { _type: journey.to_type, id: journey.to_id ?? journey.to_name, name: journey.to_name, lat: journey.to_lat, lng: journey.to_lng };
    setJourney(fromLoc, toLoc, journey.route);
    onClose?.();
  };

  const journeyMore = (journey: SavedJourney) => {
    const label = journey.label ?? `${journey.from_name} → ${journey.to_name}`;
    choose(label, [
      { label: "Show on map", icon: "map-outline", run: () => loadJourneyOnMap(journey) },
      { label: "Remove", icon: "trash-outline", destructive: true, run: () => removeJourney(journey.id).catch(() => {}) },
    ]);
  };

  const isEmpty = listPlaces.length === 0 && journeys.length === 0 && !home && !work;

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <View style={s.header}>
        <Text style={[s.headerTitle, { color: C.text }]}>Saved</Text>
        <PressableScale
          onPress={() => { Haptics.selectionAsync(); setCreating((c) => !c); setCreateError(null); }}
          style={[s.newBtn, { backgroundColor: ORANGE + "1A" }]}
          accessibilityRole="button"
        >
          <Icon name={creating ? "close" : "add"} size={16} color={ORANGE} />
          <Text style={s.newBtnText}>{creating ? "Cancel" : "New list"}</Text>
        </PressableScale>
      </View>

      <View style={s.body}>
        {creating ? (
          <View style={[s.card, { backgroundColor: C.card, borderColor: C.hairline, padding: 14 }]}>
            <NewListForm dark={dark} error={createError} onSubmit={submitNew} onCancel={() => { setCreating(false); setCreateError(null); }} />
          </View>
        ) : null}

        <View style={s.pins}>
          <PinCard pin="home" place={home} C={C} onPress={() => pinPress("home", home)} onLongPress={() => pinMore("home", home)} />
          <PinCard pin="work" place={work} C={C} onPress={() => pinPress("work", work)} onLongPress={() => pinMore("work", work)} />
        </View>

        <Text style={[s.section, { color: C.sub }]}>YOUR LISTS</Text>
        <View style={[s.card, { backgroundColor: C.card, borderColor: C.hairline }]}>
          {lists.map((l, i) => (
            <View key={l.key}>
              {i > 0 ? <View style={[s.sep, { backgroundColor: C.hairline }]} /> : null}
              <ListRow list={l} count={countOf(l.key)} C={C} onPress={() => viewList(l.key)} onMore={() => listMore(l)} />
            </View>
          ))}
        </View>

        {recent.length > 0 ? (
          <>
            <View style={s.sectionRow}>
              <Text style={[s.section, { color: C.sub }]}>RECENTLY SAVED</Text>
              <Pressable onPress={() => router.push("/(account)/saved-places" as any)} hitSlop={8}>
                <Text style={s.seeAll}>See all</Text>
              </Pressable>
            </View>
            <View style={[s.card, { backgroundColor: C.card, borderColor: C.hairline }]}>
              {recent.slice(0, RECENT_COUNT).map(({ place, lists: inLists }, i) => (
                <View key={place.id}>
                  {i > 0 ? <View style={[s.sep, { backgroundColor: C.hairline }]} /> : null}
                  <PlaceRow place={place} lists={inLists} C={C} onPress={() => openOnMap(place)} onMore={() => placeMore(place, inLists)} />
                </View>
              ))}
            </View>
          </>
        ) : null}

        {journeys.length > 0 ? (
          <>
            <Text style={[s.section, { color: C.sub }]}>SAVED ROUTES</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
              {journeys.map((j) => (
                <JourneyCard key={j.id} journey={j} C={C} dark={dark} onPress={() => loadJourneyOnMap(j)} onLongPress={() => journeyMore(j)} />
              ))}
            </ScrollView>
          </>
        ) : null}

        {isEmpty ? (
          <View style={s.empty}>
            <ListTile icon="bookmark" color={ORANGE} size={56} />
            <Text style={[s.emptyTitle, { color: C.text }]}>Save the places you love</Text>
            <Text style={[s.emptySub, { color: C.sub }]}>
              Tap Save on a place or the star on a stage, and pick a list. Set Home and Work for one-tap trips.
            </Text>
          </View>
        ) : null}
      </View>

      {listEdit.element}
      <SaveToListSheet target={changing} onClose={() => setChanging(null)} />
      {sheet.element}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 5, height: 36, paddingHorizontal: 14, borderRadius: 18 },
  newBtnText: { color: ORANGE, fontSize: 14, fontWeight: "700" },
  body: { paddingHorizontal: 14, gap: 12 },

  pins: { flexDirection: "row", gap: 10 },
  pinCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 18 },
  pinIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pinTitle: { fontSize: 15, fontWeight: "700" },
  pinSub: { fontSize: 12.5, marginTop: 1 },

  section: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginTop: 4 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  seeAll: { fontSize: 13.5, fontWeight: "700", color: ORANGE },
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 70 },

  listRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 14, paddingVertical: 11 },
  listTitle: { fontSize: 16, fontWeight: "600" },
  listSub: { fontSize: 12.5, marginTop: 1 },
  more: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },

  placeRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 14, paddingVertical: 11 },
  stopTile: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  placeTitle: { fontSize: 15.5, fontWeight: "600" },
  placeMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  placeSub: { fontSize: 12.5, flexShrink: 1, marginLeft: 2 },

  hScroll: { gap: 12, paddingRight: 4 },
  journeyCard: { width: 240, borderRadius: 18, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  journeyThumb: { width: "100%", height: 104 },
  journeyBody: { padding: 12, gap: 3 },
  journeyLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4, color: ORANGE, textTransform: "uppercase" },
  journeyLeg: { fontSize: 13.5, fontWeight: "600" },
  journeyTo: { fontSize: 13 },
  journeyFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6 },
  journeyChips: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, flex: 1 },
  journeyDuration: { fontSize: 15, fontWeight: "800", color: ORANGE, letterSpacing: -0.3 },
  walkChip: { flexDirection: "row", alignItems: "center", gap: 2, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2 },
  busChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  chipText: { fontSize: 10.5, fontWeight: "700" },

  empty: { alignItems: "center", paddingTop: 24, paddingBottom: 12, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
  emptySub: { fontSize: 14, textAlign: "center", maxWidth: 290, lineHeight: 20 },

  modalWrap: { flex: 1, justifyContent: "center", padding: 18, backgroundColor: "rgba(0,0,0,0.4)" },
  modalCard: { borderRadius: 22, padding: 18, gap: 6 },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
});
