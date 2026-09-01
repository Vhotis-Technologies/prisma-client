import { useEffect, useRef } from "react";
import { refreshAccessToken } from "../lib/api";
import { getAccessToken } from "../lib/authStorage";
import { useAuth } from "../auth/AuthProvider";

export const BOOKING_LIVE_UPDATE_EVENT = "prisma:booking-live-update";

const LIVE_EVENTS = new Set([
  "job_acceptance",
  "job_started",
  "job_completed",
  "job_reassigned",
  "booking_reassigned",
]);

function bookingWsUrl(token: string): string | null {
  const httpBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  if (!httpBase) return null;
  const wsBase = httpBase.replace(/^http/, "ws");
  return `${wsBase}/ws/client/?token=${encodeURIComponent(token)}`;
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

async function tokenForSocket(): Promise<string | null> {
  const current = getAccessToken();
  if (current && !accessExpiresSoon(current)) return current;
  try {
    return await refreshAccessToken();
  } catch {
    return null;
  }
}

/**
 * Connect the authenticated browser session to live booking updates.
 */
export function useBookingLiveUpdates() {
  const { isAuthenticated } = useAuth();
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let socket: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: number | undefined;
    let attempt = 0;

    const connect = () => {
      void (async () => {
        const token = await tokenForSocket();
        const url = token ? bookingWsUrl(token) : null;
        if (closed) return;
        if (!url) {
          attempt += 1;
          const delay = Math.min(15_000, 2_000 * 2 ** Math.min(attempt, 3));
          reconnectTimer = window.setTimeout(connect, delay);
          return;
        }
        socket = new WebSocket(url);
        socket.onopen = () => {
          connectedRef.current = true;
          attempt = 0;
        };
        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(String(event.data || "{}"));
            if (typeof data.event === "string" && LIVE_EVENTS.has(data.event)) {
              window.dispatchEvent(new CustomEvent(BOOKING_LIVE_UPDATE_EVENT, { detail: data }));
            }
          } catch {
            /* ignore */
          }
        };
        socket.onclose = () => {
          connectedRef.current = false;
          if (closed) return;
          attempt += 1;
          const delay = Math.min(15_000, 2_000 * 2 ** Math.min(attempt, 3));
          reconnectTimer = window.setTimeout(connect, delay);
        };
      })();
    };

    connect();
    const poll = window.setInterval(() => {
      if (!connectedRef.current && !closed) {
        window.dispatchEvent(new CustomEvent(BOOKING_LIVE_UPDATE_EVENT));
      }
    }, 20000);

    return () => {
      closed = true;
      connectedRef.current = false;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.clearInterval(poll);
      socket?.close();
    };
  }, [isAuthenticated]);
}
