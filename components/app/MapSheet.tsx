// components/app/MapSheet.tsx
//
// KakaoMap-style draggable bottom sheet for everything that opens over the
// map. One implementation for snap points, dragging, dismissal and the
// floating-controls handshake, so every sheet behaves the same.
//
//   - `snapPoints`: visible heights in px (ascending), e.g. [300, 0.55*H, 0.9*H]
//   - drag the grabber / header anywhere; drag the body to expand until the
//     sheet is at its top snap, after which the body scrolls
//   - release snaps to the nearest point along the throw (velocity-aware);
//     dragging below the lowest snap dismisses
//   - `footer` is pinned to the screen bottom at every snap and slides away
//     as the sheet closes
//   - reports its top edge to mapSheetInsets, so MapFloatingUI controls ride
//     above it, and hides the floating tab bar while open
//   - Android back closes the top-most sheet
//
// Open/close: mount it (or set `visible`) to open; the close button / drag /
// back animate out, then call `onClose`. Setting `visible={false}` from the
// parent also animates out before unmounting the content.
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useColorScheme,
  type LayoutChangeEvent,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReportSheetTop } from "./mapSheetInsets";

const SCREEN_H = Dimensions.get("window").height;
/** How far (ms) a release "throws" the sheet when picking a snap point. */
const THROW_MS = 160;
/** Extra drag past the lowest snap that dismisses. */
const DISMISS_PX = 72;

export interface MapSheetHandle {
  /** Animate out, then call onClose. */
  close(): void;
  /** Animate to a snap point by index. */
  snapTo(index: number): void;
}

export interface MapSheetProps {
  /** Visible heights in px, smallest first. */
  snapPoints: number[];
  /** Index of the snap point to open at. Default 0. */
  initialSnap?: number;
  /** Called once the sheet has animated out. */
  onClose: () => void;
  /** Controlled visibility. Default true (mount = open). */
  visible?: boolean;
  /** Drag below the lowest snap point to close. Default true. */
  dismissible?: boolean;
  /** Draggable area under the grabber (title row, tabs, ...). */
  header?: React.ReactNode;
  /** Sheet body. Scrolls once the sheet is at its top snap. */
  children?: React.ReactNode;
  /** Pinned to the bottom of the screen (actions, confirm button). */
  footer?: React.ReactNode;
  /** Dim the map behind the sheet (tap to close). Default false. */
  backdrop?: boolean;
  /** Wrap the body in a ScrollView. Default true. */
  scrollable?: boolean;
  /** Hide the floating tab bar while open. Default true. */
  hidesTabBar?: boolean;
  onSnapChange?: (index: number) => void;
  /** Extra style for the sheet surface. */
  style?: ViewStyle;
  testID?: string;
}

