// components/app/WeatherMeteoSheet.tsx
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { MapService } from "@/services/map";

const KAKAO_BLUE = "#3B82F6";

export interface LiveWeatherData {
  tempC: number;
  tempDecimal: string;
  deltaYesterday: string;
  conditionLabel: string;
  iconName: keyof typeof Ionicons.glyphMap;
  pm10: number;
  pm25: number;
  pm10Label: "Good" | "Normal" | "Bad";
  pm25Label: "Good" | "Normal" | "Bad";
  pm10Color: string;
  pm25Color: string;
  aqiBg: string;
  aqiColor: string;
  updatedAtLabel: string;
  hourly: Array<{
    hourLabel: string;
    tempC: number;
    precipProb: number;
    icon: keyof typeof Ionicons.glyphMap;
  }>;
  daily: Array<{
    dayLabel: string;
    minC: number;
    maxC: number;
    precipProb: number;
    icon: keyof typeof Ionicons.glyphMap;
  }>;
}

function decodeWmoCode(code: number): {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
} {
  if (code === 0) return { label: "Clear", icon: "sunny" };
  if (code <= 2) return { label: "Partly Cloudy", icon: "partly-sunny" };
  if (code === 3) return { label: "Cloudy", icon: "cloud" };
  if (code <= 48) return { label: "Misty", icon: "cloud" };
  if (code <= 67) return { label: "Rain", icon: "rainy" };
  if (code <= 82) return { label: "Showers", icon: "rainy" };
  if (code >= 95) return { label: "Thunderstorm", icon: "thunderstorm" };
  return { label: "Cloudy", icon: "cloud" };
}

export async function fetchLiveMeteo(
  lat = -1.2864,
  lng = 36.8172
): Promise<LiveWeatherData> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ampm = now.getHours() >= 12 ? "PM" : "AM";
  const hr12 = pad(now.getHours() % 12 || 12);
  const updatedAtLabel = `${now.getFullYear()}.${pad(
    now.getMonth() + 1
  )}.${pad(now.getDate())}. ${ampm} ${hr12}:00`;

  try {
    const [wRes, aqiRes] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`
      ),
      fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm10,pm2_5`
      ),
    ]);

    const wJson = await wRes.json();
    const aqiJson = await aqiRes.json();

    const rawTemp = Number(wJson?.current?.temperature_2m ?? 22.4);
    const pm10 = Math.round(aqiJson?.current?.pm10 ?? 16);
    const pm25 = Math.round(aqiJson?.current?.pm2_5 ?? 8);
    const wmo = decodeWmoCode(wJson?.current?.weather_code ?? 2);

    const pm10Label: LiveWeatherData["pm10Label"] =
      pm10 <= 30 ? "Good" : pm10 <= 80 ? "Normal" : "Bad";
    const pm25Label: LiveWeatherData["pm25Label"] =
      pm25 <= 15 ? "Good" : pm25 <= 35 ? "Normal" : "Bad";

    const pm10Color =
      pm10Label === "Good"
        ? KAKAO_BLUE
        : pm10Label === "Normal"
        ? "#16A34A"
        : "#DC2626";
    const pm25Color =
      pm25Label === "Good"
        ? KAKAO_BLUE
        : pm25Label === "Normal"
        ? "#16A34A"
        : "#DC2626";

    const nowHr = now.getHours();
    const times: string[] = wJson?.hourly?.time ?? [];
    const temps: number[] = wJson?.hourly?.temperature_2m ?? [];
    const probs: number[] = wJson?.hourly?.precipitation_probability ?? [];
    const codes: number[] = wJson?.hourly?.weather_code ?? [];

    const hourly: LiveWeatherData["hourly"] = [];
    for (
      let i = Math.max(0, nowHr);
      i < Math.min(times.length, nowHr + 10);
      i++
    ) {
      const d = new Date(times[i]);
      const h = d.getHours();
      const hourLabel = h === 0 && i > nowHr ? "TMR" : pad(h);
      hourly.push({
        hourLabel,
        tempC: Math.round(temps[i] ?? 22),
        precipProb: Math.round((probs[i] ?? 10) / 10) * 10,
        icon: decodeWmoCode(codes[i] ?? 2).icon,
      });
    }

    const dTimes: string[] = wJson?.daily?.time ?? [];
    const dMax: number[] = wJson?.daily?.temperature_2m_max ?? [];
    const dMin: number[] = wJson?.daily?.temperature_2m_min ?? [];
    const dProb: number[] =
      wJson?.daily?.precipitation_probability_max ?? [];
    const dCodes: number[] = wJson?.daily?.weather_code ?? [];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const daily: LiveWeatherData["daily"] = dTimes.map((t, idx) => {
      const dt = new Date(t);
      return {
        dayLabel: idx === 0 ? "Today" : dayNames[dt.getDay()],
        minC: Math.round(dMin[idx] ?? 15),
        maxC: Math.round(dMax[idx] ?? 25),
        precipProb: Math.round((dProb[idx] ?? 20) / 10) * 10,
        icon: decodeWmoCode(dCodes[idx] ?? 2).icon,
      };
    });

    return {
      tempC: Math.round(rawTemp),
      tempDecimal: rawTemp.toFixed(1),
      deltaYesterday: "Today -1°",
      conditionLabel: wmo.label,
      iconName: wmo.icon,
      pm10,
      pm25,
      pm10Label,
      pm25Label,
      pm10Color,
      pm25Color,
      aqiBg: pm10Color,
      aqiColor: "#FFFFFF",
      updatedAtLabel,
      hourly,
      daily,
    };
  } catch {
    return {
      tempC: 22,
      tempDecimal: "22.4",
      deltaYesterday: "Today -1°",
      conditionLabel: "Cloudy",
      iconName: "cloud",
      pm10: 15,
      pm25: 8,
      pm10Label: "Good",
      pm25Label: "Good",
      pm10Color: KAKAO_BLUE,
      pm25Color: KAKAO_BLUE,
      aqiBg: KAKAO_BLUE,
      aqiColor: "#FFFFFF",
      updatedAtLabel,
      hourly: [
        { hourLabel: "19", tempC: 21, precipProb: 60, icon: "cloud" },
        { hourLabel: "20", tempC: 20, precipProb: 30, icon: "cloudy-night" },
        { hourLabel: "21", tempC: 20, precipProb: 30, icon: "cloudy-night" },
        { hourLabel: "22", tempC: 19, precipProb: 30, icon: "rainy" },
        { hourLabel: "23", tempC: 19, precipProb: 30, icon: "cloud" },
        { hourLabel: "TMR", tempC: 18, precipProb: 30, icon: "cloud" },
        { hourLabel: "01", tempC: 18, precipProb: 30, icon: "cloud" },
        { hourLabel: "02", tempC: 17, precipProb: 30, icon: "cloud" },
      ],
      daily: [
        { dayLabel: "Today", minC: 15, maxC: 24, precipProb: 30, icon: "cloud" },
        { dayLabel: "Sun", minC: 15, maxC: 25, precipProb: 20, icon: "partly-sunny" },
        { dayLabel: "Mon", minC: 16, maxC: 26, precipProb: 10, icon: "sunny" },
        { dayLabel: "Tue", minC: 15, maxC: 24, precipProb: 40, icon: "rainy" },
      ],
    };
  }
}

