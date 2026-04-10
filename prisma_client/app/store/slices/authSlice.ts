/**
 * Auth slice: user, tokens, isAuthenticated, signUpData. Reducers for login, logout, setCredentials, etc.
 */
import { createSlice } from "@reduxjs/toolkit";
import AuthState, { SignUpScreenProps } from "@/app/interfaces/AuthInterface";

const initialState: AuthState = {
  user: null,
  access: "",
  refresh: "",
  isAuthenticated: false,
  isLoading: false,
  signUpData: undefined,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
    },
    setIsLoading: (state, action) => {
      state.isLoading = action.payload;
    },
    setIsAuthenticated: (state, action) => {
      state.isAuthenticated = action.payload;
    },
    setAccessToken: (state, action) => {
      state.access = action.payload;
    },
    setRefreshToken: (state, action) => {
      state.refresh = action.payload;
    },

    /**
     * Collect the users data during the registration process and store it in the state
     * @param state - The current state of the auth slice
     * @param action - The action payload containing the field and value to update
     */
    setSignUpData: (state, action) => {
      const { field, value } = action.payload;
      if (!state.signUpData) {
        state.signUpData = { name: "", email: "", phone: "", password: "" };
      }
      (state.signUpData as Record<string, unknown>)[field] = value;
    },

    refreshTokenSuccess: (state, action) => {
      state.access = action.payload.access;
      state.refresh = action.payload.refresh;
    },

    /**
     * Clear the user information from the state
     */
    logout: (state) => {
      state.user = null;
      state.access = "";
      state.refresh = "";
      state.isAuthenticated = false;
    },

    /**
     * Clear the sign up data from the state
     * @param state - The current state of the auth slice
     */
    clearSignUpData: (state) => {
      state.signUpData = undefined;
    },

    /**
     * Update specific user data fields in the state
     * @param state - The current state of the auth slice
     * @param action - The action payload containing the field and value to update
     */
    updateUser: (state, action) => {
      const { field, value } = action.payload;
      if (state.user) {
        (state.user as any)[field] = value;
      }
    },
  },
});

export const {
  setUser,
  setIsLoading,
  setIsAuthenticated,
  setSignUpData,
  clearSignUpData,
  logout,
  setAccessToken,
  setRefreshToken,
  updateUser,
  refreshTokenSuccess,
} = authSlice.actions;
export default authSlice.reducer;
