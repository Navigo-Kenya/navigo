// app/(account)/saved-places.tsx
//
// A saved list, as Google Maps shows one, in KakaoMap's colours:
//   - The list itself: its tile, name and count, with a map of all its
//     places (one image, pins in the list's colour; tap to see them on the
//     real map). "All saved" when opened from "See all", with chips to
//     switch lists.
//   - Its places, one row per place (a place in three lists is one row in
//     "All"), sortable: recently added, A–Z, nearest.
//   - Each place's menu: directions, the map, a note ("Gate B, by the
//     bank"), change lists, remove. The list's menu: edit, delete.
import { ScreenHeader } from "@/components/app/ScreenHeader";
import { SaveToListSheet } from "@/components/saved/SaveToListSheet";
import { ListTile } from "@/components/saved/ListTile";
import { useListEditing } from "@/components/saved/useListEditing";
import { useActionSheet, type SheetAction } from "@/components/ui/ActionSheet";
import { OptionSheet } from "@/components/ui/OptionSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { Icon } from "@/components/icons/Icon";
import { PoiCategoryGlyph } from "@/components/icons/NavigoIcons";
import { poiCategoryMeta } from "@/components/icons/poiCategories";
import { poiCategoryOf } from "@/services/placeCategory";
import { distanceM, formatDistance } from "@/services/exploreSearch";
import { hereWithoutAsking, type LatLng } from "@/services/here";
import type { SavedPlace } from "@/services/user";
import { useExploreSearchStore } from "@/store/exploreSearchStore";
import { useMapIntentStore } from "@/store/mapIntentStore";
import { useSavedStore, type SaveTarget } from "@/store/savedStore";
import { allLists, listMeta, useSavedListsStore } from "@/store/savedListsStore";
import { groupPlaces, listMapUrl, sortPlaces, type PlaceItem, type SortMode } from "@/utils/savedPlaces";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ORANGE = "#FF6F00";
const BLUE = "#2563EB";

function makeC(dark: boolean) {
  return {
    bg: dark ? "#0F0F10" : "#FFFFFF",
    card: dark ? "#1C1C1F" : "#FFFFFF",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    line: dark ? "#232326" : "#EEF0F3",
    chip: dark ? "#232326" : "#F3F4F6",
    pressed: dark ? "#1C1C1F" : "#F7F7F8",
    input: dark ? "#232326" : "#F3F4F6",
  };
}
type Palette = ReturnType<typeof makeC>;