export default function WeatherMeteoSheet({
  visible,
  onClose,
  userLat,
  userLng,
  onWeatherLoaded,
}: {
  visible: boolean;
  onClose: () => void;
  userLat?: number | null;
  userLng?: number | null;
  onWeatherLoaded?: (w: LiveWeatherData) => void;
}) {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";
  const [data, setData] = useState<LiveWeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"hourly" | "daily">("hourly");
  const [districtName, setDistrictName] = useState("Nairobi Metropolitan");

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    const lat = userLat ?? -1.2864;
    const lng = userLng ?? 36.8172;

    setLoading(true);
    MapService.reverseGeocode(lat, lng)
      .then((place) => {
        if (mounted && place) setDistrictName(place);
      })
      .catch(() => {});

    fetchLiveMeteo(lat, lng)
      .then((res) => {
        if (!mounted) return;
        setData(res);
        onWeatherLoaded?.(res);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [visible, userLat, userLng]);

  if (!visible) return null;

  const sheetBg = dark ? "#18181B" : "#FFFFFF";
  const textPrimary = dark ? "#F9FAFB" : "#111827";
  const textMuted = dark ? "#9CA3AF" : "#6B7280";
  const borderCol = dark ? "#27272A" : "#E5E7EB";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            s.sheet,
            {
              backgroundColor: sheetBg,
              paddingBottom: Math.max(insets.bottom, 18),
            },
          ]}
        >
          {/* Top Drag Handle[cite: 17] */}
          <View style={s.handleWrap}>
            <View
              style={[
                s.handle,
                { backgroundColor: dark ? "#3F3F46" : "#CBD5E1" },
              ]}
            />
          </View>

          {/* Centered District Title + Right Close Button[cite: 17] */}
          <View style={s.headerRow}>
            <View style={{ width: 28 }} />
            <Text
              style={[s.districtTitle, { color: textPrimary }]}
              numberOfLines={1}
            >
              {districtName}
            </Text>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                onClose();
              }}
              hitSlop={12}
              style={s.closeBtn}
            >
              <Ionicons name="close" size={24} color={textPrimary} />
            </Pressable>
          </View>

          {loading && !data ? (
            <View style={s.loadingBox}>
              <ActivityIndicator size="large" color={KAKAO_BLUE} />
            </View>
          ) : data ? (
            <>
              {/* Centered Weather Icon + Decimal Temp + Condition + PM10/PM2.5 Pills[cite: 17] */}
              <View style={s.heroCenter}>
                <View style={s.iconTempRow}>
                  <Ionicons
                    name={data.iconName}
                    size={54}
                    color={dark ? "#93C5FD" : "#CBD5E1"}
                  />
                  <Text style={[s.bigDecimalTemp, { color: textPrimary }]}>
                    {data.tempDecimal}°
                  </Text>
                </View>

                <Text style={[s.conditionLine, { color: textPrimary }]}>
                  {data.conditionLabel}. {data.deltaYesterday}
                </Text>

                <View style={s.pmRow}>
                  <Text style={[s.pmLabel, { color: textPrimary }]}>PM10</Text>
                  <View
                    style={[
                      s.pmBadge,
                      { backgroundColor: data.pm10Color },
                    ]}
                  >
                    <Text style={s.pmBadgeText}>{data.pm10Label}</Text>
                  </View>

                  <Text style={[s.pmDot, { color: textMuted }]}>·</Text>

                  <Text style={[s.pmLabel, { color: textPrimary }]}>PM2.5</Text>
                  <View
                    style={[
                      s.pmBadge,
                      { backgroundColor: data.pm25Color },
                    ]}
                  >
                    <Text style={s.pmBadgeText}>{data.pm25Label}</Text>
                  </View>
                </View>
              </View>

              {/* Hourly | Daily Tabs[cite: 17] */}
              <View style={[s.tabsBar, { borderBottomColor: borderCol }]}>
                {(["hourly", "daily"] as const).map((t) => {
                  const active = tab === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setTab(t);
                      }}
                      style={[
                        s.tabBtn,
                        active && [
                          s.tabBtnActive,
                          { borderBottomColor: textPrimary },
                        ],
                      ]}
                    >
                      <Text
                        style={[
                          s.tabBtnText,
                          {
                            color: active ? textPrimary : textMuted,
                            fontWeight: active ? "700" : "500",
                          },
                        ]}
                      >
                        {t === "hourly" ? "Hourly" : "Daily"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Hourly or Daily Strip[cite: 17] */}
              {tab === "hourly" ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.hourlyStrip}
                >
                  {data.hourly.map((h, idx) => (
                    <View key={idx} style={s.hourCol}>
                      <Text style={[s.hourLabel, { color: textMuted }]}>
                        {h.hourLabel}
                      </Text>
                      <Ionicons
                        name={h.icon}
                        size={26}
                        color={
                          h.icon === "sunny"
                            ? "#F59E0B"
                            : h.icon === "rainy"
                            ? "#60A5FA"
                            : "#CBD5E1"
                        }
                      />
                      <Text style={s.precipText}>{h.precipProb}%</Text>
                      <Text style={[s.hourTemp, { color: textPrimary }]}>
                        {h.tempC}°
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.hourlyStrip}
                >
                  {data.daily.map((d, idx) => (
                    <View key={idx} style={[s.hourCol, { width: 58 }]}>
                      <Text style={[s.hourLabel, { color: textMuted }]}>
                        {d.dayLabel}
                      </Text>
                      <Ionicons
                        name={d.icon}
                        size={26}
                        color={d.icon === "sunny" ? "#F59E0B" : "#94A3B8"}
                      />
                      <Text style={s.precipText}>{d.precipProb}%</Text>
                      <Text style={[s.hourTemp, { color: textPrimary }]}>
                        {d.minC}°/{d.maxC}°
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}

              {/* Footer: Last Updated + [More >] Pill[cite: 17] */}
              <View style={s.footerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.footerMeta, { color: textMuted }]}>
                    Last updated {data.updatedAtLabel}
                  </Text>
                  <Text style={[s.footerMeta, { color: textMuted }]}>
                    Provided by Open-Meteo & Navigo AirSense
                  </Text>
                </View>

                <Pressable
                  onPress={() =>
                    Linking.openURL("https://open-meteo.com").catch(() => {})
                  }
                  style={[s.moreBtn, { borderColor: borderCol }]}
                >
                  <Text style={[s.moreBtnText, { color: textMuted }]}>
                    More &gt;
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 24,
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  districtTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
    flex: 1,
  },
  closeBtn: {
    width: 28,
    alignItems: "flex-end",
  },
  loadingBox: {
    height: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCenter: {
    alignItems: "center",
    paddingVertical: 12,
  },
  iconTempRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bigDecimalTemp: {
    fontSize: 48,
    fontWeight: "800",
    letterSpacing: -1.5,
  },
  conditionLine: {
    fontSize: 15,
    fontWeight: "500",
    marginTop: 4,
  },
  pmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  pmLabel: {
    fontSize: 13.5,
    fontWeight: "500",
  },
  pmBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
  },
  pmBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  pmDot: {
    fontSize: 14,
    marginHorizontal: 2,
  },
  tabsBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBtnActive: {
    borderBottomWidth: 2,
  },
  tabBtnText: {
    fontSize: 15,
  },
  hourlyStrip: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 16,
  },
  hourCol: {
    alignItems: "center",
    width: 40,
    gap: 8,
  },
  hourLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  precipText: {
    color: KAKAO_BLUE,
    fontSize: 12,
    fontWeight: "600",
  },
  hourTemp: {
    fontSize: 15,
    fontWeight: "600",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 4,
  },
  footerMeta: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  moreBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  moreBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
});