# Navigo Rebuild Plan

**Prepared:** 2026-08-16
**Scope:** Full analysis of the current `app/` codebase (Expo/React Native client) and a detailed plan to rebuild it on the latest stable tooling, with a cleaner architecture, a real design system, and a maintainable structure.

**Out of scope:** The backend (`hopln-api`, Laravel/PHP, referenced but not present in this directory). This plan treats the API contract as fixed unless called out explicitly.

---

## 0. TL;DR

- The current app is **not tech-debt from neglect** — the core domain logic (`services/navigationEngine.ts`, the native Live Activity/widget modules, the auth store) is genuinely well engineered, commented, and in the engine's case, unit-tested. Keep and port these almost as-is.
- The problem is **everything around** the good parts: five files over 900 lines (one is **51,699 lines**), 41+ files each redefining their own `const ORANGE = "#FF6F00"` instead of a shared theme, two competing map libraries mid-migration, two competing UI kits, dead code sitting next to live code, and only 2 test files in the whole app.
- You are **already close to "latest stable"** — Expo SDK 54 / RN 0.81 / React 19.1 — so this is not primarily a version-bump exercise. As of today, **Expo SDK 57 (RN 0.86, React 19.2, Reanimated 4.5)** is current stable, three SDKs ahead. The real rebuild value is architectural: folder structure, design system, state/data boundaries, and killing the God Components.
- Recommended path: **strangler-fig rebuild**, not a big-bang rewrite. Port the navigation engine, native modules, and API clients verbatim into a new structure; rewrite screens feature-by-feature behind the same routes so the app stays shippable throughout.

---

## Part 1 — Current State Audit

### 1.1 Tech stack snapshot

| Layer | Current | Notes |
|---|---|---|
| Framework | Expo SDK ~54.0.6, New Architecture enabled | Solid, modern baseline |
| React / RN | React 19.1.0 / React Native 0.81.5 | |
| Router | expo-router ~6.0.3, `typedRoutes` + `reactCompiler` experiments **already on** | Good — keep this instinct |
| Language | TypeScript 5.9, `strict: true` | Good baseline, undermined by liberal `any` in practice |
| State | Zustand 5 (13 stores) | Good choice, inconsistently used |
| Server state | `@tanstack/react-query` 5 — installed, provider mounted in `_layout.tsx`, but **no screen actually uses `useQuery`** | Dead abstraction; everything hand-rolls fetch + a custom `CacheService` instead |
| Maps | `@rnmapbox/maps` **and** `react-native-maps` both installed | Mid-migration (see `MapPlan.md`) — not finished |
| Styling | Plain `StyleSheet.create` (68 files) + two parallel "design systems" | No shared tokens actually enforced |
| Storage | `expo-secure-store` (token) + `AsyncStorage` (18 files) + `react-native-mmkv` (installed, **0 usages**) | |
| Native features | Custom Expo modules for iOS Live Activities (ActivityKit) and Android Glance widgets, `expo-task-manager` geofencing, `expo-camera` AR overlay, `notifee` | Genuinely impressive, well-structured native work |
| Testing | Jest + jest-expo, **2 test files** (`navigationEngine.test.ts`, `rankRoutes.test.ts`) | |
| Observability | Sentry wired but inert without DSN; `console.log`/`console.error` scattered through interceptors and hooks | |
| Data | `data/stops.ts` — **51,699 lines** of hardcoded stop records shipped in the JS bundle | Major bug, not a style issue |

### 1.2 What's genuinely good — port, don't rewrite

- **`services/navigationEngine.ts`** — a clean, dependency-free, unit-tested projection-based nav engine (GPS→polyline projection, EMA smoothing, high-water-mark anti-backward-snap, hybrid ETA, hysteresis on approach phases). This is the hardest part of the app to get right and it's already right. Port verbatim.
- **`store/authStore.ts`** — correct SecureStore/AsyncStorage split (token vs. profile), stale-while-revalidate `/auth/me`, survives logout for onboarding flag. Minor gaps noted below (§1.3 A2).
- **Native modules** (`modules/navigo-live-activity`, `modules/navigo-widget-data`) and their config plugins — real ActivityKit/Glance integration with podspecs and proper `expo-module.config.json`. This is exactly the kind of code that's expensive to redo and cheap to port.
- **The `headingStore` imperative-read pattern** — using `getState()` instead of a React selector for 12 Hz compass data so it causes zero re-renders. This is the correct pattern for high-frequency sensor data and should be the template for other high-frequency state (GPS ticks, camera interval).
- **Existing self-diagnosis docs** (`MAP.md`, `MapPlan.md`, `Fare.md`) — someone already did a deep, accurate performance audit of the map/nav stack (issues C1–C5, P1–P6, A1–A3, and 64 numbered fix suggestions in `MAP.md`). Treat that document as a **validated backlog**, not something to re-derive. The rebuild should structurally prevent the classes of bug it found (e.g., 8 separate `useState` calls in one hook → use one reducer/store slice from day one).

