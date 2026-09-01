import type { LoginResponse, RegisterCredentials, UserProfile } from "../../types/user";
import { getData, postData } from "./client";

export type TermsPayload = {
  version?: string;
  content?: string;
  last_updated?: string;
  error?: string;
};

export type ResetPasswordResponse = {
  access: string;
  refresh: string;
  message?: string;
};

export type ValidateResetTokenResponse = {
  valid?: boolean;
  user_email?: string;
};

export type InvitePreviewResponse = {
  valid?: boolean;
  user_email?: string;
  purpose_label?: string;
  error?: string;
};

export function login(email: string, password: string) {
  return postData<LoginResponse>("/api/v1/authentication/login/", {
    email: email.trim().toLowerCase(),
    password,
  });
}

export function register(credentials: RegisterCredentials) {
  return postData<LoginResponse>("/api/v1/onboard/create_new_account/", { credentials });
}

export function requestPasswordReset(email: string) {
  return postData<{ message?: string }>("/api/v1/auth/password-reset/", { email });
}

export function validateResetToken(token: string) {
  return postData<ValidateResetTokenResponse>("/api/v1/auth/validate-reset-token/", { token });
}

export function resetPassword(token: string, password: string) {
  return postData<ResetPasswordResponse>("/api/v1/auth/reset-password/", { token, password });
}

export function previewInvite(token: string) {
  return getData<InvitePreviewResponse>("/api/v1/auth/accept-invite/", { params: { token } });
}

export function acceptInvite(token: string, password: string) {
  return postData<ResetPasswordResponse>("/api/v1/auth/accept-invite/", {
    token,
    password,
    confirm_password: password,
  });
}

export function getTerms() {
  return getData<TermsPayload>("/api/v1/terms/get_terms/");
}

export function getPrivacyPolicy() {
  return getData<TermsPayload>("/api/v1/terms/get_privacy_policy/");
}

export function getProfile() {
  return getData<{ profile: UserProfile }>("/api/v1/profile/get_profile/");
}
