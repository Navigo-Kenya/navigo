jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import type { SavedPlace } from "@/services/user";
import { groupPlaces, listMapUrl, pinName, sortPlaces } from "../savedPlaces";

const row = (id: number, list: string, name: string, at: string, extra: Partial<SavedPlace> = {}): SavedPlace => ({
  id, name, list, lat: -1.26 - id / 1000, lng: 36.8, type: "location", place_id: `p-${name}`, pin: null,
  category: null, note: null, created_at: at, ...extra,
});

describe("a saved list", () => {
  const rows = [
    row(1, "favorites", "Sarit Centre", "2026-11-01T10:00:00Z"),
    row(2, "want_to_go", "Sarit Centre", "2026-11-10T10:00:00Z"),
    row(3, "favorites", "Java Kimathi", "2026-11-05T10:00:00Z"),
    row(4, "favorites", "Home", "2026-11-06T10:00:00Z", { pin: "home", list: null }),
  ];

  it("shows a place once in All, with every list it's in", () => {
    const all = groupPlaces(rows, [], null);
    expect(all.map((i) => i.place.name)).toEqual(["Sarit Centre", "Java Kimathi"]);
    expect(all[0].lists.map((l) => l.key)).toEqual(["want_to_go", "favorites"]);
    expect(all[0].rows).toHaveLength(2);
  });

  it("narrows to one list, and leaves Home out", () => {
    expect(groupPlaces(rows, [], "favorites").map((i) => i.place.id)).toEqual([3, 1]);
  });

  it("sorts by name and by distance", () => {
    const items = groupPlaces(rows, [], null);
    expect(sortPlaces(items, "name", null).map((i) => i.place.name)).toEqual(["Java Kimathi", "Sarit Centre"]);
    const nearJava = { lat: -1.263, lng: 36.8 };
    expect(sortPlaces(items, "nearest", nearJava)[0].place.name).toBe("Java Kimathi");
  });

  it("draws one map of the whole list, stages in blue", () => {
    const url = listMapUrl([{ lat: -1.26, lng: 36.8, type: "location" }, { lat: -1.28, lng: 36.82, type: "stop" }], "#EF4444", false, "tok")!;
    expect(url).toContain("pin-s+ef4444(36.80000,-1.26000)");
    expect(url).toContain("pin-s+2563eb(36.82000,-1.28000)");
    expect(url).toContain("/auto/");
    expect(listMapUrl([{ lat: -1.26, lng: 36.8, type: "location" }], "#EF4444", true, "tok")).toContain("dark-v11/static/pin-s+ef4444(36.80000,-1.26000)/36.80000,-1.26000,14/");
    expect(listMapUrl([], "#EF4444", false, "tok")).toBeNull();
  });
});

describe("setting Home on the map", () => {
  const sarit = { name: "Sarit Centre", lat: -1.2614, lng: 36.802 };
  it("keeps the place's name while the pin is nudged onto the gate", () => {
    expect(pinName(sarit, { lat: -1.2616, lng: 36.802 }, "Karuna Rd")).toBe("Sarit Centre");
  });
  it("takes the address once the pin is somewhere else", () => {
    expect(pinName(sarit, { lat: -1.27, lng: 36.802 }, "Waiyaki Way")).toBe("Waiyaki Way");
    expect(pinName(null, { lat: -1.27, lng: 36.80201 }, null)).toBe("-1.27000, 36.80201");
  });
});
