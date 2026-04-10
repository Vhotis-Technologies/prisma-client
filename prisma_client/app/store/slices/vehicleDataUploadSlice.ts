/**
 * Vehicle data upload slice: form state for inspection/repair/service events, visibility, and submit.
 */
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { VehicleEventMetadata } from "@/app/interfaces/GarageInterface";

export interface VehicleDocumentForm {
  event_type: "inspection" | "repair" | "service" | "obd_scan" | "damage";
  event_date: string; // ISO string
  country: string;
  inspection_type?: string;
  mileage?: string;
  result?: "passed" | "failed" | "pending";
  notes?: string;
  metadata: VehicleEventMetadata;
  visibility: "public" | "private";
}

interface VehicleDataUploadDraft {
  formData: VehicleDocumentForm;
  lastUpdated: number; // timestamp
}

interface VehicleDataUploadState {
  drafts: {
    [vehicleId: string]: VehicleDataUploadDraft;
  };
}

const initialState: VehicleDataUploadState = {
  drafts: {},
};

const vehicleDataUploadSlice = createSlice({
  name: "vehicleDataUpload",
  initialState,
  reducers: {
    /**
     * Update a specific field in the form data for a vehicle
     * @param state - The current state
     * @param action - Payload containing vehicleId, field, and value
     */
    setFormData: (
      state,
      action: PayloadAction<{
        vehicleId: string;
        field: keyof VehicleDocumentForm;
        value: any;
      }>
    ) => {
      const { vehicleId, field, value } = action.payload;
      if (!state.drafts[vehicleId]) {
        state.drafts[vehicleId] = {
          formData: {
            event_type: "inspection",
            event_date: new Date().toISOString(),
            country: "United Kingdom",
            result: "passed",
            metadata: {},
            visibility: "public",
          },
          lastUpdated: Date.now(),
        };
      }
      (state.drafts[vehicleId].formData as any)[field] = value;
      state.drafts[vehicleId].lastUpdated = Date.now();
    },

    /**
     * Set the complete form data for a vehicle
     * @param state - The current state
     * @param action - Payload containing vehicleId and complete formData
     */
    setFullFormData: (
      state,
      action: PayloadAction<{
        vehicleId: string;
        formData: VehicleDocumentForm;
      }>
    ) => {
      const { vehicleId, formData } = action.payload;
      state.drafts[vehicleId] = {
        formData,
        lastUpdated: Date.now(),
      };
    },

    /**
     * Clear form data for a vehicle (after successful submission)
     * @param state - The current state
     * @param action - Payload containing vehicleId
     */
    clearFormData: (state, action: PayloadAction<string>) => {
      const vehicleId = action.payload;
      delete state.drafts[vehicleId];
    },

    /**
     * Load form data for a vehicle (returns the draft if it exists)
     * This is a getter action - the actual loading happens via selector
     * @param state - The current state
     * @param action - Payload containing vehicleId
     */
    loadFormData: (state, action: PayloadAction<string>) => {
      // This action is mainly for side effects if needed
      // Actual data retrieval should use selectors
      const vehicleId = action.payload;
      // Ensure draft exists with default values if it doesn't
      if (!state.drafts[vehicleId]) {
        state.drafts[vehicleId] = {
          formData: {
            event_type: "inspection",
            event_date: new Date().toISOString(),
            country: "United Kingdom",
            result: "passed",
            metadata: {},
            visibility: "public",
          },
          lastUpdated: Date.now(),
        };
      }
    },
  },
});

export const { setFormData, setFullFormData, clearFormData, loadFormData } =
  vehicleDataUploadSlice.actions;

export default vehicleDataUploadSlice.reducer;
