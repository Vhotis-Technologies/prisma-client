export type UserAddress = {
  address: string | null;
  city: string | null;
  post_code: string | null;
  country: string | null;
};

export type UserProfile = {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  is_fleet_owner?: boolean;
  is_branch_admin?: boolean;
  is_guest?: boolean;
  is_dealership?: boolean;
  partner_referral_code?: string | null;
  business_name?: string | null;
  managed_branch?: {
    id: string;
    name: string;
    address?: string;
    postcode?: string;
    city?: string;
  } | null;
  address?: UserAddress | null;
  push_notification_token?: boolean;
  email_notification_token?: boolean;
  marketing_email_token?: boolean;
  loyalty_tier?: string | null;
  loyalty_benefits?: {
    discount: number;
    free_service: string[];
  } | null;
  referral_code?: string | null;
};

export type LoginResponse = {
  access: string;
  refresh: string;
  user: UserProfile;
  message?: string;
};

export type SignUpAccountType = "b2c" | "fleet_operator" | "dealership";

export type BusinessAddress = {
  address: string;
  post_code: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
};

export type RegisterCredentials = {
  name: string;
  email: string;
  phone: string;
  password: string;
  referred_code?: string;
  isFleetOwner: boolean;
  isDealership: boolean;
  business_name?: string;
  business_address?: BusinessAddress;
};
