// app/(tabs)/_layout.tsx
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
// Aliased: this file already uses react-native's own legacy `Animated` for the
// draggable sheet's spring/timing, so Reanimated's default export (also named
// `Animated`) needs a different local name.
import Reanimated, { LinearTransition } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNotificationStore } from "@/store/notificationStore";
import { useAuthStore } from "@/store/authStore";
import GuestWall from "@/components/app/GuestWall";
import Profile from "./profile";
import FavoriteScreen from "./favorite";
import ContributeScreen from "./contribution";
import ReportSheet from "@/components/app/ReportSheet";

const ORANGE = "#FF6F00";
const BLACK = "#000000";
const INACTIVE_BLACK = "#1A1A1A";
const WHITE = "#FFFFFF";
// Tab bar content height (icon 22dp + label 11dp + gaps + paddingTop 5dp ≈ 49dp).
// Safe-area bottom is added on top of this at runtime via insets.bottom.
const TAB_BAR_HEIGHT = 64;
const { height: SCREEN_H } = Dimensions.get("window");

// ─── Tab Config ───────────────────────────────────────────────────────────────

type TabId = "explore" | "you" | "contribute" | "profile";

const TABS: {
  id: TabId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: "explore",    label: "Explore",    icon: "map-outline",           iconActive: "map"            },
  { id: "you",        label: "You",        icon: "bookmark-outline",      iconActive: "bookmark"       },
  { id: "contribute", label: "Contribute", icon: "add-circle-outline",    iconActive: "add-circle"     },
  { id: "profile",    label: "Profile",    icon: "person-circle-outline", iconActive: "person-circle"  },
];

// ─── Draggable Bottom Sheet ───────────────────────────────────────────────────

function DraggableSheet({
  visible,
  onClose,
  snapFraction = 0.62,
  minHeightOffset = 240, // Dynamic limit so Title & Subtitle peek above the tab bar
  children,
}: {
  visible: boolean;
  onClose: () => void;
  snapFraction?: number;
  minHeightOffset?: number;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';
  const sheetBg = dark ? '#1C1C1E' : WHITE;
  const handleColor = dark ? '#3A3A3C' : '#D1D5DB';
  
  // 3-Step Snapping Points
  const SNAP_Y  = SCREEN_H * (1 - snapFraction); // Half open
  const FULL_Y  = SCREEN_H * 0.08;               // Fully expanded
  const MIN_Y   = SCREEN_H - minHeightOffset;    // Minimized (peeking limit)

  const translateY      = useRef(new Animated.Value(SCREEN_H)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const currentY        = useRef(SNAP_Y);
  
  // Track minimized state to disable backdrop pointer events so users can tap the map
  const [isMinimized, setIsMinimized] = useState(false);

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
  }, [visible]);

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
          // Flick or big drag down -> go down a step
          targetY = currentY.current === FULL_Y ? SNAP_Y : MIN_Y;
        } else if (gs.vy < -0.5 || gs.dy < -80) {
          // Flick or big drag up -> go up a step
          targetY = currentY.current === MIN_Y ? SNAP_Y : FULL_Y;
        } else {
          // Snap to the closest step
          const dFull = Math.abs(destY - FULL_Y);
          const dSnap = Math.abs(destY - SNAP_Y);
          const dMin  = Math.abs(destY - MIN_Y);

          if (dFull < dSnap && dFull < dMin) targetY = FULL_Y;
          else if (dSnap < dFull && dSnap < dMin) targetY = SNAP_Y;
          else targetY = MIN_Y;
        }

        const minimizing = targetY === MIN_Y;
        setIsMinimized(minimizing);

        // Animate Sheet AND Backdrop simultaneously 
        Animated.parallel([
          Animated.spring(translateY, {
            toValue: targetY,
            useNativeDriver: true,
            damping: 24,
            stiffness: 280,
          }),
          Animated.timing(backdropOpacity, {
            toValue: minimizing ? 0 : 1, // Fade out backdrop so map is clickable
            duration: 200,
            useNativeDriver: true,
          })
        ]).start();

        currentY.current = targetY;
      },
    })
  ).current;

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dimmed backdrop - pointerEvents toggles based on minification */}
      <Animated.View
        pointerEvents={isMinimized ? "none" : "auto"}
        style={[StyleSheet.absoluteFill, { opacity: backdropOpacity, backgroundColor: "rgba(0,0,0,0.32)" }]}
      >
        {/* Tapping the backdrop fully closes the sheet and resets the tab */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet card */}
      <Animated.View
        pointerEvents="auto"
        style={[styles.sheet, { transform: [{ translateY }], backgroundColor: sheetBg }]}
      >
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={styles.handleArea}>
          <View style={[styles.handle, { backgroundColor: handleColor }]} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces
          contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_HEIGHT }}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ─── Custom Tab Bar ───────────────────────────────────────────────────────────

