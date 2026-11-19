import {
  cameraFor,
  lightPresetAt,
  modelScaleArr,
  modelScaleAt,
  modelYaw,
  modelsFor,
  sunAt,
  trainCars,
  trainConsist,
  vehicleFor,
} from "../nav3d";

const NAIROBI = { lat: -1.2864, lng: 36.8172 };
// Nairobi is UTC+3 all year.
const eat = (iso: string) => new Date(`${iso}+03:00`);

describe("light for the time of day", () => {
  it("follows the sun in Nairobi", () => {
    expect(lightPresetAt(NAIROBI.lat, NAIROBI.lng, eat("2026-11-18T12:30:00"))).toBe("day");
    expect(lightPresetAt(NAIROBI.lat, NAIROBI.lng, eat("2026-11-18T00:30:00"))).toBe("night");
    expect(lightPresetAt(NAIROBI.lat, NAIROBI.lng, eat("2026-11-18T06:10:00"))).toBe("dawn");
    expect(lightPresetAt(NAIROBI.lat, NAIROBI.lng, eat("2026-11-18T18:40:00"))).toBe("dusk");
    // Daylight from sunrise, not 25 minutes after it.
    expect(lightPresetAt(NAIROBI.lat, NAIROBI.lng, eat("2026-11-18T06:40:00"))).toBe("day");
  });

  it("is the light where the camera looks, not where the phone is", () => {
    // 12:30 in Nairobi is 18:30 in Tokyo's sky: past sunset there.
    const noonNairobi = eat("2026-11-18T12:30:00");
    expect(lightPresetAt(NAIROBI.lat, NAIROBI.lng, noonNairobi)).toBe("day");
    expect(lightPresetAt(35.68, 139.69, noonNairobi)).not.toBe("day");
  });

  it("puts the noon sun high over the equator", () => {
    const { elevation, morning } = sunAt(NAIROBI.lat, NAIROBI.lng, eat("2026-11-18T09:00:00"));
    expect(elevation).toBeGreaterThan(30);
    expect(morning).toBe(true);
  });
});

describe("the vehicle for a leg", () => {
  it("maps each mode to its model", () => {
    expect(vehicleFor("WALK")).toBe("puck");
    expect(vehicleFor("CAR")).toBe("car");
    expect(vehicleFor("MOTORBIKE")).toBe("boda");
    expect(vehicleFor("BICYCLE")).toBe("bicycle");
    expect(vehicleFor("FERRY")).toBe("ferry");
    expect(vehicleFor("RAIL", "SGR-IC")).toBe("train_sgr_loco");
    expect(vehicleFor("RAIL", "NCR-SYO")).toBe("train_commuter");
  });

  it("gives each bus route a stable vehicle, about one in three a nganya", () => {
    expect(vehicleFor("BUS", "46K")).toBe(vehicleFor("BUS", "46K"));
    const ids = Array.from({ length: 300 }, (_, i) => `R${i}`);
    const nganyas = ids.filter((id) => vehicleFor("BUS", id) === "bus").length;
    expect(nganyas).toBeGreaterThan(70);
    expect(nganyas).toBeLessThan(130);
    expect(ids.every((id) => ["bus", "matatu"].includes(vehicleFor("BUS", id)))).toBe(true);
  });

  it("lists every model a journey needs, trains car by car", () => {
    const models = modelsFor([{ mode: "BUS", routeId: "46K" }, { mode: "RAIL", routeId: "SGR-IC" }]);
    expect(models).toEqual(expect.arrayContaining(["puck", "train_sgr_loco", "train_sgr_coach"]));
    expect(trainConsist("NCR-RUI")).toEqual(["train_commuter", "train_commuter"]);
  });
});

describe("drawing", () => {
  it("sizes models with a plain [x, y, z] scale for the zoom (no zoom expression on GeoJSON)", () => {
    const near = modelScaleArr("matatu", 17);
    const far = modelScaleArr("matatu", 14);
    expect(near).toHaveLength(3);
    expect(near[0]).toBe(near[1]);
    expect(far[0]).toBeGreaterThan(near[0]); // zoomed out: drawn larger, same size on screen
    expect(modelScaleArr("puck", 22)[0]).toBe(1); // never below real size
  });

  it("keeps a model the same size on screen, never below real size", () => {
    expect(modelScaleAt("matatu", 17)).toBeCloseTo((58 * 0.597) / 5.5, 3);
    expect(modelScaleAt("matatu", 16)).toBeCloseTo(2 * modelScaleAt("matatu", 17), 3);
    expect(modelScaleAt("matatu", 21)).toBe(1);
  });

  it("turns a bearing into the models' rotation", () => {
    expect(modelYaw(0)).toBe(180);
    expect(modelYaw(270)).toBe(90);
    expect(modelYaw(-90)).toBe(90);
  });

  it("frames trains wider than road vehicles", () => {
    expect(cameraFor("train_sgr_coach").zoom(80)).toBeLessThan(cameraFor("matatu").zoom(80));
    expect(cameraFor("puck").pitch).toBeLessThan(cameraFor("car").pitch);
    // A passenger in a car or on a boda sees further: higher, wider. Transit is unchanged.
    expect(cameraFor("car", true).pitch).toBeLessThan(cameraFor("car").pitch);
    expect(cameraFor("boda", true).zoom(30)).toBeLessThan(cameraFor("boda").zoom(30));
    expect(cameraFor("matatu", true).pitch).toBe(cameraFor("matatu").pitch);
    expect(cameraFor("matatu", true).zoom(30)).toBe(cameraFor("matatu").zoom(30));
  });
});

describe("train cars along the line", () => {
  // A straight line north, 2 km, the user half-way.
  const line = Array.from({ length: 21 }, (_, i) => ({ latitude: -1.3 + i * 0.0009, longitude: 36.8 }));
  const user = { latitude: -1.3 + 10 * 0.0009, longitude: 36.8 };

  it("puts the locomotive ahead, the cars behind it in order, all heading north", () => {
    const cars = trainCars(line, user, trainConsist("SGR-IC"), 15);
    expect(cars.map((c) => c.model)).toEqual(trainConsist("SGR-IC"));
    for (let i = 1; i < cars.length; i++) {
      expect(cars[i].coord[1]).toBeLessThan(cars[i - 1].coord[1]);   // each car south of the one before
    }
    expect(cars[0].coord[1]).toBeGreaterThan(user.latitude);         // the locomotive is ahead of the user
    cars.forEach((c) => expect(Math.min(c.bearing, 360 - c.bearing)).toBeLessThan(1));
  });

  it("turns the second commuter car round", () => {
    const cars = trainCars(line, user, trainConsist("NCR-SYO"), 15);
    expect(cars.map((c) => c.flip)).toEqual([false, true]);
  });
});
