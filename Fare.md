# Navigo Fare System

Complete reference for how fares are determined, resolved, modified, and displayed
across the Navigo stack.

---

## 1. Overview

Fares are resolved **server-side** on every journey calculation request. The backend
looks up pricing from the database, applies any active time-based modifiers, and
returns a `fare` object per transit segment. The mobile app consumes this directly —
there is no client-side fare formula.

```
User requests journey
        │
        ▼
POST /api/v1/journey/calculate
        │
        ▼
TransitEngineService::findJourney()
  ├── Calls OTP → parses itinerary legs
  ├── Each transit leg captures: route_id, agency_id (from DB Route model)
  └── FareService::resolveItineraryFares()
        ├── Priority 1: route flat fare  → confidence "exact"
        ├── Priority 2: zone-pair fare   → confidence "zone"
        ├── Priority 3: zone+route combo → confidence "zone"
        └── Apply FareModifiers (multipliers → surcharges → round to nearest 5 KES)
        ▼
Each segment in response gets:
  fare: { amount: 70, currency: "KES", confidence: "exact" } | null
        │
        ▼
Mobile app: extractFares(segments) → FareResult
  ├── found: true  → show fare in search card + JourneyDetailsSheet
  └── found: false → show "No fare info for this route"
```

---

## 2. Database Schema

All fare tables live in `navigo-api`. Migrations are in `database/migrations/`.

### `fare_zones`
Drawn in the console's Zone Designer (Mapbox polygon draw tool).

| Column         | Type                  | Notes                              |
|----------------|-----------------------|------------------------------------|
| `id`           | int PK                |                                    |
| `zone_id`      | string UNIQUE         | e.g. `ZONE_ABC123`                 |
| `name`         | string                | Human-readable label               |
| `agency_id`    | string FK → agencies  |                                    |
| `color`        | char(6)               | Hex for map visualisation          |
| `zone_polygon` | geometry(Polygon,4326)| PostGIS; GIST-indexed              |

### `fare_attributes`
The price record. One per fare ID.

| Column              | Type          | Notes                                        |
|---------------------|---------------|----------------------------------------------|
| `id`                | int PK        |                                              |
| `fare_id`           | string UNIQUE | e.g. `FARE_ROUTE_101`, `FARE_ABCDEFGH`       |
| `price`             | decimal(10,2) | Base price in `currency_type`                |
| `currency_type`     | string(10)    | Default `KES`                                |
| `payment_method`    | tinyint       | 0 = on board, 1 = before boarding            |
| `transfers`         | tinyint NULL  | 0/1/2 = allowed transfers; NULL = unlimited  |
| `transfer_duration` | int NULL      | Seconds within which transfers are free      |
| `agency_id`         | string FK     |                                              |

### `fare_rules`
Links a `fare_id` to a route and/or zone pair. Multiple rules can share a `fare_id`.

| Column           | Type        | Notes                                          |
|------------------|-------------|------------------------------------------------|
| `id`             | int PK      |                                                |
| `fare_id`        | string FK   | → `fare_attributes.fare_id`                    |
| `route_id`       | string NULL | GTFS route_id; NULL = applies to any route     |
| `origin_id`      | string NULL | `zone_id` of boarding zone                     |
| `destination_id` | string NULL | `zone_id` of alighting zone                    |
| `contains_id`    | string NULL | zone_id that the trip must pass through (GTFS) |

**Route flat fare** = row where `route_id IS NOT NULL AND origin_id IS NULL AND destination_id IS NULL`.
**Zone-pair fare** = row where `origin_id + destination_id` are set.

### `fare_modifiers`
Dynamic adjustments layered on top of the base fare.

| Column          | Type          | Notes                                        |
|-----------------|---------------|----------------------------------------------|
| `id`            | int PK        |                                              |
| `name`          | string        | Human label, e.g. "Morning peak"             |
| `type`          | string(50)    | `weather` `event` `peak_hours` `day_of_week` |
| `applies_to`    | string(50)    | `all` `agency` `route` `zone`                |
| `applies_to_id` | string NULL   | Scopes modifier to a specific entity         |
| `multiplier`    | decimal(5,4)  | e.g. `1.25` = +25%. Applied before surcharge |
| `fixed_surcharge`| decimal(10,2)| e.g. `20.00` KES added after multiplier      |
| `condition_data`| jsonb NULL    | Time/day conditions (see §4)                 |
| `is_active`     | boolean       | Master on/off switch                         |
| `start_at`      | timestamp NULL| Optional validity window start               |
| `end_at`        | timestamp NULL| Optional validity window end                 |

---

## 3. Resolution Algorithm

**File:** `navigo-api/app/Services/FareService.php`

For each transit segment, `resolveSegmentFare()` runs these checks in order and
stops at the first match:

