import { HapticGate, INFO_GAP_MS, P, VoiceQueue, alightCue, alightText, arrivalText, sideOfWay } from "../navAlerts";
import { splitInstruction } from "../maneuvers";

/** A fake speaker: records what's said; `finish()` ends the current line. */
function harness() {
  let t = 0;
  const spoken: string[] = [];
  let done: (() => void) | null = null;
  const stops: number[] = [];
  const q = new VoiceQueue(
    {
      speak: (text, onDone) => { spoken.push(text); done = onDone; },
      stop: () => { stops.push(t); },
    },
    () => t,
  );
  return {
    q,
    spoken,
    stops,
    finish: () => { const d = done; done = null; d?.(); },
    advance: (ms: number) => { t += ms; },
  };
}

describe("the navigation voice", () => {
  it("says each key once", () => {
    const h = harness();
    expect(h.q.say({ key: "t:1:near", text: "In 300 metres, turn left", priority: P.normal })).toBe(true);
    h.finish();
    expect(h.q.say({ key: "t:1:near", text: "In 300 metres, turn left", priority: P.normal })).toBe(false);
    expect(h.spoken).toEqual(["In 300 metres, turn left"]);
  });

  it("lets a turn cut into a landmark, never the reverse", () => {
    const h = harness();
    h.advance(INFO_GAP_MS + 1);
    h.q.say({ key: "lm:1", text: "Passing Naivas, on your left.", priority: P.info });
    h.q.say({ key: "t:2:now", text: "Turn right onto Moi Avenue", priority: P.high });
    expect(h.stops).toHaveLength(1);
    expect(h.spoken).toEqual(["Passing Naivas, on your left.", "Turn right onto Moi Avenue"]);
    // A landmark while the turn speaks waits for nobody: it's dropped.
    expect(h.q.say({ key: "lm:2", text: "Passing Total.", priority: P.info })).toBe(false);
  });

  it("drops a cue that waited past its use", () => {
    const h = harness();
    h.q.say({ key: "a", text: "Get off in 2 stops.", priority: P.normal });
    h.q.say({ key: "t:3:near", text: "In 200 metres, turn left", priority: P.normal, ttlMs: 3_000 });
    h.advance(5_000);
    h.finish();
    expect(h.spoken).toEqual(["Get off in 2 stops."]);
  });

  it("keeps chatter for quiet moments", () => {
    const h = harness();
    h.q.say({ key: "t:1:now", text: "Turn left", priority: P.high });
    h.finish();
    h.advance(2_000);
    expect(h.q.say({ key: "stop:1", text: "Now passing Kencom.", priority: P.info })).toBe(false);
    h.advance(INFO_GAP_MS);
    expect(h.q.say({ key: "stop:2", text: "Now passing Odeon.", priority: P.info })).toBe(true);
  });

  it("forgets what's waiting for a turn that's behind", () => {
    const h = harness();
    h.q.say({ key: "g1:a", text: "First.", priority: P.normal });
    h.q.say({ key: "g1:turn:0:4:near", text: "Stale turn.", priority: P.normal });
    h.q.forget("g1:turn:0:4");
    h.finish();
    expect(h.spoken).toEqual(["First."]);
  });

  it("stops at once when cleared", () => {
    const h = harness();
    h.q.say({ key: "a", text: "Something.", priority: P.normal });
    h.q.say({ key: "b", text: "Next.", priority: P.normal });
    h.q.clear();
    h.finish();
    expect(h.spoken).toEqual(["Something."]);
    expect(h.q.pending).toBe(0);
  });
});

describe("buzzes", () => {
  it("skips a second buzz within 1.5 s unless it's critical", () => {
    let t = 0;
    const g = new HapticGate(() => t);
    expect(g.allow(P.normal)).toBe(true);
    t = 800;
    expect(g.allow(P.high)).toBe(false);
    expect(g.allow(P.critical)).toBe(true);
    t = 2_500;
    expect(g.allow(P.normal)).toBe(true);
  });
});

