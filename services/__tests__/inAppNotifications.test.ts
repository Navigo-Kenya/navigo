import { ago, bannerView, kindOf, sectionOf, statusLine, type InAppItem } from "../inAppNotifications";

const item = (id: string, kind: InAppItem["kind"]): InAppItem => ({ id, kind, title: id, body: "", screen: null, at: 0 });

describe("notifications in the app", () => {
  it("sorts each type into a kind", () => {
    expect(kindOf("alight_warning")).toBe("trip");
    expect(kindOf("disruptions")).toBe("transit");
    expect(kindOf("points_earned")).toBe("community");
    expect(kindOf("app_news")).toBe("navigo");
    expect(kindOf("something_new")).toBe("navigo");
    expect(kindOf(null)).toBe("navigo");
  });

  it("speaks time like Snapchat", () => {
    const now = Date.parse("2026-11-18T12:00:00Z");
    expect(ago("2026-11-18T11:59:40Z", now)).toBe("now");
    expect(ago("2026-11-18T11:57:00Z", now)).toBe("3m");
    expect(ago("2026-11-18T10:00:00Z", now)).toBe("2h");
    expect(ago("2026-11-14T12:00:00Z", now)).toBe("4d");
    expect(ago("2026-10-28T12:00:00Z", now)).toBe("3w");
  });

  it("reads new and opened", () => {
    const now = Date.parse("2026-11-18T12:00:00Z");
    expect(statusLine("transit", true, "2026-11-18T11:57:00Z", now)).toBe("New alert · 3m");
    expect(statusLine("community", true, "2026-11-18T11:57:00Z", now)).toBe("New points · 3m");
    expect(statusLine("transit", false, "2026-11-18T10:00:00Z", now)).toBe("Opened · 2h");
  });

  it("groups by day", () => {
    const now = new Date(2026, 10, 18, 12);
    expect(sectionOf(new Date(2026, 10, 18, 8).toISOString(), now)).toBe("Today");
    expect(sectionOf(new Date(2026, 10, 15, 8).toISOString(), now)).toBe("This week");
    expect(sectionOf(new Date(2026, 10, 1, 8).toISOString(), now)).toBe("Earlier");
  });

  it("shows one card at a time, and sums up a pile", () => {
    expect(bannerView([])).toBeNull();
    expect(bannerView([item("a", "trip"), item("b", "transit")])).toEqual({ mode: "one", item: item("a", "trip") });
    expect(bannerView([item("a", "community"), item("b", "transit"), item("c", "community")])).toMatchObject({
      mode: "many",
      count: 3,
      kinds: ["transit", "community"],
    });
  });
});
