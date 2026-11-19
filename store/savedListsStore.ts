// store/savedListsStore.ts
//
// The user's lists of saved places (KakaoMap's coloured folders, Google
// Maps' "Save to list"). A saved place is a row on the API with a `list`
// name; a place in three lists is three rows. What the API doesn't keep is
// each list's look (colour, icon) and lists that are still empty, so those
// live here, on the phone. A list found on the API with no look here (a new
// phone) gets a colour from its name, so it looks the same everywhere.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Ionicons } from "@expo/vector-icons";

export type ListIcon = keyof typeof Ionicons.glyphMap;

export interface SavedListMeta {
  /** The `list` value on the API: a built-in key, or the list's own name. */
  key: string;
  name: string;
  color: string;
  icon: ListIcon;
  /** Built-in lists can't be renamed or deleted. */
  builtIn?: boolean;
  createdAt: number;
}

export const BUILT_IN_LISTS: SavedListMeta[] = [
  { key: "favorites",    name: "Favourites",   color: "#EF4444", icon: "heart",    builtIn: true, createdAt: 0 },
  { key: "want_to_go",   name: "Want to go",   color: "#10B981", icon: "flag",     builtIn: true, createdAt: 0 },
  { key: "travel_plans", name: "Travel plans", color: "#3B82F6", icon: "airplane", builtIn: true, createdAt: 0 },
  { key: "starred",      name: "Starred",      color: "#F59E0B", icon: "star",     builtIn: true, createdAt: 0 },
];

/** The colours a new list can take (KakaoMap's folder palette, in Navigo's tones). */
export const LIST_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#84CC16", "#10B981", "#14B8A6",
  "#0EA5E9", "#3B82F6", "#6366F1", "#8B5CF6", "#D946EF", "#EC4899",
];

/** The icons a new list can take. */
export const LIST_ICONS: ListIcon[] = [
  "bookmark", "heart", "star", "home", "business", "location", "restaurant",
  "cafe", "cart", "school", "airplane", "bus", "train", "car", "bicycle",
  "walk", "camera", "trophy", "sparkles", "pricetag",
];

/** A stable colour for a list name (lists from the API with no look on this phone). */
export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return LIST_COLORS[h % LIST_COLORS.length];
}

/**
 * The look of any list key: built-in (with the colour and icon chosen on
 * this phone, if any), made on this phone, or found on the API.
 */
export function listMeta(key: string, custom: SavedListMeta[]): SavedListMeta {
  const base = BUILT_IN_LISTS.find((l) => l.key === key);
  const own = custom.find((l) => l.key === key);
  if (base) return own ? { ...base, color: own.color, icon: own.icon } : base;
  return (
    own ??
    // Lists from before this store: "labeled" was a built-in once.
    { key, name: key === "labeled" ? "Labelled" : key, color: colorForName(key), icon: "bookmark", createdAt: 0 }
  );
}

const isBuiltIn = (key: string) => BUILT_IN_LISTS.some((l) => l.key === key);

/**
 * Every list to show: the built-ins, the ones made on this phone, and any
 * other list name the saved places use. Custom lists newest first.
 */
export function allLists(custom: SavedListMeta[], usedKeys: Iterable<string>): SavedListMeta[] {
  const out = BUILT_IN_LISTS.map((l) => listMeta(l.key, custom));
  const seen = new Set(out.map((l) => l.key));
  const mine = custom.filter((l) => !isBuiltIn(l.key)).sort((a, b) => b.createdAt - a.createdAt);
  for (const l of mine) if (!seen.has(l.key)) { out.push(l); seen.add(l.key); }
  for (const k of usedKeys) if (k && !seen.has(k)) { out.push(listMeta(k, custom)); seen.add(k); }
  return out;
}

/** A list name that's free (the API keys custom lists by name). */
export function cleanListName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, 60);
}

interface SavedListsState {
  custom: SavedListMeta[];
  /** Names from the old store (savedStore.customLists), brought over once. */
  migrated: boolean;
  create: (name: string, color: string, icon: ListIcon) => SavedListMeta | null;
  update: (key: string, patch: Partial<Pick<SavedListMeta, "name" | "color" | "icon">>) => void;
  remove: (key: string) => void;
  migrate: (oldNames: string[]) => void;
}

export const useSavedListsStore = create<SavedListsState>()(
  persist(
    (set, get) => ({
      custom: [],
      migrated: false,

      create(name, color, icon) {
        const clean = cleanListName(name);
        if (!clean) return null;
        const taken = [...BUILT_IN_LISTS, ...get().custom].some(
          (l) => l.key.toLowerCase() === clean.toLowerCase() || l.name.toLowerCase() === clean.toLowerCase()
        );
        if (taken) return null;
        const meta: SavedListMeta = { key: clean, name: clean, color, icon, createdAt: Date.now() };
        set((s) => ({ custom: [meta, ...s.custom] }));
        return meta;
      },

      update(key, patch) {
        set((s) => {
          const exists = s.custom.some((l) => l.key === key);
          if (exists) return { custom: s.custom.map((l) => (l.key === key ? { ...l, ...patch } : l)) };
          // A built-in list restyled (its name stays), or a list found on the
          // API styled on this phone for the first time.
          const base = listMeta(key, s.custom);
          const next = isBuiltIn(key)
            ? { ...base, color: patch.color ?? base.color, icon: patch.icon ?? base.icon }
            : { ...base, ...patch, key };
          return { custom: [{ ...next, createdAt: Date.now() }, ...s.custom] };
        });
      },

      remove(key) {
        set((s) => ({ custom: s.custom.filter((l) => l.key !== key) }));
      },

      migrate(oldNames) {
        if (get().migrated) return;
        const have = new Set(get().custom.map((l) => l.key));
        const add = oldNames
          .map(cleanListName)
          .filter((n) => n && !have.has(n) && !BUILT_IN_LISTS.some((b) => b.key === n))
          .map((n, i) => ({ key: n, name: n, color: colorForName(n), icon: "bookmark" as ListIcon, createdAt: Date.now() - i }));
        set((s) => ({ custom: [...s.custom, ...add], migrated: true }));
      },
    }),
    {
      name: "navigo:store:saved-lists",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