describe("getting off", () => {
  it("warns twice, not three times", () => {
    expect(alightCue(3, null, 0, 0)).toBeNull();
    expect(alightCue(2, null, 0, 0)).toBe("soon");
    expect(alightCue(2, "soon", 0, 10_000)).toBeNull();
    expect(alightCue(1, "soon", 0, 60_000)).toBe("next");
    // The stop comes 30 s after "next stop": nothing more to say.
    expect(alightCue(0, "next", 60_000, 90_000)).toBeNull();
    // A long stretch since the last warning: "get off here".
    expect(alightCue(0, "next", 60_000, 200_000)).toBe("now");
  });

  it("joins a ride late without missing the next stop", () => {
    expect(alightCue(1, null, 0, 0)).toBe("next");
    expect(alightCue(0, null, 0, 0)).toBe("now");
  });

  it("says where", () => {
    expect(alightText("soon", "Kencom", null)).toBe("Get off in 2 stops at Kencom.");
    expect(alightText("next", "Kencom", "after Hilton")).toBe("Get off at the next stop, Kencom, after Hilton.");
    expect(alightText("now", null, null)).toBe("Get off here.");
  });
});

describe("arriving", () => {
  // Heading north up Moi Avenue.
  const a = { lat: -1.2850, lng: 36.8240 };
  const b = { lat: -1.2840, lng: 36.8240 };
  it("tells which side the destination is on", () => {
    expect(sideOfWay(a, b, { lat: -1.2840, lng: 36.8238 })).toBe("left");
    expect(sideOfWay(a, b, { lat: -1.2840, lng: 36.8242 })).toBe("right");
    expect(sideOfWay(a, b, { lat: -1.2839, lng: 36.82401 })).toBeNull();
    expect(sideOfWay(a, a, { lat: -1.2840, lng: 36.8238 })).toBeNull();
  });
  it("words it", () => {
    expect(arrivalText("Sarit Centre", "right")).toBe("You've arrived. Sarit Centre is on your right.");
    expect(arrivalText("Sarit Centre", null)).toBe("You've arrived at Sarit Centre.");
  });
});

describe("the banner's words", () => {
  it("puts the street first", () => {
    expect(splitInstruction("Turn left onto Kimathi St, after Java House", "after Java House"))
      .toEqual({ verb: "Turn left onto", street: "Kimathi St", landmark: "after Java House" });
    expect(splitInstruction("Head north on Kenyatta Avenue"))
      .toEqual({ verb: "Head north on", street: "Kenyatta Avenue", landmark: null });
    expect(splitInstruction("Turn right to stay on Moi Avenue").street).toBe("Moi Avenue");
    expect(splitInstruction("Walk to Kencom").street).toBe("Kencom");
    expect(splitInstruction("Arrive at Sarit Centre").street).toBe("Sarit Centre");
  });
  it("keeps a bare instruction whole", () => {
    expect(splitInstruction("Turn left.")).toEqual({ verb: "Turn left", street: null, landmark: null });
    expect(splitInstruction("Board Line 45K at Kencom").street).toBeNull();
  });
});

describe("the banner's distance", () => {
  // Imported here so the component's helpers are tested without rendering it.
  const { bannerDistance } = require("@/components/app/NavBanner");
  it("rounds like Google Maps", () => {
    expect(bannerDistance(9)).toBe("Now");
    expect(bannerDistance(74)).toBe("70 m");
    expect(bannerDistance(337)).toBe("350 m");
    expect(bannerDistance(1240)).toBe("1.2 km");
    expect(bannerDistance(12_600)).toBe("13 km");
  });
  it("speaks miles when asked", () => {
    expect(bannerDistance(90, "mi")).toBe("300 ft");
    expect(bannerDistance(2400, "mi")).toBe("1.5 mi");
  });
});