function CustomTabBar({
  activeTab,
  onTabPress,
}: {
  activeTab: TabId;
  onTabPress: (id: TabId) => void;
}) {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';
  const tabBarBg = dark ? '#1C1C1E' : WHITE;
  const labelColor = dark ? '#EBEBF5' : INACTIVE_BLACK;
  const inactiveIconColor = dark ? '#8E8E93' : '#5F6368';
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <View
      style={[
        styles.tabBar,
        { paddingBottom: insets.bottom, backgroundColor: tabBarBg },
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
                <Ionicons
                  name={isActive ? tab.iconActive : tab.icon}
                  size={22}
                  color={isActive ? WHITE : inactiveIconColor}
                />
                {tab.id === "profile" && unreadCount > 0 && (
                  <View style={[
                    styles.notifDot,
                    { borderColor: isActive ? ORANGE : (dark ? '#1C1C1E' : WHITE) },
                  ]} />
                )}
              </View>
              {isActive && <Text style={styles.tabLabel}>{tab.label}</Text>}
            </Reanimated.View>
            {!isActive && (
              <Text style={[styles.tabInactiveLabel, { color: labelColor }]} numberOfLines={1}>
                {tab.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}


// ─── Sheet: Contribute ────────────────────────────────────────────────────────

function ContributeContent() {
  const dark = useColorScheme() === 'dark';
  return (
    <View style={styles.sheetBody}>
      <Text style={[styles.sheetTitle, { color: dark ? '#FFFFFF' : BLACK }]}>Contribute</Text>
      <Text style={styles.sheetSubtitle}>Help improve Navigo for everyone in Nairobi</Text>
    </View>
  );
}


// ─── Root Layout ──────────────────────────────────────────────────────────────

export default function TabsLayout() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("explore");
  const [openSheet, setOpenSheet] = useState<TabId | null>(null);

  const handleTabPress = (id: TabId) => {
    if (id === "explore") {
      setOpenSheet(null);
      setActiveTab("explore");
      router.push("/(tabs)/map" as any);
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
  const dark = useColorScheme() === 'dark';

  return (
    <View style={{ flex: 1, backgroundColor: dark ? '#0F0F0F' : '#FFFFFF' }}>
      {/* expo-router screens, native tab bar hidden */}
      <Tabs
        initialRouteName="map"
        screenOptions={{
          tabBarStyle:  { display: "none" },
          headerShown:  false,
        }}
      >
        <Tabs.Screen name="map"          />
        <Tabs.Screen name="contribution" options={{ href: null }} />
        <Tabs.Screen name="search"       />
        <Tabs.Screen name="profile"      options={{ href: null }} />
      </Tabs>

      {/* ── Draggable sheets ── */}
      <DraggableSheet
        visible={openSheet === "you"}
        onClose={closeSheet}
        snapFraction={0.6}
        minHeightOffset={230}
      >
        {isAuthenticated
          ? <FavoriteScreen onClose={closeSheet} />
          : <GuestWall
              icon="bookmark-outline"
              title="Your saved places"
              subtitle="Sign in to save places, journeys, and build custom lists."
            />
        }
      </DraggableSheet>

      <DraggableSheet
        visible={openSheet === "contribute"}
        onClose={closeSheet}
        snapFraction={0.65}
        minHeightOffset={230}
      >
        {isAuthenticated
          ? <ContributeScreen />
          : <GuestWall
              icon="add-circle-outline"
              title="Contribute to Navigo"
              subtitle="Sign in to report delays, review stops, and earn Navigo Points."
            />
        }
      </DraggableSheet>

      {/* <DraggableSheet
        visible={openSheet === "contribute"}
        onClose={closeSheet}
        snapFraction={0.70} // Slightly taller for the list layout
        minHeightOffset={230}
      >
        {isAuthenticated
          ? <ReportSheet onClose={closeSheet} />
          : <GuestWall
              icon="add-circle-outline"
              title="Contribute to Navigo"
              subtitle="Sign in to report delays, route changes, and warn others about traffic."
            />
        }
      </DraggableSheet> */}

      <DraggableSheet
        visible={openSheet === "profile"}
        onClose={closeSheet}
        snapFraction={0.85}
        minHeightOffset={230}
      >
        {isAuthenticated
          ? <Profile />
          : <GuestWall
              icon="person-circle-outline"
              title="Your profile"
              subtitle="Sign in to manage your account, preferences, and notification settings."
            />
        }
      </DraggableSheet>

      {/* ── Floating tab bar, always on top ── */}
      <CustomTabBar activeTab={activeTab} onTabPress={handleTabPress} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Sheet ────────────────────────────────────────────────────────────────────
  sheet: {
    position:            "absolute",
    left:                0,
    right:               0,
    bottom:              0,
    height:              SCREEN_H,
    backgroundColor:     WHITE,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    shadowColor:          "#000",
    shadowOpacity:        0.18,
    shadowRadius:         24,
    shadowOffset:         { width: 0, height: -6 },
    elevation:            24,
  },
  handleArea: {
    paddingTop:    14,
    paddingBottom: 10,
    alignItems:    "center",
  },
  handle: {
    width:        42,
    height:        4,
    borderRadius:  2,
    backgroundColor: "#D1D5DB",
  },

  // ── Tab Bar ──────────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "space-around",
    backgroundColor: WHITE,
    paddingTop:        5,
    paddingBottom:    10,
    paddingHorizontal: 6,
    zIndex:           10,
  },
  tabItem: {
    flex:           1,
    alignItems:     "center",
    justifyContent: "center",
    gap:             2,
  },
  tabPill: {
    flexDirection:   "row",
    alignItems:      "center",
    paddingVertical:  8,
    paddingHorizontal: 14,
    borderRadius:     100,
    overflow:         "hidden", // enforces rounded clip on Android
    gap:               7,
  },
  tabPillActive: {
    backgroundColor: ORANGE,
  },
  tabLabel: {
    color:      WHITE,
    fontSize:   11,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  tabInactiveLabel: {
    color:      INACTIVE_BLACK,
    fontSize:   11,
    fontWeight: "400",
    letterSpacing: 0.2,
    marginTop:  1,
  },
  notifDot: {
    position:     "absolute",
    top:           -1,
    right:         -1,
    width:          8,
    height:         8,
    borderRadius:   4,
    backgroundColor: "#FF3B30",
    borderWidth:    1.5,
  },

  // ── Sheet Body & Common ───────────────────────────────────────────────────────
  sheetBody: {
    paddingHorizontal: 10,
    paddingTop:         4,
  },
  sheetTitle: {
    fontSize:   26,
    fontWeight: "800",
    color:       BLACK,
    marginBottom: 4,
    letterSpacing: -0.4,
  },
  sheetSubtitle: {
    fontSize: 14,
    color:    "#6B7280",
    marginBottom: 4,
  },
});