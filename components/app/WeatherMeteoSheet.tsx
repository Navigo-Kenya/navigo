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
  /** "+2° vs yesterday" (same hour), or null when yesterday's reading is missing. */
  deltaYesterday: string | null;
  conditionLabel: string;
  iconName: keyof typeof Ionicons.glyphMap;
  pm10: number | null;
  pm25: number | null;
  pm10Label: "Good" | "Normal" | "Bad" | "N/A";
  pm25Label: "Good" | "Normal" | "Bad" | "N/A";
  pm10Color: string;
  pm25Color: string;
  aqiBg: string;
  aqiColor: string;
  /** When the provider measured the current values, in the location's time. */
  updatedAtLabel: string;
  hourly: {
    hourLabel: string;
    tempC: number;
    precipProb: number | null;
    icon: keyof typeof Ionicons.glyphMap;
  }[];
  daily: {
    dayLabel: string;
    minC: number;
    maxC: number;
    precipProb: number | null;
    icon: keyof typeof Ionicons.glyphMap;
  }[];
}

const NO_DATA_GREY = "#9CA3AF";

/** WMO weather code -> label + icon, with night variants where they exist. */
function decodeWmoCode(code: number, isDay = true): {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
} {
  if (code === 0) return { label: "Clear", icon: isDay ? "sunny" : "moon" };
  if (code <= 2) return { label: "Partly Cloudy", icon: isDay ? "partly-sunny" : "cloudy-night" };
  if (code === 3) return { label: "Cloudy", icon: "cloud" };
  if (code <= 48) return { label: "Fog", icon: "cloud" };
  if (code <= 57) return { label: "Drizzle", icon: "rainy" };
  if (code <= 67) return { label: "Rain", icon: "rainy" };
  if (code <= 77) return { label: "Snow", icon: "snow" };
  if (code <= 82) return { label: "Showers", icon: "rainy" };
  if (code <= 86) return { label: "Snow Showers", icon: "snow" };
  return { label: "Thunderstorm", icon: "thunderstorm" };
}

function pmLevel(v: number | null, good: number, normal: number) {
  if (v == null) return { label: "N/A" as const, color: NO_DATA_GREY };
  if (v <= good) return { label: "Good" as const, color: KAKAO_BLUE };
  if (v <= normal) return { label: "Normal" as const, color: "#16A34A" };
  return { label: "Bad" as const, color: "#DC2626" };
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return res.json();
}

// ─── Cache ────────────────────────────────────────────────────────────────────
// One entry per ~5 km cell (0.05°). Fresh for 10 minutes; concurrent requests
// for the same cell share one network call. Failures are not cached.
const METEO_TTL_MS = 10 * 60 * 1000;
const meteoCache = new Map<string, { at: number; data: LiveWeatherData }>();
const meteoInFlight = new Map<string, Promise<LiveWeatherData>>();
const cellKey = (lat: number, lng: number) =>
  `${Math.round(lat * 20) / 20},${Math.round(lng * 20) / 20}`;

/** Cached weather for the ~5 km cell around (lat, lng). */
export function fetchLiveMeteo(lat = -1.2864, lng = 36.8172): Promise<LiveWeatherData> {
  const key = cellKey(lat, lng);
  const hit = meteoCache.get(key);
  if (hit && Date.now() - hit.at < METEO_TTL_MS) return Promise.resolve(hit.data);
  const pending = meteoInFlight.get(key);
  if (pending) return pending;
  const [cLat, cLng] = key.split(",").map(Number);
  const p = fetchLiveMeteoUncached(cLat, cLng)
    .then((data) => {
      meteoCache.set(key, { at: Date.now(), data });
      return data;
    })
    .finally(() => meteoInFlight.delete(key));
  meteoInFlight.set(key, p);
  return p;
}

/**
 * Live weather + air quality from Open-Meteo (open-meteo.com, CC BY 4.0).
 *
 * Every value shown comes from the response: if the forecast request fails
 * this throws (callers show "unavailable", never invented numbers). Air
 * quality is optional: if that request fails, PM values are N/A.
 * Times are the location's local time (timezone=auto), not the phone's.
 */
