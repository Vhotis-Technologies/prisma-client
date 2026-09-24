import type { PerksSummary, RecentService, UpcomingAppointment, UserStats } from "../../types/dashboard";
import { getData, patchData } from "./client";

export function fetchUserStats() {
  return getData<UserStats>("/api/v1/dashboard/get_user_stats/");
}

export function fetchUpcomingAppointments(scope?: "my_bookings") {
  return getData<UpcomingAppointment[]>("/api/v1/dashboard/get_upcoming_appointments/", {
    params: scope ? { scope } : undefined,
  });
}

export function fetchRecentServices() {
  return getData<RecentService | null>("/api/v1/dashboard/get_recent_services/");
}

export function fetchPerksSummary() {
  return getData<PerksSummary>("/api/v1/dashboard/get_perks_summary/");
}

export type SubmitReviewResponse = {
  message?: string;
  booking_reference?: string;
};

/** Submit star rating and optional comment for a completed booking. */
export function submitReview(body: {
  booking_reference: string;
  rating: number;
  comment?: string;
}) {
  return patchData<SubmitReviewResponse>("/api/v1/dashboard/submit_review/", body);
}
