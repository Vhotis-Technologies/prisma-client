/**
 * Vehicle history and VIN lookup types: basic info, owners, history response, lookup purchase.
 */
export interface VehicleBasicInfo {
  make: string;
  model: string;
  year: number;
  color: string;
  vin: string;
}

export interface VehicleOwner {
  name: string;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
}

export interface VehicleLocation {
  city: string;
  state: string;
  country: string;
  startDate: string;
  endDate?: string;
}

export interface ServiceRecord {
  date: string;
  type: string;
  description: string;
  mileage: number;
}

export interface VehicleIncident {
  date: string;
  type: string;
  description: string;
  severity: string;
}

export interface VehicleHistoryData {
  vin: string;
  vehicle: {
    make: string;
    model: string;
    year: number;
    color: string;
    mileage: number;
    registrationDate: string;
  };
  ownership: {
    totalOwners: number;
    owners: VehicleOwner[];
  };
  locations: VehicleLocation[];
  serviceHistory: ServiceRecord[];
  incidents: VehicleIncident[];
  titleStatus: string;
  hasLien: boolean;
  recalls: Array<{
    date: string;
    description: string;
    status: string;
  }>;
}

export interface DummyVehicleData {
  exists: boolean;
  make: string;
  model: string;
  year: number;
  color: string;
  vin: string;
}
