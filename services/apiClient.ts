// services/apiClient.ts
import axios, { AxiosError } from "axios";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Platform } from "react-native";
import { useAuthStore } from "@/store/authStore";

const getBaseUrl = () => {

  if (process.env.EXPO_PUBLIC_API_URL) {
    // return process.env.EXPO_PUBLIC_API_URL;
    return "https://ccc8-196-98-214-130.ngrok-free.app/api/v1";
  }

  // Strictly prevent local IPs from leaking into production builds
  if (!__DEV__) {
    console.warn("CRITICAL: EXPO_PUBLIC_API_URL is missing in production build!");
    // You can hardcode your production production URL here as a final safety net, 
    // e.g., return "https://api.navigo.ke/api/v1";
    return "https://api.navigo.ke/api/v1";
  }

  if (!Platform.isTV && !Constants.isDevice) {
    if (Platform.OS === "android") return "http://10.0.2.2:8000/api/v1";
    return "http://localhost:8000/api/v1";
  }

  return "http://192.168.100.1:8000/api/v1";
};

export const BASE_URL = getBaseUrl();

if (__DEV__) {
  console.log("API Configured with URL:", BASE_URL);
}

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 15000,
});

// --- REQUEST: attach Bearer token + logger + clean GET headers ---
api.interceptors.request.use(
  async (config) => {
    const token = useAuthStore.getState().token;
    if (token && !config.headers["Authorization"]) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }

    // GET/HEAD should not advertise a JSON body
    const method = (config.method || "get").toLowerCase();
    if (method === "get" || method === "head") {
      // axios may keep the default header; remove it so the server only sees the query string
      if (config.headers) {
        delete (config.headers as any)["Content-Type"];
        delete (config.headers as any)["content-type"];
      }
    }

    if (__DEV__) {
      console.log(
        `[REQ: ${config.method?.toUpperCase()}] ${config.url}`,
        config.params || config.data || "",
      );
    }
    return config;
  },
  (error) => {
    console.error("Request Error:", error);
    return Promise.reject(error);
  },
);

// --- RESPONSE: logger + 401 handler ---
api.interceptors.response.use(
  (response) => {
    if (__DEV__) {
      console.log(`[RES: ${response.status}] ${response.config.url}`);
    }
    return response;
  },
  async (error: AxiosError) => {
    const isLogoutEndpoint = error.config?.url?.includes("/auth/logout");

    if (error.response?.status === 401 && !isLogoutEndpoint) {
      // Only logout when we actually had a token in the store. Skipping this
      // prevents unauthenticated requests (e.g. push-token sync fired before
      // initialize() completes) from wrongly clearing the session.
      const hadToken = !!useAuthStore.getState().token;
      if (hadToken) {
        await useAuthStore.getState().logout();
        router.replace("/(auth)/login");
      }
    }

    if (error.response && !(isLogoutEndpoint && error.response.status === 401)) {
      console.error(
        `[${error.response.status}] API Error:`,
        error.response.data,
      );
    } else if (error.request) {
      console.error("Network Error: Laravel server might be unreachable.");
      console.error(
        `Attempted to reach: ${error.config?.baseURL}${error.config?.url}`,
      );
    } else {
      console.error("Setup Error:", error.message);
    }

    const customError = {
      message: (error.response?.data as any)?.message || "Server connection error",
      status:  error.response?.status,
      errors:  (error.response?.data as any)?.errors,
      data:    error.response?.data as any,
    };

    return Promise.reject(customError);
  },
);

export async function fetchApi<T>(
  endpoint: string,
  options: any = {},
): Promise<T> {
  try {
    const response = await api.request<T>({
      url: endpoint,
      method: options.method || "GET",
      data: options.body
        ? typeof options.body === "string"
          ? JSON.parse(options.body)
          : options.body
        : undefined,
      params: options.params,          // ← important
      headers: options.headers,
      timeout: options.timeout || 15000,
    });
    return response.data;
  } catch (error) {
    throw error;
  }
}

// In-flight deduplication: prevents duplicate parallel GET requests for the same key
const _inflight = new Map<string, Promise<any>>();

export function dedupedGet<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (_inflight.has(key)) return _inflight.get(key)!;
  const p = fetcher().finally(() => _inflight.delete(key));
  _inflight.set(key, p);
  return p;
}

export default api;
