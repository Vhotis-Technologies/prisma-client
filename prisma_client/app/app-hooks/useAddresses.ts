import { useFetchAllUserAddressesQuery } from "../store/api/profileApi";
import { MyAddressProps } from "../interfaces/ProfileInterfaces";

/**
 * Shared hook for accessing user addresses across components
 * Uses RTK Query's built-in caching for optimal performance
 *
 * Features:
 * - Automatic caching across all components
 * - No duplicate API calls
 * - Automatic background refetching
 * - Loading and error states
 *
 * Usage Examples:
 *
 * // Basic usage
 * const { addresses, isLoading, error } = useAddresses();
 *
 * // With refetch capability
 * const { addresses, refetch } = useAddresses();
 *
 * // In a component that needs to refresh data
 * const { addresses, refetch } = useAddresses();
 * const handleRefresh = () => refetch();
 *
 * @returns {Object} Object containing addresses, loading state, error state, and refetch function
 */
export const useAddresses = () => {
  const {
    data: addresses = [],
    isLoading,
    error,
    refetch,
  } = useFetchAllUserAddressesQuery();

  return {
    addresses,
    isLoading,
    error,
    refetch,
  };
};

export default useAddresses;
