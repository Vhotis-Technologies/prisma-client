/**
 * Service history hook: past bookings and services via serviceHistoryApi.
 */
import { useGetServiceHistoryQuery } from "@/app/store/api/serviceHistoryApi";

/**
 * Custom hook for managing service history functionality.
 * 
 * This hook provides:
 * - Service history data fetching
 * - Loading and error states
 * - Refetch functionality
 * 
 * @returns {Object} An object containing:
 *   - serviceHistory: Array of service history items
 *   - isLoadingServiceHistory: Boolean indicating loading state
 *   - errorServiceHistory: Error object if any
 *   - refetchServiceHistory: Function to refetch service history
 */
const useServiceHistory = () => {
  const {
    data,
    isLoading: isLoadingServiceHistory,
    isError,
    refetch: refetchServiceHistory,
  } = useGetServiceHistoryQuery();

  const serviceHistory = Array.isArray(data) ? data : [];

  return {
    serviceHistory,
    isLoadingServiceHistory,
    errorServiceHistory: isError,
    refetchServiceHistory,
  };
};

export default useServiceHistory;
