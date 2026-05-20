/**
 * Redux store: auth, garage, dashboard, profile, booking, vehicleDataUpload slices and all RTK Query APIs.
 */
import { configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector, TypedUseSelectorHook } from "react-redux";
import authReducer from "./slices/authSlice";
import garageReducer from "./slices/garageSlice";
import dashboardReducer from "./slices/dashboardSlice";
import profileReducer from "./slices/profileSlice";
import authApi from "./api/authApi";
import garageApi from "./api/garageApi";
import dashboardApi from "./api/dashboardApi";
import profileApi from "./api/profileApi";
import bookingReducer from "./slices/bookingSlice";
import vehicleDataUploadReducer from "./slices/vehicleDataUploadSlice";
import bookingApi from "./api/eventApi";
import notificationApi from "./api/notificationApi";
import fleetApi from "./api/fleetApi";
import subscriptionApi from "./api/subscriptionApi";
import b2cSubscriptionApi from "./api/b2cSubscriptionApi";
import ticketApi from "./api/ticketApi";
import partnerApi from "./api/partnerApi";
import serviceHistoryApi from "./api/serviceHistoryApi";

const store = configureStore({
  reducer: {
    auth: authReducer,
    garage: garageReducer,
    dashboard: dashboardReducer,
    profile: profileReducer,
    booking: bookingReducer,
    vehicleDataUpload: vehicleDataUploadReducer,
    [authApi.reducerPath]: authApi.reducer,
    [garageApi.reducerPath]: garageApi.reducer,
    [dashboardApi.reducerPath]: dashboardApi.reducer,
    [profileApi.reducerPath]: profileApi.reducer,
    [bookingApi.reducerPath]: bookingApi.reducer,
    [notificationApi.reducerPath]: notificationApi.reducer,
    [fleetApi.reducerPath]: fleetApi.reducer,
    [subscriptionApi.reducerPath]: subscriptionApi.reducer,
    [b2cSubscriptionApi.reducerPath]: b2cSubscriptionApi.reducer,
    [serviceHistoryApi.reducerPath]: serviceHistoryApi.reducer,
    [partnerApi.reducerPath]: partnerApi.reducer,
    [ticketApi.reducerPath]: ticketApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      authApi.middleware,
      garageApi.middleware,
      dashboardApi.middleware,
      profileApi.middleware,
      bookingApi.middleware,
      notificationApi.middleware,
      fleetApi.middleware,
      subscriptionApi.middleware,
      b2cSubscriptionApi.middleware,
      serviceHistoryApi.middleware,
      partnerApi.middleware,
      ticketApi.middleware,
    ),
});

export default store;

/** Full Redux state shape (slices + RTK Query caches). */
export type RootState = ReturnType<typeof store.getState>;
/** Typed dispatch for thunks and RTK Query actions. */
export type AppDispatch = typeof store.dispatch;

/** Typed `useDispatch` bound to the app store. */
export const useAppDispatch = () => useDispatch<AppDispatch>();
/** Typed `useSelector` for slice and API state. */
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
