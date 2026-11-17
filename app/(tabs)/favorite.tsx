import { useAuthStore } from "@/store/authStore";
import { sToMin } from "@/utils/mapHelpers";
import { useSavedStore } from "@/store/savedStore";
import { useJourneyStore, UnifiedLocation } from "@/store/journeyStore";
import { SavedJourney, SavedPlace } from "@/services/user";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { Icon } from "@/components/icons/Icon";
const ORANGE = "#FF6F00";
const BLACK  = "#1C1C1E";
const GREY   = "#8E8E93";

const DEFAULT_LISTS = [
  { key: "favorites",    label: "Favorites",    icon: "heart-outline"     as const, color: "#EF4444" },
  { key: "want_to_go",   label: "Want to go",   icon: "flag-outline"      as const, color: "#10B981" },
  { key: "travel_plans", label: "Travel plans", icon: "briefcase-outline" as const, color: "#3B82F6" },
  { key: "labeled",      label: "Labeled",      icon: "pricetag-outline"  as const, color: GREY },
] as const;

function makeC(dark: boolean) {
  return {
    bg:       dark ? "#0F0F0F" : "#FFFFFF",
    card:     dark ? "#1C1C1E" : "#FFFFFF",
    text:     dark ? "#FFFFFF" : BLACK,
    sub:      dark ? GREY      : "#6B7280",
    hairline: dark ? "#2C2C2E" : "#E5E7EB",
    iconBg:   dark ? "#2C2C2E" : "#F2F2F7",
    pill:     dark ? "rgba(255,111,0,0.18)" : "#FFF3E0",
    pressed:  dark ? "#2C2C2E" : "#F2F2F7",
    input:    dark ? "#2C2C2E" : "#F2F2F7",
  };
}

function mapboxThumb(lng: number, lat: number): string {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${lng},${lat},15/300x160@2x?access_token=${token}`;
}

function mapboxJourneyThumb(fromLng: number, fromLat: number, toLng: number, toLat: number): string {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
  return (
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/` +
    `pin-s+FF6F00(${fromLng},${fromLat}),pin-s+10B981(${toLng},${toLat})` +
    `/auto/320x130@2x?padding=35&access_token=${token}`
  );
}

function formatDuration(secs: number): string {
  return sToMin(secs);
}

// ── PlaceCard ─────────────────────────────────────────────────────────────────