async function fetchLiveMeteoUncached(
  lat: number,
  lng: number
): Promise<LiveWeatherData> {
  const [w, aqi] = await Promise.all([
    getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&current=temperature_2m,weather_code,is_day` +
        `&hourly=temperature_2m,precipitation_probability,weather_code,is_day` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=auto&forecast_days=7&past_days=1`
    ),
    getJson(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}` +
        `&current=pm10,pm2_5&timezone=auto`
    ).catch(() => null),
  ]);

  const nowTemp = num(w?.current?.temperature_2m);
  const nowCode = num(w?.current?.weather_code);
  const nowTime: string | undefined = w?.current?.time; // "2026-11-16T05:30" (location time)
  if (nowTemp == null || nowCode == null || !nowTime) {
    throw new Error("Open-Meteo returned no current weather");
  }
  const isDay = w.current.is_day !== 0;
  const wmo = decodeWmoCode(nowCode, isDay);

  // Hourly: from the location's current hour, 10 entries.
  const times: string[] = w?.hourly?.time ?? [];
  const temps: (number | null)[] = w?.hourly?.temperature_2m ?? [];
  const probs: (number | null)[] = w?.hourly?.precipitation_probability ?? [];
  const codes: (number | null)[] = w?.hourly?.weather_code ?? [];
  const days: (number | null)[] = w?.hourly?.is_day ?? [];
  const hourKey = nowTime.slice(0, 13); // "2026-11-16T05"
  let nowIdx = times.findIndex((t) => t.slice(0, 13) === hourKey);
  if (nowIdx < 0) nowIdx = Math.max(0, times.findIndex((t) => t >= nowTime));
  const today = nowTime.slice(0, 10);

  const hourly: LiveWeatherData["hourly"] = [];
  for (let i = nowIdx; i < Math.min(times.length, nowIdx + 10); i++) {
    const temp = num(temps[i]);
    const code = num(codes[i]);
    if (temp == null || code == null) continue;
    const hh = times[i].slice(11, 13);
    const p = num(probs[i]);
    hourly.push({
      hourLabel: i === nowIdx ? "Now" : times[i].slice(0, 10) !== today && hh === "00" ? "TMR" : hh,
      tempC: Math.round(temp),
      precipProb: p == null ? null : Math.round(p / 10) * 10,
      icon: decodeWmoCode(code, days[i] !== 0).icon,
    });
  }

  // Change vs the same hour yesterday (past_days=1 puts yesterday first).
  const yesterday = nowIdx >= 24 ? num(temps[nowIdx - 24]) : null;
  let deltaYesterday: string | null = null;
  if (yesterday != null) {
    const d = Math.round(nowTemp - yesterday);
    deltaYesterday =
      d === 0 ? "Same as yesterday" : `${d > 0 ? "+" : "\u2212"}${Math.abs(d)}° vs yesterday`;
  }

  // Daily: from today.
  const dTimes: string[] = w?.daily?.time ?? [];
  const dMax: (number | null)[] = w?.daily?.temperature_2m_max ?? [];
  const dMin: (number | null)[] = w?.daily?.temperature_2m_min ?? [];
  const dProb: (number | null)[] = w?.daily?.precipitation_probability_max ?? [];
  const dCodes: (number | null)[] = w?.daily?.weather_code ?? [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayIdx = Math.max(0, dTimes.indexOf(today));

  const daily: LiveWeatherData["daily"] = [];
  for (let i = todayIdx; i < dTimes.length; i++) {
    const max = num(dMax[i]);
    const min = num(dMin[i]);
    const code = num(dCodes[i]);
    if (max == null || min == null || code == null) continue;
    const p = num(dProb[i]);
    daily.push({
      dayLabel: i === todayIdx ? "Today" : dayNames[new Date(`${dTimes[i]}T12:00:00Z`).getUTCDay()],
      minC: Math.round(min),
      maxC: Math.round(max),
      precipProb: p == null ? null : Math.round(p / 10) * 10,
      icon: decodeWmoCode(code).icon,
    });
  }

  // Air quality.
  const pm10Raw = num(aqi?.current?.pm10);
  const pm25Raw = num(aqi?.current?.pm2_5);
  const pm10 = pm10Raw == null ? null : Math.round(pm10Raw);
  const pm25 = pm25Raw == null ? null : Math.round(pm25Raw);
  const p10 = pmLevel(pm10, 30, 80);
  const p25 = pmLevel(pm25, 15, 35);

  return {
    tempC: Math.round(nowTemp),
    tempDecimal: nowTemp.toFixed(1),
    deltaYesterday,
    conditionLabel: wmo.label,
    iconName: wmo.icon,
    pm10,
    pm25,
    pm10Label: p10.label,
    pm25Label: p25.label,
    pm10Color: p10.color,
    pm25Color: p25.color,
    aqiBg: p10.color,
    aqiColor: "#FFFFFF",
    updatedAtLabel: `${nowTime.slice(0, 10).replace(/-/g, ".")} ${nowTime.slice(11, 16)} (local time)`,
    hourly,
    daily,
  };
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
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
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

    setFailed(false);
    fetchLiveMeteo(lat, lng)
      .then((res) => {
        if (!mounted) return;
        setData(res);
        onWeatherLoaded?.(res);
      })
      .catch(() => {
        if (mounted) setFailed(true);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [visible, userLat, userLng, attempt]);

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
          ) : failed && !data ? (
            <View style={s.loadingBox}>
              <Ionicons name="cloud-offline-outline" size={40} color={textMuted} />
              <Text style={[s.conditionLine, { color: textPrimary }]}>Weather unavailable</Text>
              <Text style={[s.footerMeta, { color: textMuted }]}>
                Couldn&apos;t reach the weather service.
              </Text>
              <Pressable
                onPress={() => setAttempt((n) => n + 1)}
                style={[s.moreBtn, { borderColor: borderCol, marginTop: 10 }]}
              >
                <Text style={[s.moreBtnText, { color: textPrimary }]}>Try again</Text>
              </Pressable>
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
                  {data.conditionLabel}
                  {data.deltaYesterday ? ` · ${data.deltaYesterday}` : ""}
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
                      <Text style={s.precipText}>{h.precipProb == null ? "\u2013" : `${h.precipProb}%`}</Text>
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
                      <Text style={s.precipText}>{d.precipProb == null ? "\u2013" : `${d.precipProb}%`}</Text>
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
                    Measured {data.updatedAtLabel}
                  </Text>
                  <Text style={[s.footerMeta, { color: textMuted }]}>
                    Weather & air quality: Open-Meteo (CC BY 4.0)
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
    gap: 6,
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