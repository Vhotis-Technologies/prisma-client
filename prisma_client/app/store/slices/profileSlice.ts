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
    /** Stash in-progress address for the add-address flow. */
    setNewAddress: (state, action: PayloadAction<MyAddressProps>) => {
      state.new_address = action.payload;
    },
    /** Clear draft address after save or cancel. */
    clearNewAddress: (state) => {
      state.new_address = null;
    },
  },
});
export const { setNewAddress, clearNewAddress } = profileSlice.actions;
export default profileSlice.reducer;
