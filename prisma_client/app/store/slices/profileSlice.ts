/**
 * Profile slice: new_address for add-address flow. setNewAddress, clearNewAddress.
 */
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import ProfileState, {
  MyAddressProps,
} from "@/app/interfaces/ProfileInterfaces";

const initialState: ProfileState = {
  new_address: null,
};

const profileSlice = createSlice({
  name: "profile",
  initialState,
  reducers: {
    /* Sets a new address to the state for when the user is trying to add a new address  */
    setNewAddress: (state, action: PayloadAction<MyAddressProps>) => {
      state.new_address = action.payload;
    },
    /* Clear the new address state when the user is done updating the address */
    clearNewAddress: (state) => {
      state.new_address = null;
    },
  },
});
export const { setNewAddress, clearNewAddress } = profileSlice.actions;
export default profileSlice.reducer;
