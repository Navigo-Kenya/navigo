// components/ui/PressableScale.tsx
//
// Drop-in Pressable with a tactile press effect: springs down slightly on
// press-in and back on release (native driver, so it stays smooth while the
// JS thread is busy). Use it for floating map buttons, chips and sheet actions.
import React, { useRef } from "react";
import {
  Animated,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export interface PressableScaleProps extends Omit<PressableProps, "style"> {
  /** Style of the visible (animated) surface. */
  style?: StyleProp<ViewStyle>;
  /** Style of the outer touch area, e.g. { flex: 1 } inside a row. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Scale while pressed. Default 0.94. */
  pressedScale?: number;
  /** Opacity while pressed. Default 0.92. */
  pressedOpacity?: number;
  children?: React.ReactNode;
}

export function PressableScale({
  style,
  containerStyle,
  pressedScale = 0.94,
  pressedOpacity = 0.92,
  onPressIn,
  onPressOut,
  disabled,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const to = (s: number, o: number) =>
    Animated.parallel([
      Animated.spring(scale, {
        toValue: s,
        useNativeDriver: true,
        speed: 40,
        bounciness: s < 1 ? 0 : 8,
      }),
      Animated.timing(opacity, { toValue: o, duration: 90, useNativeDriver: true }),
    ]).start();

  return (
    <Pressable
      {...rest}
      style={containerStyle}
      disabled={disabled}
      onPressIn={(e: GestureResponderEvent) => {
        to(pressedScale, pressedOpacity);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        to(1, 1);
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { opacity, transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
