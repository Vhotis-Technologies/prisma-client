import type {
  PartnerDashboardResponse,
  PartnerPayoutDetails,
  PartnerPayoutHistoryItem,
} from "../../types/partner";
import { getData, patchData, postData } from "./client";

export function getPartnerDashboard() {
  return getData<PartnerDashboardResponse>("/api/v1/partner/get_dashboard/");
}

export function getPayoutDetails() {
  return getData<PartnerPayoutDetails>("/api/v1/partner/get_payout_details/");
}

export function getPayoutHistory() {
  return getData<{ payout_requests: PartnerPayoutHistoryItem[] }>("/api/v1/partner/get_payout_history/");
}

export function updatePayoutDetails(payload: Record<string, unknown>) {
  return patchData<PartnerPayoutDetails>("/api/v1/partner/update_payout_details/", payload);
}

export function createPayoutRequest() {
  return postData<{ message: string; amount_requested?: number }>("/api/v1/partner/create_payout_request/");
}
