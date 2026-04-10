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
import vinLookupApi from "./api/vinLookupApi";
import serviceHistoryApi from "./api/serviceHistoryApi";
import partnerApi from "./api/partnerApi";
import ticketApi from "./api/ticketApi";

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
    [vinLookupApi.reducerPath]: vinLookupApi.reducer,
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
      vinLookupApi.middleware,
      serviceHistoryApi.middleware,
      partnerApi.middleware,
      ticketApi.middleware,
    ),
});

export default store;

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