function PlaceCard({ place, C, onLongPress }: { place: SavedPlace; C: ReturnType<typeof makeC>; onLongPress: () => void }) {
  const def = DEFAULT_LISTS.find((l) => l.key === place.list);
  const meta = def ?? { icon: "pricetag-outline" as const, color: "#8B5CF6", label: place.list ?? "Saved" };
  return (
    <Pressable
      style={[s.placeCard, { backgroundColor: C.card }]}
      onLongPress={onLongPress}
      delayLongPress={500}
    >
      <Image
        source={{ uri: mapboxThumb(place.lng, place.lat) }}
        style={s.placeThumb}
        contentFit="cover"
      />
      <View style={s.placeBody}>
        <Text style={[s.placeTitle, { color: C.text }]} numberOfLines={1}>{place.name}</Text>
        {place.category ? (
          <Text style={[s.placeSub, { color: C.sub }]} numberOfLines={1}>{place.category}</Text>
        ) : null}
        <View style={[s.placeBadge, { backgroundColor: meta.color + "18" }]}>
          <Icon name={meta.icon} size={11} color={meta.color} />
          <Text style={[s.placeBadgeText, { color: meta.color }]}>
            {def?.label ?? (place.list ?? "Saved")}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ── JourneyCard ───────────────────────────────────────────────────────────────

function JourneyCard({ journey, C, onPress, onLongPress }: { journey: SavedJourney; C: ReturnType<typeof makeC>; onPress: () => void; onLongPress: () => void }) {
  const segs     = journey.route?.segments ?? [];
  const date     = new Date(journey.created_at).toLocaleDateString([], { month: "short", day: "numeric" });
  const thumbUri = mapboxJourneyThumb(journey.from_lng, journey.from_lat, journey.to_lng, journey.to_lat);

  return (
    <Pressable
      style={({ pressed }) => [s.journeyCard, { backgroundColor: C.card, opacity: pressed ? 0.9 : 1 }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
    >
      {/* Map thumbnail with from/to pins */}
      <Image source={{ uri: thumbUri }} style={s.journeyThumb} contentFit="cover" />

      <View style={s.journeyBody}>
        {journey.label ? (
          <Text style={[s.journeyLabel, { color: ORANGE }]} numberOfLines={1}>{journey.label}</Text>
        ) : null}

        {/* From / To */}
        <View style={s.journeyRoute}>
          <View style={s.routeDots}>
            <View style={s.dotFrom} />
            <View style={[s.dotLine, { backgroundColor: C.hairline }]} />
            <View style={[s.dotTo, { borderColor: C.sub }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.journeyLeg, { color: C.text }]} numberOfLines={1}>{journey.from_name}</Text>
            <View style={{ height: 10 }} />
            <Text style={[s.journeyLeg, { color: C.sub }]} numberOfLines={1}>{journey.to_name}</Text>
          </View>
        </View>

        {/* Segment chips + duration + date */}
        <View style={s.journeyFooter}>
          <View style={s.journeyChips}>
            {segs.slice(0, 4).map((seg: any, i: number) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                {i > 0 && <Icon name="chevron-forward" size={9} color={C.sub} />}
                {seg.mode === "WALK" ? (
                  <View style={[s.walkChip, { backgroundColor: C.pressed }]}>
                    <Icon name="walk" size={10} color={C.sub} />
                    <Text style={[s.chipText, { color: C.sub }]}>
                      {Math.max(1, Math.round((seg.duration ?? 0) / 60))}m
                    </Text>
                  </View>
                ) : (
                  <View style={[s.busChip, { backgroundColor: ORANGE + "15" }]}>
                    <Text style={[s.chipText, { color: ORANGE }]}>{seg.route_name ?? "Bus"}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.journeyDuration}>{formatDuration(journey.duration)}</Text>
            <Text style={[s.journeyDate, { color: C.sub }]}>{date}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function FavoriteScreen({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const dark = useColorScheme() === "dark";
  const C = makeC(dark);
  const { user, avatarTs } = useAuthStore();
  const { places, journeys, customLists, fetch: fetchSaved, removePlace, removeJourney, addCustomList, removeCustomList } = useSavedStore();
  const setJourney = useJourneyStore((s) => s.setJourney);

  // Custom list input (Android/fallback)
  const [showNewListInput, setShowNewListInput] = useState(false);
  const [newListName, setNewListName]           = useState("");

  useEffect(() => { fetchSaved().catch(() => {}); }, [fetchSaved]);

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  // Only list-type places (not home/work pins)
  const listPlaces = places.filter((p) => p.list !== null && p.pin === null);
  const isEmpty    = listPlaces.length === 0 && journeys.length === 0;

  const confirmRemovePlace = (place: SavedPlace) => {
    Alert.alert(
      "Remove from saved",
      `Remove "${place.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => removePlace(place.id) },
      ]
    );
  };

  const confirmRemoveJourney = (journey: SavedJourney) => {
    const label = journey.label ?? `${journey.from_name} → ${journey.to_name}`;
    Alert.alert(
      "Remove journey",
      `Remove "${label}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => removeJourney(journey.id) },
      ]
    );
  };

  const loadJourneyOnMap = (journey: SavedJourney) => {
    const fromLoc: UnifiedLocation = {
      _type: journey.from_type,
      id:    journey.from_id ?? journey.from_name,
      name:  journey.from_name,
      lat:   journey.from_lat,
      lng:   journey.from_lng,
    };
    
    const toLoc: UnifiedLocation = {
      _type: journey.to_type,
      id:    journey.to_id ?? journey.to_name,
      name:  journey.to_name,
      lat:   journey.to_lat,
      lng:   journey.to_lng,
    };

    setJourney(fromLoc, toLoc, journey.route);
    onClose?.();
  };

  // Navigate to saved-places screen filtered by list
  const viewList = (listKey: string) => {
    router.push({ pathname: "/(account)/saved-places", params: { filter: listKey } } as any);
  };

  const showListOptions = (listKey: string, label: string, count: number, isCustom = false) => {
    const buttons: any[] = [
      { text: `View ${count} place${count !== 1 ? "s" : ""}`, onPress: () => viewList(listKey) },
    ];
    if (isCustom) {
      buttons.push({
        text: "Delete list",
        style: "destructive" as const,
        onPress: () => {
          Alert.alert(`Delete "${label}"?`, "Places in this list won't be deleted, just untagged.", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => removeCustomList(label) },
          ]);
        },
      });
    }
    buttons.push({ text: "Cancel", style: "cancel" as const });
    Alert.alert(label, `${count} place${count !== 1 ? "s" : ""} saved`, buttons);
  };

  const handleNewList = () => {
    if (Platform.OS === "ios") {
      Alert.prompt(
        "New List",
        "Give your list a name",
        (name) => { if (name?.trim()) addCustomList(name.trim()); },
        "plain-text",
        "",
      );
    } else {
      setShowNewListInput(true);
      setNewListName("");
    }
  };

  const submitNewList = () => {
    if (newListName.trim()) addCustomList(newListName.trim());
    setShowNewListInput(false);
    setNewListName("");
  };

  // Combine default + custom list metadata
  const allListMeta = [
    ...DEFAULT_LISTS,
    ...customLists.map((l) => ({
      key:   l,
      label: l,
      icon:  "list-outline" as const,
      color: "#8B5CF6",
    })),
  ];

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={[s.headerTitle, { color: C.text }]}>You</Text>
        <Pressable
          style={[s.iconBtn, { backgroundColor: C.iconBg }]}
          onPress={() => router.push("/(account)/notification-inbox" as any)}
          hitSlop={8}
        >
          <Icon name="notifications-outline" size={20} color={C.text} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
      >
        {/* Mini profile card */}
        <Pressable
          style={[s.profileCard, { backgroundColor: C.card }]}
          onPress={() => router.push("/(account)/profile-details" as any)}
        >
          {user?.avatar ? (
            <Image source={{ uri: `${user.avatar}?_v=${avatarTs}` }} style={s.profileAvatar} contentFit="cover" />
          ) : (
            <View style={[s.profileAvatar, s.profileAvatarFallback]}>
              <Text style={s.profileInitials}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[s.profileName, { color: C.text }]} numberOfLines={1}>{user?.name ?? "—"}</Text>
            <Text style={[s.profileEmail, { color: C.sub }]} numberOfLines={1}>{user?.email ?? ""}</Text>
          </View>
          <Icon name="chevron-forward" size={18} color={C.sub} />
        </Pressable>

        {/* New list button */}
        <Pressable
          style={[s.newListBtn, { backgroundColor: C.pill }]}
          onPress={handleNewList}
        >
          <Icon name="add" size={18} color={ORANGE} />
          <Text style={s.newListText}>New list</Text>
        </Pressable>

        {/* Android inline new-list input */}
        {showNewListInput && (
          <View style={[s.newListInputRow, { backgroundColor: C.card, borderColor: C.hairline }]}>
            <TextInput
              style={[s.newListInput, { color: C.text }]}
              placeholder="List name…"
              placeholderTextColor={C.sub}
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={submitNewList}
            />
            <Pressable onPress={submitNewList} style={[s.newListInputAdd, { backgroundColor: ORANGE }]}>
              <Text style={s.newListInputAddText}>Add</Text>
            </Pressable>
            <Pressable onPress={() => setShowNewListInput(false)} hitSlop={8}>
              <Icon name="close" size={18} color={C.sub} />
            </Pressable>
          </View>
        )}

        {/* Lists card, default + custom */}
        <View style={[s.listsCard, { backgroundColor: C.card }]}>
          {allListMeta.map((item, idx) => {
            const count    = listPlaces.filter((p) => p.list === item.key).length;
            const isCustom = customLists.includes(item.key);
            return (
              <View key={item.key}>
                {idx > 0 && <View style={[s.sep, { backgroundColor: C.hairline }]} />}
                <Pressable
                  style={({ pressed }) => [s.listRow, { backgroundColor: pressed ? C.pressed : "transparent" }]}
                  onPress={() => viewList(item.key)}
                >
                  <View style={[s.listIconWrap, { backgroundColor: item.color + "22" }]}>
                    <Icon name={item.icon} size={18} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.listTitle, { color: C.text }]}>{item.label}</Text>
                    <Text style={[s.listSub, { color: C.sub }]}>{count} place{count !== 1 ? "s" : ""}</Text>
                  </View>
                  <Pressable
                    hitSlop={8}
                    onPress={() => showListOptions(item.key, item.label, count, isCustom)}
                  >
                    <Icon name="ellipsis-horizontal" size={18} color={C.sub} />
                  </Pressable>
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* Saved places, horizontal scroll + "See all" */}
        {listPlaces.length > 0 && (
          <>
            <View style={s.sectionHeader}>
              <Text style={[s.sectionTitle, { color: C.text }]}>Saved places</Text>
              <Pressable onPress={() => router.push("/(account)/saved-places" as any)} hitSlop={8}>
                <Text style={s.seeAll}>See all</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.hScrollContent}
            >
              {listPlaces.slice(0, 12).map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  C={C}
                  onLongPress={() => confirmRemovePlace(place)}
                />
              ))}
            </ScrollView>
          </>
        )}

        {/* Saved journeys */}
        {journeys.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { color: C.text }]}>Saved journeys</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.hScrollContent}
            >
              {journeys.map((journey) => (
                <JourneyCard
                  key={journey.id}
                  journey={journey}
                  C={C}
                  onPress={() => loadJourneyOnMap(journey)}
                  onLongPress={() => confirmRemoveJourney(journey)}
                />
              ))}
            </ScrollView>
          </>
        )}

        {/* Empty state */}
        {isEmpty && (
          <View style={s.emptyState}>
            <Icon name="bookmark-outline" size={56} color={C.sub} />
            <Text style={[s.emptyTitle, { color: C.text }]}>Save places you love</Text>
            <Text style={[s.emptySub, { color: C.sub }]}>
              Tap the bookmark on any stop to save it here.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1 },
  // header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle:   { fontSize: 22, fontWeight: "700", letterSpacing: -0.5 },
  iconBtn:       { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  scrollContent: { paddingHorizontal: 13, gap: 16, paddingBottom: 180 },

  // Profile card
  profileCard:           { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, padding: 5 },
  profileAvatar:         { width: 48, height: 48, borderRadius: 24 },
  profileAvatarFallback: { backgroundColor: ORANGE, justifyContent: "center", alignItems: "center" },
  profileInitials:       { color: "#FFF", fontSize: 17, fontWeight: "700" },
  profileName:           { fontSize: 15, fontWeight: "600" },
  profileEmail:          { fontSize: 13, marginTop: 1 },

  // New list
  newListBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 99 },
  newListText: { fontSize: 15, fontWeight: "600", color: ORANGE },

  // New list input (Android)
  newListInputRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  newListInput:    { flex: 1, fontSize: 15, paddingVertical: 4 },
  newListInputAdd: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99 },
  newListInputAddText: { color: "#FFF", fontSize: 13, fontWeight: "700" },

  // Lists card
  listsCard: { borderRadius: 16, overflow: "hidden" },
  listRow:   { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  listIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  listTitle: { fontSize: 15, fontWeight: "600" },
  listSub:   { fontSize: 12, marginTop: 1 },
  sep:       { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle:  { fontSize: 18, fontWeight: "700", letterSpacing: -0.3 },
  seeAll:        { fontSize: 14, fontWeight: "600", color: ORANGE },
  hScrollContent: { gap: 12, paddingRight: 4 },

  // Place card
  placeCard:      { width: 160, borderRadius: 14, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  placeThumb:     { width: "100%", height: 95 },
  placeBody:      { padding: 10, gap: 4 },
  placeTitle:     { fontSize: 13, fontWeight: "600" },
  placeSub:       { fontSize: 11 },
  placeBadge:     { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99, alignSelf: "flex-start", marginTop: 2 },
  placeBadgeText: { fontSize: 11, fontWeight: "600" },

  // Journey card
  journeyCard:    { width: 250, borderRadius: 16, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  journeyThumb:   { width: "100%", height: 120 },
  journeyBody:    { padding: 12, gap: 8 },
  journeyLabel:   { fontSize: 11, fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase" },
  journeyRoute:   { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  routeDots:      { alignItems: "center", gap: 0, paddingTop: 3 },
  dotFrom:        { width: 8, height: 8, borderRadius: 4, backgroundColor: ORANGE },
  dotLine:        { width: 1.5, height: 18, marginLeft: 3 },
  dotTo:          { width: 8, height: 8, borderRadius: 2, borderWidth: 2, backgroundColor: "transparent" },
  journeyLeg:     { fontSize: 12, fontWeight: "500", lineHeight: 16 },
  journeyFooter:  { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8 },
  journeyChips:   { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 3, flex: 1 },
  journeyDuration:{ fontSize: 15, fontWeight: "700", color: ORANGE, letterSpacing: -0.3 },
  journeyDate:    { fontSize: 10, marginTop: 1 },
  walkChip:       { flexDirection: "row", alignItems: "center", gap: 2, borderRadius: 99, paddingHorizontal: 5, paddingVertical: 2 },
  busChip:        { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  chipText:       { fontSize: 10, fontWeight: "600" },

  // Empty state
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 19, fontWeight: "700" },
  emptySub:   { fontSize: 14, textAlign: "center", maxWidth: 260 },
});
