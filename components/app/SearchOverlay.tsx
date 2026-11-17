import { JSX } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { Icon } from "@/components/icons/Icon";
import { StopTypeBadge } from "@/components/app/StopTypeBadge";

const BLACK = "#000000";

interface SearchOverlayProps {
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  searchQ: string;
  setSearchQ: (q: string) => void;
  searchResults: any[];
  onSelect: (stop: any) => void;
  getDistanceText: (stop: any) => string | null;
}

export default function SearchOverlay({
  searchOpen,
  setSearchOpen,
  searchQ,
  setSearchQ,
  searchResults,
  onSelect,
  getDistanceText,
}: SearchOverlayProps): JSX.Element | null {
  if (!searchOpen) return null;

  return (
    <>
      <Pressable style={styles.backdrop} onPress={() => setSearchOpen(false)} />
      <View style={styles.searchCard}>
        <View style={styles.searchRow}>
          <Icon name="search-outline" size={18} color={BLACK} />
          <TextInput
            autoFocus
            placeholder="Search stops"
            placeholderTextColor="#9CA3AF"
            value={searchQ}
            onChangeText={setSearchQ}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {searchQ.length > 0 && (
            <Pressable onPress={() => setSearchQ("")} hitSlop={8}>
              <Icon name="close-circle-outline" size={18} color="#6B7280" />
            </Pressable>
          )}
        </View>

        <ScrollView style={{ maxHeight: 260 }}>
          {searchResults.length === 0 ? (
            <Text style={[styles.sub, { paddingVertical: 8 }]}>No results</Text>
          ) : (
            searchResults.map((s) => (
              <Pressable
                key={s.id}
                style={styles.searchResult}
                onPress={() => onSelect(s)}
              >
                <StopTypeBadge stop={s as any} size={22} />
                <Text style={{ color: BLACK, flex: 1 }} numberOfLines={1}>
                  {s.name}
                </Text>
                {getDistanceText(s) && (
                  <Text style={{ color: "#6B7280", marginLeft: 8 }}>
                    {getDistanceText(s)}
                  </Text>
                )}
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17,24,39,0.15)",
  },
  searchCard: {
    position: "absolute",
    top: 88,
    right: 72,
    width: 280,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 10,
    zIndex: 10,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: { flex: 1, color: BLACK, paddingVertical: 0 },
  searchResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  sub: { color: "#6B7280", textAlign: "left" },
});
