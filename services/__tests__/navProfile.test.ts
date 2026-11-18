import { journeyModeOf, legKind, legProfile, pickReroute, preferenceOf, roleFor } from "../navProfile";

const drivers = { carRole: "driver", bodaRole: "passenger" } as const;
const passengers = { carRole: "passenger", bodaRole: "driver" } as const;

describe("leg kind and role", () => {
  it("comes from the planned mode", () => {
    expect(legKind("WALK")).toBe("walk");
    expect(legKind("BICYCLE")).toBe("bicycle");
    expect(legKind("CAR")).toBe("car");
    expect(legKind("MOTORBIKE")).toBe("motorbike");
    expect(legKind("BUS")).toBe("transit");
    expect(legKind("RAIL")).toBe("transit");
    expect(legKind(null)).toBe("walk");
  });

  it("walking and cycling are always in control, transit never", () => {
    expect(roleFor("walk", passengers)).toBe("driver");
    expect(roleFor("bicycle", passengers)).toBe("driver");
    expect(roleFor("transit", drivers)).toBe("passenger");
  });

  it("car and boda follow the user's choice", () => {
    expect(roleFor("car", drivers)).toBe("driver");
    expect(roleFor("car", passengers)).toBe("passenger");
    expect(roleFor("motorbike", drivers)).toBe("passenger"); // default: the boda passenger
    expect(roleFor("motorbike", passengers)).toBe("driver");
  });
});

describe("leg profile", () => {
  it("a driver hears the turns and is told to U-turn", () => {
    const p = legProfile("CAR", drivers);
    expect(p).toMatchObject({ turns: true, voiceTurns: true, reroute: true, silentReroute: false, wrongWay: "u-turn", showTheRider: false });
  });

  it("a car passenger is kept informed, quietly", () => {
    const p = legProfile("CAR", passengers);
    expect(p).toMatchObject({ turns: true, voiceTurns: false, reroute: true, silentReroute: true, wrongWay: "heading-away" });
  });

  it("a boda passenger gets the rider card and a buzz before each turn", () => {
    const p = legProfile("MOTORBIKE", drivers);
    expect(p).toMatchObject({ role: "passenger", showTheRider: true, hapticTurns: true, voiceTurns: false, silentReroute: true });
  });

  it("walking and cycling turn around; matatus don't reroute", () => {
    expect(legProfile("WALK", drivers)).toMatchObject({ voiceTurns: true, hapticTurns: true, wrongWay: "turn-around", reroute: true });
    expect(legProfile("BICYCLE", drivers).wrongWayMinSpeed).toBeGreaterThan(legProfile("WALK", drivers).wrongWayMinSpeed);
    expect(legProfile("BUS", drivers)).toMatchObject({ turns: false, reroute: false, wrongWay: null });
  });
});

describe("rerouting keeps the trip's mode and preference", () => {
  it("maps the route's category to the planner mode", () => {
    expect(journeyModeOf({ category: "car", segments: [] })).toBe("car");
    expect(journeyModeOf({ category: "motorbike", segments: [] })).toBe("motorbike");
    expect(journeyModeOf({ category: "bicycle", segments: [] })).toBe("bicycle");
    expect(journeyModeOf({ category: "walk", segments: [] })).toBe("walk");
    expect(journeyModeOf({ category: "bus", segments: [] })).toBe("bus");
    expect(journeyModeOf({ category: "rail", segments: [] })).toBe("rail");
    expect(journeyModeOf({ category: "mixed", segments: [] })).toBe("transit");
    // Older payloads without a category: a single street leg tells.
    expect(journeyModeOf({ segments: [{ mode: "CAR" }] } as any)).toBe("car");
    expect(journeyModeOf({ segments: [{ mode: "WALK" }, { mode: "BUS" }] } as any)).toBe("transit");
  });

  it("keeps No tolls, Safest, Step-free…; fastest is not a preference", () => {
    expect(preferenceOf({ route_options: ["no_tolls"] })).toBe("no_tolls");
    expect(preferenceOf({ route_options: ["fastest", "safest"] })).toBe("safest");
    expect(preferenceOf({ route_options: ["alternative_1"] })).toBeNull();

    const routes = [{ route_options: ["fastest"] }, { route_options: ["no_tolls"] }];
    expect(pickReroute(routes, { route_options: ["no_tolls"] })).toBe(routes[1]);
    expect(pickReroute(routes, { route_options: ["alternative_2"] })).toBe(routes[0]);
    expect(pickReroute(routes, { route_options: ["flattest"] })).toBe(routes[0]); // not offered from here
    expect(pickReroute([], { route_options: ["no_tolls"] })).toBeNull();
  });
});
