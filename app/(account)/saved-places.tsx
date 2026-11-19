// app/(account)/saved-places.tsx
import { ScreenHeader } from "@/components/app/ScreenHeader";
import { SavedPlace } from "@/services/user";
import { useSavedStore, type SaveTarget } from "@/store/savedStore";
import { allLists, listMeta, useSavedListsStore } from "@/store/savedListsStore";
import { useExploreSearchStore } from "@/store/exploreSearchStore";
import { useMapIntentStore } from "@/store/mapIntentStore";
import { SaveToListSheet } from "@/components/saved/SaveToListSheet";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";
const GREY   = "#8E8E93";


function makeC(dark: boolean) {
  return {
    bg:       dark ? "#0F0F0F" : "#F6F7F8",
    card:     dark ? "#1C1C1E" : "#FFFFFF",
    text:     dark ? "#FFFFFF" : "#1C1C1E",
    sub:      dark ? GREY      : "#6B7280",
    hairline: dark ? "#2C2C2E" : "#E5E7EB",
    input:    dark ? "#1C1C1E" : "#FFFFFF",
    border:   dark ? "#3A3A3C" : "#E5E7EB",
    pill:     dark ? "rgba(255,111,0,0.18)" : "#FFF3E0",
    pressed:  dark ? "#2C2C2E" : "#F0F0F0",
  };
}

function mapboxThumb(lng: number, lat: number): string {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${lng},${lat},15/200x120@2x?access_token=${token}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7)  return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── Place row ─────────────────────────────────────────────────────────────────

