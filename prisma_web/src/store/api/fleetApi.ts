import type {
  BranchSpend,
  BranchVehiclesResponse,
  FleetAdmin,
  FleetBranch,
  FleetDashboardResponse,
} from "../../types/fleet";
import { getData, patchData, postData } from "./client";

export function getBranches() {
  return getData<{ branches: FleetBranch[] }>("/api/v1/fleet/get_branches/");
}

export function getFleetAdmins() {
  return getData<{ admins: FleetAdmin[] }>("/api/v1/fleet/get_fleet_admins/");
}

export function createBranch(payload: Record<string, unknown>) {
  return postData("/api/v1/fleet/create_branch/", payload);
}

export function updateBranch(branchId: string, payload: Record<string, unknown>) {
  return patchData(`/api/v1/fleet/update_branch/${branchId}/`, payload);
}

export function resendInvite(adminId: string) {
  return postData("/api/v1/fleet/resend_invite/", { admin_id: adminId });
}

export function createBranchAdmin(payload: Record<string, unknown>) {
  return postData("/api/v1/fleet/create_branch_admin/", payload);
}

export function getFleetDashboard(startDate: string, endDate: string) {
  return getData<FleetDashboardResponse>("/api/v1/fleet/get_fleet_dashboard/", {
    params: { start_date: startDate, end_date: endDate },
  });
}

export function getBranchSpend() {
  return getData<BranchSpend>("/api/v1/fleet/get_branch_spend/");
}

export function getBranchVehicles(branchId: string) {
  return getData<BranchVehiclesResponse>(`/api/v1/fleet/get_branch_vehicles/${branchId}/`);
}