function addedAgo(iso: string): string {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (d <= 0) return "Added today";
  if (d === 1) return "Added yesterday";
  if (d < 7) return `Added ${d} days ago`;
  if (d < 30) return `Added ${Math.floor(d / 7)} wk ago`;
  return `Added ${new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

// ── A place ──────────────────────────────────────────────────────────────────

function PlaceRow({ item, C, here, showLists, onPress, onMore }: {
  item: PlaceItem;
  C: Palette;
  here: LatLng | null;
  showLists: boolean;
  onPress: () => void;
  onMore: () => void;
}) {
  const p = item.place;
  const cat = p.type === "stop" ? null : poiCategoryOf(p.category);
  const dist = here ? formatDistance(distanceM(here.lat, here.lng, p.lat, p.lng)) : null;
  const note = item.rows.find((r) => r.note)?.note ?? null;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMore}
      delayLongPress={350}
      style={({ pressed }) => [s.row, { backgroundColor: pressed ? C.pressed : "transparent" }]}
      accessibilityRole="button"
      accessibilityLabel={`${p.name}, open on the map`}
    >
      {p.type === "stop" ? (
        <View style={[s.tile, { backgroundColor: BLUE + "1F" }]}>
          <Icon name="bus" size={19} color={BLUE} />
        </View>
      ) : cat ? (
        <View style={[s.tile, { backgroundColor: poiCategoryMeta(cat).color }]}>
          <PoiCategoryGlyph category={cat} size={20} />
        </View>
      ) : (
        <ListTile icon={item.lists[0]?.icon ?? "bookmark"} color={item.lists[0]?.color ?? ORANGE} size={42} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.name, { color: C.text }]} numberOfLines={1}>{p.name}</Text>
        <Text style={[s.meta, { color: C.sub }]} numberOfLines={1}>
          {[p.type === "stop" ? "Stage" : p.category, dist, addedAgo(p.created_at)].filter(Boolean).join(" · ")}
        </Text>
        {showLists ? (
          <View style={s.dots}>
            {item.lists.slice(0, 4).map((l) => (
              <View key={l.key} style={[s.listPill, { backgroundColor: l.color + "1A" }]}>
                <View style={[s.dot, { backgroundColor: l.color }]} />
                <Text style={[s.listPillText, { color: l.color }]} numberOfLines={1}>{l.name}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {note ? (
          <View style={s.noteRow}>
            <Icon name="create-outline" size={12} color={C.sub} />
            <Text style={[s.note, { color: C.text }]} numberOfLines={2}>{note}</Text>
          </View>
        ) : null}
      </View>
      <Pressable onPress={onMore} hitSlop={10} style={s.more} accessibilityLabel={`${p.name} options`}>
        <Icon name="ellipsis-horizontal" size={18} color={C.sub} />
      </Pressable>
    </Pressable>
  );
}

// ── A note ───────────────────────────────────────────────────────────────────

function NoteModal({ row, C, dark, onClose }: { row: SavedPlace | null; C: Palette; dark: boolean; onClose: () => void }) {
  const setNote = useSavedStore((st) => st.setNote);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setText(row?.note ?? ""); }, [row]);

  const save = async () => {
    if (!row) return;
    setBusy(true);
    try {
      await setNote(row.id, text);
      onClose();
    } catch {
      Alert.alert("Couldn't save the note", "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!row} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {row ? (
          <View style={[s.modalCard, { backgroundColor: dark ? "#18181B" : "#FFFFFF" }]}>
            <Text style={[s.modalTitle, { color: C.text }]}>Note</Text>
            <Text style={[s.modalSub, { color: C.sub }]} numberOfLines={1}>{row.name}</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="e.g. Gate B, by the bank. Ask for Mama Njeri."
              placeholderTextColor={C.sub}
              style={[s.noteInput, { backgroundColor: C.input, color: C.text }]}
              multiline
              maxLength={500}
              autoFocus
            />
            <View style={s.modalBtns}>
              <Pressable onPress={onClose} style={[s.modalBtn, { backgroundColor: C.chip }]} accessibilityRole="button">
                <Text style={[s.modalBtnText, { color: C.text }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={save} disabled={busy} style={[s.modalBtn, { backgroundColor: ORANGE, opacity: busy ? 0.6 : 1 }]} accessibilityRole="button">
                <Text style={[s.modalBtnText, { color: "#FFFFFF" }]}>{text.trim() ? "Save" : row.note ? "Clear note" : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

const SORTS: { value: SortMode; label: string; description: string }[] = [
  { value: "recent", label: "Recently added", description: "The newest first" },
  { value: "name", label: "Name", description: "A to Z" },
  { value: "nearest", label: "Nearest", description: "Closest to where you are" },
];

export default function SavedPlacesScreen() {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";
  const C = makeC(dark);
  const router = useRouter();
  const { filter: initial } = useLocalSearchParams<{ filter?: string }>();

  const { places, removePlace, customLists, fetch: fetchSaved, refresh } = useSavedStore();
  const { custom, migrate } = useSavedListsStore();
  const [list, setList] = useState<string | null>(initial && initial !== "all" ? initial : null);
  const [sort, setSort] = useState<SortMode>("recent");
  const [sorting, setSorting] = useState(false);
  const [query, setQuery] = useState("");
  const [here, setHere] = useState<LatLng | null>(null);
  const [changing, setChanging] = useState<SaveTarget | null>(null);
  const [noting, setNoting] = useState<SavedPlace | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const sheet = useActionSheet();

  useEffect(() => { fetchSaved().catch(() => {}); }, [fetchSaved]);
  useEffect(() => { migrate(customLists); }, [customLists, migrate]);
  useEffect(() => { hereWithoutAsking().then(setHere); }, []);

  const listRows = useMemo(() => places.filter((p) => p.list !== null && p.pin === null), [places]);
  const lists = useMemo(() => allLists(custom, listRows.map((p) => p.list as string)), [custom, listRows]);
  const countOf = (key: string) => listRows.filter((p) => p.list === key).length;
  const listEdit = useListEditing(lists, countOf);
  const meta = list ? listMeta(list, custom) : null;

  const items = useMemo(() => groupPlaces(places, custom, list), [places, custom, list]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? items.filter((i) => i.place.name.toLowerCase().includes(q) || (i.place.category ?? "").toLowerCase().includes(q) || i.rows.some((r) => (r.note ?? "").toLowerCase().includes(q)))
      : items;
    return sortPlaces(base, sort, here);
  }, [items, query, sort, here]);

  const mapUrl = useMemo(
    () => listMapUrl(items.map((i) => i.place), meta?.color ?? ORANGE, dark, process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? ""),
    [items, meta?.color, dark]
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refresh(); } catch {} finally { setRefreshing(false); }
  };

  // The map: the tab sheets close when the map is asked to show something.
  const openOnMap = (p: SavedPlace) => {
    Haptics.selectionAsync();
    if (p.type === "stop" && p.place_id) {
      useMapIntentStore.getState().show({ kind: "stop", stop: { id: p.place_id, name: p.name, lat: p.lat, lng: p.lng } as any });
    } else {
      const place = { id: p.place_id ?? `saved:${p.id}`, name: p.name, address: "", category: p.category ?? "", lat: p.lat, lng: p.lng };
      useExploreSearchStore.getState().startSearch({ query: p.name, activeTab: "place", places: [place], selectedPlace: place });
    }
    router.dismissTo("/(tabs)/map" as any);
  };

  /** Every place of the list on the map, as search results. */
  const showAllOnMap = () => {
    if (!items.length) return;
    Haptics.selectionAsync();
    const results = items.map(({ place: p }) => ({
      id: p.place_id ?? `saved:${p.id}`, name: p.name, address: "", category: p.category ?? "", lat: p.lat, lng: p.lng,
    }));
    useExploreSearchStore.getState().startSearch({ query: meta?.name ?? "Saved places", activeTab: "place", places: results });
    router.dismissTo("/(tabs)/map" as any);
  };

  const placeMenu = (item: PlaceItem) => {
    const p = item.place;
    // In a list, the note and the removal are this list's row; in "All", the newest row's.
    const row = (list ? item.rows.find((r) => r.list === list) : null) ?? p;
    const actions: SheetAction[] = [
      { label: "Directions", icon: "navigate-outline", run: () => router.push({ pathname: "/route" as any, params: { tLat: String(p.lat), tLng: String(p.lng), tName: p.name } }) },
      { label: "Show on map", icon: "map-outline", run: () => openOnMap(p) },
      { label: row.note ? "Edit note" : "Add a note", icon: "create-outline", hint: row.note ?? "Gate, floor, who to ask", run: () => setNoting(row) },
    ];
    if (p.place_id) {
      actions.push({
        label: "Change lists",
        icon: "bookmarks-outline",
        hint: item.lists.map((l) => l.name).join(", "),
        run: () => setChanging({ name: p.name, lat: p.lat, lng: p.lng, type: p.type, place_id: p.place_id!, category: p.category }),
      });
    }
    if (list && meta) {
      actions.push({ label: `Remove from ${meta.name}`, icon: "trash-outline", destructive: true, run: () => { removePlace(row.id).catch(() => {}); } });
    } else {
      actions.push({
        label: item.rows.length > 1 ? `Remove from ${item.rows.length} lists` : "Remove",
        icon: "trash-outline",
        destructive: true,
        run: () => { Promise.all(item.rows.map((r) => removePlace(r.id))).catch(() => {}); },
      });
    }
    sheet.open(p.name, actions, [p.category, item.lists.map((l) => l.name).join(", ")].filter(Boolean).join(" · "));
  };

  const listMenu = () => {
    if (!meta) return;
    sheet.open(meta.name, [
      ...(items.length ? [{ label: "Show all on map", icon: "map-outline" as const, run: showAllOnMap }] : []),
      { label: meta.builtIn ? "Change colour and icon" : "Edit list", icon: "color-palette-outline", run: () => listEdit.edit(meta) },
      ...(!meta.builtIn
        ? [{ label: "Delete list", icon: "trash-outline" as const, destructive: true, run: () => listEdit.confirmDelete(meta, () => setList(null)) }]
        : []),
    ]);
  };

  const chipLists = lists.filter((l) => countOf(l.key) > 0 || l.key === list);
  const count = items.length;

  const header = (
    <View>
      {/* The map of the whole list */}
      {mapUrl ? (
        <PressableScale pressedScale={0.98} onPress={showAllOnMap} style={s.mapCard} accessibilityRole="button" accessibilityLabel="Show all on the map">
          <Image source={{ uri: mapUrl }} style={s.map} contentFit="cover" transition={150} />
          <View style={[s.mapPill, { backgroundColor: C.card }]}>
            <Icon name="map" size={14} color={meta?.color ?? ORANGE} />
            <Text style={[s.mapPillText, { color: C.text }]}>Show on map</Text>
          </View>
        </PressableScale>
      ) : null}

      {/* The list */}
      <View style={s.identity}>
        {meta ? <ListTile icon={meta.icon} color={meta.color} size={46} solid /> : <ListTile icon="bookmark" color={ORANGE} size={46} solid />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.listName, { color: C.text }]} numberOfLines={1}>{meta?.name ?? "All saved"}</Text>
          <Text style={[s.listSub, { color: C.sub }]}>
            {count === 0 ? "No places yet" : `${count} place${count === 1 ? "" : "s"}`} · Private
          </Text>
        </View>
        {count > 1 ? (
          <PressableScale onPress={() => setSorting(true)} style={[s.sortBtn, { backgroundColor: C.chip }]} accessibilityRole="button" accessibilityLabel="Sort">
            <Icon name="swap-vertical" size={14} color={C.text} />
            <Text style={[s.sortText, { color: C.text }]}>{SORTS.find((x) => x.value === sort)?.label.split(" ")[0]}</Text>
          </PressableScale>
        ) : null}
      </View>

      {/* Switch lists */}
      {chipLists.length > 1 || list ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {[null, ...chipLists.map((l) => l.key)].map((k) => {
            const m = k ? listMeta(k, custom) : null;
            const on = k === list;
            const color = m?.color ?? ORANGE;
            return (
              <PressableScale
                key={k ?? "all"}
                onPress={() => { Haptics.selectionAsync(); setList(k); setQuery(""); }}
                style={[s.chip, { backgroundColor: on ? color : C.chip }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                {m ? <Icon name={m.icon} size={13} color={on ? "#FFFFFF" : color} /> : null}
                <Text style={[s.chipText, { color: on ? "#FFFFFF" : C.text }]} numberOfLines={1}>{m?.name ?? "All"}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Search, once a list is long */}
      {count >= 8 ? (
        <View style={[s.search, { backgroundColor: C.input }]}>
          <Icon name="search" size={16} color={C.sub} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${meta?.name ?? "your places"}`}
            placeholderTextColor={C.sub}
            style={[s.searchInput, { color: C.text }]}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear">
              <Icon name="close-circle" size={16} color={C.sub} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <ScreenHeader
        title={meta?.name ?? "Saved places"}
        C={{ bg: C.bg, text: C.text, hairline: C.line }}
        rightNode={
          meta ? (
            <Pressable onPress={listMenu} hitSlop={10} accessibilityLabel={`${meta.name} options`}>
              <Icon name="ellipsis-horizontal" size={22} color={C.text} />
            </Pressable>
          ) : undefined
        }
      />
      <FlatList
        data={shown}
        keyExtractor={(i) => String(i.place.id)}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={[s.sep, { backgroundColor: C.line }]} />}
        renderItem={({ item }) => (
          <PlaceRow item={item} C={C} here={here} showLists={!list} onPress={() => openOnMap(item.place)} onMore={() => placeMenu(item)} />
        )}
        ListEmptyComponent={
          query ? (
            <Text style={[s.noMatch, { color: C.sub }]}>{`Nothing called "${query.trim()}" here.`}</Text>
          ) : (
            <View style={s.empty}>
              <ListTile icon={meta?.icon ?? "bookmark"} color={meta?.color ?? ORANGE} size={64} />
              <Text style={[s.emptyTitle, { color: C.text }]}>{meta ? `Nothing in ${meta.name} yet` : "Nothing saved yet"}</Text>
              <Text style={[s.emptySub, { color: C.sub }]}>
                Tap Save on a place, or the star on a stage, and pick {meta ? meta.name : "a list"}.
              </Text>
              <PressableScale onPress={() => router.push("/search" as any)} style={[s.emptyBtn, { backgroundColor: meta?.color ?? ORANGE }]} accessibilityRole="button">
                <Icon name="search" size={16} color="#FFFFFF" />
                <Text style={s.emptyBtnText}>Find a place</Text>
              </PressableScale>
            </View>
          )
        }
      />

      <OptionSheet
        visible={sorting}
        title="Sort places"
        options={here ? SORTS : SORTS.filter((x) => x.value !== "nearest")}
        value={sort}
        onSelect={setSort}
        onClose={() => setSorting(false)}
      />
      <SaveToListSheet target={changing} onClose={() => setChanging(null)} />
      <NoteModal row={noting} C={C} dark={dark} onClose={() => setNoting(null)} />
      {listEdit.element}
      {sheet.element}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  mapCard: { marginHorizontal: 14, marginTop: 10, borderRadius: 20, overflow: "hidden" },
  map: { width: "100%", height: 150 },
  mapPill: { position: "absolute", left: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6, elevation: 3 },
  mapPillText: { fontSize: 13, fontWeight: "700" },

  identity: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  listName: { fontSize: 21, fontWeight: "800", letterSpacing: -0.4 },
  listSub: { fontSize: 13, marginTop: 1 },
  sortBtn: { flexDirection: "row", alignItems: "center", gap: 5, height: 32, paddingHorizontal: 12, borderRadius: 16 },
  sortText: { fontSize: 13, fontWeight: "700" },

  chips: { gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 13, borderRadius: 17, maxWidth: 180 },
  chipText: { fontSize: 13.5, fontWeight: "700" },

  search: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 14, marginTop: 4, marginBottom: 6, paddingHorizontal: 12, height: 42, borderRadius: 14 },
  searchInput: { flex: 1, fontSize: 15 },

  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  tile: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15.5, fontWeight: "700" },
  meta: { fontSize: 12.5, marginTop: 2 },
  dots: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 6 },
  listPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, height: 20, borderRadius: 10, maxWidth: 140 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  listPillText: { fontSize: 11, fontWeight: "700" },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 5, marginTop: 6 },
  note: { flex: 1, fontSize: 13, lineHeight: 18, fontStyle: "italic" },
  more: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginTop: 4 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 70 },

  noMatch: { textAlign: "center", fontSize: 14, paddingTop: 30 },
  empty: { alignItems: "center", paddingHorizontal: 40, paddingTop: 40, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingHorizontal: 18, borderRadius: 22, marginTop: 8 },
  emptyBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },

  modalWrap: { flex: 1, justifyContent: "center", padding: 18, backgroundColor: "rgba(0,0,0,0.4)" },
  modalCard: { borderRadius: 22, padding: 18 },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalSub: { fontSize: 13, marginTop: 2, marginBottom: 12 },
  noteInput: { minHeight: 96, borderRadius: 14, padding: 12, fontSize: 15, textAlignVertical: "top" },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 14 },
  modalBtn: { flex: 1, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  modalBtnText: { fontSize: 15, fontWeight: "800" },
});
