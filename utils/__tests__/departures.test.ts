import { arrivalsStatusCopy, departureMeta } from "../departures";

describe("departureMeta", () => {
  it("uses the scheduled position when known", () => {
    expect(departureMeta({ stops_away: 0 })).toBe("Starts here");
    expect(departureMeta({ stops_away: 1 })).toBe("1 stop away");
    expect(departureMeta({ stops_away: 4 })).toBe("4 stops away");
  });
  it("falls back to the headway for frequency trips", () => {
    expect(departureMeta({ stops_away: null, headway_secs: 900, source: "frequency" })).toBe("Every 15min");
  });
  it("adds crowding only when there is data", () => {
    expect(departureMeta({ stops_away: 2, crowding: "Busy" })).toBe("2 stops away · Busy");
    expect(departureMeta({ stops_away: 2, crowding: null })).toBe("2 stops away");
  });
  it("says nothing rather than invent", () => {
    expect(departureMeta({ stops_away: null, crowding: null })).toBe("");
  });
});

describe("arrivalsStatusCopy", () => {
  it("explains each empty state", () => {
    expect(arrivalsStatusCopy("ended").title).toBe("No more departures today");
    expect(arrivalsStatusCopy("terminates_here").title).toBe("Terminates here");
    expect(arrivalsStatusCopy("not_running_today").title).toBe("Not running today");
    expect(arrivalsStatusCopy(undefined).title).toBe("No timetable yet");
  });
});
