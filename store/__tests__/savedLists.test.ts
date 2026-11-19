jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import {
  BUILT_IN_LISTS,
  allLists,
  cleanListName,
  colorForName,
  listMeta,
  useSavedListsStore,
  type SavedListMeta,
} from "../savedListsStore";

const mine = (key: string, over: Partial<SavedListMeta> = {}): SavedListMeta => ({
  key, name: key, color: "#8B5CF6", icon: "cafe", createdAt: 1, ...over,
});

describe("saved lists", () => {
  beforeEach(() => useSavedListsStore.setState({ custom: [], migrated: false }));

  it("shows the built-ins first, then mine (newest first), then names found on the API", () => {
    const lists = allLists([mine("Coffee", { createdAt: 1 }), mine("Date night", { createdAt: 2 })], ["favorites", "Old list"]);
    expect(lists.map((l) => l.key)).toEqual([
      ...BUILT_IN_LISTS.map((l) => l.key),
      "Date night",
      "Coffee",
      "Old list",
    ]);
  });

  it("gives a list from another phone a stable colour from its name", () => {
    expect(listMeta("Old list", []).color).toBe(colorForName("Old list"));
    expect(colorForName("Old list")).toBe(colorForName("Old list"));
    expect(listMeta("labeled", []).name).toBe("Labelled");
  });

  it("keeps a built-in's name but lets its colour and icon change", () => {
    const { update } = useSavedListsStore.getState();
    update("favorites", { name: "Not allowed", color: "#0EA5E9", icon: "star" });
    const meta = listMeta("favorites", useSavedListsStore.getState().custom);
    expect(meta).toMatchObject({ key: "favorites", name: "Favourites", color: "#0EA5E9", icon: "star", builtIn: true });
    // Still listed once.
    expect(allLists(useSavedListsStore.getState().custom, []).filter((l) => l.key === "favorites")).toHaveLength(1);
  });

  it("refuses a second list with the same name, in any case", () => {
    const { create } = useSavedListsStore.getState();
    expect(create("  Coffee   spots ", "#EF4444", "cafe")?.key).toBe("Coffee spots");
    expect(create("coffee SPOTS", "#EF4444", "cafe")).toBeNull();
    expect(create("favourites", "#EF4444", "cafe")).toBeNull();
    expect(create("   ", "#EF4444", "cafe")).toBeNull();
  });

  it("brings the old list names over once", () => {
    const { migrate } = useSavedListsStore.getState();
    migrate(["Weekend", "favorites", ""]);
    migrate(["Again"]);
    expect(useSavedListsStore.getState().custom.map((l) => l.key)).toEqual(["Weekend"]);
  });

  it("cleans names", () => {
    expect(cleanListName("  a   b ")).toBe("a b");
    expect(cleanListName("x".repeat(80))).toHaveLength(60);
  });
});