### 1.3 Structural problems (with evidence)

#### God components

File sizes are a symptom, not the disease — the disease is screens doing routing, data-fetching, map rendering, business logic, and UI all in one function component.

| File | Lines | Hook calls (`useState/Effect/Callback/Memo/Ref`) |
|---|---:|---:|
| `data/stops.ts` | 51,699 | — (static data, see §1.4) |
| `app/(tabs)/contribution.tsx` | 1,767 | 44 |
| `components/app/StopDetailsSheet.tsx` | 1,518 | — |
| `app/(tabs)/map.tsx` | 1,499 | **106** |
| `app/search.tsx` | 959 | — |
| `hooks/useNavigation.ts` | 995 | 62 |
| `data/routes.ts` | 998 | — |
| `app/kwame.tsx` | 908 | — |

`map.tsx` alone imports 25 components and 8 hooks and holds 106 hook calls — it is simultaneously the map renderer, the navigation HUD, the search-result consumer, the report layer host, the deep-link handler, and the session-restore controller. `MAP.md §3.1` documents 33+ distinct `useState` variables in this one file. This is the single highest-leverage target in the whole rebuild.

#### Duplicated / competing systems

1. **Two map libraries.** `MapPlan.md` shows this is a *deliberate, incomplete* migration off `react-native-maps`/`PROVIDER_GOOGLE` and onto `@rnmapbox/maps`, motivated by real bugs (marker rasterization on Android, camera fights with Google's animation queue, pitch limits). `map.tsx` has migrated; `pick-place.tsx`, `contribution.tsx`, `HeadingBeam.tsx`, `UserLocationMarker.tsx`, and `offlineTiles.ts` have not. Shipping both SDKs doubles native binary size and maintenance surface for no product benefit.
2. **Two design systems.** `constants/theme.ts` (the stock Expo-template file) defines `Colors.light`/`Colors.dark` — except **dark mode's `background` and `text` are hardcoded to the same values as light mode**, so it's a non-functional stub. Meanwhile `lib/theme.ts` defines a real `palette`/`spacing`/`radius`/`shadow` — but it's barely used, because 41+ component files locally redeclare `const ORANGE = "#FF6F00"`, `const BLACK = "#1C1C1E"`, etc. `#FF6F00` alone appears in 62 files. There are also two component libraries: `components/ui/` (Button, Card, Input, Text — template-ish) and `ui/Highlight.tsx` (one-off, different location). No screen consistently uses either.
3. **Two storage layers doing the same job.** `react-native-mmkv` is a dependency with **zero usages** anywhere in the source. `AsyncStorage` is used in 18 files instead, including as the Zustand `persist` backend, which is materially slower than MMKV for this exact use case.
4. **`@turf/helpers` and `@turf/line-slice`** are dependencies with zero usages — `navigationEngine.ts` and `utils/mapHelpers.ts` hand-roll haversine/projection math instead (which is fine — the math is correct — but the unused geo library should either be adopted for `flyThrough.ts`/offline-pack geometry or removed).
5. **`lucide-react`** (the *web* React package, not `lucide-react-native`) is a dependency with zero usages — the app consistently uses `@expo/vector-icons`/`Ionicons` instead. Dead weight, and if anyone did import it, it wouldn't render in native.

#### Dead code

- **`components/app/test.tsx`** — 234 lines, header comment literally says `// components/app/MapFloatingUI.tsx`. It's a stale duplicate/scratch copy of the real `MapFloatingUI.tsx`, not imported anywhere. Should not exist in the tree.
- **`search/index.ts`** — a Fuse.js fuzzy-search index built over `data/fakeData.ts` (which itself just re-exports `data/stops.ts`). It is imported by nothing except itself. `useStopSearch.ts` (the hook actually used by screens) talks to the backend + Mapbox geocoding instead. This entire module — plus the sample routes/trips in `fakeData.ts` — is orphaned.
- **`data/routes.ts` / `data/stops.ts`** are imported by exactly one file (`components/map/BusLayer.tsx`), for what appears to be simulated/demo bus positions. A 51,699-line file backing a single demo layer is the single biggest bundle-size and cold-start-time bug in the app (see §6).

#### Cross-cutting quality issues

- **`console.log`/`console.warn`/`console.error`** calls appear throughout request/response interceptors (`apiClient.ts`), stores, and hooks — including logging full request/response bodies in `__DEV__`, which is fine for dev but there's no structured logger to strip/gate this centrally or route it to Sentry breadcrumbs in production.
- **`: any`** shows up regularly (e.g. `apiClient.ts`'s `fetchApi<T>(endpoint, options: any = {})`, several store actions), undermining `strict: true`.
- **`apiClient.ts` hardcodes a production URL fallback** (`https://api.navigo.ke/api/v1`) directly in source with a `console.warn` if the env var is missing, instead of failing the build or reading from EAS environment configuration. Low severity but worth cleaning up as part of the env-handling rework.
- **Testing is close to nonexistent.** Two test files cover the navigation engine and route ranking — both good, both worth keeping — but nothing covers stores, services, or a single component. For an app with this much stateful, timing-sensitive logic (GPS smoothing, background geofencing, session restore), that's a real risk.
- **No accessibility pass** — no `accessibilityLabel`/`accessibilityRole` usage found across the sampled screens.

### 1.4 Data layer bug: `data/stops.ts`

This deserves its own line item because it's not a style problem, it's a correctness/performance problem: **51,699 lines of static stop data are compiled into the JavaScript bundle** and used only by one demo layer (`BusLayer.tsx`). Meanwhile the real stop data flows correctly through `services/stop.ts` → `StopService` → backend API with a proper stale-while-revalidate cache (`CacheService`, 24 h TTL) in `map.tsx`. The static file is legacy scaffolding that never got deleted after the real API integration landed. It directly inflates JS bundle size, Metro bundling time, and app cold-start parse time for zero product value.

---

## Part 2 — Rebuild Goals

1. **Same product, better bones.** No feature regressions — journey planning, Kwame AI, live navigation, contribution/gamification, offline maps, widgets/Live Activity all carry over. This is an architecture and DX rebuild, not a product pivot.
2. **One way to do each thing.** One map SDK, one design system, one storage layer, one data-fetching pattern (React Query for server state, Zustand for client/session state only).
3. **No file does more than one job.** Screens are thin route shells; feature logic lives in hooks/services; God Components are structurally impossible because routes can't hold business logic.
4. **Ship incrementally.** The rebuild must not freeze the app for months. Feature-by-feature migration behind the existing route table, with the old and new code able to coexist during the transition.
5. **Make the good parts (engine, native modules) load-bearing, not incidental.** They should sit in clearly-named, well-tested core packages that the rest of the app depends on, not just "another file in `services/`".

---

## Part 3 — Target Tech Stack

Verified against current (Aug 2026) stable releases — pin exact patch versions at implementation time via `npx expo install --check` / `npx expo-doctor`, since these move fast.

| Layer | Recommendation | Why |
|---|---|---|
| Framework | **Expo SDK 57** (RN 0.86, React 19.2, New Architecture, Reanimated 4.5) | Current stable as of this writing; you're 3 SDKs behind today, this closes the gap and picks up New Architecture stabilization work landed since 54 |
| Router | **expo-router 7.x** (matching SDK 57), typed routes on by default | Keep file-based routing — it's the right call already made — but reorganize *what* lives under `app/` (§4.2) |
| Language | TypeScript 5.9+, `strict: true`, **ban new `any`** via `@typescript-eslint/no-explicit-any` at `error` | Enforce what `tsconfig.json` already claims to want |
| Client state | **Zustand 5**, `mmkv` as the `persist` storage engine (not AsyncStorage) | Keep — it's the right tool, just finish adopting the already-installed MMKV dependency |
| Server state | **TanStack Query 5**, actually used this time — every screen fetch goes through `useQuery`/`useMutation`, not hand-rolled `axios` + custom cache | The provider is already mounted and unused; this is the highest-value "finish what you started" item |
| Maps | **`@rnmapbox/maps` only** — finish the migration `MapPlan.md` already scoped, delete `react-native-maps` | Removes a whole class of Android marker-rasterization bugs *and* ~15–20 MB of duplicate native SDK |
| Styling / design system | **NativeWind v4** (Tailwind syntax, build-time compiled, largest ecosystem/community) as the default; `react-native-reanimated` for motion | See §4.4 for the decision rationale and the Tamagui/Unistyles alternatives considered |
| Forms | `react-hook-form` + `zod` | Currently every auth/profile form hand-rolls validation; there's real duplicated logic across `login.tsx`, `register.tsx`, `forgot-password.tsx`, `verify-phone.tsx`, `profile-details.tsx` |
| Icons | `@expo/vector-icons` only | Already the de facto standard in the app — just remove the dead `lucide-react` entry |
| HTTP | `axios` + a typed API client generated per domain, or hand-written thin wrappers — keep, it's fine | Not broken, just needs the interceptor cleanup (§1.3) and to sit behind React Query instead of being called directly from components |
| Geo | `@turf/*` used properly for polyline ops in `flyThrough.ts`/offline packs, **or** remove it — don't leave it installed-and-unused | |
| Testing | Jest + jest-expo (unit), `@testing-library/react-native` (component), **Maestro** (E2E, Expo's recommended flow-based E2E tool) | See §7 |
| Observability | Sentry (already wired, just needs a DSN + the console.* cleanup routed through it) | |
| CI | GitHub Actions: lint + typecheck + unit tests on every PR; EAS Build for preview builds on demand | |

---

## Part 4 — Target Architecture

### 4.1 Folder structure

expo-router requires actual route files to live under `app/`, so routes stay as **thin shells** that import a screen component from `src/features/*`. Everything else moves to a `src/` tree organized **by feature**, not by technical layer.

```
navigo/
├── app/                              # expo-router routes ONLY — no logic
│   ├── _layout.tsx                   # root: providers, fonts, deep-link/session bootstrap
│   ├── index.tsx
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx                 # → renders <LoginScreen /> from features/auth
│   │   ├── register.tsx
│   │   ├── verify-phone.tsx
│   │   └── forgot-password.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx               # tab bar shell only
│   │   ├── map.tsx                   # → <MapScreen />
│   │   ├── favorite.tsx              # → <SavedPlacesScreen />
│   │   ├── contribution.tsx          # → <ContributionScreen />
│   │   └── profile.tsx               # → <ProfileScreen />
│   ├── (account)/                    # settings-style stack, unchanged grouping
│   │   └── ...
│   ├── journey.tsx                   # → <JourneyResultsScreen />
│   ├── kwame.tsx                     # → <KwameChatScreen />
│   └── kwame-settings.tsx
│
├── src/
│   ├── features/
│   │   ├── navigation/                # the live-nav HUD + engine glue (was hooks/useNavigation.ts + half of map.tsx)
│   │   │   ├── engine/                # navigationEngine.ts ports here verbatim, plus its tests
│   │   │   ├── hooks/                 # useNavigationSession, useVoiceGuide, useGeofenceAlerts, useDeadReckoning
│   │   │   ├── components/            # NavIndicator, HUD banner, pause/resume controls
│   │   │   └── store/                 # navSessionStore, navStateStore
│   │   │
│   │   ├── map/                       # map rendering, stops, clustering, offline packs
│   │   │   ├── components/            # MapView wrapper, StopsLayer, ReportLayer, RouteOverlay
│   │   │   ├── hooks/                 # useMapCamera, useHeadingTracker, useStopSearch
│   │   │   └── store/                 # mapLayersStore, offlineMapStore, headingStore
│   │   │
│   │   ├── journey-planning/          # search → itineraries → route details
│   │   │   ├── components/            # RouteStepsList, RouteRankChips, JourneyDetailsSheet
│   │   │   ├── hooks/                 # useRouteOverlay, useJourneySearch (React Query)
│   │   │   └── store/                 # journeyStore (trimmed to true client state; route data via React Query)
│   │   │
│   │   ├── kwame-ai/                  # chat, voice, in-trip copilot
│   │   │   ├── components/            # MessageBubble, RouteCard, PlaceCard, VoiceOverlay
│   │   │   ├── hooks/                 # useAiVoice, useKwameChat
│   │   │   └── store/                 # chatStore, kwameSettingsStore
│   │   │
│   │   ├── contribution/              # stop edits, photos, reports, reviews, moderation
│   │   ├── community/                 # badges, leaderboard, streaks
│   │   ├── auth/                      # login/register/OTP/OAuth — thin screens, react-hook-form + zod
│   │   ├── saved-places/              # home/work pins, saved journeys, widget bridge sync
│   │   ├── offline-maps/              # Mapbox TileStore pack manager
│   │   ├── ar-guidance/               # expo-camera AR overlay
│   │   └── widgets/                   # widgetBridge + Live Activity orchestration (native calls live in native/modules)
│   │
│   ├── shared/
│   │   ├── ui/                        # ONE design system: Button, Card, Sheet, Text, Input, Chip, Avatar…
│   │   ├── theme/                     # tokens.ts (color/spacing/radius/typography scale), ThemeProvider, NativeWind config
│   │   ├── api/                       # apiClient.ts, queryClient.ts, typed endpoint wrappers per domain
│   │   ├── stores/                    # only truly cross-cutting: authStore, networkStore, prefsStore
│   │   ├── hooks/                     # useRatePrompt and other screen-agnostic hooks
│   │   ├── utils/                     # mapHelpers, flyThrough, markdown, shareJourney
│   │   └── types/
│   │
│   └── native/
│       ├── modules/                   # navigo-live-activity, navigo-widget-data — ported as-is
│       ├── plugins/                   # withLiveActivity, withAndroidWidget, withWorkManagerFix
│       └── targets/                   # navigo-widgets (WidgetKit/Glance native targets)
│
├── assets/
├── app.config.ts                      # typed config (see §4.2), same env-driven pattern as today
└── eas.json
```

Rules that make this stick (enforce via ESLint boundaries, not just convention):

- Files under `app/` may import from `src/features/*/screens` and `src/shared/*` **only** — never the reverse, and never business logic inline.
- A component crosses from "local to a feature" to "shared" only after it's used by a second feature — resist promoting things to `shared/ui` speculatively.
- No file may exceed roughly 300 lines / 15 hooks as a soft ESLint-enforced budget (`max-lines`, custom rule for hook count). `map.tsx` at 1,499 lines / 106 hooks is exactly what this prevents.

### 4.2 Routing

Keep expo-router and keep the existing route groups (`(auth)`, `(tabs)`, `(account)`) — the grouping itself is sound, it's what's *inside* each route file that needs to shrink to nothing but composition. Turn on `app.config.ts` (TypeScript config) instead of `app.config.js` now that the config has grown non-trivial conditionals (`IS_DEV`/`IS_PREVIEW`), for type-checked `extra` fields.

### 4.3 State & data-layer boundary

This is the single most important rule to set before writing any feature code, because its absence is what let `CacheService` and ad-hoc `axios` calls sprawl through screens:

| Kind of state | Owner | Example |
|---|---|---|
| Data that comes from the server and can go stale | **TanStack Query** | stops, routes, itineraries, contributions, leaderboard, badges, reports-in-viewport |
| Session/client-only state that must persist across launches | **Zustand + MMKV persist** | auth token presence, prefs (voice/units/nav-view), onboarding flag |
| Session/client-only state that must NOT persist | **Zustand, no persist middleware** | active journey, live nav session, chat draft |
| High-frequency (>5 Hz) sensor/telemetry state | **Zustand with imperative `getState()` reads only, never a selector** | heading, live GPS tick — this is already the right pattern in `headingStore`, generalize it |
| Local UI state (sheet open/closed, form field focus) | **`useState` in the component** | |

Concretely: `services/stop.ts`, `services/route.ts`, `services/contribution.ts` become the `queryFn`s behind `useStops()`, `useJourneyPlan()`, `useContributions()` hooks — not functions screens call directly inside `useEffect`. This alone removes the need for `CacheService`'s hand-rolled TTL/stale-while-revalidate logic (§1.3 §3.6 in `MAP.md`) — React Query does this natively via `staleTime`/`gcTime`, which the `QueryClient` in `_layout.tsx` already configures correctly but nothing uses.

### 4.4 Design system

**Recommendation: NativeWind v4** as the styling engine, backed by a small `shared/theme/tokens.ts` that mirrors the existing (good) `lib/theme.ts` palette — same orange/near-black brand identity, just enforced everywhere instead of copy-pasted into 41 files.

Why NativeWind over the alternatives considered:

- **vs. Tamagui** — Tamagui's compiler and cross-platform (web+native) optimization are overkill here; Navigo's web target is a secondary `expo-router` static export, not a first-class product surface, so Tamagui's main selling point doesn't pay for its learning curve and build complexity.
- **vs. Unistyles 3** — a legitimate alternative (compile-time, no runtime style resolution, great for "maximum flexibility, highly customized UI"), and worth a bake-off if the team already knows it. NativeWind is recommended by default for its larger ecosystem/community size and because Tailwind's utility vocabulary maps cleanly onto the kind of spacing/color consistency this app is missing today.
- **vs. plain `StyleSheet` + tokens** (i.e., just discipline, no library) — viable and lowest-risk, but given that 41 files already redefine the same 5 hex codes under plain StyleSheet *today*, a library that makes the inconsistent pattern impossible (can't easily hardcode `#FF6F00` inline in a `className`, the linter catches raw hex) is a better bet than relying on discipline a second time.

Design-system deliverables, in order:

1. `tokens.ts` — color scale (primitive + semantic: `brand.orange`, `surface.card`, `text.primary`, `danger`, `success`…), spacing scale, radius scale, type scale, matching **both** light and dark (the current `constants/theme.ts` dark mode is non-functional — this is the fix).
2. `ThemeProvider` wired to `useColorScheme()` + a user override in `prefsStore` (the app already has a dark-mode-capable `userInterfaceStyle: "automatic"` in `app.config.js`, so the plumbing intent is there, just not the tokens).
3. `shared/ui/` primitives: `Button`, `Card`, `Sheet` (bottom-sheet wrapper — currently every screen hand-rolls its own `Animated`-based sheet, e.g. `DraggableSheet` inline in `(tabs)/_layout.tsx`, `JourneyDetailsSheet`, `PostJourneySheet`, `ReportSheet` all reimplementing similar drag/snap logic), `Input`, `Chip`, `Avatar`, `EmptyState`, `Badge`.
4. One shared bottom-sheet primitive (built on `@gorhom/bottom-sheet`, which is not currently a dependency but is the standard for this) replacing the ~6 independently-implemented sheet components.

### 4.5 Native modules strategy

No changes to the native module *code* — `navigo-live-activity` and `navigo-widget-data` are well-built Expo modules with correct podspecs/manifests. Port the directories as-is into `src/native/modules/`, update their `package.json` `main` paths, and keep the config plugins (`withLiveActivity`, `withAndroidWidget`, `withWorkManagerFix`) unchanged apart from path updates. The only integration change is where they're *called from*: today `liveActivity.ts` and `widgetBridge.ts` live in the flat `services/` folder and are called ad hoc from `map.tsx`/`journeyStore`; in the rebuild they become the implementation behind `features/widgets/` hooks (`useLiveActivitySync()`, `useWidgetDataSync()`) so the native bridge calls have one clear call site per platform event instead of being sprinkled through the nav loop.

---

## Part 5 — Feature Module Breakdown

For each feature, what ports as-is vs. what gets rebuilt:

| Feature | Port as-is | Rebuild |
|---|---|---|
| **Live navigation** | `navigationEngine.ts` (100%), EMA/dead-reckoning math, geofence background task | `useNavigation.ts` (995 lines/62 hooks) splits into `useNavigationSession`, `useVoiceAnnouncements`, `useCameraFollow`, `useSessionRestore` — one concern each, composed in the screen |
| **Map rendering** | Mapbox custom style, offline TileStore pack logic | Finish `react-native-maps` → `@rnmapbox/maps` migration per `MapPlan.md`; replace `setInterval`-based `NavIndicator`/`ReportLayer` polling with `onRegionChangeComplete`-driven projection (`MAP.md` #30); spatial-hash stop clustering instead of O(n²) (`MAP.md` #25) |
| **Journey planning / search** | Backend contract (`/journey/calculate`, Mapbox geocoding fallback), `rankRoutes.ts` ranking logic + its test | `search.tsx` (959 lines) splits into a search screen + `useJourneySearch` React Query hook; delete the orphaned `search/index.ts` Fuse index or, if fuzzy client-side search over a *small* recent/favorites list is wanted, rebuild it deliberately against real data, not the dead 51k-line file |
| **Kwame AI** | `services/ai.ts` API contract, voice VAD/TTS flow | `kwame.tsx` (908 lines) → `KwameChatScreen` composed from `features/kwame-ai` components already itemized in the current `components/kwame/` folder (these are already reasonably sized — mostly a relocation, not a rewrite) |
| **Contribution/community** | Points/badges/streak backend contract, `BadgeUnlockModal` animation | `contribution.tsx` (1,767 lines/44 hooks) — the single largest screen — splits into a contribution-type picker + per-type flow screens (stop-edit, photo, report, review) instead of one mega-screen branching on mode |
| **Stop details** | Data contract | `StopDetailsSheet.tsx` (1,518 lines) splits into the shared `Sheet` primitive + smaller content sections (info, reviews, contribute-CTA, nearby-routes) |
| **Auth** | OAuth/Apple/OTP backend contract | Rebuild forms on `react-hook-form` + `zod`, sharing one `AuthLayout`; currently `login.tsx`/`register.tsx`/`verify-phone.tsx`/`forgot-password.tsx` each hand-roll validation and layout independently |
| **Offline maps / widgets / Live Activity** | Native modules, TileStore pack management | Thin orchestration hooks as described in §4.5 |

---

## Part 6 — Fixing the data layer

1. **Delete `data/stops.ts` and `data/routes.ts` from the client bundle.** Whatever `BusLayer.tsx`'s demo layer needs, source it from the same backend endpoint real stops already come from (`StopService`), or — if simulated bus positions for a demo/offline mode are a genuine product requirement — generate a small (dozens, not 50,000 rows) fixture file checked in under `__fixtures__/`, not `data/`.
2. **Delete `data/fakeData.ts` and `search/index.ts`** (orphaned Fuse index) unless client-side fuzzy search over a small, deliberately-curated dataset (e.g., "recent + favorite stops") is a real feature — in which case rebuild it against live data with a clear owner (a hook, not a floating top-level module nothing imports).
3. Confirm via a bundle-size check (`npx expo export` + `source-map-explorer` or Expo Atlas) that this single change is the largest bundle-size win available in the whole rebuild — worth measuring and reporting, since it's an easy "before/after" number for stakeholders.

---

## Part 7 — Testing Strategy

Current: 2 unit test files, both good, both keep.

Target layers:

1. **Unit** (Jest) — every pure module in `features/*/engine` and `shared/utils` gets tests, following the existing `navigationEngine.test.ts` golden-trace-fixture pattern (`services/__tests__/fixtures/`). This pattern is a real asset — reuse the fixture format for other geo-math (`rankRoutes`, `flyThrough`).
2. **Component** (`@testing-library/react-native`) — start with the new `shared/ui` primitives (cheap, high reuse payoff) and the contribution flow screens (currently the least tested, most complex branching logic).
3. **Store** — Zustand stores are pure functions of state; test `authStore`'s stale-revalidate branch, `journeyStore`'s trip-status machine, and `prefsStore` persistence round-trip directly, no rendering needed.
4. **E2E** (Maestro) — 3–5 critical flows: guest search → view route → sign-up gate; login → plan journey → start navigation → arrive; submit a contribution → see points awarded. Maestro is Expo's currently recommended flow-based E2E tool and needs no native test-runner setup, which matters given this app already carries meaningful native-module complexity.
5. **CI gate**: typecheck + lint + unit/store tests block merge; component/E2E run on a schedule or pre-release, not every PR, to keep iteration fast.

---

## Part 8 — Performance & Observability

- Treat `MAP.md`'s **C1–C5 / P1–P6 / A1–A3** findings and its 64 numbered suggestions as the concrete performance backlog for the navigation/map feature — they're already diagnosed with file:line precision; the rebuild's job is to make the *fixed* version (single reducer instead of 8 `useState`s, RAF instead of `setInterval` polling, memoized `RouteOverlay`, spatial-hash clustering) the **only** version that ever existed, rather than a patch on top of the old one.
- Replace scattered `console.*` calls with a tiny `shared/lib/logger.ts` (level-gated, `__DEV__`-aware, forwards `warn`/`error` to Sentry breadcrumbs in production) — one call site to change instead of grepping the whole tree later.
- Turn on Sentry's DSN from day one in the rebuild (it's currently shipped-but-inert) so crash/ANR data exists from the first internal build, not after "Phase 2."
- Add a bundle-size budget check to CI (Expo Atlas or `source-map-explorer`) so a future `data/stops.ts`-style regression fails the build instead of shipping silently.

---

## Part 9 — Migration Plan (phased, keeps the app shippable)

**Phase 0 — Foundations (1–2 weeks)**
Scaffold `src/` tree, set up NativeWind + tokens, stand up `shared/ui` primitives, configure React Query as the only data-fetching path, wire ESLint boundary rules (`app/` can't hold logic, file/hook-count budgets). Port `navigationEngine.ts` + its tests untouched. No user-visible change yet.

**Phase 1 — Delete the dead weight**
Remove `data/stops.ts`, `data/routes.ts`, `data/fakeData.ts`, `search/index.ts`, `components/app/test.tsx`, `lucide-react`, unused `@turf/*` (or adopt it properly), finish the `react-native-maps` → `@rnmapbox/maps` migration and remove `react-native-maps`. Adopt MMKV as the Zustand persist engine, replacing AsyncStorage for store persistence (keep AsyncStorage only if something outside Zustand still needs raw key-value access — audit the 18 usages first). This phase is pure risk-reduction and bundle-size win, shippable as an update to the *current* app even before the architectural rebuild finishes.

**Phase 2 — Auth + Profile + Saved Places**
Smallest, most self-contained features. Good proving ground for the new patterns (React Query, react-hook-form, `shared/ui`) before tackling the map.

**Phase 3 — Map + Navigation**
The big one. Split `map.tsx` and `useNavigation.ts` per §5, applying the `MAP.md` performance fixes as part of the rewrite (not as a follow-up). Keep the old screen reachable behind a feature flag until the new one passes the E2E nav flow.

**Phase 4 — Journey planning + Kwame AI**

**Phase 5 — Contribution + Community**
Largest remaining screen (`contribution.tsx`, 1,767 lines) — split by contribution type.

**Phase 6 — Offline maps, widgets, AR, Live Activity**
Lowest risk — mostly relocation of already-solid native integration code into the new feature-folder homes.

Throughout: both old and new code can coexist because routes are thin — a route file under `app/` can point at either the old inline screen or the new `features/*/screens/*` component with a one-line change, so each phase ships independently and is individually revertible.

---

## Part 10 — Open Questions

These need a product/eng decision before or during Phase 0 — flagging rather than guessing:

1. **Styling library** — NativeWind is recommended (§4.4), but if the team has existing Unistyles/Tamagui experience that should override the default recommendation; worth a half-day spike on 2–3 real screens before committing.
2. **Bottom-sheet primitive** — recommend consolidating on `@gorhom/bottom-sheet`; confirm it covers every current use case (`JourneyDetailsSheet`'s map-offset-aware drag, `(tabs)/_layout.tsx`'s custom `DraggableSheet`) before ripping out the bespoke implementations.
3. **`data/stops.ts`'s actual purpose** — confirm with whoever owns `BusLayer.tsx` whether the 51k-line dataset is dead legacy or is quietly relied on for an offline/demo mode before deleting; the grep evidence says it's only used by one file, but worth a sign-off given the size.
4. **Web target** — `app.config.js` has `web.output: "static"` and `react-native-web` is installed; confirm whether web is a real secondary platform (which would push the styling choice toward Tamagui/NativeWind's web story more heavily) or vestigial from the Expo template.
5. **Backend coupling** — this plan assumes the `hopln-api` contract is stable. If a backend rebuild is also on the table, sequence it *before* Phase 2 so the client isn't built twice against two API shapes.

---

## Appendix A — God-component inventory (full list, lines ≥ 400)

| File | Lines |
|---|---:|
| `data/stops.ts` | 51,699 |
| `app/(tabs)/contribution.tsx` | 1,767 |
| `components/app/StopDetailsSheet.tsx` | 1,518 |
| `app/(tabs)/map.tsx` | 1,499 |
| `app/search.tsx` | 959 |
| `data/routes.ts` | 998 |
| `hooks/useNavigation.ts` | 995 |
| `app/kwame.tsx` | 908 |
| `app/(account)/pick-place.tsx` | 573 |
| `components/app/PostJourneySheet.tsx` | 558 |
| `app/(tabs)/favorite.tsx` | 528 |
| `components/app/BusDetailsSheet.tsx` | 529 |
| `app/(tabs)/_layout.tsx` | 492 |
| `app/(account)/privacy.tsx` | 495 |
| `components/app/ReportDetailCard.tsx` | 495 |
| `app/(account)/profile-details.tsx` | 486 |
| `components/app/MapFloatingUI.tsx` | 570 |
| `app/kwame-settings.tsx` | 453 |
| `app/(account)/notification-inbox.tsx` | 441 |
| `app/(auth)/verify-phone.tsx` | 424 |
| `app/(tabs)/home.tsx` | 423 |
| `app/(tabs)/profile.tsx` | 419 |
| `components/app/RouteStepsList.tsx` | 417 |
| `components/map/BusLayer.tsx` | 424 |

## Appendix B — Dependency audit

| Package | Status | Action |
|---|---|---|
| `react-native-maps` | Actively used in 5 files, superseded by `@rnmapbox/maps` in `map.tsx` | Finish migration, remove |
| `react-native-mmkv` | Installed, **0 usages** | Adopt as Zustand persist engine |
| `@turf/helpers`, `@turf/line-slice` | Installed, **0 usages** | Adopt for geo ops or remove |
| `lucide-react` | Installed, **0 usages**, wrong platform package (web, not native) | Remove |
| `fuse.js` | Used only by the orphaned `search/index.ts` | Remove with that module, or keep if fuzzy search gets rebuilt deliberately |
| `@tanstack/react-query` | Installed, provider mounted, **0 `useQuery` call sites** | Actually adopt (§4.3) — highest-value "finish what you started" item |

---

*This document is a planning artifact, not a ticket backlog — recommend breaking Part 9's phases into tracked issues before starting Phase 0.*
