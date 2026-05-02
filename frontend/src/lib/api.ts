import axios from "axios";
import type { AxiosRequestConfig } from "axios";
import { getToken, logout } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

type DedupeGetConfig = AxiosRequestConfig & { skipDedupe?: boolean };

const inFlightGetRequests = new Map<string, Promise<unknown>>();

const stableSerialize = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const typedValue = value as Record<string, unknown>;
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${key}:${stableSerialize(typedValue[key])}`).join(",")}}`;
  }
  return String(value);
};

const buildGetRequestKey = (url: string, config?: DedupeGetConfig): string => {
  const paramsPart = stableSerialize(config?.params);
  return `${url}::${paramsPart}`;
};

const rawGet = api.get.bind(api);
api.get = ((url: string, config?: DedupeGetConfig) => {
  if (config?.skipDedupe === true) {
    return rawGet(url, config);
  }

  const key = buildGetRequestKey(url, config);
  const inFlight = inFlightGetRequests.get(key);
  if (inFlight) {
    return inFlight;
  }

  const request = (rawGet(url, config) as Promise<unknown>).finally(() => {
    inFlightGetRequests.delete(key);
  });

  inFlightGetRequests.set(key, request);
  return request;
}) as typeof api.get;

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle 401 Unauthorized globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Avoid logout loop if already on login/register pages
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.includes("/login") &&
        !window.location.pathname.includes("/register")
      ) {
        logout();
      }
    }
    return Promise.reject(error);
  }
);

export default api;
