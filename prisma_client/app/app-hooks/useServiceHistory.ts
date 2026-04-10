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
    data: serviceHistory = [],
    isLoading: isLoadingServiceHistory,
    error: errorServiceHistory,
    refetch: refetchServiceHistory,
  } = useGetServiceHistoryQuery();

  return {
    serviceHistory,
    isLoadingServiceHistory,
    errorServiceHistory,
    refetchServiceHistory,
  };
};

export default useServiceHistory;
