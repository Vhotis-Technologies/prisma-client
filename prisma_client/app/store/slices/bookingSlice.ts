/**
 * Booking slice: selected service/valet type, date, address, vehicle, SUV/express flags. Used by booking flow.
 */
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import BookingState, { ServiceTypeProps, ValetTypeProps } from "../../interfaces/BookingInterfaces";
import {MyAddressProps } from "@/app/interfaces/ProfileInterfaces";
import { MyVehiclesProps } from "@/app/interfaces/GarageInterface";

const initialState : BookingState = {
    service_type : null,
    valet_type : null,
    selected_date : null,
    special_instructions : null,
    isSuv : false,
    isExpressService : false,
    selected_vehicle : null,
    selected_address : null,
    selected_service_type : null,
    selected_valet_type : null
}


const bookingSlice = createSlice({
    name : "booking",
    initialState,
    reducers : {
        /**
         * Set the service type for the booking.
         * ARGS : ServiceTypeProps[]
         * RESPONSE : void
         * {
         *  id : string
         *  name : string
         *  description : string[]
         *  price : number
         *  duration : number
         * }
         */
        setServiceType : (state, action : PayloadAction<ServiceTypeProps[]>) => {
            state.service_type = action.payload
        },
        /**
         * Set the valet type for the booking.
         * ARGS : ValetTypeProps[]
         * RESPONSE : void
         * {
         *  id : string
         *  name : string
         *  description : string
         * }
         */
        setValetType : (state, action : PayloadAction<ValetTypeProps[]>) => {
            state.valet_type = action.payload
        },
        /**
         * Set the booking date for the booking.
         * ARGS : Date
         * RESPONSE : void
         */
        setBookingDate : (state, action) => {
            state.selected_date = action.payload
        },

        /**
         * Set the vehicle for the booking.
         * ARGS : MyVehiclesProps
         * RESPONSE : void
         */
        setVehicle : (state, action : PayloadAction<MyVehiclesProps>) => {
            state.selected_vehicle = action.payload
        },

        /**
         * Set the address for the booking.
         * ARGS : MyAddressProps
         * RESPONSE : void
         */
        setAddress : (state, action : PayloadAction<MyAddressProps>) => {
            state.selected_address = action.payload
        },
    }
})
export const { setServiceType, setValetType, setBookingDate } = bookingSlice.actions
export default bookingSlice.reducer
