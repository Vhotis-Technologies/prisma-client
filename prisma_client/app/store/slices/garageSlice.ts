/**
 * Garage slice: newVehicle for add-vehicle flow. createNewVehicle, clearNewVehicle.
 */
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import GarageState, { MyVehiclesProps } from "@/app/interfaces/GarageInterface";

const initialState: GarageState = {
  newVehicle: null, 
};

const garageSlice = createSlice({
  name: "garage",
  initialState,
  reducers: {
    /** Stash in-progress vehicle fields for the add-vehicle screen. */
    createNewVehicle: (state, action: PayloadAction<MyVehiclesProps>) => {
      state.newVehicle = action.payload;
    },
    /** Clear draft vehicle after successful add or cancel. */
    resetNewVehicle: (state) => {
      state.newVehicle = null;
    },
  },
});

export const { createNewVehicle, resetNewVehicle } =
  garageSlice.actions;
export default garageSlice.reducer;
