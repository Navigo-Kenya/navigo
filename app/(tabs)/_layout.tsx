// app/(tabs)/_layout.tsx
import { useReportSheetTop, useTabBarHidden } from "@/components/app/mapSheetInsets";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import React, { useRef, useState, useEffect } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import Reanimated, { LinearTransition } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNotificationStore } from "@/store/notificationStore";
import { useAuthStore } from "@/store/authStore";
import { useJourneyStore } from "@/store/journeyStore";
import GuestWall from "@/components/app/GuestWall";
import Profile from "./profile";
import FavoriteScreen from "./favorite";
import ContributeScreen from "./contribution";
import { Icon } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";
const BLACK = "#111827";
const WHITE = "#FFFFFF";
const TAB_BAR_HEIGHT = 62;
const { height: SCREEN_H } = Dimensions.get("window");

type TabId = "explore" | "transit" | "you" | "contribute" | "profile";

const TABS: {
  id: TabId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: "explore",    label: "Map",        icon: "compass-outline",       iconActive: "compass"        },
  { id: "transit",    label: "Transit",    icon: "train-outline",         iconActive: "train"          },
  { id: "you",        label: "Saved",      icon: "bookmark-outline",      iconActive: "bookmark"       },
  { id: "contribute", label: "Contribute", icon: "add-circle-outline",    iconActive: "add-circle"     },
  { id: "profile",    label: "Profile",    icon: "person-circle-outline", iconActive: "person-circle"  },
];

