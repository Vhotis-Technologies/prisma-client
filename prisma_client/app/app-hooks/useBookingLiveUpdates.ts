/**
 * Live booking updates: WebSocket when available, RTK refetch fallback otherwise.
 */
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { API_CONFIG } from "@/constants/Config";
import { RootState, useAppSelector } from "../store/main_store";
import store from "../store/main_store";
import { refreshTokenSuccess } from "../store/slices/authSlice";
import { dashboardApi } from "../store/api/dashboardApi";
import serviceHistoryApi from "../store/api/serviceHistoryApi";

const LIVE_EVENTS = new Set([
  "job_acceptance",
  "job_started",
  "job_completed",
  "job_reassigned",
  "booking_reassigned",
]);

function bookingWsUrl(token: string): string | null {
  const explicit = API_CONFIG.websocketUrl;
  const httpBase = API_CONFIG.customerAppUrl;
  const raw = explicit || (httpBase ? httpBase.replace(/^http/, "ws") : "");
  if (!raw) return null;
  const base = raw.replace(/\/$/, "");
  const path = explicit ? base : `${base}/ws/client/`;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}token=${encodeURIComponent(token)}`;
}

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function accessExpiresSoon(token: string, skewMs = 60_000): boolean {
  const payload = decodeJwtPayload(token);
  if (typeof payload?.exp !== "number") return true;
  return payload.exp * 1000 <= Date.now() + skewMs;
}

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refresh =
      store.getState().auth.refresh ||
      (await SecureStore.getItemAsync("refresh"));
    if (!refresh) throw new Error("No refresh token");
    const base = String(API_CONFIG.customerAppUrl || "").replace(/\/$/, "");
    const { data } = await axios.post<{ access: string; refresh?: string }>(
      `${base}/api/v1/authentication/refresh/`,
      { refresh },
      { timeout: 30000 }
    );
    await SecureStore.setItemAsync("access", data.access);
    if (data.refresh) await SecureStore.setItemAsync("refresh", data.refresh);
    store.dispatch(
      refreshTokenSuccess({ access: data.access, refresh: data.refresh || refresh })
    );
    return data.access;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function tokenForSocket(accessFromState: string | undefined): Promise<string | null> {
  const current = accessFromState || (await SecureStore.getItemAsync("access"));
  if (current && !accessExpiresSoon(current)) return current;
  try {
    return await refreshAccessToken();
  } catch {
    return null;
  }
}

function invalidateBookingViews() {
  store.dispatch(
    dashboardApi.util.invalidateTags([
      "UpcomingAppointments",
      "RecentServices",
    ])
  );
  store.dispatch(serviceHistoryApi.util.invalidateTags(["ServiceHistory"]));
}

/**
 * Subscribe to live booking status while the user is signed in.
 * Mount from the authenticated main layout.
 */
export function useBookingLiveUpdates() {
  const isAuthenticated = useAppSelector(
    (state: RootState) => state.auth.isAuthenticated
  );
  const access = useAppSelector((state: RootState) => state.auth.access);
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let socket: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = async () => {
      const token = await tokenForSocket(access);
      if (!token || closed) {
        if (!closed) {
          attempt += 1;
          const delay = Math.min(15000, 2000 * 2 ** Math.min(attempt, 3));
          reconnectTimer = setTimeout(connect, delay);
        }
        return;
      }
      const url = bookingWsUrl(token);
      if (!url) return;
      try {
        socket = new WebSocket(url);
      } catch {
        return;
      }
      socket.onopen = () => {
        connectedRef.current = true;
        attempt = 0;
      };
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data || "{}"));
          if (typeof data.event === "string" && LIVE_EVENTS.has(data.event)) {
            invalidateBookingViews();
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = () => {
        connectedRef.current = false;
        if (!closed) {
          attempt += 1;
          const delay = Math.min(15000, 2000 * 2 ** Math.min(attempt, 3));
          reconnectTimer = setTimeout(connect, delay);
        }
      };
      socket.onerror = () => {
        connectedRef.current = false;
      };
    };

    void connect();

    const poll = setInterval(() => {
      if (!connectedRef.current && !closed) {
        invalidateBookingViews();
      }
    }, 20000);

    const onAppState = (state: AppStateStatus) => {
      if (state === "active") {
        invalidateBookingViews();
      }
    };
    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      closed = true;
      connectedRef.current = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(poll);
      sub.remove();
      socket?.close();
    };
  }, [isAuthenticated, access]);
}
