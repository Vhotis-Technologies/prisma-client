import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import type { PerksSummary, RecentService, UpcomingAppointment, UserStats } from "../types/dashboard";
import * as dashboardApi from "../store/api/dashboardApi";
import { BOOKING_LIVE_UPDATE_EVENT } from "./useBookingLiveUpdates";

export type LoadState<T> =
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "error"; message: string };

function loadError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { error?: string; detail?: string } | undefined;
    if (body?.error) return String(body.error);
    if (body?.detail) return String(body.detail);
    return `${fallback} (${err.response?.status ?? "network"})`;
  }
  return fallback;
}

export function useConsumerDashboard(enabled: boolean) {
  const [stats, setStats] = useState<LoadState<UserStats>>({ status: "loading" });
  const [upcoming, setUpcoming] = useState<LoadState<UpcomingAppointment[]>>({ status: "loading" });
  const [recent, setRecent] = useState<LoadState<RecentService | null>>({ status: "loading" });
  const [perks, setPerks] = useState<LoadState<PerksSummary | null>>({ status: "loading" });

  const load = useCallback(async () => {
    if (!enabled) return;
    setStats({ status: "loading" });
    setUpcoming({ status: "loading" });
    setRecent({ status: "loading" });
    setPerks({ status: "loading" });

    const [statsRes, upcomingRes, recentRes, perksRes] = await Promise.allSettled([
      dashboardApi.fetchUserStats(),
      dashboardApi.fetchUpcomingAppointments("my_bookings"),
      dashboardApi.fetchRecentServices(),
      dashboardApi.fetchPerksSummary(),
    ]);

    if (statsRes.status === "fulfilled") setStats({ status: "ok", data: statsRes.value });
    else setStats({ status: "error", message: loadError(statsRes.reason, "Could not load stats") });

    if (upcomingRes.status === "fulfilled") setUpcoming({ status: "ok", data: upcomingRes.value ?? [] });
    else {
      setUpcoming({
        status: "error",
        message: loadError(upcomingRes.reason, "Could not load upcoming bookings"),
      });
    }

    if (recentRes.status === "fulfilled") setRecent({ status: "ok", data: recentRes.value ?? null });
    else setRecent({ status: "error", message: loadError(recentRes.reason, "Could not load recent service") });

    if (perksRes.status === "fulfilled") setPerks({ status: "ok", data: perksRes.value ?? null });
    else setPerks({ status: "error", message: loadError(perksRes.reason, "Could not load perks") });
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const onLive = () => {
      void Promise.allSettled([
        dashboardApi.fetchUpcomingAppointments("my_bookings"),
        dashboardApi.fetchRecentServices(),
      ]).then(([upcomingRes, recentRes]) => {
        if (upcomingRes.status === "fulfilled") {
          setUpcoming({ status: "ok", data: upcomingRes.value ?? [] });
        }
        if (recentRes.status === "fulfilled") {
          setRecent({ status: "ok", data: recentRes.value ?? null });
        }
      });
    };
    window.addEventListener(BOOKING_LIVE_UPDATE_EVENT, onLive);
    return () => window.removeEventListener(BOOKING_LIVE_UPDATE_EVENT, onLive);
  }, [enabled]);

  return { stats, upcoming, recent, perks, load };
}
