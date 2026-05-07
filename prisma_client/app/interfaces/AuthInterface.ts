/**
 * Auth state and sign-up types for login/register flows.
 */
import { UserProfileProps } from "./ProfileInterfaces";

export default interface AuthState {
  user?: UserProfileProps | null;
  access?: string;
  refresh?: string;
  isAuthenticated?: boolean;
  isLoading?: boolean;
  signUpData?: SignUpScreenProps;
}

export interface BusinessAddress {
  address: string;
  post_code: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
}

/** Chosen during onboarding landing; maps to API flags `isFleetOwner` / `isDealership`. */
export type SignUpAccountType = "b2c" | "fleet_operator" | "dealership";

export interface SignUpScreenProps {
  name: string;
  email: string;
  phone: string;
  password: string;
  referred_code?: string;
  signUpAccountType?: SignUpAccountType;
  isFleetOwner?: boolean;
  isDealership?: boolean;
  business_name?: string;
  business_address?: BusinessAddress;
}

export interface LoginScreenProps {
  email: string;
  password: string;
}
