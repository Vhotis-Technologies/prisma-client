import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setSession,
} from "./authStorage";

const apiBaseUrl = (
  import.meta.env.VITE_API_URL || "http://localhost/client"
).replace(/\/$/, "");

const usesNgrok =
  /ngrok(-free)?\.(app|dev|io)\b/i.test(apiBaseUrl) ||
  (typeof window !== "undefined" &&
    /ngrok(-free)?\.(app|dev|io)\b/i.test(window.location.hostname));

const ngrokHeaders = usesNgrok
  ? { "ngrok-skip-browser-warning": "true" }
  : {};

const PUBLIC_PATH_PREFIXES = [
  "/api/v1/authentication/login/",
  "/api/v1/authentication/refresh/",
  "/api/v1/onboard/",
  "/api/v1/terms/",
  "/api/v1/auth/password-reset/",
  "/api/v1/auth/validate-reset-token/",
  "/api/v1/auth/reset-password/",
  "/api/v1/auth/accept-invite/",
  "/api/v1/garage/web-transfer-action/",
  "/api/v1/guest/",
  "/api/v1/places/",
];

function isPublicPath(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.startsWith("http") ? new URL(url).pathname : url;
  return PUBLIC_PATH_PREFIXES.some((prefix) => path.includes(prefix));
}

export const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000,
  headers: { "Content-Type": "application/json", ...ngrokHeaders },
});

api.interceptors.request.use((config) => {
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    const headers = config.headers;
    if (headers && typeof headers.delete === "function") {
      headers.delete("Content-Type");
    } else if (headers) {
      delete headers["Content-Type"];
    }
  }
  const access = getAccessToken();
  if (access && !isPublicPath(config.url)) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

export async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refresh = getRefreshToken();
    if (!refresh) {
      throw new Error("No refresh token");
    }
    const { data } = await axios.post<{ access: string; refresh?: string }>(
      `${apiBaseUrl}/api/v1/authentication/refresh/`,
      { refresh },
      { timeout: 30000, headers: ngrokHeaders },
    );
    setSession(data.access, data.refresh || refresh);
    return data.access;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retried?: boolean })
      | undefined;
    const status = error.response?.status;

    if (
      !original ||
      status !== 401 ||
      original._retried ||
      isPublicPath(original.url)
    ) {
      return Promise.reject(error);
    }

    original._retried = true;

    try {
      const access = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${access}`;
      return api(original);
    } catch {
      clearSession();
      return Promise.reject(error);
    }
  },
);

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}
