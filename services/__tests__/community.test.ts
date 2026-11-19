jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { rewardLines, humanizeSlug } from "@/store/rewardStore";
import { streakLine, streakReminderAt } from "../streakReminder";
import { nextStep, resetsIn } from "@/utils/leaderboard";

describe("the thanks after a contribution", () => {
  it("leads with the points, then the streak", () => {
    expect(rewardLines({ points: 10, streak: 4, title: "Review posted" })).toEqual({
      title: "+10 Safiri Points",
      sub: "Review posted · 4-day streak",
    });
  });
  it("says what approval will earn", () => {
    expect(rewardLines({ points: 0, pendingPoints: 50, title: "New stage sent for review" })).toEqual({
      title: "New stage sent for review",
      sub: "+50 Safiri Points once it's approved",
    });
  });
  it("names a new badge, even before its name is loaded", () => {
    expect(rewardLines({ points: 5, badges: ["first_report"] }).title).toBe("New badge: First report");
    expect(rewardLines({ points: 5, badges: ["first_report", "x"] }, "First Alert").title).toBe("New badge: First Alert and 1 more");
    expect(humanizeSlug("city-watchman")).toBe("City watchman");
  });
  it("doesn't call one day a streak", () => {
    expect(rewardLines({ points: 2, streak: 1 }).sub).toBeNull();
  });
});

describe("the streak", () => {
  const at = (h: number) => new Date(2026, 10, 18, h, 0, 0);
  it("reminds at 7 p.m. only when it's worth it", () => {
    expect(streakReminderAt({ streakDays: 5, contributedToday: false, allowed: true, now: at(9) })?.getHours()).toBe(19);
    expect(streakReminderAt({ streakDays: 5, contributedToday: true, allowed: true, now: at(9) })).toBeNull();
    expect(streakReminderAt({ streakDays: 1, contributedToday: false, allowed: true, now: at(9) })).toBeNull();
    expect(streakReminderAt({ streakDays: 5, contributedToday: false, allowed: false, now: at(9) })).toBeNull();
    // Past 7 p.m.: too late tonight.
    expect(streakReminderAt({ streakDays: 5, contributedToday: false, allowed: true, now: at(20) })).toBeNull();
  });
  it("says where it stands", () => {
    expect(streakLine(5, true)).toBe("5-day streak, safe for today");
    expect(streakLine(5, false)).toBe("Keep your 5-day streak going today");
    expect(streakLine(0, false)).toBe("Contribute today to start a streak");
  });
});

describe("the leaderboard's words", () => {
  it("tells you who to pass, by first name", () => {
    expect(nextStep({ rank: 57, points: 120, ahead: { name: "Wanjiru Kamau", points: 132 } }, true)).toBe("13 points to pass Wanjiru");
    expect(nextStep({ rank: 2, points: 14, ahead: { name: "Otieno", points: 15 } }, true)).toBe("2 points to pass Otieno");
  });
  it("cheers the leader and invites newcomers", () => {
    expect(nextStep({ rank: 1, points: 300, ahead: null }, true)).toMatch(/leading this week/);
    expect(nextStep({ rank: null, points: 0, ahead: null }, true)).toBe("One road report puts you on this week's board.");
    expect(nextStep(null, false)).toBe("Your first contribution puts you on the board.");
  });
  it("counts down to Monday", () => {
    const now = Date.parse("2026-11-18T07:00:00Z");
    expect(resetsIn("2026-11-23T00:00:00+03:00", now)).toBe("Resets in 4 days");
    expect(resetsIn("2026-11-18T12:30:00Z", now)).toBe("Resets in 5 h");
    expect(resetsIn("2026-11-18T07:20:00Z", now)).toBe("Resets in 20 min");
    expect(resetsIn(null, now)).toBeNull();
  });
});

describe("your week in the league", () => {
  const { leagueLine } = require("@/utils/leaderboard");
  const me = (zone: string, to_up: number | null, to_safe: number | null) => ({ rank: 5, points: 50, zone, to_up, to_safe });
  it("says what it comes to", () => {
    expect(leagueLine({ joined: false, me: null, next: "Fedha" })).toBe("Score this week to join a group.");
    expect(leagueLine({ joined: true, me: me("up", null, null), next: "Dhahabu" })).toBe("In the promotion zone: hold on to move up to Dhahabu.");
    expect(leagueLine({ joined: true, me: me("safe", 21, null), next: "Dhahabu" })).toBe("21 points to reach the promotion zone.");
    expect(leagueLine({ joined: true, me: me("down", null, 1), next: "Dhahabu" })).toBe("1 point to get out of the drop zone.");
    expect(leagueLine({ joined: true, me: me("safe", null, null), next: null })).toBe("Nyota, the top league: stay out of the drop zone.");
  });
});
