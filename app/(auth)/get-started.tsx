
// app/get-started.tsx
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icons/Icon";

const { width: SCREEN_W } = Dimensions.get("window");

const SLIDES = [
  {
    key: "navigate",
    icon: "navigate" as const,
    title: "Navigate Nairobi",
    subtitle: "Find matatu routes, boarding stages, and arrival times, all in one place.",
    cardBg: "#FFF3E0",
    cardBgDark: "#2A1800",
    iconColor: "#FF6F00",
  },
  {
    key: "realtime",
    icon: "time" as const,
    title: "No more guessing",
    subtitle: "Real-time route planning powered by live transit data from the city network.",
    cardBg: "#EFF6FF",
    cardBgDark: "#00152A",
    iconColor: "#3B82F6",
  },
  {
    key: "community",
    icon: "people" as const,
    title: "Built for commuters",
    subtitle: "Join thousands of Nairobians who navigate smarter with Navigo every day.",
    cardBg: "#F0FDF4",
    cardBgDark: "#002214",
    iconColor: "#22C55E",
  },
] as const;

type Slide = (typeof SLIDES)[number];

export default function GetStarted() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";
  const { markOnboardingSeen } = useAuthStore();

  const handleExploreAsGuest = () => {
    markOnboardingSeen();
    router.replace("/(tabs)/map");
  };
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const C = {
    bg:      dark ? "#0F0F0F" : "#FFFFFF",
    text:    dark ? "#F9FAFB" : "#111827",
    textSub: dark ? "#9CA3AF" : "#6B7280",
    accent:  "#FF6F00",
    dot:     dark ? "#2C2C2E" : "#D1D5DB",
    ghost:   dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
    ghostBd: dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % SLIDES.length;
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 4000);
  };

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const handleScrollEnd = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActiveIndex(idx);
    startTimer();
  };

  const advance = () => {
    const next = (activeIndex + 1) % SLIDES.length;
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setActiveIndex(next);
    startTimer();
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <View style={styles.logoRow}>
          <Image 
            source={
              dark 
                ? require("@/assets/images/logo-white.png") 
                : require("@/assets/images/logo.png")
            } 
            style={styles.logoImage} 
            resizeMode="contain" 
          />
        </View>
        <Pressable onPress={() => router.push("/(auth)/login")}>
          <Text style={[styles.skipText, { color: C.accent }]}>Sign in</Text>
        </Pressable>
      </View>

      {/* Slides */}
      <FlatList
        ref={listRef}
        data={SLIDES as unknown as Slide[]}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollBeginDrag={() => { if (timerRef.current) clearInterval(timerRef.current); }}
        keyExtractor={(s) => s.key}
        getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
        renderItem={({ item }) => <SlideItem slide={item} dark={dark} C={C} />}
        style={{ flex: 1 }}
      />

      {/* Bottom controls */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
        {/* Pill dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <Pressable
              key={i}
              onPress={() => {
                listRef.current?.scrollToIndex({ index: i, animated: true });
                setActiveIndex(i);
                startTimer();
              }}
            >
              <View
                style={[
                  styles.dot,
                  i === activeIndex
                    ? [styles.dotActive, { backgroundColor: C.accent }]
                    : [styles.dotInactive, { backgroundColor: C.dot }],
                ]}
              />
            </Pressable>
          ))}
        </View>

        {/* Primary CTA */}
        <Pressable
          style={[styles.primary, { backgroundColor: C.accent }]}
          onPress={isLast ? () => router.push("/(auth)/register") : advance}
        >
          <Text style={styles.primaryText}>
            {isLast ? "Get Started" : "Next"}
          </Text>
          <Icon
            name={isLast ? "arrow-forward" : "chevron-forward"}
            size={18}
            color="#FFF"
          />
        </Pressable>

        {/* Guest escape hatch — Now a prominent secondary button */}
        <Pressable 
          style={[styles.secondaryBtn, { backgroundColor: C.ghost }]} 
          onPress={handleExploreAsGuest}
        >
          <Text style={[styles.secondaryBtnText, { color: C.text }]}>
            Explore without signing up
          </Text>
        </Pressable>

        {/* Sign in link */}
        <Pressable onPress={() => router.push("/(auth)/login")} style={styles.signinBtn}>
          <Text style={[styles.signinText, { color: C.textSub }]}>
            Already have an account?{" "}
            <Text style={{ color: C.accent, fontWeight: "600" }}>Sign in</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SlideItem({
  slide,
  dark,
  C,
}: {
  slide: Slide;
  dark: boolean;
  C: Record<string, string>;
}) {
  const circleSize = Math.min(SCREEN_W * 0.64, 260);
  const bg = dark ? slide.cardBgDark : slide.cardBg;

  return (
    <View style={[styles.slide, { width: SCREEN_W }]}>
      {/* Illustration */}
      <View style={styles.illustrationWrap}>
        {/* Outer ring */}
        <View
          style={[
            styles.outerRing,
            {
              width: circleSize + 40,
              height: circleSize + 40,
              borderRadius: (circleSize + 40) / 2,
              backgroundColor: bg,
              opacity: 0.4,
            },
          ]}
        />
        {/* Main circle */}
        <View
          style={[
            styles.mainCircle,
            {
              width: circleSize,
              height: circleSize,
              borderRadius: circleSize / 2,
              backgroundColor: bg,
            },
          ]}
        >
          <Icon name={slide.icon} size={circleSize * 0.38} color={slide.iconColor} />
        </View>
      </View>

      {/* Text */}
      <View style={styles.textBlock}>
        <Text style={[styles.slideTitle, { color: C.text }]}>{slide.title}</Text>
        <Text style={[styles.slideSubtitle, { color: C.textSub }]}>{slide.subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  logoRow: { flexDirection: "row", alignItems: "center" },
  logoImage: {
    height: 42,
    width: 110, // Adjust width based on your actual logo's aspect ratio
  },
  skipText: { fontSize: 15, fontWeight: "600" },

  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 36,
  },
  illustrationWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  outerRing: {
    position: "absolute",
  },
  mainCircle: {
    justifyContent: "center",
    alignItems: "center",
  },
  textBlock: {
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 8,
  },
  slideTitle: {
    fontSize: 30,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  slideSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },

  bottom: {
    paddingHorizontal: 24,
    gap: 16,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  dot: { height: 8, borderRadius: 4 },
  dotActive: { width: 28 },
  dotInactive: { width: 8 },

  primary: {
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryText: { color: "#FFF", fontSize: 16, fontWeight: "700" },

  secondaryBtn: {
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { fontSize: 16, fontWeight: "600" },

  signinBtn: { alignItems: "center", paddingVertical: 8 },
  signinText: { fontSize: 14 },
});