```
1. Route flat fare
   fare_rules WHERE route_id = $routeId
     AND origin_id IS NULL AND destination_id IS NULL
   → confidence: "exact"

2. Zone-pair fare
   Origin zone  = PostGIS ST_Contains(zone_polygon, boarding lat/lng)
   Dest zone    = PostGIS ST_Contains(zone_polygon, alighting lat/lng)
   fare_rules WHERE origin_id = $originZone AND destination_id = $destZone
   (also tries reversed pair)
   → confidence: "zone"

3. Zone + route combo
   fare_rules WHERE route_id = $routeId
     AND (origin_id = $originZone OR destination_id = $destZone)
   → confidence: "zone"

4. No match → fare: null
```

Zone resolution uses raw boarding/alighting coordinates from the OTP leg — no
stop migration required.

After a base price is found, **all matching active modifiers** are applied:

```
price = base_price
for each modifier where multiplier IS NOT NULL:   price *= multiplier
for each modifier where fixed_surcharge IS NOT NULL: price += fixed_surcharge
return round(price / 5) * 5    ← nearest 5 KES
```

Multipliers run before surcharges (same order as the console Preview). Active
modifier records are **cached for 60 seconds** so console changes propagate
within one minute without clearing the OTP route cache.

---

## 4. Modifier Condition Data

The `condition_data` JSON field contains time/day constraints evaluated at
departure time (Africa/Nairobi timezone).

### `peak_hours`
```json
{ "from": "07:00", "to": "09:30", "days": ["Mon","Tue","Wed","Thu","Fri"] }
```
`days` is optional (matches all days if absent). `from`/`to` are 24-hour HH:MM.

### `day_of_week`
```json
{ "days": ["Sat","Sun"] }
```
Day abbreviations match PHP `Carbon::format('D')`: `Mon Tue Wed Thu Fri Sat Sun`.

### `weather` / `event`
`condition_data` is not evaluated programmatically yet — these types match on
scope (`applies_to` / `applies_to_id`) only. Time-window (`start_at`/`end_at`)
is still enforced.

---

## 5. OTP Integration Point

**File:** `navigo-api/app/Services/TransitEngineService.php`

During `parseItinerary()`, each OTP transit leg now captures two internal fields:

```php
'_route_id'  => $cleanRouteId,   // canonical DB route_id (OTP prefix stripped)
'_agency_id' => $resolvedAgencyId,
```

These are **never returned to the client**. After OTP parsing and deduplication,
`enrichWithFares()` passes all itineraries through `FareService` with a parsed
`Carbon` departure time, then strips the internal fields.

OTP result is cached (5-minute default TTL). Fare data is applied **after** the
cache read so modifier changes never require a cache flush.

---

## 6. API Response Shape

Each transit segment in `POST /api/v1/journey/calculate` now includes:

```jsonc
{
  "mode": "BUS",
  "route_name": "101",
  "distance": 3200,
  "duration": 480,
  // ... existing fields ...
  "fare": {
    "amount": 70,          // int, rounded to nearest 5 KES
    "currency": "KES",
    "confidence": "exact"  // "exact" | "zone"
  }
  // or "fare": null when no DB rule matches
}
```

WALK segments do not include a `fare` key.

---

## 7. Mobile Consumption

**Files:** `navigo/services/route.ts`, `navigo/utils/mapHelpers.ts`

```ts
// Type on RouteSegment
fare?: { amount: number; currency: string; confidence: "exact" | "zone" } | null;

// Helper
extractFares(segments: RouteSegment[]): FareResult
// FareResult = { found: true, total, currency, confidence, breakdown[] }
//            | { found: false }
```

`extractFares` aggregates all transit-segment fares:
- `found: false` if every transit segment has `fare: null`
- `confidence: "zone"` if any segment is zone-resolved (tilde shown)
- `confidence: "exact"` only when all resolved segments are exact

### Display rules

| State | Search card | JourneyDetailsSheet |
|---|---|---|
| `found: true`, exact | `KES 70` | `Fare KES 70` (no ⓘ) |
| `found: true`, zone | `~KES 70` | `Est. fare ~KES 70` + ⓘ disclaimer |
| `found: false` | *(hidden, duration shown instead)* | `No fare info for this route` (grey) |

The `showFares` user preference (`navigo/store/prefsStore.ts`) gates all fare
rendering. When off, `extractFares` is never called and no fare UI is shown.

---

## 8. Console Configuration

**Route:** `/fares` in the admin console (`console/src/pages/fares/FareManagerPage.tsx`).

