/**
 * Dashboard slice: list of upcoming appointments. Set/clear appointments.
 */
import UpcomingAppointmentProps from "@/app/interfaces/DashboardInterfaces";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface DashboardState {
  appointments: UpcomingAppointmentProps[];
}

const initialState: DashboardState = {
  appointments: [],
};

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {
    /**
     * The function is an actions that will set the appointment to the state.
     * @param state the state of the appointments
     * @param action the action of the appointments of interface {OngoingAppointmentProps}
     */
    setAppointments: (
      state,
      action: PayloadAction<UpcomingAppointmentProps[]>
    ) => {
      state.appointments = action.payload;
    },
  },
});

const { setAppointments } = dashboardSlice.actions;
export default dashboardSlice.reducer;
