# Golden-trace fixtures

Recorded navigation sessions used as regression tests for `NavigationEngine`.

## Where fixtures come from

1. Enable **dev traces** (Profile → Privacy → tap version 7× → Dev tools, or any `__DEV__` build — recording is automatic).
2. Ride/walk a real journey. On trip end the session is stored (last 5 kept).
3. Open **Dev replay** (`app/(account)/dev-replay.tsx`), pick the session, hit **Export** and share the JSON here as `<short-description>.json`.

## File format (`RecordedTraceFile` in `../traceKit.ts`)

```json
{
  "version": 1,
  "route": {
    "coords": [[36.82, -1.30], ...],
    "steps": [{ "instruction": "...", "distance": 0, "duration": 0, "location": [lng, lat], "type": "WALK|BUS", "stops": [] }]
  },
  "fixes": [{ "t": 0, "lat": -1.30, "lng": 36.82, "speed": 1.4 }, ...]
}
```

## Writing a regression test

```ts
import { replayRecorded, RecordedTraceFile } from "../traceKit";
import trace from "./corner-slide-ngong-rd.json";

it("does not mis-snap at the Ngong Rd corner", () => {
  const ticks = replayRecorded(trace as RecordedTraceFile);
  // assert on ticks[i].result — stepIndex, status, distanceFromRouteM...
});
```

Every field bug becomes a fixture: capture the trace, assert the correct
behavior, fix the engine, keep the test forever.
