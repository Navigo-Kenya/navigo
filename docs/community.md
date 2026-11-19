# Community: alerts on your roads, leagues, streaks

Status: proposal, for discussion. Nothing in it is built except where "today" says so.

## Today

- **Contributions:** delay reports, stage reviews, photos and edits, new stages, route corrections. Each earns points and some are auto-approved (`ContributionService`).
- **Road reports:** jams, accidents, blocked roads, stage queues, police checks, floods, breakdowns, security, fare hikes (`TransitReport`). They expire, are voted up or down, and are dismissed by the community. TomTom incidents are shown beside them.
- **22 badges and 7 levels:** Commuter, Explorer, Safiri Guide, Transit Expert, Matatu Master, Route Pioneer, Community Elder.
  - The badges are now drawn by Navigo in five tiers named in Swahili: Shaba (copper), Fedha (silver), Dhahabu (gold), Almasi (diamond), Nyota (star).
  - Exact progress comes from `/user/community/stats`.
- **Leaderboards:** all time and this week, top 20, plus the user's own rank.
- **Streak:** consecutive days with a contribution (`streak_days`, `last_contribution_at`).
- **Push:** Expo, through `SendPushNotificationJob`, which follows each user's settings. There's a 6 a.m. morning briefing.

## 1. Alerts on the roads you use, or are about to use

Waze tells drivers about the road they're on now. Navigo can do more: it knows the matatu you take every morning before you leave home.

### Your roads ("corridors")

| Source | How the road is known | Active when |
|---|---|---|
| A saved route | Its geometry | Its usual departure time, ±1 h |
| Home ↔ Work | The best route between them | Weekday mornings and evenings, from the trips taken |
| Trips taken with Navigo | `journey_logs`: kept when taken 3+ times in 4 weeks | The hours they're usually taken |
| A trip planned for today | The route picked, with "Leave at" or the best time to leave | From 2 h before until the trip |
| The trip in progress | Live, in-app (navigation, not push) | Now |

Each corridor is stored once, server side: a simplified line with a 150 m buffer and its time windows (`user_corridors`). The user can see and delete them, and they're never shared. A new setting, "Reports on my roads", is on for people who saved a route or Home/Work. It's added to the settings only once the sender exists, like every other setting now.

### When to alert: smart, not loud

- **Only when the report is trusted:** one confirmation, or a reporter at level 4 or above, or a TomTom incident marked major. A lone, unconfirmed jam never wakes anyone.
- **Only when it matters:**
  - Accident, blocked road, flood, security: push.
  - Jam or queue: push only when it adds 10 min or more to the usual time. Otherwise it waits in the app for the next time the user opens it.
- **Only in the window:** a Mombasa Road accident at 14:00 doesn't reach someone who uses Mombasa Road at 07:30. If it's still there at 06:45 the next day, it does.
- **With something to do about it:**
  - "Accident on Mombasa Rd near GM. Your 07:30 trip is about 15 min slower. Leave at 07:10, or take the SGR feeder."
  - This builds on the best time to leave (#28).
- **Rationed:**
  - At most one push per corridor per 30 min, and 3 a day.
  - Several reports become one push: "2 reports on your way to work".
  - Quiet hours: 21:00 to 05:30.
- **Closed:** "Cleared: Mombasa Rd is moving again", only to those who got the first alert.
- **Waze's best habit:** while you navigate past a report, a "Still there?" card with two big buttons. One tap confirms it or clears it, which keeps the map honest and is also the cheapest useful action for a streak (section 3).

### Sketch

- **API:**
  - `user_corridors` (PostGIS buffered line, windows, source).
  - A nightly `CorridorBuilder` from `journey_logs` and saved routes.
  - `MatchReportToCorridors` runs when a report becomes trusted (`ST_Intersects` with the buffers, then the window and severity rules), then `SendPushNotificationJob` with a new `route_reports` setting.
- **App:**
  - A "Your roads" list in Settings, to see and delete them.
  - The inbox groups the alerts per corridor.
  - The "Still there?" card in navigation.

## 2. Leaderboards, from a list to a league

- **Weekly leagues:** groups of about 30 people of similar activity, named after the badge tiers (Shaba League up to Nyota League). Every Monday at 00:00 Nairobi time, the top 7 go up and the bottom 5 go down.
  - Everyone has a race they can win, instead of a top 20 nobody new ever reaches.
- **Boards that mean something locally:**
  - Your estate or ward ("Top reporters in Kasarani").
  - Your line ("The 45K crew"): the people who keep your commute honest.
  - Your SACCO's riders, which the console can show to the SACCO.
  - Friends, opt-in from contacts.
- **Seasons:** a theme a month, for example "Long rains: floods count double", with a season badge.
- **Points for usefulness, not volume:**
  - A report someone confirms is worth more than one nobody saw.
  - Repeats on the same spot within 30 min earn nothing.
  - Dismissed reports cost points.
  - A trust score raises or lowers how much a person's reports count.
- **A screen worth opening:**
  - A podium for the top 3.
  - Your row pinned, with an arrow for movement since yesterday.
  - The league's countdown to Monday.
  - Who's just above you and by how much ("12 points to pass Wanjiru").
- **Rewards people want:**
  - Avatar frames.
  - Skins for your matatu in 3D navigation, in nganya art painted by Kenyan artists. Navigo can offer this and Google can't.
  - Later, partner rewards (airtime, fares), once budget and terms allow.
- **A weekly recap card to share:** "This week you saved 3 people from the Thika Road jam".

## 3. Streaks that keep people coming back daily

- **What counts as a day:** any useful act. That's a trip with Navigo (at least 1 km navigated, or a planned trip taken), a "Still there?" answer, a vote on a report, or a contribution. A commuter keeps it just by commuting.
- **A commuter's week:** weekends don't break it unless the user wants a 7-day streak. Most matatu riders don't ride on Sunday, and a streak lost on a rest day feels unfair.
- **Freezes:** one earned for every 7 days, up to 2 held, used automatically on a missed day.
- **Milestones:** 7, 30, 100 and 365 days, each a badge in a new flame-shaped streak family.
- **One reminder, and only if the streak is at risk:**
  - Sent at the user's usual commute time, never after 20:00.
  - It has its own setting.
  - It carries one thing to do: "1 tap keeps your 12-day streak: is the jam on Waiyaki Way still there?"
- **Daily quests (up to 3):** "Confirm a report on your route", "Rate today's ride", "Add a photo of your stage". Each is worth points and is something that helps someone else.
- **What it needs:** `last_active_at`, plus the trips counted per day (`journey_logs` has them). `streak_days` then counts active days, not only contribution days.

## Order

1. Corridors and "Reports on my roads": the most value, and it makes the reports matter.
2. "Still there?" in navigation, and streaks counted on activity, with the at-risk reminder.
3. Leagues and the local boards (estate, line).
4. Seasons, recap cards, matatu skins.

## How we'll know

- **Health:** retention at day 1, 7 and 30; weekly active contributors; how fast a report gets its first confirmation; the share of pushes opened.
- **The guardrail:** the opt-out rate per notification type. If people turn "Reports on my roads" off, the rules are too loud.
