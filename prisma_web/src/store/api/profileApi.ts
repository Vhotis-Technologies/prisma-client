import type { SavedAddress } from "../../types/address";
import type { UserProfile } from "../../types/user";
import { deleteData, getData, patchData, postData } from "./client";

export function fetchAddresses() {
  return getData<{ addresses: SavedAddress[] }>("/api/v1/profile/get_addresses/");
}

export function addAddress(payload: Record<string, unknown>) {
  return postData("/api/v1/profile/add_new_address/", payload);
}

export function updateAddress(payload: Record<string, unknown>) {
  return patchData("/api/v1/profile/update_address/", payload);
}

export function deleteAddress(id: string) {
  return deleteData("/api/v1/profile/delete_address/", { data: { id } });
}

export function fetchProfile() {
  return getData<{ profile: UserProfile }>("/api/v1/profile/get_profile/");
}

export function updateProfile(payload: Record<string, string>) {
  return patchData<{ profile: UserProfile }>("/api/v1/profile/update_profile/", payload);
}

export function updateEmailNotificationToken(update: boolean) {
  return patchData("/api/v1/profile/update_email_notification_token/", { update });
}

export function updateMarketingEmailToken(update: boolean) {
  return patchData("/api/v1/profile/update_marketing_email_token/", { update });
}
