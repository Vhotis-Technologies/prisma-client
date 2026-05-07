/**
 * Vehicle and garage types: my vehicles, inspection data, promotions, fleet vehicle stats.
 */
export interface MyVehiclesProps {
  id: string;
  model: string;
  make: string;
  year: number;
  color: string;
  licence: string;
  body_style?: string | null;
  country?: string;
  image?: string | null | any;
  branch_id?: string;
  branch_name?: string;
  /** Manual add-vehicle path (server entry_mode=manual). */
  entry_mode?: "manual";
}

export interface LookupVehiclePreview {
  registration_number: string;
  country: string;
  make: string;
  model: string;
  year: number;
  body_style?: string | null;
  image_url?: string | null;
  county?: string | null;
  description?: string | null;
}

export interface LookupVehicleRegistrationResponse {
  preview: LookupVehiclePreview;
  lookup_token: string;
  expires_in_seconds: number;
}

export interface VehicleInspectionProps {
  id?: number;
  booking?: number;
  tire_tread_depth?: number | null;
  tire_condition?: string | null;
  wiper_status?: "good" | "needs_work" | "bad" | null;
  oil_level?: "good" | "low" | "needs_change" | "needs_refill" | null;
  coolant_level?: "good" | "low" | "needs_change" | "needs_refill" | null;
  brake_fluid_level?: "good" | "low" | "needs_change" | "needs_refill" | null;
  battery_condition?: "good" | "weak" | "replace" | null;
  headlights_status?: "working" | "dim" | "not_working" | null;
  taillights_status?: "working" | "dim" | "not_working" | null;
  indicators_status?: "working" | "not_working" | null;
  vehicle_condition_notes?: string | null;
  damage_report?: string | null;
  inspected_at?: string;
  appointment_date?: string;
  booking_reference?: string;
}

export interface MyVehicleStatsProps {
  vehicle: MyVehiclesProps | null;
  total_bookings: number;
  total_amount: number;
  last_cleaned: string;
  next_recommended_service: string;
  latest_inspection?: VehicleInspectionProps | null;
}

export interface PromotionsProps {
  id: string;
  title: string;
  discount_percentage: number;
  valid_until: string;
  is_active: boolean;
  terms_conditions?: string;
}

export interface BranchVehiclesGroup {
  branch_id: string;
  branch_name: string;
  vehicles: MyVehiclesProps[];
}

export interface VehicleEventMetadata {
  country?: string;
  inspection_type?: string;
  mileage?: string;
  result?: "passed" | "failed" | "pending";
  certificate_number?: string;
  test_station?: string;
  expiry_date?: string;
  advisory_items?: string[];
  defects?: Array<{
    severity: "dangerous" | "major" | "minor";
    description: string;
  }>;
  work_performed?: string;
  parts_replaced?: string;
  cost?: string;
  warranty_period?: string;
  fault_codes?: string[];
  diagnostics_summary?: string;
  notes?: string;
}

export interface VehicleEvent {
  id: string;
  vehicle_id: string;
  event_type: "inspection" | "repair" | "service" | "obd_scan" | "damage";
  event_date: string;
  metadata: VehicleEventMetadata;
  visibility: "public" | "private";
  performed_by?: {
    id: string;
    name: string;
  };
  created_at: string;
}

export interface CreateVehicleEventRequest {
  vehicle_id: string;
  event_type: "inspection" | "repair" | "service" | "obd_scan" | "damage";
  event_date: string; // ISO string
  metadata: VehicleEventMetadata;
  visibility: "public" | "private";
  notes?: string;
}

export default interface GarageState {
  newVehicle: MyVehiclesProps | null;
}

/** Pending vehicle transfer (incoming or outgoing) */
export interface PendingTransferItem {
  id: string;
  direction: "incoming" | "outgoing";
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    registration_number: string;
  };
  from_owner: { id: string; name: string; email: string };
  to_owner: { id: string; name: string; email: string };
  status: string;
  requested_at: string;
  expires_at: string;
  is_expired: boolean;
}

export interface PendingTransfersResponse {
  incoming_transfers: PendingTransferItem[];
  outgoing_transfers: PendingTransferItem[];
  total_pending: number;
}
