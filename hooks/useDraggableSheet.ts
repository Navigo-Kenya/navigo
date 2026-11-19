// hooks/useDraggableSheet.ts
//
// A plain bottom sheet's motion: it slides up (no spring, no pop), follows
// the finger when dragged down, and closes past a threshold or on a flick;
// otherwise it settles back. Used by the modal sheets (OptionSheet,
// SaveToListSheet) so they behave like the app's other draggable sheets.
import { useCallback, useEffect, useRef } from "react";
import { Animated, Dimensions, Easing, PanResponder } from "react-native";

const SCREEN_H = Dimensions.get("window").height;
/** Dragged further than this (or flicked), the sheet closes. */
const CLOSE_DY = 90;
const CLOSE_VY = 0.9;

export function useDraggableSheet(visible: boolean, onClose: () => void) {
  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  useEffect(() => {
    if (!visible) return;
    closing.current = false;
    translateY.setValue(SCREEN_H);
    backdrop.setValue(0);
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdrop, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [visible, translateY, backdrop]);

  /** Slides the sheet away, then runs `after` and onClose. */
  const close = useCallback(
    (after?: () => void) => {
      if (closing.current) return;
      closing.current = true;
      Animated.parallel([
        Animated.timing(translateY, { toValue: SCREEN_H, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        after?.();
        onClose();
      });
    },
    [translateY, backdrop, onClose]
  );

  // The responder is made once; it reaches the latest close through a ref.
  const closeRef = useRef(close);
  closeRef.current = close;

  const panHandlers = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => translateY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > CLOSE_DY || g.vy > CLOSE_VY) {
          closeRef.current();
          return;
        }
        Animated.timing(translateY, { toValue: 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        Animated.timing(translateY, { toValue: 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      },
    })
  ).current.panHandlers;

  return { translateY, backdrop, panHandlers, close };
}