function DraggableSheet({
  visible,
  onClose,
  snapFraction = 0.62,
  minHeightOffset = 240,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  snapFraction?: number;
  minHeightOffset?: number;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";
  const sheetBg = dark ? "#18181B" : WHITE;
  const handleColor = dark ? "#3F3F46" : "#D1D5DB";

  const SNAP_Y = SCREEN_H * (1 - snapFraction);
  const FULL_Y = SCREEN_H * 0.08;
  const MIN_Y  = SCREEN_H - minHeightOffset;

  const translateY      = useRef(new Animated.Value(SCREEN_H)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const currentY        = useRef(SNAP_Y);
  const [isMinimized, setIsMinimized] = useState(false);
  // Floating map controls follow this sheet's top edge.
  useReportSheetTop(translateY, visible, { hidesTabBar: false });

  useEffect(() => {
    if (visible) {
      setIsMinimized(false);
      currentY.current = SNAP_Y;
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: SNAP_Y,
          useNativeDriver: true,
          damping: 26,
          stiffness: 310,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: SCREEN_H,
          useNativeDriver: true,
          damping: 22,
          stiffness: 240,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, SNAP_Y, translateY, backdropOpacity]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dy) > 6 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        translateY.setValue(Math.max(FULL_Y, currentY.current + gs.dy));
      },
      onPanResponderRelease: (_, gs) => {
        const destY = currentY.current + gs.dy;
        let targetY = currentY.current;

        if (gs.vy > 0.7 || gs.dy > 90) {
          targetY = currentY.current === FULL_Y ? SNAP_Y : MIN_Y;
        } else if (gs.vy < -0.5 || gs.dy < -80) {
          targetY = currentY.current === MIN_Y ? SNAP_Y : FULL_Y;
        } else {
          const dFull = Math.abs(destY - FULL_Y);
          const dSnap = Math.abs(destY - SNAP_Y);
          const dMin  = Math.abs(destY - MIN_Y);

          if (dFull < dSnap && dFull < dMin) targetY = FULL_Y;
          else if (dSnap < dFull && dSnap < dMin) targetY = SNAP_Y;
          else targetY = MIN_Y;
        }

        const minimizing = targetY === MIN_Y;
        setIsMinimized(minimizing);

        Animated.parallel([
          Animated.spring(translateY, {
            toValue: targetY,
            useNativeDriver: true,
            damping: 24,
            stiffness: 280,
          }),
          Animated.timing(backdropOpacity, {
            toValue: minimizing ? 0 : 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();

        currentY.current = targetY;
      },
    })
  ).current;

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        pointerEvents={isMinimized ? "none" : "auto"}
        style={[
          StyleSheet.absoluteFill,
          { opacity: backdropOpacity, backgroundColor: "rgba(0,0,0,0.32)" },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        pointerEvents="auto"
        style={[
          styles.sheet,
          { transform: [{ translateY }], backgroundColor: sheetBg },
        ]}
      >
        <View {...panResponder.panHandlers} style={styles.handleArea}>
          <View style={[styles.handle, { backgroundColor: handleColor }]} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces
          contentContainerStyle={{
            paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 28,
          }}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function CustomFloatingTabBar({
  activeTab,
  onTabPress,
}: {
  activeTab: TabId;
  onTabPress: (id: TabId) => void;
}) {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const activeJourney = useJourneyStore((s) => s.activeJourney);
  // Map sheets open where the dock sits: slide it away while one is open.
  const sheetOpen = useTabBarHidden();
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(slide, {
      toValue: sheetOpen ? 1 : 0,
      useNativeDriver: true,
      damping: 22,
      stiffness: 240,
    }).start();
  }, [sheetOpen, slide]);

  // Hide the floating dock when a journey sheet or turn-by-turn nav is active
  if (activeJourney) return null;

  const capsuleBg = dark ? "rgba(24, 24, 27, 0.96)" : "rgba(255, 255, 255, 0.96)";
  const borderCol = dark ? "rgba(63, 63, 70, 0.7)" : "rgba(229, 231, 235, 0.9)";
  const inactiveIconColor = dark ? "#A1A1AA" : "#4B5563";

  return (
    <Animated.View
      pointerEvents={sheetOpen ? "none" : "box-none"}
      style={[
        styles.floatingDockWrapper,
        {
          bottom: Math.max(insets.bottom, 12),
          opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [
            {
              translateY: slide.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 58 + Math.max(insets.bottom, 12) + 16],
              }),
            },
          ],
        },
      ]}
    >
      <View
        style={[
          styles.floatingCapsule,
          { backgroundColor: capsuleBg, borderColor: borderCol },
        ]}
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <Pressable
              key={tab.id}
              onPress={() => {
                Haptics.selectionAsync();
                onTabPress(tab.id);
              }}
              style={styles.tabItem}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
            >
              <Reanimated.View
                layout={LinearTransition.springify().damping(18).stiffness(220)}
                style={[styles.tabPill, isActive && styles.tabPillActive]}
              >
                <View>
                  <Icon
                    name={isActive ? tab.iconActive : tab.icon}
                    size={21}
                    color={isActive ? WHITE : inactiveIconColor}
                  />
                  {tab.id === "profile" && unreadCount > 0 && (
                    <View
                      style={[
                        styles.notifDot,
                        {
                          borderColor: isActive
                            ? ORANGE
                            : dark
                            ? "#18181B"
                            : WHITE,
                        },
                      ]}
                    />
                  )}
                </View>
                {isActive && <Text style={styles.tabLabel}>{tab.label}</Text>}
              </Reanimated.View>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

export default function TabsLayout() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("explore");
  const [openSheet, setOpenSheet] = useState<TabId | null>(null);

  const handleTabPress = (id: TabId) => {
    if (id === "explore") {
      setOpenSheet(null);
      setActiveTab("explore");
      router.push("/(tabs)/map" as any);
    } else if (id === "transit") {
      setOpenSheet(null);
      setActiveTab("explore");
      router.push("/(tabs)/search?tab=transit" as any);
    } else {
      setActiveTab(id);
      setOpenSheet(id);
    }
  };

  const closeSheet = () => {
    setOpenSheet(null);
    setActiveTab("explore");
  };

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const dark = useColorScheme() === "dark";

  return (
    <View style={{ flex: 1, backgroundColor: dark ? "#0F0F0F" : "#FFFFFF" }}>
      <Tabs
        initialRouteName="map"
        screenOptions={{
          tabBarStyle: { display: "none" },
          headerShown: false,
        }}
      >
        <Tabs.Screen name="map" />
        <Tabs.Screen name="contribution" options={{ href: null }} />
        <Tabs.Screen name="search" />
        <Tabs.Screen name="profile" options={{ href: null }} />
      </Tabs>

      <DraggableSheet
        visible={openSheet === "you"}
        onClose={closeSheet}
        snapFraction={0.62}
        minHeightOffset={230}
      >
        {isAuthenticated ? (
          <FavoriteScreen onClose={closeSheet} />
        ) : (
          <GuestWall
            icon="bookmark-outline"
            title="Your saved places & routes"
            subtitle="Sign in to save stations, lines, and one-tap Home/Work commutes."
          />
        )}
      </DraggableSheet>

      <DraggableSheet
        visible={openSheet === "contribute"}
        onClose={closeSheet}
        snapFraction={0.65}
        minHeightOffset={230}
      >
        {isAuthenticated ? (
          <ContributeScreen />
        ) : (
          <GuestWall
            icon="megaphone-outline"
            title="Contribute to Navigo"
            subtitle="Sign in to report stage queues, traffic, and earn Navigo Points."
          />
        )}
      </DraggableSheet>

      <DraggableSheet
        visible={openSheet === "profile"}
        onClose={closeSheet}
        snapFraction={0.85}
        minHeightOffset={230}
      >
        {isAuthenticated ? (
          <Profile />
        ) : (
          <GuestWall
            icon="person-circle-outline"
            title="Your profile"
            subtitle="Sign in to manage your account, mobility preferences, and alerts."
          />
        )}
      </DraggableSheet>

      {/* Detached KakaoMap-style Floating Capsule Dock */}
      <CustomFloatingTabBar activeTab={activeTab} onTabPress={handleTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_H,
    backgroundColor: WHITE,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 24,
  },
  handleArea: {
    paddingTop: 14,
    paddingBottom: 10,
    alignItems: "center",
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
  },
  floatingDockWrapper: {
    position: "absolute",
    left: 22,
    right: 22,
    zIndex: 15,
    alignItems: "center",
  },
  floatingCapsule: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    height: 58,
    paddingHorizontal: 8,
    borderRadius: 32,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 24,
    overflow: "hidden",
    gap: 6,
  },
  tabPillActive: {
    backgroundColor: ORANGE,
  },
  tabLabel: {
    color: WHITE,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  notifDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF3B30",
    borderWidth: 1.5,
  },
});