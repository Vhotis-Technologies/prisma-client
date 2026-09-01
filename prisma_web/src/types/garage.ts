export type GarageVehicle = {
  id: string;
  make: string;
  model: string;
  year: number | string;
  color: string;
  registration_number?: string;
  licence?: string;
  country?: string;
  body_style?: string | null;
  image?: string | null;
  branch_id?: string;
  branch_name?: string;
};

export type LookupPreview = {
  registration_number: string;
  country: string;
  make: string;
  model: string;
  year: number;
  color?: string | null;
  body_style?: string | null;
  image_url?: string | null;
};

export type LookupResponse = {
  preview: LookupPreview;
  lookup_token: string;
  expires_in_seconds: number;
};

export type FleetBranch = {
  id: string;
  name: string;
  city?: string;
};

export type VehiclesResponse = {
  vehicles?: GarageVehicle[];
  branches?: { vehicles: GarageVehicle[] }[];
};

export function flattenVehicles(data: VehiclesResponse): GarageVehicle[] {
  if (Array.isArray(data.vehicles)) return data.vehicles;
  if (Array.isArray(data.branches)) {
    return data.branches.flatMap((branch) => branch.vehicles || []);
  }
  return [];
}

export function plateOf(vehicle: GarageVehicle): string {
  return vehicle.licence || vehicle.registration_number || "";
}