| Tab | What it manages |
|---|---|
| Zone Fares | Draw zone polygons on a map; set zone-to-zone prices |
| Route Fares | Set flat per-route prices (creates fare_attribute + fare_rule pair) |
| Modifiers | Create/toggle peak-hours, event, weather, day-of-week surcharges |
| Preview | Test fare resolution for any origin zone + dest zone + route combo |
| Export | Download GTFS-compatible `fare_attributes.txt` + `fare_rules.txt` |

---

## 9. Machine Learning Strategy

### Why not build an ML model right now

A supervised model requires ground truth. Without the post-journey feedback loop
(§10) producing real confirmed fares, training on anything is fitting noise. A
gradient-boosted tree trained on 20 records is worse than a lookup table. The
feedback collection UX is the actual ML moat — not the model architecture.

The fastest path to accuracy is **collecting real fares first**, then applying
statistics, then ML once the data volume justifies it.

### Phase 1 — Bayesian per-route distributions (~200 confirmations)

No ML infrastructure needed. For each `route_id`, maintain in the DB:

```sql
ALTER TABLE fare_attributes ADD COLUMN confirm_count    INT     DEFAULT 0;
ALTER TABLE fare_attributes ADD COLUMN confirm_mean     DECIMAL(10,2);
ALTER TABLE fare_attributes ADD COLUMN confirm_variance DECIMAL(10,4);
ALTER TABLE fare_attributes ADD COLUMN last_confirmed_at TIMESTAMP;
```

When a user confirms fare amount `x`:
```
n'    = n + 1
mean' = mean + (x - mean) / n'          ← Welford online update
var'  = var  + (x - mean) * (x - mean') ← running sum of squares
```

Surface the variance as a confidence interval: *"KES 50–70 (based on 23 trips)"*.
High variance = unstable route → warn user to board with exact change.

**Confidence decay**: if `last_confirmed_at` is older than 30 days, downgrade
`confidence` from `"exact"` to `"zone"` even for route flat-fare rules.

### Phase 2 — Gradient-boosted tree (~500 confirmations / 50+ routes)

At this point, an XGBoost / LightGBM model genuinely outperforms rules because
it captures **interaction effects** that the modifier system can't express:

> *Route 101 at 8am on a rainy Monday costs more than  
> `peak_hours_multiplier × weather_surcharge` applied independently*

**Features:**
```
route_id (one-hot or target-encoded)
hour_of_day          (0–23)
day_of_week          (0–6)
is_raining           (bool, from congestion reports or weather API)
traffic_report_count (last 30 min on this route — unique signal)
days_since_last_fare_hike_report
boarding_zone_id
alighting_zone_id
route_distance_km
agency_id
```

**Infrastructure:** Python training script run offline weekly, model exported as
a flat weight file (PMML or PHP-native decision tree array) consumed by
`FareService`. No Python server in production path.

### Phase 3 — Online incremental retraining (scale)

As confirmation volume grows, switch to weekly retrain via a Laravel background
job (`php artisan fare:retrain`). Use the previous model as a warm start.

### Why navigo can win this market

Uber and Google Maps get accurate ETAs from billions of trips, not fancy models.
At Nairobi scale, 500 confirmed fares will beat any formula. The **congestion
crowd-report signal** (Phase C of the accuracy roadmap) is unique — no other
Nairobi transit app has per-route real-time congestion data from its own users.
That one feature alone will make navigo's ML model structurally more accurate
than anything trained on static GTFS data.

---

## 10. Accuracy Roadmap

### Phase A — Crowdsourced confirmations *(highest leverage)*
After `ARRIVED` state, show: *"Did the fare match? ✓ Yes / ↑ Higher / ↓ Lower"*

Store in `fare_reports { route_id, zone_origin_id, zone_dest_id, reported_amount, reported_at, user_id }`.

Use reports to auto-correct `fare_attributes.price` after ≥ 5 confirmations within ±5 KES median.
Confidence decays if no confirmation in 30 days (shown as zone-level even for exact rules).

### Phase B — Time-slot modifier bands
Seed `FareModifier` records from Phase A data aggregated by hour:
morning rush (06:30–09:30), evening rush (16:30–19:30), late night (22:00–05:00), weekend.

### Phase C — Congestion-linked surcharge
Wire existing traffic crowd-reports: ≥ 3 reports on a route in 30 min
auto-activates a `fixed_surcharge` for 45 min via a new `"congestion"` modifier type.
Unique signal — no other Nairobi transit app has this.

### Phase D — Per-operator differentiation
Use `route_operators` pivot + OTP `tripId → Trip.service_id` to identify the
operating agency on a shared corridor and prefer that agency's fare rule.

### Phase E — Public fare API
`GET /v1/fares/route/{route_id}` — read-only endpoint with confidence score (0–100)
derived from confirmation count, recency, and modifier coverage.
Positions navigo's fare DB as the community-maintained source for Nairobi pricing.
