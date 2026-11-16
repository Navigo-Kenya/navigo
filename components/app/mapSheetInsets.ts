// components/app/mapSheetInsets.ts
//
// Shared layout channel between the bottom sheets that sit over the map and
// the floating controls (MapFloatingUI, IntermStopInfoCard, OfflineNotice).
//
// Every sheet reports the screen Y of its top edge as an Animated.Value:
//   - draggable sheets pass the translateY they already animate
//   - bottom-anchored cards report through onLayout (useStaticSheetTop)
// Floating controls read the top-most sheet with useSheetTop() and derive
// their position from it on the native driver, so they track a drag frame by
// frame instead of sitting at hard-coded offsets.
//
// Whenever the top-most sheet changes (one opens over another, one closes,
// one unmounts mid-screen) the published node cross-fades from the old
// sheet's position to the new one, so controls glide back to their place
// instead of jumping.
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  type LayoutChangeEvent,
} from "react-native";

const WINDOW_H = Dimensions.get("window").height;

/** How long controls take to glide to a new sheet, or back to rest. */
const HANDOFF_MS = 280;

/** Screen Y of a sheet's top edge, as read by floating controls. */
export type SheetTopNode = Animated.Value | Animated.AnimatedAddition<number>;

/**
 * Used when no sheet is open. Just below the screen: every control's
 * interpolation is clamped there, so they sit at rest.
 */
const OFFSCREEN = new Animated.Value(WINDOW_H);

type Entry = { top: Animated.Value; gen: number };

let entries: Entry[] = [];
let genCounter = 0;
/** The sheet controls are heading towards. */
let target: Animated.Value = OFFSCREEN;
/** What controls read: `target`, or a blend while handing over to it. */
let current: SheetTopNode = OFFSCREEN;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function publish() {
  const next = entries.length ? entries[entries.length - 1].top : OFFSCREEN;
  if (next === target) return;
  target = next;

  // current + (next - current) * t, with t: 0 → 1. At t = 0 this equals
  // whatever controls show now (even mid-drag or mid-handoff), so there is no
  // jump; it then follows `next` live, so a sheet that is still springing in
  // is tracked while the handoff runs.
  const t = new Animated.Value(0);
  const from = current;
  current = Animated.add(
    from,
    Animated.multiply(Animated.subtract(next, from), t)
  );
  notify();

  Animated.timing(t, {
    toValue: 1,
    duration: HANDOFF_MS,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: true,
  }).start(({ finished }) => {
    // At t = 1 the blend equals `next` exactly: swapping in the plain value
    // is invisible and keeps the node graph from growing.
    if (finished && target === next) {
      current = next;
      notify();
    }
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function add(top: Animated.Value): number {
  const gen = ++genCounter;
  entries = entries.filter((e) => e.top !== top);
  entries.push({ top, gen });
  publish();
  return gen;
}

function remove(top: Animated.Value, gen: number) {
  const before = entries.length;
  entries = entries.filter((e) => !(e.top === top && e.gen === gen));
  if (entries.length !== before) publish();
}

/** Report a draggable sheet's top edge (its translateY from the screen top). */
export function useReportSheetTop(top: Animated.Value, active = true) {
  useEffect(() => {
    if (!active) return;
    const gen = add(top);
    // No exit animation on the sheet's own value: the handoff in publish()
    // glides controls back, and leaving the value alone means we never fight
    // a sheet that is running its own close animation.
    return () => remove(top, gen);
  }, [top, active]);
}

/**
 * For bottom-anchored cards without a translateY. Attach the returned handler
 * to the card's root `onLayout`; the root must be a direct child of a
 * full-screen container so `layout.y` is its screen Y.
 */
export function useStaticSheetTop(active = true) {
  const top = useRef(new Animated.Value(WINDOW_H)).current;
  useReportSheetTop(top, active);
  return useCallback(
    (e: LayoutChangeEvent) => {
      Animated.timing(top, {
        toValue: e.nativeEvent.layout.y,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [top]
  );
}

/** Top edge (screen Y) of the top-most open sheet. Never null. */
export function useSheetTop(): SheetTopNode {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current
  );
}

/**
 * Position for a control that rides on top of the sheet. The control must be
 * laid out with `top: 0` and use the returned translateY.
 *
 *  - follows the sheet with `gap` px of clearance
 *  - never drops below `restTop` (its position when no sheet is open)
 *  - never rises above `minTop`; once the sheet passes that point the control
 *    fades out instead of being half-covered
 */
export function floatAboveSheet(
  sheetTop: SheetTopNode,
  opts: { height: number; restTop: number; minTop: number; gap?: number }
) {
  const { height, restTop, gap = 12 } = opts;
  const lo = Math.min(opts.minTop, restTop - 1);
  const loSheet = lo + height + gap;
  return {
    translateY: sheetTop.interpolate({
      inputRange: [loSheet, restTop + height + gap],
      outputRange: [lo, restTop],
      extrapolate: "clamp",
    }),
    opacity: sheetTop.interpolate({
      inputRange: [loSheet - 40, loSheet - 6],
      outputRange: [0, 1],
      extrapolate: "clamp",
    }),
  };
}

/** Opacity that drops to 0 as the sheet's top edge rises past `y`. */
export function fadeWhenSheetAbove(sheetTop: SheetTopNode, y: number) {
  return sheetTop.interpolate({
    inputRange: [y - 12, y + 6],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
}

// ─── Sheet accessory ─────────────────────────────────────────────────────────
// A card that itself rides on top of the sheet (IntermStopInfoCard) reserves
// its height here, so the floating controls stack above it, not under it.
// Animated, so the controls glide up when it appears and back down when it
// closes.

const accessoryHeight = new Animated.Value(0);
let accessoryTarget = 0;

export function setSheetAccessoryHeight(h: number) {
  if (h === accessoryTarget) return;
  accessoryTarget = h;
  Animated.timing(accessoryHeight, {
    toValue: h,
    duration: 240,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: true,
  }).start();
}

/** Height reserved above the sheet by an accessory card (animated). */
export function useSheetAccessoryHeight(): Animated.Value {
  return accessoryHeight;
}

// ─── Top UI edge ─────────────────────────────────────────────────────────────
// MapFloatingUI publishes the bottom edge of its top bar (search bar + chips,
// or the navigation banner) so other overlays can sit below it.

let topUiBottom = 0;
const topListeners = new Set<() => void>();

export function setTopUiBottom(y: number) {
  if (y === topUiBottom) return;
  topUiBottom = y;
  topListeners.forEach((l) => l());
}

/** Bottom edge of the map's top bar, or 0 before it has been measured. */
export function useTopUiBottom(): number {
  return useSyncExternalStore(
    (l) => {
      topListeners.add(l);
      return () => {
        topListeners.delete(l);
      };
    },
    () => topUiBottom,
    () => topUiBottom
  );
}
