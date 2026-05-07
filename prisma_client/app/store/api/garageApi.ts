/**
 * Garage API: add/update/delete vehicles, get vehicles, stats, S3 test, transfer approve/reject, pending transfers, vehicle events.
 */
import { createApi } from "@reduxjs/toolkit/query/react";
import { axiosBaseQuery } from "../baseQuery";
import {
  MyVehicleStatsProps,
  MyVehiclesProps,
  BranchVehiclesGroup,
  CreateVehicleEventRequest,
  PendingTransfersResponse,
  LookupVehicleRegistrationResponse,
} from "@/app/interfaces/GarageInterface";

const garageApi = createApi({
  reducerPath: "garageApi",
  baseQuery: axiosBaseQuery(),
  endpoints: (builder) => ({
    /**
     * Ireland registration lookup (RegCheck). POST JSON body.
     */
    lookupVehicleRegistration: builder.mutation<
      LookupVehicleRegistrationResponse,
      { licence?: string; registration_number?: string; country?: string }
    >({
      query: (body) => ({
        url: "/api/v1/garage/lookup_vehicle_registration/",
        method: "POST",
        data: body,
      }),
    }),

    /**
     * Add a new vehicle to the server passing the vehicle object to the server
     * @param vehicle - The vehicle object to add to the server
     * @returns The vehicle object that was added to the server
     */
    addNewVehicle: builder.mutation<{ message: string }, FormData>({
      query: (formData) => ({
        url: "/api/v1/garage/add_vehicle/",
        method: "POST",
        data: formData,
      }),
    }),

    /**
     * Get all the vehicles from the server
     * @returns The vehicles that were fetched from the server
     * For fleet owners: returns grouped by branch { branches: BranchVehiclesGroup[] }
     * For regular users/branch admins: returns flat list { vehicles: MyVehiclesProps[] }
     */
    getMyVehicles: builder.query<
      MyVehiclesProps[] | { branches: BranchVehiclesGroup[] },
      void
    >({
      query: () => ({
        url: "/api/v1/garage/get_vehicles/",
        method: "GET",
      }),
      transformResponse: (
        response:
          | { vehicles: any[] }
          | { branches: any[] }
      ) => {
        // Transform registration_number to licence for compatibility
        const transformVehicle = (vehicle: any): MyVehiclesProps => ({
          ...vehicle,
          licence: vehicle.licence || vehicle.registration_number || "",
        });

        // Return the response as-is, let the hook handle the structure
        if ("branches" in response) {
          return {
            branches: response.branches.map((branch: any) => ({
              ...branch,
              vehicles: branch.vehicles.map(transformVehicle),
            })),
          };
        }
        return response.vehicles.map(transformVehicle);
      },
    }),

    /**
     * Get the stats of a specific vehicle
     * @param vehicleId - The id of the vehicle to get the stats for
     * @returns The stats of the vehicle
     */
    getVehicleStats: builder.query<MyVehicleStatsProps, string>({
      query: (vehicleId) => ({
        url: `/api/v1/garage/get_vehicle_stats/${vehicleId}/`,
        method: "GET",
      }),
      transformResponse: (response: MyVehicleStatsProps) => {
        // Transform registration_number to licence for compatibility
        if (response.vehicle) {
          return {
            ...response,
            vehicle: {
              ...response.vehicle,
              licence: response.vehicle.licence || (response.vehicle as any).registration_number || "",
            },
          };
        }
        return response;
      },
    }),

    /**
     * Update a specific vehicle in the server
     * @param vehicle - The vehicle object to update in the server
     * @returns The vehicle object that was updated in the server
     */
    updateVehicle: builder.mutation<MyVehiclesProps, MyVehiclesProps>({
      query: (vehicle) => ({
        url: `/api/v1/garage/update_vehicle/${vehicle.id}/`,
        method: "PATCH",
        data: vehicle,
      }),
    }),

    /**
     * Delete a specific vehicle in the server
     * @param vehicleId - The id of the vehicle to delete in the server
     * @returns The id of the vehicle that was deleted in the server
     */
    deleteVehicle: builder.mutation<{ message: string }, string>({
      query: (vehicleId) => ({
        url: `/api/v1/garage/delete_vehicle/${vehicleId}/`,
        method: "DELETE",
      }),
    }),

    /**
     * Create a vehicle event (inspection, repair, service, etc.)
     * @param eventData - The vehicle event data to create
     * @returns The created event ID and success message
     */
    createVehicleEvent: builder.mutation<
      { id: string; message: string },
      CreateVehicleEventRequest
    >({
      query: (eventData) => ({
        url: "/api/v1/garage/create_vehicle_event/",
        method: "POST",
        data: eventData,
      }),
    }),

    /**
     * Get pending vehicle transfers (incoming and outgoing)
     */
    getPendingTransfers: builder.query<PendingTransfersResponse, void>({
      query: () => ({
        url: "/api/v1/garage/get_pending_transfers/",
        method: "GET",
      }),
    }),

    /**
     * Approve a vehicle transfer (owner only)
     */
    approveTransfer: builder.mutation<
      { message: string; transfer_id: string; status: string },
      { transfer_id: string }
    >({
      query: ({ transfer_id }) => ({
        url: "/api/v1/garage/approve_transfer/",
        method: "POST",
        data: { transfer_id },
      }),
    }),

    /**
     * Reject a vehicle transfer (owner only)
     */
    rejectTransfer: builder.mutation<
      { message: string; transfer_id: string; status: string },
      { transfer_id: string }
    >({
      query: ({ transfer_id }) => ({
        url: "/api/v1/garage/reject_transfer/",
        method: "POST",
        data: { transfer_id },
      }),
    }),
  }),
});
export const {
  useAddNewVehicleMutation,
  useLookupVehicleRegistrationMutation,
  useUpdateVehicleMutation,
  useDeleteVehicleMutation,
  useGetMyVehiclesQuery,
  useGetVehicleStatsQuery,
  useCreateVehicleEventMutation,
  useGetPendingTransfersQuery,
  useApproveTransferMutation,
  useRejectTransferMutation,
} = garageApi;
export default garageApi;
