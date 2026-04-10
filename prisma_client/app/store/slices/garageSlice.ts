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
    /* Set the new vehicle to the states so that is can be used in the add new vehicle screen */
    createNewVehicle: (state, action: PayloadAction<MyVehiclesProps>) => {
      state.newVehicle = action.payload;
    },
    /* After adding the new vehicle to the server db, 
    * this will be called to clear the state of all the values stored in the newVehicle state*/
    resetNewVehicle: (state) => {
      state.newVehicle = null;
    },
  },
});

export const { createNewVehicle, resetNewVehicle } =
  garageSlice.actions;
export default garageSlice.reducer;