function PlaceRow({
  place,
  C,
  listColor,
  listIcon,
  listLabel,
  onPress,
  onLongPress,
}: {
  place: SavedPlace;
  C: ReturnType<typeof makeC>;
  listColor: string;
  listIcon: keyof typeof Ionicons.glyphMap;
  listLabel: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.placeRow, { backgroundColor: pressed ? C.pressed : C.card }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, open on the map`}
    >
      {/* Mapbox thumbnail */}
      <Image
        source={{ uri: mapboxThumb(place.lng, place.lat) }}
        style={s.thumb}
        contentFit="cover"
      />

      {/* Info */}
      <View style={s.placeInfo}>
        <Text style={[s.placeName, { color: C.text }]} numberOfLines={1}>{place.name}</Text>
        {place.category ? (
          <Text style={[s.placeSub, { color: C.sub }]} numberOfLines={1}>{place.category}</Text>
        ) : null}
        <View style={s.placeFooter}>
          <View style={[s.listBadge, { backgroundColor: listColor + "22" }]}>
            <Icon name={listIcon} size={10} color={listColor} />
            <Text style={[s.listBadgeText, { color: listColor }]}>{listLabel}</Text>
          </View>
          <Text style={[s.placeDate, { color: C.sub }]}>{timeAgo(place.created_at)}</Text>
        </View>
      </View>

      <Pressable onPress={onLongPress} hitSlop={10} accessibilityLabel={`${place.name} options`}>
        <Icon name="ellipsis-vertical" size={16} color={C.sub} style={{ marginLeft: 4 }} />
      </Pressable>
    </Pressable>
  );
}

// ── Filter pill ───────────────────────────────────────────────────────────────

function FilterPill({
  label,
  count,
  active,
  color,
  onPress,
  C,
}: {
  label: string;
  count: number;
  active: boolean;
  color?: string;
  onPress: () => void;
  C: ReturnType<typeof makeC>;
}) {
  return (
    <Pressable
      style={[
        s.filterPill,
        active
          ? { backgroundColor: color ?? ORANGE }
          : { backgroundColor: C.card, borderWidth: 1, borderColor: C.hairline },
      ]}
      onPress={onPress}
    >
      <Text style={[s.filterPillText, { color: active ? "#FFF" : C.text }]}>{label}</Text>
      <View style={[s.filterCount, { backgroundColor: active ? "rgba(255,255,255,0.25)" : C.hairline }]}>
        <Text style={[s.filterCountText, { color: active ? "#FFF" : C.sub }]}>{count}</Text>
      </View>
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SavedPlacesScreen() {
  const insets = useSafeAreaInsets();
  const dark   = useColorScheme() === "dark";
  const C      = makeC(dark);
  const router = useRouter();
  const { filter: initialFilter } = useLocalSearchParams<{ filter?: string }>();

  const { places, removePlace, customLists, fetch: fetchSaved } = useSavedStore();
  const { custom, migrate } = useSavedListsStore();
  const [activeFilter, setActiveFilter] = useState(initialFilter ?? "all");
  const [query, setQuery]               = useState("");
  const [changing, setChanging]         = useState<SaveTarget | null>(null);

  useEffect(() => { fetchSaved().catch(() => {}); }, [fetchSaved]);
  useEffect(() => { migrate(customLists); }, [customLists, migrate]);

  // Only list-type places (not home/work pins)
  const listPlaces = useMemo(
    () => places.filter((p) => p.list !== null && p.pin === null),
    [places],
  );

  const filtered = useMemo(() => {
    const base = activeFilter === "all"
      ? listPlaces
      : listPlaces.filter((p) => p.list === activeFilter);
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter((p) => p.name.toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q));
  }, [listPlaces, activeFilter, query]);

  // Build filter tab data
  const allCount = listPlaces.length;
  const filterTabs = [
    { key: "all", label: "All", count: allCount, color: ORANGE, icon: "bookmark" as const },
    ...allLists(custom, listPlaces.map((p) => p.list as string)).map((l) => ({
      key:   l.key,
      label: l.name,
      count: listPlaces.filter((p) => p.list === l.key).length,
      color: l.color,
      icon:  l.icon,
    })),
  ];

  const getListMeta = (list: string | null) => {
    if (!list) return { color: GREY, icon: "bookmark-outline" as const, label: "Saved" };
    const m = listMeta(list, custom);
    return { color: m.color, icon: m.icon, label: m.name };
  };

  // Shown on the map: the tab sheets close when the map is asked to show something.
  const openOnMap = (p: SavedPlace) => {
    if (p.type === "stop" && p.place_id) {
      useMapIntentStore.getState().show({ kind: "stop", stop: { id: p.place_id, name: p.name, lat: p.lat, lng: p.lng } as any });
    } else {
      const place = { id: p.place_id ?? `saved:${p.id}`, name: p.name, address: "", category: p.category ?? "", lat: p.lat, lng: p.lng };
      useExploreSearchStore.getState().startSearch({ query: p.name, activeTab: "place", places: [place], selectedPlace: place });
    }
    router.dismissTo("/(tabs)/map" as any);
  };

  const placeActions = (place: SavedPlace) => {
    const label = getListMeta(place.list).label;
    Alert.alert(place.name, undefined, [
      {
        text: "Directions",
        onPress: () => router.push({ pathname: "/route" as any, params: { tLat: String(place.lat), tLng: String(place.lng), tName: place.name } }),
      },
      ...(place.place_id
        ? [{
            text: "Change lists",
            onPress: () => setChanging({ name: place.name, lat: place.lat, lng: place.lng, type: place.type, place_id: place.place_id!, category: place.category }),
          }]
        : []),
      { text: `Remove from ${label}`, style: "destructive" as const, onPress: () => { removePlace(place.id).catch(() => {}); } },
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const headerC = { bg: C.card, text: C.text, hairline: C.hairline };

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <ScreenHeader title="Saved Places" C={headerC} />

      {/* Search bar */}
      <View style={[s.searchWrap, { backgroundColor: C.card, borderBottomColor: C.hairline }]}>
        <View style={[s.searchRow, { backgroundColor: C.bg, borderColor: C.border }]}>
          <Icon name="search-outline" size={16} color={C.sub} />
          <TextInput
            style={[s.searchInput, { color: C.text }]}
            placeholder="Search your places…"
            placeholderTextColor={C.sub}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Icon name="close-circle" size={16} color={C.sub} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[s.filterScroll, { backgroundColor: C.card, borderBottomColor: C.hairline }]}
        contentContainerStyle={s.filterContent}
      >
        {filterTabs.map((tab) => (
          <FilterPill
            key={tab.key}
            label={tab.label}
            count={tab.count}
            active={activeFilter === tab.key}
            color={tab.color}
            onPress={() => setActiveFilter(tab.key)}
            C={C}
          />
        ))}
      </ScrollView>

      {/* Place list */}
      {filtered.length === 0 ? (
        <View style={s.empty}>
          <Icon name="bookmark-outline" size={52} color={C.sub} />
          <Text style={[s.emptyTitle, { color: C.text }]}>
            {query ? `No results for "${query}"` : "Nothing here yet"}
          </Text>
          <Text style={[s.emptySub, { color: C.sub }]}>
            {query
              ? "Try a different search term."
              : "Save a stop or place to see it here."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 24 }]}
          ItemSeparatorComponent={() => (
            <View style={[s.sep, { backgroundColor: C.hairline, marginLeft: 88 }]} />
          )}
          renderItem={({ item }) => {
            const meta = getListMeta(item.list);
            return (
              <PlaceRow
                place={item}
                C={C}
                listColor={meta.color}
                listIcon={meta.icon}
                listLabel={meta.label}
                onPress={() => openOnMap(item)}
                onLongPress={() => placeActions(item)}
              />
            );
          }}
        />
      )}
      <SaveToListSheet target={changing} onClose={() => setChanging(null)} />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical:   10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchRow: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              8,
    paddingHorizontal: 12,
    paddingVertical:  10,
    borderRadius:     12,
    borderWidth:      1,
  },
  searchInput: { flex: 1, fontSize: 14 },

  filterScroll:  { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  filterContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterPill: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              6,
    paddingHorizontal: 12,
    paddingVertical:  7,
    borderRadius:     99,
  },
  filterPillText:  { fontSize: 13, fontWeight: "600" },
  filterCount:     { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 99 },
  filterCountText: { fontSize: 11, fontWeight: "700" },

  listContent: { paddingTop: 4 },

  placeRow: {
    flexDirection:    "row",
    alignItems:       "center",
    paddingHorizontal: 16,
    paddingVertical:   12,
    gap:              12,
  },
  thumb: {
    width:        72,
    height:       52,
    borderRadius: 10,
    flexShrink:   0,
  },
  placeInfo:   { flex: 1, gap: 3 },
  placeName:   { fontSize: 15, fontWeight: "600" },
  placeSub:    { fontSize: 12 },
  placeFooter: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  listBadge: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              4,
    paddingHorizontal: 7,
    paddingVertical:  3,
    borderRadius:     99,
  },
  listBadgeText: { fontSize: 11, fontWeight: "600" },
  placeDate:     { fontSize: 11 },

  sep: { height: StyleSheet.hairlineWidth },

  empty: {
    flex:           1,
    alignItems:     "center",
    justifyContent: "center",
    gap:            12,
    paddingHorizontal: 40,
    paddingBottom:  80,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptySub:   { fontSize: 14, textAlign: "center" },
});
