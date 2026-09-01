export type SavedAddress = {
  id: string;
  address: string;
  post_code: string;
  city: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
};
