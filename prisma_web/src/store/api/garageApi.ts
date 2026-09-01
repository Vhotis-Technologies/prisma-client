import type { GarageVehicle, LookupResponse, VehiclesResponse } from "../../types/garage";
import { api, deleteData, getData, patchData, postData } from "./client";

export type TransferVehicle = {
  make?: string;
  model?: string;
  year?: number | string;
  registration_number?: string;
  color?: string;
};

export type TransferParty = {
  name?: string;
  email?: string;
};

export type TransferPayload = {
  valid?: boolean;
  success?: boolean;
  error?: string;
  status?: string;
  action?: string;
  transfer_id?: string;
  vehicle?: TransferVehicle;
  requester?: TransferParty;
  owner?: TransferParty;
  expires_at?: string | null;
  requested_at?: string | null;
};

export function getVehicles() {
  return getData<VehiclesResponse>("/api/v1/garage/get_vehicles/");
}

export function deleteVehicle(vehicleId: string) {
  return deleteData(`/api/v1/garage/delete_vehicle/${vehicleId}/`);
}

export function lookupVehicleRegistration(licence: string) {
  return postData<LookupResponse>("/api/v1/garage/lookup_vehicle_registration/", {
    licence,
    registration_number: licence,
    country: "Ireland",
  });
}

export async function addVehicle(form: FormData) {
  const response = await api.post<{ message?: string }>("/api/v1/garage/add_vehicle/", form);
  return { data: response.data, status: response.status };
}

export function updateVehicle(vehicleId: string, payload: Partial<GarageVehicle> & Record<string, unknown>) {
  return patchData(`/api/v1/garage/update_vehicle/${vehicleId}/`, payload);
}

export function getWebTransfer(id: string) {
  return getData<TransferPayload>(`/api/v1/garage/web-transfer-action/${id}/`);
}

export function webTransferAction(id: string, body: Record<string, unknown>) {
  return postData<TransferPayload>(`/api/v1/garage/web-transfer-action/${id}/`, body);
}