export const MapSheet = forwardRef<MapSheetHandle, MapSheetProps>(
  function MapSheet(
    {
      snapPoints,
      initialSnap = 0,
      onClose,
      visible = true,
      dismissible = true,
      header,
      children,
      footer,
      backdrop = false,
      scrollable = true,
      hidesTabBar = true,
      onSnapChange,
      style,
      testID,
    },
    ref
  ) {
    const dark = useColorScheme() === "dark";
    const insets = useSafeAreaInsets();

    const heights = useMemo(
      () => [...snapPoints].map((h) => Math.min(h, SCREEN_H - insets.top - 8)).sort((a, b) => a - b),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [snapPoints.join(","), insets.top]
    );
    const sheetH = heights[heights.length - 1];
    /** translateY for each snap (sheet top's screen Y). */
    const tops = useMemo(() => heights.map((h) => SCREEN_H - h), [heights]);
    const lowestTop = tops[0];
    const highestTop = tops[tops.length - 1];

    const translateY = useRef(new Animated.Value(SCREEN_H)).current;
    const current = useRef(Math.min(initialSnap, heights.length - 1));
    const [snapIndex, setSnapIndex] = useState(current.current);
    const [mounted, setMounted] = useState(visible);
    const closing = useRef(false);
    const [footerH, setFooterH] = useState(0);

    useReportSheetTop(translateY, mounted, { hidesTabBar });

    const setIndex = useCallback(
      (i: number) => {
        current.current = i;
        setSnapIndex(i);
        onSnapChange?.(i);
      },
      [onSnapChange]
    );

    const snapTo = useCallback(
      (i: number, velocity = 0) => {
        const idx = Math.max(0, Math.min(i, tops.length - 1));
        setIndex(idx);
        Animated.spring(translateY, {
          toValue: tops[idx],
          velocity,
          useNativeDriver: true,
          damping: 26,
          stiffness: 260,
          mass: 0.9,
          overshootClamping: false,
          restDisplacementThreshold: 0.5,
          restSpeedThreshold: 0.5,
        }).start();
      },
      [tops, translateY, setIndex]
    );

    const animateOut = useCallback(
      (then?: () => void) => {
        if (closing.current) return;
        closing.current = true;
        Animated.timing(translateY, {
          toValue: SCREEN_H,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          closing.current = false;
          setMounted(false);
          then?.();
        });
      },
      [translateY]
    );

    const close = useCallback(() => animateOut(onClose), [animateOut, onClose]);

    useImperativeHandle(ref, () => ({ close, snapTo: (i) => snapTo(i) }), [close, snapTo]);

    // Open on mount / when visible flips on; animate out when it flips off.
    useEffect(() => {
      if (visible) {
        setMounted(true);
        closing.current = false;
        translateY.setValue(SCREEN_H);
        snapTo(current.current);
      } else if (mounted) {
        animateOut();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    // Android back closes the sheet.
    useEffect(() => {
      if (!mounted) return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        close();
        return true;
      });
      return () => sub.remove();
    }, [mounted, close]);

    // ── Dragging ──────────────────────────────────────────────────────────────
    const dragStart = useRef(0);
    const release = useCallback(
      (dy: number, vy: number) => {
        const y = dragStart.current + dy;
        const projected = y + vy * THROW_MS;
        if (dismissible && (projected > lowestTop + DISMISS_PX || (vy > 1.4 && current.current === 0))) {
          close();
          return;
        }
        // Nearest snap to where the throw would land.
        let best = 0;
        tops.forEach((t, i) => {
          if (Math.abs(t - projected) < Math.abs(tops[best] - projected)) best = i;
        });
        snapTo(best, vy);
      },
      [dismissible, lowestTop, tops, snapTo, close]
    );

    const move = useCallback(
      (dy: number) => {
        let y = dragStart.current + dy;
        // Rubber band above the top snap.
        if (y < highestTop) y = highestTop - (highestTop - y) * 0.25;
        translateY.setValue(Math.min(SCREEN_H, y));
      },
      [highestTop, translateY]
    );

    const grant = useCallback(() => {
      translateY.stopAnimation((v) => {
        dragStart.current = v;
      });
    }, [translateY]);

    /** Grabber + header: always drag the sheet. */
    const headerPan = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => false,
          onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
          onPanResponderGrant: grant,
          onPanResponderMove: (_, g) => move(g.dy),
          onPanResponderRelease: (_, g) => release(g.dy, g.vy),
          onPanResponderTerminate: (_, g) => release(g.dy, g.vy),
        }),
      [grant, move, release]
    );

    /** Body: drags the sheet until it's fully expanded, then lets it scroll. */
    const atTop = snapIndex === tops.length - 1;
    const bodyPan = useMemo(
      () =>
        PanResponder.create({
          onMoveShouldSetPanResponder: (_, g) =>
            !atTop && Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
          onPanResponderGrant: grant,
          onPanResponderMove: (_, g) => move(g.dy),
          onPanResponderRelease: (_, g) => release(g.dy, g.vy),
          onPanResponderTerminate: (_, g) => release(g.dy, g.vy),
        }),
      [atTop, grant, move, release]
    );

    if (!mounted) return null;

    const C = {
      bg: dark ? "#18181B" : "#FFFFFF",
      grabber: dark ? "#52525B" : "#D1D5DB",
      hairline: dark ? "#27272A" : "#E5E7EB",
    };

    const bodyPad = (footer ? footerH : 0) + Math.max(insets.bottom, 12) + 12;

    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID={testID}>
        {backdrop && (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: "#000",
                opacity: translateY.interpolate({
                  inputRange: [lowestTop, SCREEN_H],
                  outputRange: [0.28, 0],
                  extrapolate: "clamp",
                }),
              },
            ]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
          </Animated.View>
        )}

        <Animated.View
          style={[
            styles.sheet,
            { height: sheetH, backgroundColor: C.bg, transform: [{ translateY }] },
            style,
          ]}
        >
          <View {...headerPan.panHandlers}>
            <View style={styles.grabberWrap}>
              <View style={[styles.grabber, { backgroundColor: C.grabber }]} />
            </View>
            {header}
          </View>

          <View style={styles.body} {...bodyPan.panHandlers}>
            {scrollable ? (
              <ScrollView
                scrollEnabled={atTop}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: bodyPad }}
              >
                {children}
              </ScrollView>
            ) : (
              <View style={{ flex: 1, paddingBottom: bodyPad }}>{children}</View>
            )}
          </View>
        </Animated.View>

        {footer && (
          <Animated.View
            onLayout={(e: LayoutChangeEvent) => setFooterH(Math.round(e.nativeEvent.layout.height))}
            style={[
              styles.footer,
              {
                backgroundColor: C.bg,
                borderTopColor: C.hairline,
                paddingBottom: Math.max(insets.bottom, 12),
                transform: [
                  {
                    // Pinned while open; slides out with the sheet on close.
                    translateY: translateY.interpolate({
                      inputRange: [lowestTop, SCREEN_H],
                      outputRange: [0, Math.max(footerH, 80) + insets.bottom],
                      extrapolate: "clamp",
                    }),
                  },
                ],
              },
            ]}
          >
            {footer}
          </Animated.View>
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
    elevation: 24,
    zIndex: 30,
    overflow: "hidden",
  },
  grabberWrap: { alignItems: "center", paddingTop: 9, paddingBottom: 8 },
  grabber: { width: 36, height: 4.5, borderRadius: 3 },
  body: { flex: 1 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    zIndex: 31,
    elevation: 25,
  },
});
